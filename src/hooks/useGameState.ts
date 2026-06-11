"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Event } from "nostr-tools";
import { KIND, ISSUER_PUBKEY, ALBUM_ID } from "@/lib/constants";
import { list, subscribe } from "@/lib/pool";
import {
  parseListings,
  parseOwnership,
  parseSettlement,
} from "@/lib/parsers";
import { onlyFromIssuer, isSelfSigned } from "@/lib/verify";
import { backupEvents } from "@/lib/figuDb";
import type { Listing, Ownership, Settlement } from "@/lib/types";
import { ALL_NUMBERS } from "@/lib/catalog";

const ownKey     = (pk: string) => `figus_own_${pk}`;
const claimedKey = (pk: string) => `figus_claimed_${pk}`;

function readLocalOwn(pubkey: string): Ownership {
  try { return JSON.parse(localStorage.getItem(ownKey(pubkey)) ?? "{}") ?? {}; }
  catch { return {}; }
}

function writeLocalOwn(pubkey: string, own: Ownership) {
  try { localStorage.setItem(ownKey(pubkey), JSON.stringify(own)); } catch {}
}

function isLocalClaimed(pubkey: string): boolean {
  try { return !!localStorage.getItem(claimedKey(pubkey)); } catch { return false; }
}

function mergeOwn(nostr: Ownership, local: Ownership): Ownership {
  // Server is authoritative for stickers it has records for.
  // Local is kept only for pending optimistic adds not yet confirmed by server.
  const result: Ownership = { ...local };
  for (const k of Object.keys(nostr)) {
    result[Number(k)] = nostr[Number(k)];
  }
  return result;
}

function subtractSales(merged: Ownership, soldCounts: Record<number, number>): Ownership {
  if (Object.keys(soldCounts).length === 0) return merged;
  const result = { ...merged };
  for (const k of Object.keys(soldCounts)) {
    const n = Number(k);
    result[n] = Math.max(0, (result[n] ?? 0) - soldCounts[n]);
  }
  return result;
}

