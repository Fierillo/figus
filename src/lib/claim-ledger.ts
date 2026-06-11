// Server-only claim ledger — persists paid rewards to a local JSON file.
// Prevents double-payment regardless of relay state.
//
// Anti doble-claim en dos niveles:
//   - secuencial: hasClaimed() rechaza un reclamo ya registrado.
//   - concurrente: reserveClaim() reserva ATÓMICAMENTE (read+write síncronos, sin
//     await en el medio) antes de pagar. Dos requests simultáneos para la misma
//     (pubkey, página) no pueden reservar los dos — el segundo recibe 409 y nunca
//     paga. Si el pago falla, releaseClaim() libera la reserva para reintentar.
import fs from "fs";
import path from "path";

const LEDGER_DIR  = path.join(process.cwd(), "data");
const LEDGER_PATH = path.join(LEDGER_DIR, "claims.json");

type ClaimStatus = "pending" | "confirmed";
type Entry = { ts: number; amountSats: number; status?: ClaimStatus };
type Ledger = Record<string, Entry>;

const key = (pubkey: string, claimKey: string) => `${pubkey}:${claimKey}`;

function read(): Ledger {
  try {
    if (!fs.existsSync(LEDGER_PATH)) return {};
    return JSON.parse(fs.readFileSync(LEDGER_PATH, "utf-8")) as Ledger;
  } catch {
    return {};
  }
}

function write(ledger: Ledger): void {
  if (!fs.existsSync(LEDGER_DIR)) fs.mkdirSync(LEDGER_DIR, { recursive: true });
  // Escritura atómica: tmp + rename, nunca deja el JSON a medias.
  const tmp = `${LEDGER_PATH}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(ledger, null, 2));
  fs.renameSync(tmp, LEDGER_PATH);
}

/** True si la página ya fue reclamada (reserva pendiente o pago confirmado). */
export function hasClaimed(pubkey: string, claimKey: string): boolean {
  return Boolean(read()[key(pubkey, claimKey)]);
}

/**
 * Reserva atómica previa al pago. Devuelve true si reservó (el caller debe
 * pagar y luego confirmar/liberar); false si ya estaba reservada/confirmada.
 * Síncrona a propósito: sin await entre el read y el write, dos requests
 * concurrentes no pueden ganar los dos.
 */
export function reserveClaim(pubkey: string, claimKey: string, amountSats: number): boolean {
  const ledger = read();
  const k = key(pubkey, claimKey);
  if (ledger[k]) return false;
  ledger[k] = { ts: Date.now(), amountSats, status: "pending" };
  write(ledger);
  return true;
}

/** Confirma una reserva tras el pago exitoso. */
export function confirmClaim(pubkey: string, claimKey: string): void {
  const ledger = read();
  const k = key(pubkey, claimKey);
  if (!ledger[k]) return;
  ledger[k].status = "confirmed";
  ledger[k].ts = Date.now();
  write(ledger);
}

/** Libera una reserva pendiente (el pago falló) para permitir reintentar. */
export function releaseClaim(pubkey: string, claimKey: string): void {
  const ledger = read();
  const k = key(pubkey, claimKey);
  if (ledger[k]?.status === "pending") {
    delete ledger[k];
    write(ledger);
  }
}

/** @deprecated usar reserveClaim + confirmClaim. Se mantiene por compatibilidad. */
export function markClaimed(pubkey: string, claimKey: string, amountSats: number): void {
  const ledger = read();
  ledger[key(pubkey, claimKey)] = { ts: Date.now(), amountSats, status: "confirmed" };
  write(ledger);
}
