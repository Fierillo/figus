// Ledger durable del issuer (Fix #2 — anti-replay / idempotencia).
//
// Todo el estado vive EN MEMORIA y se persiste a data/ con escrituras atómicas
// (tmp + rename), así un crash a mitad de escritura nunca corrompe el archivo.
// Antes cada lectura/escritura hacía readFileSync+parse del JSON completo — con
// un evento por segundo eso era el 90% del trabajo del proceso.
//
//   orders.json    → órdenes de compra (write-through: se persisten al instante,
//                    perder una orden = un pago sin figus)
//   seen.json      → ids ya procesados por namespace (anti-replay)
//   state.json     → watermarks de suscripciones (último created_at visto por
//                    stream, para retomar tras un reinicio sin perder eventos)
//   ownership.json → cache de tenencia (espejo de los 30100 que publica el
//                    issuer; evita consultar relays en cada bump)
import fs from "fs";
import path from "path";

const DIR = path.join(process.cwd(), "data");
const ORDERS_PATH = path.join(DIR, "orders.json");
const SEEN_PATH = path.join(DIR, "seen.json");
const STATE_PATH = path.join(DIR, "state.json");
const OWNERSHIP_PATH = path.join(DIR, "ownership.json");

export type OrderAction = "open-pack" | "open-pack-10" | "buy-sticker";

export interface Order {
  paymentHash: string;
  buyer: string;
  action: OrderAction;
  amountSats: number;
  status: "pending" | "granted" | "failed" | "expired";
  ts: number;
  // open-pack(-10)
  stickers?: number[];
  // buy-sticker
  listingCoord?: string;
  seller?: string;
  stickerNum?: number;
}

type Orders = Record<string, Order>;
type SeenSets = Record<string, string[]>; // namespace -> ids

function readJson<T>(p: string, fallback: T): T {
  try {
    if (!fs.existsSync(p)) return fallback;
    return JSON.parse(fs.readFileSync(p, "utf-8")) as T;
  } catch {
    return fallback;
  }
}

