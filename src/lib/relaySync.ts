// Sincronización de figus entre relays (resiliencia).
//
// Las pruebas de tenencia son eventos firmados por el issuer (30100 + 1573):
// cualquiera puede republicarlos tal cual en más relays sin re-firmar. Este
// módulo busca las figus del usuario relay por relay, arma el conjunto
// canónico (union de todos + respaldo local IndexedDB), lo respalda local y
// republica lo que falte en cada relay — con progreso observable para la UI.
import { verifyEvent, type Event, type Filter } from "nostr-tools";
import { KIND, ISSUER_PUBKEY } from "./constants";
import { backupEvents, loadBackup } from "./figuDb";

// ── Relays extra del usuario (persisten en localStorage) ──────────────────────

const EXTRA_KEY = "figus:extra_relays";

/** Relays públicos populares para sugerir — curados, abiertos a escritura. */
export const POPULAR_RELAYS = [
  "wss://relay.damus.io",
  "wss://nos.lol",
  "wss://relay.primal.net",
  "wss://relay.nostr.band",
  "wss://relay.snort.social",
  "wss://nostr.wine",
  "wss://offchain.pub",
  "wss://nostr.mom",
  "wss://nostr.oxtr.dev",
  "wss://relay.nostr.bg",
  "wss://nostr21.com",
  "wss://nostr.fmt.wiz.biz",
];

export function getExtraRelays(): string[] {
  if (typeof window === "undefined") return [];
  try {
    const arr = JSON.parse(localStorage.getItem(EXTRA_KEY) || "[]");
    return Array.isArray(arr) ? arr.filter((r) => typeof r === "string") : [];
  } catch {
    return [];
  }
}

/** Normaliza y agrega un relay. Devuelve la URL normalizada o null si es inválida. */
export function addExtraRelay(raw: string): string | null {
  let url = raw.trim().toLowerCase();
  if (!url) return null;
  if (!url.startsWith("wss://") && !url.startsWith("ws://")) url = `wss://${url}`;
  try {
    const u = new URL(url);
    if (u.protocol !== "wss:" && u.protocol !== "ws:") return null;
    url = u.toString().replace(/\/$/, "");
  } catch {
    return null;
  }
  const cur = getExtraRelays();
  if (!cur.includes(url)) {
    try { localStorage.setItem(EXTRA_KEY, JSON.stringify([...cur, url])); } catch {}
  }
  return url;
}

export function removeExtraRelay(url: string): void {
  try {
    localStorage.setItem(EXTRA_KEY, JSON.stringify(getExtraRelays().filter((r) => r !== url)));
  } catch {}
}

// ── Acceso crudo por relay (WebSocket del browser, control fino por relay) ────

function queryRelay(
  url: string,
  filters: Filter[],
  timeoutMs = 10_000
): Promise<{ events: Event[]; error?: string }> {
  return new Promise((resolve) => {
    const events: Event[] = [];
    let done = false;
    let ws: WebSocket;
    const finish = (error?: string) => {
      if (done) return;
      done = true;
      try { ws.close(); } catch {}
      resolve({ events, error });
    };
    try {
      ws = new WebSocket(url);
    } catch {
      resolve({ events, error: "URL inválida" });
      return;
    }
    const timer = setTimeout(() => finish(events.length ? undefined : "timeout"), timeoutMs);
    ws.onopen = () => ws.send(JSON.stringify(["REQ", "figus-sync", ...filters]));
    ws.onmessage = (msg) => {
      try {
        const m = JSON.parse(msg.data as string);
        if (m[0] === "EVENT" && m[1] === "figus-sync") events.push(m[2] as Event);
        if (m[0] === "EOSE" || m[0] === "CLOSED") { clearTimeout(timer); finish(); }
      } catch {}
    };
    ws.onerror = () => { clearTimeout(timer); finish("no se pudo conectar"); };
    ws.onclose = () => { clearTimeout(timer); finish(); };
  });
}

