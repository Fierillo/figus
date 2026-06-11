// Respaldo local de los eventos Nostr que prueban la tenencia de figus
// (30100 ownership + 1573 grants, firmados por el issuer). Se guardan en
// IndexedDB para que el usuario conserve sus pruebas aunque TODOS los relays
// pierdan los eventos: la sincronización puede republicarlas desde acá.
import type { Event } from "nostr-tools";

const DB_NAME = "figus-backup";
const STORE = "events";

interface BackupRow {
  id: string;       // event id (clave primaria — dedup natural)
  owner: string;    // pubkey del dueño de las figus
  kind: number;
  created_at: number;
  ev: Event;        // evento Nostr completo, con firma — republicable tal cual
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const store = db.createObjectStore(STORE, { keyPath: "id" });
        store.createIndex("owner", "owner", { unique: false });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function available(): boolean {
  return typeof indexedDB !== "undefined";
}

/** Guarda (upsert) eventos en el respaldo local. Inocuo si IndexedDB no existe. */
export async function backupEvents(owner: string, evs: Event[]): Promise<void> {
  if (!available() || evs.length === 0) return;
  const db = await openDb();
  try {
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE, "readwrite");
      const store = tx.objectStore(STORE);
      for (const ev of evs) {
        const row: BackupRow = { id: ev.id, owner, kind: ev.kind, created_at: ev.created_at, ev };
        store.put(row);
      }
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } finally {
    db.close();
  }
}

/** Devuelve todos los eventos respaldados del dueño. */
export async function loadBackup(owner: string): Promise<Event[]> {
  if (!available()) return [];
  const db = await openDb();
  try {
    return await new Promise<Event[]>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("owner");
      const req = idx.getAll(IDBKeyRange.only(owner));
      req.onsuccess = () => resolve((req.result as BackupRow[]).map((r) => r.ev));
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}

/** Cantidad de eventos respaldados del dueño. */
export async function backupCount(owner: string): Promise<number> {
  if (!available()) return 0;
  const db = await openDb();
  try {
    return await new Promise<number>((resolve, reject) => {
      const tx = db.transaction(STORE, "readonly");
      const idx = tx.objectStore(STORE).index("owner");
      const req = idx.count(IDBKeyRange.only(owner));
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  } finally {
    db.close();
  }
}