// Remove listings that have a confirmed settlement.
// settled is an array of {from, stickerNum} pairs — one entry per settlement.
// If a seller settled the same sticker twice, two listings are removed.
function applySettledFilter(
  openListings: Listing[],
  settled: { from: string; stickerNum: number }[]
): Listing[] {
  if (settled.length === 0) return openListings;
  const counts = new Map<string, number>();
  for (const s of settled) {
    const key = `${s.from}:${s.stickerNum}`;
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  const used = new Map<string, number>();
  return openListings.filter(l => {
    const key = `${l.seller}:${l.stickerNum}`;
    const total = counts.get(key) ?? 0;
    const u = used.get(key) ?? 0;
    if (u < total) {
      used.set(key, u + 1);
      return false; // settled — remove from market
    }
    return true;
  });
}

export function useGameState(pubkey: string | null) {
  const [ownership, setOwnership] = useState<Ownership>({});
  const [listings, setListings] = useState<Listing[]>([]);
  const [settlements, setSettlements] = useState<Settlement[]>([]);
  const [loading, setLoading] = useState(true);
  const [hasClaimedFreePack, setHasClaimedFreePack] = useState(false);
  const ownEvents     = useRef<Event[]>([]);
  const listingEvents = useRef<Event[]>([]);
  // All confirmed settlement pairs — kept in a ref so the listing subscription
  // can always apply the latest filter without re-subscribing.
  const settledPairs  = useRef<{ from: string; stickerNum: number }[]>([]);
  // How many of each sticker the current user has sold — subtracted from merged ownership.
  const soldCounts    = useRef<Record<number, number>>({});

  useEffect(() => {
    ownEvents.current    = [];
    listingEvents.current = [];
    settledPairs.current = [];
    soldCounts.current   = {};

    if (pubkey) {
      setOwnership(readLocalOwn(pubkey));
      setHasClaimedFreePack(isLocalClaimed(pubkey));
    } else {
      setOwnership({});
      setHasClaimedFreePack(false);
    }

    if (!ISSUER_PUBKEY) {
      setLoading(false);
      return;
    }
    let unsubs: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      setLoading(true);

      if (pubkey) {
        const [owns, grants, freeClaims] = await Promise.all([
          list([{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }]),
          list([{ kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [pubkey], limit: 1 }]),
          list([{ kinds: [KIND.FREE_PACK_CLAIM], authors: [pubkey], "#d": [`free-pack:${ALBUM_ID}`] }]),
        ]);
        if (!cancelled) {
          // Solo confiamos en eventos con firma válida del issuer (Fix #3).
          ownEvents.current = onlyFromIssuer(owns);
          // Respaldo local pasivo: las pruebas de tenencia quedan en IndexedDB
          // aunque los relays las pierdan (se republican desde Configuración).
          backupEvents(pubkey, ownEvents.current).catch(() => {});
          const validGrants = onlyFromIssuer(grants);
          const validFreeClaims = freeClaims.filter(isSelfSigned);
          const claimed = validGrants.length > 0 || validFreeClaims.length > 0 || isLocalClaimed(pubkey);
          setHasClaimedFreePack(claimed);
          if (claimed) {
            try { localStorage.setItem(claimedKey(pubkey), "1"); } catch {}
          }
        }
      }

      // Load listings and settlements in parallel so we can apply the settlement
      // filter to listings immediately, without a window where sold listings are visible.
      const [ls, st] = await Promise.all([
        list([{ kinds: [KIND.LISTING] }]),
        list([{ kinds: [KIND.SETTLEMENT], authors: [ISSUER_PUBKEY] }]),
      ]);

      if (!cancelled) {
        // Settlements: solo los firmados por el issuer (Fix #3).
        const parsedSt = onlyFromIssuer(st).map(parseSettlement).filter((s): s is Settlement => s !== null);

        // Populate settled pairs BEFORE setting listings so the filter is ready.
        settledPairs.current = parsedSt.map(s => ({ from: s.from, stickerNum: s.stickerNum }));

        // Listings: eventos de usuario; exigimos firma válida (el autor es el vendedor).
        listingEvents.current = ls.filter(isSelfSigned);
        setListings(applySettledFilter(
          parseListings(listingEvents.current).filter(l => l.status === "open"),
          settledPairs.current
        ));

        setSettlements(parsedSt);

        if (pubkey) {
          const counts: Record<number, number> = {};
          for (const s of parsedSt) {
            if (s.from === pubkey) {
              counts[s.stickerNum] = (counts[s.stickerNum] ?? 0) + 1;
            }
          }
          soldCounts.current = counts;
          const merged = mergeOwn(parseOwnership(ownEvents.current), readLocalOwn(pubkey));
          writeLocalOwn(pubkey, merged);
          setOwnership(subtractSales(merged, counts));
        }
      }

      if (!cancelled) setLoading(false);

      if (pubkey) {
        unsubs.push(
          subscribe(
            [{ kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] }],
            (ev) => {
              if (!onlyFromIssuer([ev]).length) return; // descartar inyecciones (Fix #3)
              ownEvents.current = [...ownEvents.current, ev];
              backupEvents(pubkey, [ev]).catch(() => {}); // respaldo local incremental
              setOwnership(subtractSales(
                mergeOwn(parseOwnership(ownEvents.current), readLocalOwn(pubkey)),
                soldCounts.current
              ));
            }
          )
        );
      }

      unsubs.push(
        subscribe([{ kinds: [KIND.LISTING] }], (ev) => {
          if (!isSelfSigned(ev)) return; // listing con firma inválida (Fix #3)
          listingEvents.current = [...listingEvents.current, ev];
          // Always apply the settled filter so re-delivered or new listing events
          // don't resurrect sold listings.
          setListings(applySettledFilter(
            parseListings(listingEvents.current).filter(l => l.status === "open"),
            settledPairs.current
          ));
        })
      );

      unsubs.push(
        subscribe([{ kinds: [KIND.SETTLEMENT], authors: [ISSUER_PUBKEY] }], (ev) => {
          if (!onlyFromIssuer([ev]).length) return; // settlement no firmado por issuer (Fix #3)
          const s = parseSettlement(ev);
          if (!s) return;

          setSettlements(prev => {
            if (prev.some(p => p.id === s.id)) return prev;
            return [s, ...prev];
          });

          // Add to settled pairs and re-derive listings so the sold listing disappears.
          settledPairs.current = [...settledPairs.current, { from: s.from, stickerNum: s.stickerNum }];
          setListings(applySettledFilter(
            parseListings(listingEvents.current).filter(l => l.status === "open"),
            settledPairs.current
          ));

          if (pubkey && s.from === pubkey) {
            soldCounts.current = {
              ...soldCounts.current,
              [s.stickerNum]: (soldCounts.current[s.stickerNum] ?? 0) + 1,
            };
            setOwnership(prev => {
              const next = { ...prev };
              next[s.stickerNum] = Math.max(0, (next[s.stickerNum] ?? 0) - 1);
              return next;
            });
          }
        })
      );
    })();

    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [pubkey]);

  const owned = ALL_NUMBERS.filter((n) => (ownership[n] || 0) > 0).length;
  const dupes = ALL_NUMBERS.filter((n) => (ownership[n] || 0) > 1);

  const refresh = useCallback(async () => {
    if (!pubkey || !ISSUER_PUBKEY) return;
    const owns = onlyFromIssuer(await list([
      { kinds: [KIND.OWNERSHIP], authors: [ISSUER_PUBKEY], "#p": [pubkey] },
    ]));
    ownEvents.current = owns;
    const merged = mergeOwn(parseOwnership(owns), readLocalOwn(pubkey));
    writeLocalOwn(pubkey, merged);
    setOwnership(subtractSales(merged, soldCounts.current));
  }, [pubkey]);

  const claimPack = useCallback((nums: number[]) => {
    if (!pubkey) return;
    setHasClaimedFreePack(true);
    try {
      localStorage.setItem(claimedKey(pubkey), "1");
      const local = readLocalOwn(pubkey);
      for (const n of nums) local[n] = (local[n] ?? 0) + 1;
      writeLocalOwn(pubkey, local);
      setOwnership(prev => {
        const next = { ...prev };
        for (const n of nums) next[n] = (next[n] ?? 0) + 1;
        return next;
      });
    } catch {}
  }, [pubkey]);

  const addSticker = useCallback((num: number) => {
    if (!pubkey) return;
    try {
      const local = readLocalOwn(pubkey);
      local[num] = (local[num] ?? 0) + 1;
      writeLocalOwn(pubkey, local);
      setOwnership(prev => {
        const next = { ...prev };
        next[num] = (next[num] ?? 0) + 1;
        return next;
      });
    } catch {}
  }, [pubkey]);

  // Agrega varias figuritas de una, todo local (sin eventos Nostr).
  // Batchea el write a localStorage y un único setState para no re-renderizar N veces.
  const addStickers = useCallback((nums: number[]) => {
    if (!pubkey || nums.length === 0) return;
    try {
      const local = readLocalOwn(pubkey);
      for (const n of nums) local[n] = (local[n] ?? 0) + 1;
      writeLocalOwn(pubkey, local);
      setOwnership(prev => {
        const next = { ...prev };
        for (const n of nums) next[n] = (next[n] ?? 0) + 1;
        return next;
      });
    } catch {}
  }, [pubkey]);

  return { ownership, listings, settlements, owned, dupes, loading, refresh, albumId: ALBUM_ID, hasClaimedFreePack, claimPack, addSticker, addStickers };
}