function publishToRelay(
  url: string,
  evs: Event[],
  onEach: (published: number, failed: number) => void,
  perEventTimeoutMs = 5_000,
  maxConsecutiveTimeouts = 5,
  maxDurationMs = 120_000
): Promise<{ published: number; failed: number; error?: string }> {
  return new Promise((resolve) => {
    let published = 0;
    let failed = 0;
    let idx = 0;
    let settled = false;
    let consecutiveTimeouts = 0;
    let ws: WebSocket;
    let timer: ReturnType<typeof setTimeout> | null = null;
    const finish = (error?: string) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      clearTimeout(budgetTimer);
      try { ws.close(); } catch {}
      resolve({ published, failed, error });
    };
    // Presupuesto total por relay: uno lento no puede demorar la corrida entera.
    // Lo publicado hasta acá vale; el resto queda para la próxima sincronización.
    const budgetTimer = setTimeout(
      () => finish(published > 0 ? undefined : "demasiado lento — abortado"),
      maxDurationMs
    );
    try {
      ws = new WebSocket(url);
    } catch {
      resolve({ published: 0, failed: evs.length, error: "URL inválida" });
      return;
    }
    const sendNext = () => {
      if (idx >= evs.length) { finish(); return; }
      ws.send(JSON.stringify(["EVENT", evs[idx]]));
      timer = setTimeout(() => {
        // sin OK a tiempo: lo contamos fallido y seguimos — pero si el relay
        // nunca confirma nada, no lo dejamos secuestrar la sincronización.
        failed++;
        idx++;
        consecutiveTimeouts++;
        onEach(published, failed);
        if (consecutiveTimeouts >= maxConsecutiveTimeouts) {
          finish("no confirma eventos — abortado");
          return;
        }
        sendNext();
      }, perEventTimeoutMs);
    };
    ws.onopen = () => sendNext();
    ws.onmessage = (msg) => {
      try {
        const m = JSON.parse(msg.data as string);
        if (m[0] !== "OK" || m[1] !== evs[idx]?.id) return;
        if (timer) clearTimeout(timer);
        consecutiveTimeouts = 0;
        if (m[2]) published++;
        else failed++; // rechazado (rate limit, política, etc.)
        idx++;
        onEach(published, failed);
        sendNext();
      } catch {}
    };
    ws.onerror = () => finish("no se pudo conectar");
    ws.onclose = () => finish();
  });
}

// ── Orquestador de sincronización ─────────────────────────────────────────────

export type RelayStatus = "pendiente" | "buscando" | "ok" | "error" | "publicando" | "sincronizado";

export interface RelayReport {
  url: string;
  status: RelayStatus;
  found: number;      // eventos de figus que el relay ya tiene
  missing: number;    // eventos que le faltan respecto del set canónico
  published: number;  // republicados con OK
  failed: number;     // rechazados / timeout
  error?: string;
}

export interface SyncProgress {
  phase: "collect" | "diagnose" | "publish" | "done";
  message: string;
  overall: number; // 0..1
  relays: RelayReport[];
  totalEvents: number;   // tamaño del set canónico
  backedUp: number;      // eventos en respaldo local tras la corrida
  newLocal: number;      // pruebas nuevas traídas al respaldo en esta corrida
}

/**
 * entrada → trae TODO de los relays al respaldo local (no publica nada).
 * salida  → republica el respaldo local a los relays donde falte.
 * full    → entrada + salida en una pasada.
 */
export type SyncMode = "entrada" | "salida" | "full";

export interface SyncOptions {
  user: string;
  relays: string[];
  onProgress: (p: SyncProgress) => void;
  signal?: { cancelled: boolean };
  mode?: SyncMode;
}

/** Solo nos importan las pruebas de figus: ownership vigente + grants. */
function figuFilters(user: string): Filter[] {
  return [
    { kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [user] },
    { kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [user] },
  ];
}

