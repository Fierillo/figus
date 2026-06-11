import { SimplePool, type Event, type Filter } from "nostr-tools";
import { RELAYS } from "./constants";
import { getExtraRelays } from "./relaySync";

// Pool único compartido en el cliente
let pool: SimplePool | null = null;

export function getPool(): SimplePool {
  if (!pool) pool = new SimplePool();
  return pool;
}

// Relays base + los que el usuario agregó (resiliencia): las suscripciones y
// publicaciones de la app usan el set completo.
export function getRelays(): string[] {
  if (typeof window === "undefined") return RELAYS;
  return [...new Set([...RELAYS, ...getExtraRelays()])];
}

// Pre-establish WebSocket connections to all relays so the first real query is fast
export function warmupRelays(): void {
  const p = getPool();
  const sub = p.subscribeMany(getRelays(), { kinds: [0], limit: 0 } as Filter, { onevent: () => {} });
  setTimeout(() => sub.close(), 3000);
}

// Query puntual: junta eventos de varios filtros hasta EOSE y resuelve.
// maxWait 2000ms: con 5 relays confiables el EOSE llega mucho antes;
// cualquier relay que no responda en 2s se ignora sin bloquear el resto.
export async function list(filters: Filter[], maxWait = 2000): Promise<Event[]> {
  const p = getPool();
  const results = await Promise.all(
    filters.map((f) => p.querySync(getRelays(), f, { maxWait }))
  );
  const byId = new Map<string, Event>();
  for (const arr of results) for (const ev of arr) byId.set(ev.id, ev);
  return Array.from(byId.values());
}

// Suscripción viva a UN filtro. Devuelve unsub.
export function subscribeOne(
  filter: Filter,
  onevent: (ev: Event) => void
): () => void {
  const p = getPool();
  const sub = p.subscribeMany(getRelays(), filter, { onevent });
  return () => sub.close();
}

// Suscripción viva a varios filtros. Devuelve unsub que cierra todas.
export function subscribe(
  filters: Filter[],
  onevent: (ev: Event) => void
): () => void {
  const closers = filters.map((f) => subscribeOne(f, onevent));
  return () => closers.forEach((c) => c());
}

const SEARCH_RELAYS = ["wss://relay.nostr.band", "wss://noswhere.com"];

// Search query usando un pool temporal para no contaminar el pool principal
// con relays de búsqueda que pueden ser lentos o inestables.
export async function searchProfiles(searchTerm: string, limit = 8): Promise<Event[]> {
  const searchPool = new SimplePool();
  try {
    return await searchPool.querySync(SEARCH_RELAYS, { kinds: [0], search: searchTerm, limit }, { maxWait: 3500 });
  } finally {
    searchPool.close(SEARCH_RELAYS);
  }
}

export type { Event, Filter };
