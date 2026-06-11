import { NextRequest, NextResponse } from "next/server";
import { verifyEvent } from "nostr-tools/pure";
import type { Event } from "nostr-tools";
import fs from "fs";
import path from "path";
import { nwcPayServer, fetchNostrEvents } from "@/lib/nwc-server";
import { hasClaimed, markClaimed } from "@/lib/claim-ledger";
import { PAGES, ALL_NUMBERS } from "@/lib/catalog";

const REWARD_PAGE_SATS  = Number(process.env.REWARD_PAGE_SATS  || "210");
const REWARD_ALBUM_SATS = Number(process.env.REWARD_ALBUM_SATS || "5000");

export async function POST(req: NextRequest) {
  // ── Parse body ──────────────────────────────────────────────────────────────
  let body: { event?: unknown; pageId?: unknown };
  try { body = await req.json(); }
  catch { return err("Cuerpo de solicitud inválido", 400); }

  const { event: signedEvent, pageId } = body;
  if (!signedEvent || typeof pageId !== "string") return err("Faltan datos", 400);

  // ── Verify Nostr signature ──────────────────────────────────────────────────
  try {
    if (!verifyEvent(signedEvent as Parameters<typeof verifyEvent>[0])) throw 0;
  } catch {
    return err("Firma inválida", 400);
  }

  const ev = signedEvent as { pubkey: string; created_at: number; tags: string[][] };

  // Event must be recent (within 10 minutes)
  const ageSecs = Math.abs(Math.floor(Date.now() / 1000) - ev.created_at);
  if (ageSecs > 600) return err("Evento expirado — intentá de nuevo", 400);

  // pageId in event must match body
  const evPageId = ev.tags.find((t) => t[0] === "page")?.[1];
  if (evPageId !== pageId) return err("Evento no coincide con el pageId", 400);

  const pubkey   = ev.pubkey;
  const isAlbum  = pageId === "album";

  // ── Determine reward amount & required stickers ──────────────────────────────
  let requiredNums: number[];
  let amountSats: number;

  if (isAlbum) {
    requiredNums = ALL_NUMBERS;
    amountSats   = REWARD_ALBUM_SATS;
  } else {
    const page = PAGES.find((p) => p.id === pageId);
    if (!page) return err("Página no encontrada", 400);
    requiredNums = page.numbers;
    amountSats   = REWARD_PAGE_SATS;
  }

  // ── Anti-double-claim ───────────────────────────────────────────────────────
  if (hasClaimed(pubkey, pageId)) {
    return err("Ya reclamaste este premio anteriormente", 409);
  }

  // ── Verify ownership on Nostr relay ─────────────────────────────────────────
  const issuerPubkey = process.env.NEXT_PUBLIC_ISSUER_PUBKEY ?? "";
  if (issuerPubkey) {
    const owned = await fetchOwnedStickers(pubkey, issuerPubkey, requiredNums);
    const missing = requiredNums.filter((n) => !owned.has(n));
    if (missing.length > 0) {
      return err(
        `Aún te faltan ${missing.length} figurita${missing.length > 1 ? "s" : ""} para completar ${isAlbum ? "el álbum" : "la página"}`,
        422
      );
    }
  }

  // ── NWC config check ────────────────────────────────────────────────────────
  const nwcStr = process.env.REWARD_NWC;
  if (!nwcStr) return err("Premios no configurados en el servidor", 503);

  // ── Get user's lightning address from Nostr profile ──────────────────────────
  const lud16 = await fetchUserLud16(pubkey);
  if (!lud16) {
    return err(
      "No encontramos una dirección Lightning en tu perfil Nostr. " +
      "Agregá tu lud16 en tu perfil (ej: usuario@wallet.com) y volvé a intentar.",
      422
    );
  }

  // ── Generate invoice via LNURL-pay ──────────────────────────────────────────
  let invoice: string;
  try {
    invoice = await getInvoice(lud16, amountSats);
  } catch (e: any) {
    return err(`No se pudo generar la factura Lightning: ${e.message}`, 502);
  }

  // ── Pay via reward NWC ──────────────────────────────────────────────────────
  try {
    await nwcPayServer(invoice, nwcStr);
  } catch (e: any) {
    return err(`Error al enviar el pago: ${e.message}`, 502);
  }

  // ── Record claim ────────────────────────────────────────────────────────────
  markClaimed(pubkey, pageId, amountSats);

  return NextResponse.json({
    ok: true,
    message: `¡Premio pagado! ⚡ ${amountSats} sats enviados a ${lud16}`,
  });
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function err(message: string, status: number) {
  return NextResponse.json({ error: message }, { status });
}

async function fetchUserLud16(pubkey: string): Promise<string | null> {
  const relays = (process.env.NEXT_PUBLIC_RELAYS ?? "wss://relay.damus.io,wss://nos.lol")
    .split(",")
    .map((r) => r.trim())
    .filter(Boolean);

  for (const relay of relays) {
    try {
      const events = await fetchNostrEvents(
        relay,
        { kinds: [0], authors: [pubkey], limit: 1 },
        6_000
      );
      if (!events.length) continue;
      const ev = events[0] as { content: string };
      const profile = JSON.parse(ev.content) as Record<string, string>;
      if (profile.lud16) return profile.lud16;
    } catch {}
  }
  return null;
}

async function getInvoice(lnAddress: string, amountSats: number): Promise<string> {
  const [user, domain] = lnAddress.split("@");
  if (!user || !domain) throw new Error("Dirección Lightning inválida");

  const lnurlRes = await fetch(`https://${domain}/.well-known/lnurlp/${user}`);
  if (!lnurlRes.ok) throw new Error(`LNURL error ${lnurlRes.status}`);
  const lnurlData = (await lnurlRes.json()) as {
    callback: string;
    minSendable: number;
    maxSendable: number;
  };
  if (!lnurlData.callback) throw new Error("LNURL sin callback");

  const amountMs = amountSats * 1000;
  if (amountMs < lnurlData.minSendable || amountMs > lnurlData.maxSendable) {
    throw new Error(
      `Monto ${amountSats} sats fuera del rango permitido ` +
      `(${lnurlData.minSendable / 1000}–${lnurlData.maxSendable / 1000} sats)`
    );
  }

  const cbUrl = new URL(lnurlData.callback);
  cbUrl.searchParams.set("amount", String(amountMs));
  const invRes = await fetch(cbUrl.toString());
  if (!invRes.ok) throw new Error(`Callback error ${invRes.status}`);
  const invData = (await invRes.json()) as { pr?: string; reason?: string };
  if (!invData.pr) throw new Error(invData.reason || "No se recibió la factura");

  return invData.pr;
}

// Lee el ownership directamente del cache local del issuer (data/ownership.json).
// El issuer es el único autor de los 30100 — su espejo local es autoritativo y
// no depende de que los relays externos estén disponibles o sin límite.
// Fallback a relay query si el archivo no existe (setup inicial sin cache).
async function fetchOwnedStickers(pubkey: string, issuerPubkey: string, requiredNums: number[]): Promise<Set<number>> {
  const owned = new Set<number>();

  // ── Opción A: cache local (mismo servidor que el issuer) ──────────────────
  try {
    const ownershipPath = path.join(process.cwd(), "data", "ownership.json");
    const raw = JSON.parse(fs.readFileSync(ownershipPath, "utf-8")) as Record<string, number>;
    for (const num of requiredNums) {
      if ((raw[`${pubkey}:${num}`] ?? 0) > 0) owned.add(num);
    }
    return owned; // archivo existe → es la fuente de verdad
  } catch {
    // El archivo no existe todavía (primera vez) — caer a relays
  }

  // ── Opción B: fallback — query por relay ──────────────────────────────────
  const albumId = process.env.NEXT_PUBLIC_ALBUM_ID ?? "mundial-2026";
  const dTags = requiredNums.map((n) => `${pubkey}:${albumId}:${n}`);
  const relays = (process.env.NEXT_PUBLIC_RELAYS ?? "wss://relay.damus.io,wss://nos.lol")
    .split(",").map((r) => r.trim()).filter(Boolean);

  for (const relay of relays) {
    try {
      const events = await fetchNostrEvents(
        relay,
        { kinds: [30100], authors: [issuerPubkey], "#d": dTags },
        10_000
      );
      const latest = new Map<string, { tags: string[][] }>();
      for (const ev of events as { pubkey: string; tags: string[][]; created_at: number }[]) {
        if (ev.pubkey !== issuerPubkey) continue;
        try { if (!verifyEvent(ev as unknown as Event)) continue; } catch { continue; }
        const d = ev.tags.find((t) => t[0] === "d")?.[1];
        if (!d) continue;
        const prev = latest.get(d) as { created_at: number } | undefined;
        if (!prev || ev.created_at > prev.created_at) latest.set(d, ev);
      }
      for (const ev of latest.values()) {
        const sticker = ev.tags.find((t) => t[0] === "sticker")?.[1];
        const count   = Number(ev.tags.find((t) => t[0] === "count")?.[1] ?? "0");
        if (sticker && count > 0) owned.add(Number(sticker.split(":")[1]));
      }
      if (owned.size > 0) break;
    } catch {}
  }
  return owned;
}