// Escritura atómica: nunca deja un JSON a medias aunque el proceso muera.
function writeJsonAtomic(p: string, data: unknown): void {
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  const tmp = `${p}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(data));
  fs.renameSync(tmp, p);
}

// ── Estado en memoria (cargado una sola vez al boot) ──────────────────────────

const orders: Orders = readJson(ORDERS_PATH, {});
const seen: SeenSets = readJson(SEEN_PATH, {});
const watermarks: Record<string, number> = readJson(STATE_PATH, {});
const ownership: Record<string, number> = readJson(OWNERSHIP_PATH, {});

// Sets en memoria para lookup O(1) (seen.json guarda arrays para legibilidad).
const seenSets = new Map<string, Set<string>>(
  Object.entries(seen).map(([ns, ids]) => [ns, new Set(ids)])
);

// ── Persistencia con debounce ─────────────────────────────────────────────────
// orders se escribe al instante (es el dato crítico); el resto se agrupa en una
// escritura diferida para no castigar el disco con cada evento de relay.

const FLUSH_DELAY_MS = 1500;
const dirty = new Set<"seen" | "state" | "ownership">();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

function flushDirty(): void {
  if (dirty.has("seen")) writeJsonAtomic(SEEN_PATH, seen);
  if (dirty.has("state")) writeJsonAtomic(STATE_PATH, watermarks);
  if (dirty.has("ownership")) writeJsonAtomic(OWNERSHIP_PATH, ownership);
  dirty.clear();
}

function scheduleFlush(what: "seen" | "state" | "ownership"): void {
  dirty.add(what);
  if (!flushTimer) {
    flushTimer = setTimeout(() => {
      flushTimer = null;
      flushDirty();
    }, FLUSH_DELAY_MS);
  }
}

/** Vuelca a disco todo lo pendiente. Llamar antes de salir del proceso. */
export function flushSync(): void {
  if (flushTimer) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  flushDirty();
}

// ── Órdenes ───────────────────────────────────────────────────────────────────

export function getOrder(paymentHash: string): Order | undefined {
  return orders[paymentHash];
}

export function putOrder(order: Order): void {
  orders[order.paymentHash] = order;
  writeJsonAtomic(ORDERS_PATH, orders);
}

export function updateOrder(paymentHash: string, patch: Partial<Order>): void {
  const cur = orders[paymentHash];
  if (!cur) return;
  orders[paymentHash] = { ...cur, ...patch };
  writeJsonAtomic(ORDERS_PATH, orders);
}

export function pendingOrders(): Order[] {
  return Object.values(orders).filter((o) => o.status === "pending");
}

/**
 * Borra órdenes en estado terminal (granted/failed/expired) más viejas que
 * maxAgeS para que orders.json no crezca para siempre. Las pending no se tocan
 * (las expira el poller por TTL). Devuelve cuántas borró.
 */
export function pruneOrders(maxAgeS: number, nowS = Math.floor(Date.now() / 1000)): number {
  let removed = 0;
  for (const [hash, o] of Object.entries(orders)) {
    if (o.status !== "pending" && nowS - o.ts > maxAgeS) {
      delete orders[hash];
      removed++;
    }
  }
  if (removed > 0) writeJsonAtomic(ORDERS_PATH, orders);
  return removed;
}

// ── Set de "ya procesado" (receipts, free-pack claims, etc.) ──────────────────

export function wasProcessed(ns: string, id: string): boolean {
  return seenSets.get(ns)?.has(id) ?? false;
}

export function markProcessed(ns: string, id: string): void {
  let set = seenSets.get(ns);
  if (!set) {
    set = new Set();
    seenSets.set(ns, set);
  }
  if (set.has(id)) return;
  set.add(id);
  const arr = seen[ns] ?? (seen[ns] = []);
  arr.push(id);
  // Bound the set so the file doesn't grow forever (keep last 5000 por namespace).
  if (arr.length > 5000) {
    const trimmed = arr.slice(-5000);
    seen[ns] = trimmed;
    seenSets.set(ns, new Set(trimmed));
  }
  scheduleFlush("seen");
}

// ── Watermarks de suscripciones ───────────────────────────────────────────────
// Último created_at procesado por stream. Al reiniciar, cada suscripción retoma
// desde su watermark (con margen) en vez de un "since: now - 2 min" fijo — los
// eventos publicados mientras el issuer estaba caído se recuperan y el ledger
// de "ya procesado" evita duplicar los que sí se habían atendido.

export function getWatermark(stream: string): number | undefined {
  return watermarks[stream];
}

export function setWatermark(stream: string, ts: number): void {
  if ((watermarks[stream] ?? 0) >= ts) return; // monotónico
  watermarks[stream] = ts;
  scheduleFlush("state");
}

// ── Lock de proceso único ─────────────────────────────────────────────────────
// El estado vive en memoria: DOS issuers a la vez se pisan el ledger y conceden
// duplicado (cada uno con su propia copia del anti-replay). El lock con pid
// rechaza el segundo proceso; un lock huérfano (pid muerto) se pisa solo.

const LOCK_PATH = path.join(DIR, "issuer.lock");

export function acquireProcessLock(): void {
  if (fs.existsSync(LOCK_PATH)) {
    const pid = Number(fs.readFileSync(LOCK_PATH, "utf-8"));
    let alive = false;
    try {
      if (pid > 0) {
        process.kill(pid, 0); // señal 0: solo chequea existencia
        alive = true;
      }
    } catch {
      /* ESRCH: el proceso del lock ya no existe */
    }
    if (alive) {
      throw new Error(
        `Ya hay un issuer corriendo (pid ${pid}). ` +
        `Si es un lock viejo, borrá data/issuer.lock`
      );
    }
  }
  if (!fs.existsSync(DIR)) fs.mkdirSync(DIR, { recursive: true });
  fs.writeFileSync(LOCK_PATH, String(process.pid));
}

export function releaseProcessLock(): void {
  try {
    fs.unlinkSync(LOCK_PATH);
  } catch {
    /* puede no existir */
  }
}

// ── Cache de tenencia (espejo local de los 30100 del issuer) ──────────────────
// El issuer es el único autor de los eventos de ownership, así que el espejo en
// disco es autoritativo entre reinicios: un pack-10 ya no dispara 70 queries a
// relays para conocer los counts vigentes.

export function getCachedOwnership(key: string): number | undefined {
  return ownership[key];
}

export function setCachedOwnership(key: string, count: number): void {
  ownership[key] = count;
  scheduleFlush("ownership");
}

// ── Ledger de reclamos de premios ─────────────────────────────────────────────
// Fuente de verdad durable para Vercel: /tmp es efímero y se borra en cada
// redeploy, así que el issuer (con disco real) guarda el registro definitivo.

const CLAIMS_PATH = path.join(DIR, "claims.json");
type ClaimEntry = { ts: number; amountSats: number; status: "pending" | "confirmed" };
type Claims = Record<string, ClaimEntry>;

const claims: Claims = readJson(CLAIMS_PATH, {});

function writeClaims(): void {
  writeJsonAtomic(CLAIMS_PATH, claims);
}

function claimKey(pubkey: string, pageId: string): string {
  return `${pubkey}:${pageId}`;
}

export function hasClaimRecord(pubkey: string, pageId: string): boolean {
  return Boolean(claims[claimKey(pubkey, pageId)]);
}

/**
 * Reserva atómica (read+write síncronos, sin await en el medio).
 * Dos requests concurrentes no pueden reservar los dos — el segundo recibe false.
 * Devuelve true si reservó con éxito, false si ya existía (pending o confirmed).
 */
export function reserveClaimRecord(pubkey: string, pageId: string, amountSats: number): boolean {
  const k = claimKey(pubkey, pageId);
  if (claims[k]) return false;
  claims[k] = { ts: Date.now(), amountSats, status: "pending" };
  writeClaims();
  return true;
}

export function confirmClaimRecord(pubkey: string, pageId: string): void {
  const k = claimKey(pubkey, pageId);
  if (!claims[k]) return;
  claims[k] = { ...claims[k], status: "confirmed", ts: Date.now() };
  writeClaims();
}

export function releaseClaimRecord(pubkey: string, pageId: string): void {
  const k = claimKey(pubkey, pageId);
  if (claims[k]?.status === "pending") {
    delete claims[k];
    writeClaims();
  }
}

// Devuelve un mapa { stickerNum → count } para un pubkey dado.
// Usado por el HTTP API del issuer para que Vercel pueda verificar ownership.
export function getOwnershipForPubkey(pubkey: string): Record<number, number> {
  const prefix = `${pubkey}:`;
  const result: Record<number, number> = {};
  for (const [key, count] of Object.entries(ownership)) {
    if (key.startsWith(prefix)) {
      const num = parseInt(key.slice(prefix.length), 10);
      if (!isNaN(num) && count > 0) result[num] = count;
    }
  }
  return result;
}