export async function syncFigus({ user, relays, onProgress, signal, mode = "full" }: SyncOptions): Promise<SyncProgress> {
  const reports: RelayReport[] = relays.map((url) => ({
    url, status: "pendiente", found: 0, missing: 0, published: 0, failed: 0,
  }));
  const state: SyncProgress = {
    phase: "collect", message: "Conectando a los relays…", overall: 0.02,
    relays: reports, totalEvents: 0, backedUp: 0, newLocal: 0,
  };
  const emit = () => onProgress({ ...state, relays: reports.map((r) => ({ ...r })) });
  emit();

  // Respaldo local previo — base de la salida y referencia para contar qué
  // trae de nuevo la entrada.
  let localEvents: Event[] = [];
  try {
    localEvents = (await loadBackup(user)).filter((ev) => ev.pubkey === ISSUER_PUBKEY);
  } catch {}
  const localIds = new Set(localEvents.map((ev) => ev.id));

  // ── Fase 1: recolectar las figus relay por relay ────────────────────────────
  // Siempre se consulta: la entrada lo necesita para traer, la salida para
  // saber qué le falta a cada relay antes de publicar.
  const perRelayIds = new Map<string, Set<string>>();
  const union = new Map<string, Event>();

  let collected = 0;
  await Promise.all(relays.map(async (url, i) => {
    reports[i].status = "buscando";
    emit();
    const { events, error } = await queryRelay(url, figuFilters(user));
    const ids = new Set<string>();
    for (const ev of events) {
      if (ev.pubkey !== ISSUER_PUBKEY) continue;       // solo eventos del issuer
      if (!union.has(ev.id)) {
        try { if (!verifyEvent(ev)) continue; } catch { continue; } // firma válida
        union.set(ev.id, ev);
      }
      ids.add(ev.id);
    }
    perRelayIds.set(url, ids);
    reports[i].found = ids.size;
    reports[i].status = error ? "error" : "ok";
    reports[i].error = error;
    collected++;
    state.message = `Buscando tus figus… (${collected}/${relays.length} relays)`;
    state.overall = 0.02 + 0.33 * (collected / relays.length);
    emit();
  }));
  if (signal?.cancelled) return state;

  // Pruebas nuevas que los relays tienen y el respaldo local no (entrada).
  state.newLocal = [...union.keys()].filter((id) => !localIds.has(id)).length;

  // Sumar el respaldo local a la union: si todos los relays perdieron algo,
  // acá sigue vivo.
  for (const ev of localEvents) {
    if (!union.has(ev.id)) union.set(ev.id, ev);
  }

  // ── Fase 2: set canónico + diagnóstico ──────────────────────────────────────
  // 30100 es reemplazable: solo vale el último por d-tag (republicar versiones
  // viejas es inútil). Los grants 1573 son regulares: van todos.
  // Salida: el set sale SOLO del respaldo local (lo local es la fuente);
  // entrada/full: union de relays + respaldo.
  state.phase = "diagnose";
  state.message = "Armando el set canónico de tus figus…";
  state.overall = 0.37;
  emit();

  const sourceEvents = mode === "salida" ? localEvents : [...union.values()];
  const latestByD = new Map<string, Event>();
  const grants: Event[] = [];
  for (const ev of sourceEvents) {
    if (ev.kind === KIND.OWNERSHIP) {
      const d = ev.tags.find((t) => t[0] === "d")?.[1] ?? ev.id;
      const cur = latestByD.get(d);
      if (!cur || ev.created_at > cur.created_at) latestByD.set(d, ev);
    } else if (ev.kind === KIND.GRANT) {
      grants.push(ev);
    }
  }
  const canonical = [...latestByD.values(), ...grants];
  const canonicalIds = canonical.map((e) => e.id);
  state.totalEvents = canonical.length;

  // Entrada (y full): persistir TODO lo recolectado en el respaldo local.
  if (mode !== "salida") {
    try {
      await backupEvents(user, [...union.values()]);
      state.backedUp = union.size;
    } catch {}
  } else {
    state.backedUp = localEvents.length;
  }

  // Entrada pura: acá termina — no se publica nada.
  if (mode === "entrada") {
    for (const r of reports) if (r.status === "ok") r.status = "sincronizado";
    state.phase = "done";
    state.overall = 1;
    state.message = state.newLocal > 0
      ? `✅ ${state.newLocal} pruebas nuevas traídas de los relays · respaldo local: ${state.backedUp}`
      : `✅ Tu respaldo local ya tenía todo (${state.backedUp} pruebas)`;
    emit();
    return state;
  }

  let totalMissing = 0;
  for (let i = 0; i < relays.length; i++) {
    const ids = perRelayIds.get(relays[i]) ?? new Set();
    reports[i].missing = reports[i].status === "error"
      ? 0 // no sabemos qué tiene; no le publicamos a ciegas
      : canonicalIds.filter((id) => !ids.has(id)).length;
    totalMissing += reports[i].missing;
  }
  state.overall = 0.4;
  state.message = totalMissing > 0
    ? `Faltan ${totalMissing} copias entre todos los relays — republicando…`
    : "Todos los relays ya tienen tus figus";
  emit();
  if (signal?.cancelled) return state;

  // ── Fase 3: republicar lo que falta, relay por relay ────────────────────────
  state.phase = "publish";
  let donePublishing = 0;
  await Promise.all(relays.map(async (url, i) => {
    if (reports[i].missing === 0 || reports[i].status === "error") {
      if (reports[i].status === "ok") reports[i].status = "sincronizado";
      emit();
      return;
    }
    const ids = perRelayIds.get(url) ?? new Set();
    const toSend = canonical.filter((e) => !ids.has(e.id));
    reports[i].status = "publicando";
    emit();
    const res = await publishToRelay(url, toSend, (published, failed) => {
      reports[i].published = published;
      reports[i].failed = failed;
      donePublishing = reports.reduce((a, r) => a + r.published + r.failed, 0);
      state.overall = totalMissing > 0 ? 0.4 + 0.58 * (donePublishing / totalMissing) : 0.98;
      state.message = `Republicando en ${url.replace(/^wss?:\/\//, "")}… (${published + failed}/${toSend.length})`;
      emit();
    });
    reports[i].published = res.published;
    reports[i].failed = res.failed + (toSend.length - res.published - res.failed);
    reports[i].status = res.error ? "error" : "sincronizado";
    if (res.error) reports[i].error = res.error;
    emit();
  }));

  // ── Listo ───────────────────────────────────────────────────────────────────
  const totalPublished = reports.reduce((a, r) => a + r.published, 0);
  const okRelays = reports.filter((r) => r.status === "sincronizado").length;
  state.phase = "done";
  state.overall = 1;
  const desde = mode === "salida" ? " desde tu respaldo local" : "";
  state.message = totalMissing > 0
    ? `✅ ${totalPublished} copias republicadas${desde} · tus figus están en ${okRelays}/${relays.length} relays`
    : `✅ Tus ${canonical.length} pruebas ya estaban replicadas en ${okRelays}/${relays.length} relays`;
  emit();
  return state;
}
