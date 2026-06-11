"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { EventTemplate } from "nostr-tools";
import { useIdentity } from "@/hooks/useIdentity";
import { useGameState } from "@/hooks/useGameState";
import { useOpenMatches, useHasMyTurn, createMatch } from "@/hooks/usePenaltyMatch";
import { Connect } from "@/components/Connect";
import { Album } from "@/components/Album";
import { Packs, PackReveal, type PackMark } from "@/components/Packs";
import { Market } from "@/components/Market";
import { MyStickers } from "@/components/MyStickers";
import { Fixture } from "@/components/Fixture";
import { PenaltyGame } from "@/components/PenaltyGame";
import { Leaderboard } from "@/components/Leaderboard";
import { PenaltyMatchLobby, PenaltyMatchView } from "@/components/PenaltyMatch";
import type { PenaltyMatch } from "@/lib/penalty";
import { ALL_NUMBERS, rollSticker, CATALOG, RARITY_META } from "@/lib/catalog";
import { StickerFace } from "@/components/StickerCard";
import { ISSUER_PUBKEY, KIND, ALBUM_ID, addr } from "@/lib/constants";
import { requestOrderInvoice, tryPayInvoice } from "@/lib/order";
import { subscribeOne } from "@/lib/pool";
import { signEvent } from "@/lib/identity";
import { getPool, getRelays, warmupRelays } from "@/lib/pool";
import { InvoiceModal } from "@/components/InvoiceModal";
import { SettingsModal } from "@/components/SettingsModal";
import { RelaySyncModal } from "@/components/RelaySyncModal";
import { DevTools, DevModeFooter } from "@/components/DevTools";
import { StickerPlacementFX, RevealSummaryModal, type RevealResult } from "@/components/StickerPlacementFX";
import { LangProvider, useLang } from "@/contexts/LangContext";
import type { Listing, Page } from "@/lib/types";

type Tab = "album" | "packs" | "market" | "fixture" | "game";

export default function Home() {
  return <LangProvider><HomeInner /></LangProvider>;
}

function HomeInner() {
  const { t, lang, toggle: toggleLang } = useLang();
  const { identity, nip07Available, connectNip07, connectLocal, connectNip46QR, connectNip46Bunker, logout, importNsec } =
    useIdentity();
  const pubkey = identity?.pubkey ?? null;
  const { ownership, listings, settlements, owned, dupes, loading, refresh, hasClaimedFreePack, claimPack, addSticker, addStickers } =
    useGameState(pubkey);

  // DEV MODE: habilita herramientas de prueba locales (sin eventos Nostr).
  const isDev = process.env.NODE_ENV === "development";
  // Cola de figuritas pendientes de revelar con la animación de colocación.
  const [revealQueue, setRevealQueue] = useState<number[]>([]);
  // Marcas (nueva/repetida) alineadas con revealQueue — precalculadas al abrir el
  // sobre, para que la animación clasifique bien aunque la tenencia ya esté acreditada.
  const [revealMarks, setRevealMarks] = useState<PackMark[]>([]);
  // Pedido de foco para el álbum: salta a la página que contiene la figurita.
  const [albumFocus, setAlbumFocus] = useState<{ num: number; token: number } | null>(null);
  const focusToken = useRef(0);
  // Resumen del lote al terminar la cola (modal con nuevas y repetidas).
  const [revealSummary, setRevealSummary] = useState<RevealResult[] | null>(null);
  // Figuritas a la espera del efecto de pegado (corre al cerrar el sobre), con sus
  // marcas nueva/repetida alineadas. Lo usan tanto los sobres dev como los reales.
  const pendingPlacement = useRef<number[]>([]);
  const pendingPlacementMarks = useRef<PackMark[]>([]);
  // Figuritas NUEVAS cuya animación de pegado todavía no aterrizó: el álbum las
  // muestra como casillero vacío hasta que la carta cae. En el flujo real la
  // tenencia ya llegó vía 30100 ANTES de la animación — sin esta máscara la figu
  // aparece pegada en el casillero desde que arranca el efecto.
  const [pendingPaste, setPendingPaste] = useState<Set<number>>(new Set());

  // Encola figuritas (con sus marcas) para el efecto de pegado.
  function enqueuePlacement(nums: number[], marks: PackMark[]) {
    pendingPlacement.current = [...pendingPlacement.current, ...nums];
    pendingPlacementMarks.current = [...pendingPlacementMarks.current, ...marks];
  }

  // Pasa las figuritas pendientes del sobre al efecto de pegado. Drena los refs,
  // así llamarla dos veces es inocuo.
  function queuePendingPlacement() {
    if (pendingPlacement.current.length === 0) return;
    const nums = pendingPlacement.current;
    const marks = pendingPlacementMarks.current;
    pendingPlacement.current = [];
    pendingPlacementMarks.current = [];
    // Enmascarar las nuevas hasta que su carta aterrice en el casillero.
    const newOnes = nums.filter((_, i) => marks[i]?.isNew);
    if (newOnes.length) setPendingPaste(prev => new Set([...prev, ...newOnes]));
    setRevealQueue(q => (q.length ? [...q, ...nums] : nums));
    setRevealMarks(m => (m.length ? [...m, ...marks] : marks));
  }

  // La carta aterrizó (o se salteó): el casillero ya puede mostrar la figu.
  function unmaskPaste(nums: number[]) {
    setPendingPaste(prev => {
      if (!nums.some(n => prev.has(n))) return prev;
      const next = new Set(prev);
      for (const n of nums) next.delete(n);
      return next;
    });
  }

  // Ownership vivo, para clasificar nueva/repetida en handlers asíncronos
  const ownershipLive = useRef(ownership);
  ownershipLive.current = ownership;

  // Baseline de clasificación: lo que ya tenés + lo que salió de sobres y aún no se pegó.
  function packBaseline(): Record<number, number> {
    const base: Record<number, number> = { ...ownershipLive.current };
    for (const n of pendingPlacement.current) base[n] = (base[n] ?? 0) + 1;
    return base;
  }

  // Clasifica secuencialmente (muta base): la primera copia es nueva, las siguientes repes.
  function classifyPack(nums: number[], base: Record<number, number>): PackMark[] {
    return nums.map(n => {
      const had = base[n] ?? 0;
      base[n] = had + 1;
      return { isNew: had === 0, copies: had + 1 };
    });
  }
  const { incoming: pmIncoming, outgoing: pmOutgoing, loading: pmLoading } = useOpenMatches(pubkey);

  // Excluir matches que el cliente ya confirmó como terminados (localStorage) —
  // estos siguen en Nostr con status "open" pero no deben activar el punto rojo.
  const [localFinishedIds] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem("figus_finished_matches") || "[]") as string[]); }
    catch { return new Set<string>(); }
  });
  const activeIncoming = pmIncoming.filter(m => !localFinishedIds.has(m.id));
  const activeOutgoing = pmOutgoing.filter(m => !localFinishedIds.has(m.id));
  const hasPendingChallenge = useHasMyTurn(activeIncoming, activeOutgoing, pubkey);

  const VALID_TABS: Tab[] = ["album", "packs", "market", "fixture", "game"];
  const hashTab = (): Tab => {
    if (typeof window === "undefined") return "album";
    const h = window.location.hash.slice(1) as Tab;
    return VALID_TABS.includes(h) ? h : "album";
  };
  const [tab, setTab] = useState<Tab>(hashTab);
  // Render-once-then-hide: una tab se monta la primera vez que se visita
  // y queda montada (con display:none) para no perder estado ni suscripciones.
  const [visitedTabs, setVisitedTabs] = useState<Set<Tab>>(() => new Set([hashTab()]));

  // Keep URL hash in sync with active tab
  useEffect(() => {
    window.location.hash = tab;
    setVisitedTabs(prev => { prev.add(tab); return new Set(prev); });
  }, [tab]);

  // Pre-establish relay connections as soon as the user logs in
  useEffect(() => {
    if (pubkey) warmupRelays();
  }, [pubkey]);
  const [toast, setToast] = useState<string | null>(null);
  const [packResult, setPackResult] = useState<number[] | null>(null);
  // Marcas (nueva/repetida ×N) alineadas con packResult
  const [packMarks, setPackMarks] = useState<PackMark[] | null>(null);
  const [packQueue, setPackQueue] = useState<{ figus: number[]; marks: PackMark[] }[]>([]);
  const packQueueTotal = useRef(0);
  const [penaltyPackPending, setPenaltyPackPending] = useState(false);
  const [busy, setBusy] = useState(false);
  const [invoice, setInvoice] = useState<string | null>(null);
  const [invoiceAmount, setInvoiceAmount] = useState<number>(0);
  // Listing associated with the current invoice — used to deliver the sticker
  // immediately when NWC confirms payment (without waiting for ZAP_RECEIPT).
  const invoiceListing = useRef<Listing | null>(null);
  // Guards against addSticker being called twice (once by onNwcPaid, once by ZAP_RECEIPT).
  const buyDelivered = useRef(false);
  // Listing IDs paid locally — hidden from market immediately, before SETTLEMENT arrives.
  const [locallyRemovedListings, setLocallyRemovedListings] = useState<string[]>([]);
  const [showSettings, setShowSettings] = useState(false);
  const [showRelaySync, setShowRelaySync] = useState(false);
  const [keyAcked, setKeyAcked] = useState(false);
  const [activeMatch, setActiveMatch] = useState<PenaltyMatch | null>(null);
  const [claimedPages, setClaimedPages] = useState<string[]>([]);

  useEffect(() => {
    if (packResult) setPenaltyPackPending(false);
  }, [packResult]);

  // Mostrar aviso de clave a usuarios locales que no lo confirmaron aún
  useEffect(() => {
    if (!pubkey || identity?.mode !== "local") { setKeyAcked(true); return; }
    const acked = localStorage.getItem("figus:key_ack");
    setKeyAcked(acked === pubkey);
  }, [pubkey, identity?.mode]);

  function ackKey() {
    if (pubkey) localStorage.setItem("figus:key_ack", pubkey);
    setKeyAcked(true);
  }

  // Load which pages have already been claimed (persisted locally to drive button state)
  useEffect(() => {
    setPendingPaste(new Set()); // máscara de pegado pendiente no sobrevive al cambio de cuenta
    if (!pubkey) { setClaimedPages([]); return; }
    try {
      const raw = localStorage.getItem(`figus_rewards_${pubkey}`);
      setClaimedPages(raw ? JSON.parse(raw) : []);
    } catch { setClaimedPages([]); }
  }, [pubkey]);

  const notify = (m: string, durationMs = 3000) => {
    setToast(m);
    setTimeout(() => setToast(null), durationMs);
  };

  const configured = Boolean(ISSUER_PUBKEY);

  // DEV: agrega N figuritas random al álbum (solo local, no publica nada).
  // Cada figurita se pega recién cuando su animación de colocación aterriza.
  function addRandomFigus(count: number) {
    if (!pubkey) return notify("Conectate primero");
    const nums = Array.from({ length: count }, () => rollSticker());
    setRevealQueue(q => (q.length ? [...q, ...nums] : nums));
  }

  // --- sobre de regalo: publica prueba en Nostr y espera GRANT del issuer ---
  function openFreePack() {
    if (!identity) return notify("Conectate primero");
    setBusy(true);

    const since = Math.floor(Date.now() / 1000);
    let grantReceived = false;
    let unsubGrant: (() => void) | null = null;
    let pollIv: ReturnType<typeof setInterval> | null = null;
    let freeTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleGrant(ev: { created_at: number; tags: string[][] }) {
      if (grantReceived) return;
      if (ev.created_at < since - 5) return;
      const nums = ev.tags
        .filter((t) => t[0] === "sticker")
        .map((t) => Number(t[1].split(":")[1]))
        .filter((n) => n > 0);
      if (!nums.length) return;
      grantReceived = true;
      const marks = classifyPack(nums, packBaseline());
      setPackMarks(marks);
      enqueuePlacement(nums, marks);
      claimPack(nums);
      setPackResult(nums);
      refresh();
      unsubGrant?.();
      if (pollIv) clearInterval(pollIv);
      if (freeTimeout) clearTimeout(freeTimeout);
      setBusy(false);
    }

    // 1. Suscripción en vivo esperando el GRANT del issuer (se setea antes del await
    //    para que el fallback funcione aunque el signing de Amber no responda)
    unsubGrant = subscribeOne(
      { kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [identity.pubkey], since },
      handleGrant
    );

    const pubkeyLocal = identity.pubkey;
    pollIv = setInterval(async () => {
      if (grantReceived) return;
      const { list: listEvs } = await import("@/lib/pool");
      const evs = await listEvs([{
        kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY],
        "#p": [pubkeyLocal], since: since - 5, limit: 1,
      }]);
      if (evs.length) handleGrant(evs[0]);
    }, 5000);

    // 2. Fallback: si el issuer no responde en 15s, dar figus localmente
    freeTimeout = setTimeout(() => {
      if (!grantReceived) {
        unsubGrant?.();
        if (pollIv) clearInterval(pollIv);
        const nums = Array.from({ length: 7 }, () => rollSticker());
        const marks = classifyPack(nums, packBaseline());
        setPackMarks(marks);
        enqueuePlacement(nums, marks);
        claimPack(nums);
        setPackResult(nums);
        setBusy(false);
        notify("🎁 Sobre de regalo abierto · el issuer confirmará las figuritas pronto");
      }
    }, 15000);

    // 3. Publicar prueba de claim (fire-and-forget: no bloqueamos el flujo
    //    porque signEvent con Amber puede necesitar interacción del usuario)
    const claimTemplate: EventTemplate = {
      kind: KIND.FREE_PACK_CLAIM,
      created_at: since,
      content: "",
      tags: [
        ["d", `free-pack:${ALBUM_ID}`],
        ["a", addr(KIND.ALBUM, ISSUER_PUBKEY, ALBUM_ID)],
        ["figus-action", "free-pack-claim"],
      ],
    };
    signEvent(claimTemplate, identity.mode)
      .then(claimEv => Promise.any(getPool().publish(getRelays(), claimEv)))
      .catch(() => {});
  }

  // ── DEV MODE: sobres 100% locales — sin zap, sin publicar eventos Nostr ──
  // Las figuritas NO se acreditan acá: quedan pendientes y, al cerrar el sobre,
  // pasan por el efecto de pegado (StickerPlacementFX) que las acredita al aterrizar.
  function openPackDev() {
    const nums = Array.from({ length: 7 }, () => rollSticker());
    const marks = classifyPack(nums, packBaseline());
    enqueuePlacement(nums, marks);
    setPackMarks(marks);
    setPackResult(nums);
  }

  function openPackBulkDev() {
    const nums = Array.from({ length: 70 }, () => rollSticker());
    const marks = classifyPack(nums, packBaseline());
    enqueuePlacement(nums, marks);
    const chunks: { figus: number[]; marks: PackMark[] }[] = [];
    for (let i = 0; i < nums.length; i += 7) {
      chunks.push({ figus: nums.slice(i, i + 7), marks: marks.slice(i, i + 7) });
    }
    packQueueTotal.current = chunks.length;
    setPackQueue(chunks);
  }

  function openFreePackDev() {
    const nums = Array.from({ length: 7 }, () => rollSticker());
    const marks = classifyPack(nums, packBaseline());
    claimPack([]); // marca el regalo como usado; acredita el FX al pegar cada una
    enqueuePlacement(nums, marks);
    setPackMarks(marks);
    setPackResult(nums);
  }

  // --- abrir sobre: zap al issuer ---
  async function openPack() {
    if (!identity) return notify("Conectate primero");
    setBusy(true);

    const since = Math.floor(Date.now() / 1000);
    let grantReceived = false;
    let unsubGrant: (() => void) | null = null;
    let pollIv: ReturnType<typeof setInterval> | null = null;
    let grantTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleGrant(ev: { created_at: number; tags: string[][] }) {
      if (grantReceived) return;
      // Ignorar grants anteriores al momento en que se clickeó
      if (ev.created_at < since - 5) return;
      const nums = ev.tags
        .filter((t) => t[0] === "sticker")
        .map((t) => Number(t[1].split(":")[1]))
        .filter((n) => n > 0);
      if (!nums.length) return;
      grantReceived = true;
      setInvoice(null);
      const marks = classifyPack(nums, packBaseline());
      setPackMarks(marks);
      enqueuePlacement(nums, marks);
      setPackResult(nums);
      refresh();
      unsubGrant?.();
      if (pollIv) clearInterval(pollIv);
      if (grantTimeout) clearTimeout(grantTimeout);
    }

    // Suscripción en vivo (real-time)
    unsubGrant = subscribeOne(
      { kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [identity.pubkey], since },
      handleGrant
    );

    // Polling fallback cada 5s — por si el relay no entregó el evento en vivo
    const pubkey = identity.pubkey;
    pollIv = setInterval(async () => {
      if (grantReceived) return;
      const { list } = await import("@/lib/pool");
      const evs = await list([{
        kinds: [KIND.GRANT],
        authors: [ISSUER_PUBKEY],
        "#p": [pubkey],
        since: since - 5,
        limit: 5,
      }]);
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      if (latest) handleGrant(latest);
    }, 5000);

    grantTimeout = setTimeout(() => {
      if (!grantReceived) {
        unsubGrant?.();
        if (pollIv) clearInterval(pollIv);
        notify("⚠️ No llegaron las figus en 90s. Verificá que el issuer esté corriendo.");
      }
    }, 90000);

    try {
      // El issuer emite la factura y la cobra (Fix #1). Race de 25s por si Amber
      // cuelga la firma del ORDER_REQUEST.
      const { invoice } = await Promise.race([
        requestOrderInvoice({
          action: "open-pack",
          extraTags: [["a", addr(KIND.PACK, ISSUER_PUBKEY, "pack-basico")]],
          signerMode: identity.mode,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tiempo de firma agotado — si usás Amber, abrilo y aprobá la firma")), 25_000)
        ),
      ]);
      const paid = await tryPayInvoice(invoice);
      // tryPayInvoice puede tardar hasta 20s (timeouts de WebLN + NWC) y el GRANT
      // puede llegar en el medio — si ya llegó, no mostrar la factura tarde sobre
      // el sobre abierto.
      if (grantReceived) {
        setInvoice(null);
      } else if (paid) {
        setInvoice(null);
        notify("⚡ Pago enviado — esperando figus del issuer…");
      } else {
        setInvoiceAmount(21);
        setInvoice(invoice);
      }
    } catch (e: any) {
      grantReceived = true;
      if (grantTimeout) clearTimeout(grantTimeout);
      if (pollIv) clearInterval(pollIv);
      unsubGrant?.();
      notify("⚠️ " + (e.message || "Error al abrir el sobre"));
    } finally {
      setBusy(false);
    }
  }

  // --- abrir 10 sobres: zap de 189 sats al issuer ---
  async function openPackBulk() {
    if (!identity) return notify("Conectate primero");
    setBusy(true);

    const since = Math.floor(Date.now() / 1000);
    let grantReceived = false;
    let unsubGrant: (() => void) | null = null;
    let pollIv: ReturnType<typeof setInterval> | null = null;
    let grantTimeout: ReturnType<typeof setTimeout> | null = null;

    function handleGrant(ev: { created_at: number; tags: string[][] }) {
      if (grantReceived) return;
      if (ev.created_at < since - 5) return;
      const nums = ev.tags
        .filter((t) => t[0] === "sticker")
        .map((t) => Number(t[1].split(":")[1]))
        .filter((n) => n > 0);
      if (!nums.length) return;
      grantReceived = true;
      setInvoice(null);
      const marks = classifyPack(nums, packBaseline());
      claimPack(nums);
      enqueuePlacement(nums, marks);
      const chunks: { figus: number[]; marks: PackMark[] }[] = [];
      for (let i = 0; i < nums.length; i += 7) {
        chunks.push({ figus: nums.slice(i, i + 7), marks: marks.slice(i, i + 7) });
      }
      packQueueTotal.current = chunks.length;
      setPackQueue(chunks);
      refresh();
      unsubGrant?.();
      if (pollIv) clearInterval(pollIv);
      if (grantTimeout) clearTimeout(grantTimeout);
    }

    unsubGrant = subscribeOne(
      { kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY], "#p": [identity.pubkey], since },
      handleGrant
    );

    const pubkey = identity.pubkey;
    pollIv = setInterval(async () => {
      if (grantReceived) return;
      const { list } = await import("@/lib/pool");
      const evs = await list([{
        kinds: [KIND.GRANT], authors: [ISSUER_PUBKEY],
        "#p": [pubkey], since: since - 5, limit: 1,
      }]);
      const latest = evs.sort((a, b) => b.created_at - a.created_at)[0];
      if (latest) handleGrant(latest);
    }, 5000);

    grantTimeout = setTimeout(() => {
      if (!grantReceived) {
        unsubGrant?.();
        if (pollIv) clearInterval(pollIv);
        notify("⚠️ No llegaron las figus en 90s. Verificá que el issuer esté corriendo.");
      }
    }, 90000);

    try {
      const { invoice } = await Promise.race([
        requestOrderInvoice({
          action: "open-pack-10",
          extraTags: [["a", addr(KIND.PACK, ISSUER_PUBKEY, "pack-basico")]],
          signerMode: identity.mode,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error("Tiempo de firma agotado — si usás Amber, abrilo y aprobá la firma")), 25_000)
        ),
      ]);
      const paid = await tryPayInvoice(invoice);
      // Si el GRANT llegó mientras corrían los timeouts de WebLN/NWC, no mostrar
      // la factura tarde sobre el sobre abierto.
      if (grantReceived) {
        setInvoice(null);
      } else if (paid) {
        setInvoice(null);
        notify("⚡ Pago enviado — esperando figus del issuer…");
      } else {
        setInvoiceAmount(189);
        setInvoice(invoice);
      }
    } catch (e: any) {
      grantReceived = true;
      if (grantTimeout) clearTimeout(grantTimeout);
      if (pollIv) clearInterval(pollIv);
      unsubGrant?.();
      notify("⚠️ " + (e.message || "Error al abrir los sobres"));
    } finally {
      setBusy(false);
    }
  }

  // --- publicar resultado de penal en Nostr ---
  async function publishPenalty(result: "goal" | "save", zone: number, keeper: number, totalGoals: number) {
    if (!identity) return;
    const today = new Date().toISOString().slice(0, 10);
    const template: EventTemplate = {
      kind: KIND.PENALTY_PLAY,
      created_at: Math.floor(Date.now() / 1000),
      content: result === "goal" ? `⚽ Convertí un penal en Figus Mundial 2026` : `🧤 Me atajaron el penal en Figus Mundial 2026`,
      tags: [
        ["d", `penalty:${today}`],
        ["result", result],
        ["zone", String(zone)],
        ["keeper", String(keeper)],
        ["goals", String(totalGoals)],
        ["a", addr(KIND.ALBUM, ISSUER_PUBKEY, ALBUM_ID)],
      ],
    };
    try {
      const ev = await signEvent(template, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
    } catch {}
  }

  // --- desafiar desde el ranking ---
  async function challengeFromLeaderboard(targetPubkey: string) {
    if (!identity) return notify("Conectate para desafiar");
    if (targetPubkey === pubkey) return;
    try {
      await createMatch(identity, targetPubkey, 2);
      notify("⚽ Desafío enviado");
    } catch {
      notify("⚠️ No se pudo enviar el desafío");
    }
  }

  // --- vender repetida: publicar listing 30200 (firmado por el usuario) ---
  async function listForSale(num: number, price: number) {
    if (!identity) return;
    const d = `sell:${num}`;
    const template: EventTemplate = {
      kind: KIND.LISTING,
      created_at: Math.floor(Date.now() / 1000),
      content: `Vendo #${num} repetida, ${price} sats`,
      tags: [
        ["d", d],
        ["sticker", `${ALBUM_ID}:${num}`],
        ["a", addr(KIND.STICKER, ISSUER_PUBKEY, `${ALBUM_ID}:${num}`)],
        ["price", String(price)],
        ["status", "open"],
        ["p", ISSUER_PUBKEY],
      ],
    };
    try {
      const ev = await signEvent(template, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
      notify(`🏷️ Publicaste la #${num} por ${price} sats`);
    } catch (e: any) {
      notify("⚠️ No se pudo publicar la oferta");
    }
  }

  // --- cancelar venta: republica el listing con status "closed" ---
  async function cancelAllListings(listings: Listing[]) {
    if (!identity || listings.length === 0) return;
    notify(`⏳ Cancelando ${listings.length} publicaciones…`);
    // Firmar secuencialmente (NIP-07 no admite prompts en paralelo)
    const events: Awaited<ReturnType<typeof signEvent>>[] = [];
    for (const listing of listings) {
      const template: EventTemplate = {
        kind: KIND.LISTING,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["d", listing.d],
          ["sticker", `${ALBUM_ID}:${listing.stickerNum}`],
          ["price", String(listing.price)],
          ["status", "closed"],
          ["p", ISSUER_PUBKEY],
        ],
      };
      events.push(await signEvent(template, identity.mode));
    }
    // Publicar en paralelo
    await Promise.allSettled(events.map(ev => Promise.any(getPool().publish(getRelays(), ev))));
    notify(`✅ ${listings.length} publicaciones canceladas`);
    setTimeout(refresh, 800);
  }

  async function cancelListing(listing: Listing) {
    if (!identity) return;
    const template: EventTemplate = {
      kind: KIND.LISTING,
      created_at: Math.floor(Date.now() / 1000),
      content: "",
      tags: [
        ["d", listing.d],
        ["sticker", `${ALBUM_ID}:${listing.stickerNum}`],
        ["price", String(listing.price)],
        ["status", "closed"],
        ["p", ISSUER_PUBKEY],
      ],
    };
    try {
      const ev = await signEvent(template, identity.mode);
      await Promise.any(getPool().publish(getRelays(), ev));
      notify(`✅ Oferta cancelada`);
      setTimeout(refresh, 800);
    } catch {
      notify("⚠️ No se pudo cancelar la oferta");
    }
  }

  // --- comprar: pago al ISSUER (escrow), que valida y transfiere (Fix #1/#4) ---
  async function buyListing(listing: Listing) {
    if (!identity) return notify("Conectate primero");
    if (listing.seller === pubkey) return notify("No podés comprar tu propia figurita");
    setBusy(true);
    // Reset delivery guards for this new purchase attempt
    invoiceListing.current = listing;
    buyDelivered.current   = false;
    try {
      // El issuer valida que el vendedor tenga la figu y emite la factura; al cobrarla
      // transfiere la propiedad y paga al vendedor (menos fee). Race de 25s por Amber.
      const { invoice } = await Promise.race([
        requestOrderInvoice({
          action: "buy-sticker",
          extraTags: [["a", addr(KIND.LISTING, listing.seller, listing.d)]],
          signerMode: identity.mode,
        }),
        new Promise<never>((_, reject) =>
          setTimeout(
            () => reject(new Error("Tiempo de firma agotado. Si usás Amber, abrilo y aprobá la firma.")),
            25_000
          )
        ),
      ]);
      const paid = await tryPayInvoice(invoice);
      if (paid) {
        if (!buyDelivered.current) {
          buyDelivered.current = true;
          addSticker(listing.stickerNum);
          notify(`✅ ¡Pago enviado! La #${listing.stickerNum} fue acreditada a tu álbum`);
          setTimeout(refresh, 3000);
        }
        setLocallyRemovedListings(prev =>
          prev.includes(listing.id) ? prev : [...prev, listing.id]
        );
        setInvoice(null);
      } else if (buyDelivered.current) {
        // La entrega ya se acreditó (p. ej. vía onNwcPaid) mientras corrían los
        // timeouts de WebLN/NWC — no mostrar la factura tarde.
        setInvoice(null);
      } else {
        setInvoiceAmount(listing.price);
        setInvoice(invoice);
      }
    } catch (e: any) {
      notify("⚠️ " + (e.message || "Error en la compra"));
    } finally {
      setBusy(false);
    }
  }

  // --- reclamar premio de página/álbum completo ---
  async function sendRewardClaim(pageId: string, displayName: string) {
    if (!identity || !pubkey) return notify("Conectate primero");
    setBusy(true);
    try {
      const template: EventTemplate = {
        kind: KIND.REWARD_CLAIM,
        created_at: Math.floor(Date.now() / 1000),
        content: "",
        tags: [
          ["type",  pageId === "album" ? "album" : "page"],
          ["page",  pageId],
          ["a",     addr(KIND.ALBUM, ISSUER_PUBKEY, ALBUM_ID)],
        ],
      };
      const ev = await signEvent(template, identity.mode);
      const res = await fetch("/api/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event: ev, pageId }),
      });
      const data = await res.json() as { ok?: boolean; error?: string; message?: string };
      if (!res.ok) {
        const msg = "⚠️ " + (data.error || `Error ${res.status} al reclamar el premio`);
        console.error("[claim]", res.status, data);
        notify(msg, 8000);
        return;
      }
      // Persist claimed state so the button flips to "RECLAMADO"
      const next = [...claimedPages, pageId];
      setClaimedPages(next);
      try { localStorage.setItem(`figus_rewards_${pubkey}`, JSON.stringify(next)); } catch {}
      notify("🏆 " + (data.message || `Premio de ${displayName} enviado.`));
    } catch (e: any) {
      const msg = "⚠️ " + (e.message || "Error al reclamar");
      console.error("[claim]", e);
      notify(msg, 8000);
    } finally {
      setBusy(false);
    }
  }

  function claimPage(page: Page) { return sendRewardClaim(page.id, page.name); }
  function claimAlbum()          { return sendRewardClaim("album", "álbum completo"); }

  const dupesList = useMemo(() => dupes, [dupes]);
  // Ownership que ve el ÁLBUM: sin las figus nuevas cuya animación de pegado
  // sigue en vuelo — el casillero queda vacío hasta que la carta aterriza.
  const albumOwnership = useMemo(() => {
    if (pendingPaste.size === 0) return ownership;
    const next = { ...ownership };
    for (const n of pendingPaste) delete next[n];
    return next;
  }, [ownership, pendingPaste]);
  // Hide listings the user has already paid for locally, before ISSUER publishes SETTLEMENT.
  const visibleListings = useMemo(
    () => listings.filter(l => !locallyRemovedListings.includes(l.id)),
    [listings, locallyRemovedListings]
  );

  return (
    <div style={{ paddingBottom: isDev ? 72 : 40 }}>
      {/* HEADER */}
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          padding: "12px 20px",
          borderBottom: "1px solid var(--line)",
          position: "sticky",
          top: 0,
          background: "rgba(3,11,24,.92)",
          backdropFilter: "blur(12px)",
          zIndex: 5,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {/* Logo */}
          <img src="/logomundial.png" alt="Figus Mundial 2026" width={40} height={40} style={{ objectFit: "contain" }} />
          <div>
            <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
              <span style={{ fontFamily: "var(--display)", fontSize: 20, lineHeight: 1, color: "var(--gold)" }}>
                FIGUS
              </span>
              <span style={{ fontFamily: "var(--condensed)", fontSize: 10, color: "var(--muted)", letterSpacing: 1, fontWeight: 700 }}>
                MUNDIAL 2026™
              </span>
            </div>
            <div style={{ fontSize: 9.5, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 0.5 }}>
              {t.header_subtitle}
            </div>
          </div>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {/* Language toggle */}
          <button
            onClick={toggleLang}
            title={t.settings}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              color: "var(--gold)",
              width: 34,
              height: 34,
              borderRadius: 8,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              fontSize: 11,
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              letterSpacing: 0.5,
              transition: "border-color .2s",
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold)"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; }}
          >
            {lang === "es" ? "EN" : "ES"}
          </button>

          <button
            onClick={() => setShowSettings(true)}
            title={t.settings}
            style={{
              background: "transparent",
              border: "1px solid var(--line)",
              width: 34,
              height: 34,
              borderRadius: 8,
              cursor: "pointer",
              display: "grid",
              placeItems: "center",
              padding: 0,
              transition: "border-color .2s, opacity .2s",
              opacity: 0.75,
            }}
            onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--gold)"; (e.currentTarget as HTMLButtonElement).style.opacity = "1"; }}
            onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.borderColor = "var(--line)"; (e.currentTarget as HTMLButtonElement).style.opacity = "0.75"; }}
          >
            {/* Engranaje de configuración */}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="var(--gold)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3.2" />
              <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1.03 1.56V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.11-1.56 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.56-1.03H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.56-1.11 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h.01a1.7 1.7 0 0 0 1.02-1.56V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1.03 1.56 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v.01a1.7 1.7 0 0 0 1.56 1.02H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.56 1.03z" />
            </svg>
          </button>
          <Connect
            identity={identity}
            nip07Available={nip07Available}
            onNip07={connectNip07}
            onLocal={connectLocal}
            onLogout={logout}
            onNip46QR={connectNip46QR}
            onNip46Bunker={connectNip46Bunker}
          />
        </div>
      </header>

      {identity ? (
        <>
          {!configured && (
            <div
              style={{
                maxWidth: 720,
                margin: "20px auto 0",
                padding: 16,
                background: "var(--panel)",
                border: "1px solid var(--gold)",
                borderRadius: 12,
                fontSize: 14,
              }}
            >
              <strong style={{ color: "var(--gold)" }}>Falta configurar el issuer.</strong>{" "}
              Corré <code>npm run seed</code> para generar las claves y publicar el
              catálogo, copiá la pubkey impresa en <code>.env</code> como{" "}
              <code>NEXT_PUBLIC_ISSUER_PUBKEY</code>, y reiniciá el dev server.
            </div>
          )}

          {/* TABS */}
          <nav
            style={{
              display: "flex",
              gap: 4,
              padding: "12px 20px 0",
              justifyContent: "center",
              borderBottom: "1px solid var(--line)",
            }}
          >
            {(
              [
                ["album",   t.tab_album],
                ["packs",   t.tab_packs],
                ["market",  t.tab_market],
                ["fixture", t.tab_fixture],
                ["game",    t.tab_game],
              ] as [Tab, string][]
            ).map(([k, l]) => (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  background: "transparent",
                  border: "none",
                  borderBottom: tab === k ? "2px solid var(--gold)" : "2px solid transparent",
                  color: tab === k ? "var(--gold)" : "var(--muted)",
                  padding: "8px 18px 10px",
                  fontSize: 12,
                  fontWeight: 900,
                  fontFamily: "var(--condensed)",
                  letterSpacing: 1,
                  transition: "color .2s",
                  position: "relative",
                }}
              >
                {l}
                {k === "game" && hasPendingChallenge && (
                  <span style={{
                    position: "absolute",
                    top: 6,
                    right: 8,
                    width: 7,
                    height: 7,
                    borderRadius: "50%",
                    background: "#ef4444",
                    boxShadow: "0 0 6px #ef444488",
                  }} />
                )}
              </button>
            ))}
          </nav>

          {/* DEV TOOLS (solo en development) */}
          {isDev && <DevTools onAddRandom={addRandomFigus} />}

          {/* progress */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "10px 20px 0",
              maxWidth: 720,
              margin: "0 auto",
            }}
          >
            <div
              style={{
                flex: 1,
                height: 6,
                background: "var(--panel2)",
                borderRadius: 99,
                overflow: "hidden",
                border: "1px solid var(--line)",
              }}
            >
              <div
                style={{
                  height: "100%",
                  width: `${(owned / ALL_NUMBERS.length) * 100}%`,
                  background: "linear-gradient(90deg, var(--gold), #d4920a)",
                  transition: "width .5s ease",
                }}
              />
            </div>
            <span
              style={{
                fontSize: 11,
                color: "var(--gold)",
                whiteSpace: "nowrap",
                fontFamily: "var(--condensed)",
                fontWeight: 900,
              }}
            >
              {owned}/{ALL_NUMBERS.length}
            </span>
            <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
              {t.collected}
            </span>
          </div>

          <main style={{ maxWidth: 720, margin: "0 auto", padding: "18px 20px" }}>
            {/* ── Aviso clave privada (solo usuarios locales que no confirmaron) ── */}
            {!keyAcked && identity?.mode === "local" && (
              <div style={{
                background: "linear-gradient(135deg, rgba(245,158,11,.15), rgba(239,68,68,.1))",
                border: "1px solid rgba(245,158,11,.5)",
                borderRadius: 12,
                padding: "14px 16px",
                marginBottom: 18,
                display: "flex",
                gap: 12,
                alignItems: "flex-start",
              }}>
                <div style={{ fontSize: 22, lineHeight: 1, flexShrink: 0 }}>⚠️</div>
                <div style={{ flex: 1 }}>
                  <div style={{
                    fontFamily: "var(--condensed)", fontWeight: 900,
                    fontSize: 13, color: "#f59e0b", letterSpacing: 0.3, marginBottom: 5,
                  }}>
                    {t.key_warning_title}
                  </div>
                  <div style={{ fontSize: 12, color: "var(--muted)", lineHeight: 1.5, marginBottom: 10 }}>
                    {t.key_warning_body}
                  </div>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <button
                      onClick={() => { setShowSettings(true); ackKey(); }}
                      style={{
                        background: "#f59e0b", color: "#030b18",
                        border: "none", padding: "7px 14px", borderRadius: 7,
                        fontWeight: 900, fontSize: 11, fontFamily: "var(--condensed)",
                        letterSpacing: 0.5, cursor: "pointer",
                      }}
                    >
                      {t.key_warning_open_settings}
                    </button>
                    <button
                      onClick={ackKey}
                      style={{
                        background: "transparent",
                        border: "1px solid rgba(245,158,11,.4)",
                        color: "rgba(245,158,11,.8)",
                        padding: "7px 14px", borderRadius: 7,
                        fontWeight: 900, fontSize: 11, fontFamily: "var(--condensed)",
                        letterSpacing: 0.5, cursor: "pointer",
                      }}
                    >
                      {t.key_warning_ack}
                    </button>
                  </div>
                </div>
              </div>
            )}

            {loading && configured && (
              <p style={{ opacity: 0.5, textAlign: "center" }}>{t.loading}</p>
            )}
            {visitedTabs.has("album") && (
              <div style={{ display: tab === "album" ? undefined : "none" }}>
                <Album
                  ownership={albumOwnership}
                  onClaim={claimPage}
                  onClaimAlbum={claimAlbum}
                  onSell={listForSale}
                  claimedPages={claimedPages}
                  myListings={listings.filter(l => l.seller === pubkey)}
                  identity={identity ?? undefined}
                  focusSticker={albumFocus}
                  busy={busy}
                />
              </div>
            )}
            {visitedTabs.has("packs") && (
              <div style={{ display: tab === "packs" ? undefined : "none" }}>
                <Packs
                  onOpen={isDev ? openPackDev : openPack}
                  onOpenBulk={isDev ? openPackBulkDev : openPackBulk}
                  onCancel={() => setBusy(false)}
                  busy={busy}
                  freePack={{
                    available: !!pubkey && !hasClaimedFreePack,
                    onOpen: isDev ? openFreePackDev : openFreePack,
                  }}
                />
                <MyStickers ownership={ownership} onSell={listForSale} myListings={listings.filter(l => l.seller === pubkey)} />
              </div>
            )}
            {visitedTabs.has("fixture") && (
              <div style={{ display: tab === "fixture" ? undefined : "none" }}>
                <Fixture identity={identity ?? undefined} />
              </div>
            )}
            {visitedTabs.has("game") && (
              <div style={{ display: tab === "game" ? "grid" : "none", gap: 28 }}>
                {activeMatch && identity ? (
                  <PenaltyMatchView
                    match={activeMatch}
                    identity={identity}
                    onBack={() => setActiveMatch(null)}
                  />
                ) : (
                  <>
                    <PenaltyGame
                      pubkey={pubkey}
                      onGoal={() => { setPenaltyPackPending(true); (isDev ? openFreePackDev : openFreePack)(); }}
                      onPublish={publishPenalty}
                      packPending={penaltyPackPending}
                    />
                    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 24 }}>
                      <PenaltyMatchLobby
                        identity={identity}
                        incoming={pmIncoming}
                        outgoing={pmOutgoing}
                        matchesLoading={pmLoading}
                        onEnterMatch={setActiveMatch}
                      />
                    </div>
                    <Leaderboard myPubkey={pubkey} onChallenge={challengeFromLeaderboard} />

                    {/* ── TORNEO ── */}
                    <div style={{
                      borderTop: "1px solid var(--line)",
                      paddingTop: 24,
                    }}>
                      <div style={{
                        background: "linear-gradient(135deg, rgba(232,185,35,.06) 0%, rgba(245,158,11,.03) 100%)",
                        border: "1px solid rgba(232,185,35,.2)",
                        borderRadius: 14,
                        padding: "20px 18px",
                        display: "flex",
                        alignItems: "center",
                        gap: 16,
                      }}>
                        <div style={{ fontSize: 36, lineHeight: 1 }}>🏆</div>
                        <div style={{ flex: 1 }}>
                          <div style={{
                            fontFamily: "var(--display)",
                            fontSize: 17,
                            color: "var(--gold)",
                            letterSpacing: 0.5,
                            marginBottom: 4,
                          }}>
                            {t.tournament_title}
                          </div>
                          <div style={{
                            fontSize: 12,
                            color: "var(--muted)",
                            lineHeight: 1.4,
                          }}>
                            {t.tournament_desc}
                          </div>
                        </div>
                        <div style={{
                          fontFamily: "var(--condensed)",
                          fontWeight: 900,
                          fontSize: 10,
                          letterSpacing: 1.5,
                          color: "var(--gold)",
                          background: "rgba(232,185,35,.12)",
                          border: "1px solid rgba(232,185,35,.3)",
                          borderRadius: 99,
                          padding: "5px 10px",
                          whiteSpace: "nowrap",
                        }}>
                          {t.tournament_soon}
                        </div>
                      </div>
                    </div>
                  </>
                )}
              </div>
            )}
            {visitedTabs.has("market") && (
              <div style={{ display: tab === "market" ? undefined : "none" }}>
                <Market
                  listings={visibleListings}
                  settlements={settlements}
                  myOwnership={ownership}
                  myPubkey={pubkey}
                  onBuy={buyListing}
                  onCancel={cancelListing}
                  onCancelAll={cancelAllListings}
                />
              </div>
            )}
          </main>
        </>
      ) : (
        <LandingPage
          nip07Available={nip07Available}
          onNip07={connectNip07}
          onLocal={connectLocal}
          onLogout={logout}
          onNip46QR={connectNip46QR}
          onNip46Bunker={connectNip46Bunker}
        />
      )}

      {/* Revelado espectacular de figuritas: parte de la experiencia en dev y en
          producción. El crédito de tenencia solo lo hace el FX en dev (sin Nostr);
          en el flujo real la tenencia ya la acreditó el issuer (eventos 30100). */}
      {revealQueue.length > 0 && (
        <StickerPlacementFX
          queue={revealQueue}
          marks={revealMarks.length === revealQueue.length ? revealMarks : undefined}
          ownership={ownership}
          onNavigate={(num) => {
            setTab("album");
            // El efecto [tab] no re-corre si ya estábamos en album — sincronizar igual.
            if (window.location.hash !== "#album") window.location.hash = "album";
            setAlbumFocus({ num, token: ++focusToken.current });
          }}
          onPlace={(num) => {
            if (isDev) addSticker(num);
            unmaskPaste([num]); // recién acá el casillero muestra la figu
          }}
          onPlaceMany={(nums) => {
            if (isDev) addStickers(nums);
            unmaskPaste(nums);
          }}
          onFinish={(results) => {
            setRevealQueue([]);
            setRevealMarks([]);
            setAlbumFocus(null);
            setPendingPaste(new Set()); // por si quedó alguna máscara colgada
            setRevealSummary(results);
          }}
        />
      )}

      {/* Modal resumen del lote (nuevas vs repetidas) */}
      {revealSummary && (
        <RevealSummaryModal
          results={revealSummary}
          ownership={ownership}
          onClose={() => setRevealSummary(null)}
          onBuyMore={() => {
            setRevealSummary(null);
            setTab("packs");
            if (window.location.hash !== "#packs") window.location.hash = "packs";
          }}
        />
      )}

      {packResult && (
        <PackReveal
          figus={packResult}
          marks={packMarks ?? undefined}
          onClose={() => { setPackResult(null); setPackMarks(null); queuePendingPlacement(); }}
          identity={identity ?? undefined}
        />
      )}

      {packQueue.length > 0 && (
        <PackReveal
          figus={packQueue[0].figus}
          marks={packQueue[0].marks}
          onClose={() => {
            const isLast = packQueue.length === 1;
            setPackQueue(q => q.slice(1));
            if (isLast) queuePendingPlacement(); // el efecto corre tras el último sobre
          }}
          onSkipAll={() => {
            setPackQueue([]);
            queuePendingPlacement();
          }}
          identity={identity ?? undefined}
          packIndex={packQueueTotal.current - packQueue.length + 1}
          totalPacks={packQueueTotal.current}
        />
      )}

      {invoice && (
        <InvoiceModal
          invoice={invoice}
          amountSats={invoiceAmount}
          onClose={() => setInvoice(null)}
          onNwcPaid={() => {
            // If this invoice belongs to a sticker purchase, deliver optimistically:
            // the NWC wallet confirmed the payment was sent, so we credit the sticker
            // right away rather than waiting for the ZAP_RECEIPT (which may never arrive
            // if the seller's provider publishes the receipt to different relays).
            const listing = invoiceListing.current;
            if (listing && !buyDelivered.current) {
              buyDelivered.current = true;
              addSticker(listing.stickerNum);
              notify(`⚡ Pago enviado · la #${listing.stickerNum} fue acreditada a tu álbum`);
              setTimeout(refresh, 2000);
            }
            if (listing) {
              setLocallyRemovedListings(prev =>
                prev.includes(listing.id) ? prev : [...prev, listing.id]
              );
            }
            setInvoice(null);
          }}
          notify={notify}
        />
      )}

      {showSettings && (
        <SettingsModal
          onClose={() => setShowSettings(false)}
          identity={identity}
          onImportNsec={(raw) => { importNsec(raw); setShowSettings(false); }}
          onOpenRelaySync={() => { setShowSettings(false); setShowRelaySync(true); }}
        />
      )}

      {showRelaySync && pubkey && (
        <RelaySyncModal pubkey={pubkey} onClose={() => setShowRelaySync(false)} />
      )}

      {toast && (
        <div
          style={{
            position: "fixed",
            bottom: 28,
            left: "50%",
            transform: "translateX(-50%)",
            background: toast.startsWith("⚠️") ? "#3d0a0a" : "var(--panel)",
            border: toast.startsWith("⚠️") ? "1px solid #e05555" : "1px solid var(--gold)",
            color: toast.startsWith("⚠️") ? "#ffaaaa" : "var(--ink)",
            padding: "12px 20px",
            borderRadius: 12,
            fontSize: 14,
            fontWeight: 600,
            zIndex: 60,
            boxShadow: "0 8px 24px rgba(0,0,0,.5)",
            maxWidth: "90vw",
            textAlign: "center",
          }}
        >
          {toast}
        </div>
      )}

      <footer
        style={{
          textAlign: "center",
          fontSize: 11,
          color: "var(--muted)",
          padding: "24px 20px 0",
          maxWidth: 600,
          margin: "0 auto",
        }}
      >
        © 2026 Figus · Nostr + Lightning · Open source
        {process.env.NEXT_PUBLIC_APP_VERSION && (
          <span style={{ opacity: 0.6 }}> · v{process.env.NEXT_PUBLIC_APP_VERSION}</span>
        )}
      </footer>

      {/* DEV MODE: banner fijo full-width (solo en development) */}
      {isDev && <DevModeFooter />}
    </div>
  );
}

// ─────────────────────────────────────────
// LANDING PAGE (pre-login)
// ─────────────────────────────────────────

function LandingPage({
  nip07Available,
  onNip07,
  onLocal,
  onLogout,
  onNip46QR,
  onNip46Bunker,
}: {
  nip07Available: boolean;
  onNip07: () => void;
  onLocal: () => void;
  onLogout: () => void;
  onNip46QR: (
    onQR: (uri: string, dataUrl: string, expiresAt: number) => void,
    onauth: (url: string) => void,
    signal: AbortSignal
  ) => Promise<void>;
  onNip46Bunker: (url: string, onauth: (url: string) => void) => Promise<void>;
}) {
  const { t } = useLang();
  const connectProps = { identity: null, nip07Available, onNip07, onLocal, onLogout, onNip46QR, onNip46Bunker };
  const [demoKey, setDemoKey] = useState<string | null>(null);
  const [demoKicked, setDemoKicked] = useState(false);

  function startPenaltyDemo() {
    const key = Array.from(crypto.getRandomValues(new Uint8Array(32))).map(b => b.toString(16).padStart(2, "0")).join("");
    setDemoKey(key);
    setDemoKicked(false);
  }

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "0 20px 80px" }}>

      {/* ── HERO ── */}
      <section className="fade-in" style={{ textAlign: "center", padding: "56px 0 52px" }}>
        <img
          src="/logomundial.png"
          alt="Figus Mundial 2026"
          width={88}
          height={88}
          style={{ objectFit: "contain", marginBottom: 20, filter: "drop-shadow(0 0 24px rgba(232,185,35,.35))" }}
        />
        <h1 style={{
          fontFamily: "var(--display)",
          fontSize: "clamp(40px, 10vw, 64px)",
          color: "var(--gold)",
          margin: "0 0 6px",
          lineHeight: 1,
          letterSpacing: 2,
        }}>
          FIGUS
        </h1>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: "clamp(13px, 3vw, 17px)",
          color: "var(--ink)",
          fontWeight: 900,
          letterSpacing: 3,
          marginBottom: 20,
        }}>
          MUNDIAL 2026™
        </div>
        <p style={{
          fontSize: 15,
          color: "var(--muted)",
          maxWidth: 460,
          margin: "0 auto 36px",
          lineHeight: 1.75,
        }}>
          {t.landing_tagline}
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Connect {...connectProps} />
        </div>
      </section>

      {/* ── DIVISOR ── */}
      <div style={{ borderTop: "1px solid var(--line)", marginBottom: 52 }} />

      {/* ── CÓMO FUNCIONA ── */}
      <section style={{ marginBottom: 60 }}>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: 10,
          letterSpacing: 3,
          color: "var(--muted)",
          textAlign: "center",
          marginBottom: 28,
          fontWeight: 900,
        }}>
          {t.landing_how_it_works}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <FeatureCard icon="📖" color="#e8b923" title={t.landing_album_title} desc={t.landing_album_desc} />
          <FeatureCard icon="⚡" color="#f5d060" title={t.landing_packs_title} desc={t.landing_packs_desc} />
          <FeatureCard icon="🏷️" color="#52b788" title={t.landing_market_title} desc={t.landing_market_desc} />
          <FeatureCard icon="⚽" color="#6cc4ee" title={t.landing_game_title} desc={t.landing_game_desc} />
          <FeatureCard icon="🃏" color="#f87171" title={t.landing_steal_title} desc={t.landing_steal_desc} />
          <FeatureCard icon="🎰" color="#a78bfa" title={t.landing_bets_title} desc={t.landing_bets_desc} />
        </div>
      </section>

      {/* ── PREMIOS ── */}
      <section style={{ marginBottom: 60 }}>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: 10,
          letterSpacing: 3,
          color: "var(--muted)",
          textAlign: "center",
          marginBottom: 24,
          fontWeight: 900,
        }}>
          {t.landing_prizes_label}
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14 }}>
          {/* Equipo */}
          <div style={{
            background: "linear-gradient(135deg, rgba(232,185,35,.1), rgba(232,185,35,.03))",
            border: "1px solid rgba(232,185,35,.35)",
            borderRadius: 16,
            padding: "28px 20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏅</div>
            <div style={{
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 13,
              color: "var(--ink)",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}>
              {t.landing_prizes_team}
            </div>
            <div style={{
              fontFamily: "var(--display)",
              fontSize: 28,
              color: "var(--gold)",
              lineHeight: 1,
              marginBottom: 4,
            }}>
              {t.landing_prizes_team_sats}
            </div>
          </div>
          {/* Álbum */}
          <div style={{
            background: "linear-gradient(135deg, rgba(232,185,35,.16), rgba(232,185,35,.05))",
            border: "1px solid rgba(232,185,35,.55)",
            borderRadius: 16,
            padding: "28px 20px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 36, marginBottom: 10 }}>🏆</div>
            <div style={{
              fontFamily: "var(--condensed)",
              fontWeight: 900,
              fontSize: 13,
              color: "var(--ink)",
              letterSpacing: 0.5,
              marginBottom: 8,
            }}>
              {t.landing_prizes_album}
            </div>
            <div style={{
              fontFamily: "var(--display)",
              fontSize: 28,
              color: "var(--gold)",
              lineHeight: 1,
              marginBottom: 4,
            }}>
              {t.landing_prizes_album_sats}
            </div>
          </div>
        </div>
        <p style={{
          textAlign: "center",
          fontSize: 11,
          color: "var(--muted)",
          fontFamily: "var(--condensed)",
          marginTop: 14,
        }}>
          {t.landing_prizes_note}
        </p>
      </section>

      {/* ── DEMO PENAL ── */}
      <section style={{ marginBottom: 60 }}>
        {!demoKey ? (
          <div style={{
            background: "linear-gradient(135deg, rgba(108,196,238,.07), rgba(108,196,238,.02))",
            border: "1px solid rgba(108,196,238,.3)",
            borderRadius: 20,
            padding: "44px 28px",
            textAlign: "center",
          }}>
            <div style={{ fontSize: 52, marginBottom: 16, lineHeight: 1 }}>⚽</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 22, color: "#6cc4ee", marginBottom: 8 }}>
              PROBÁ UN PENAL
            </div>
            <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 auto 28px", maxWidth: 380, lineHeight: 1.7 }}>
              Cada gol que convertís con tu cuenta te da un sobre de figuritas. Probá cómo funciona sin conectarte.
            </p>
            <button
              onClick={startPenaltyDemo}
              style={{
                background: "linear-gradient(135deg, #6cc4ee, #3a9fc8)",
                color: "#030b18",
                border: "none",
                padding: "14px 40px",
                borderRadius: 12,
                fontSize: 15,
                fontWeight: 900,
                fontFamily: "var(--condensed)",
                letterSpacing: 1,
                cursor: "pointer",
                boxShadow: "0 4px 20px rgba(108,196,238,.25)",
              }}
            >
              PATEAR PENAL
            </button>
          </div>
        ) : (
          <div style={{
            background: "linear-gradient(135deg, rgba(108,196,238,.07), rgba(108,196,238,.02))",
            border: "1px solid rgba(108,196,238,.3)",
            borderRadius: 20,
            padding: "24px 20px",
          }}>
            <PenaltyGame
              pubkey={demoKey}
              onGoal={() => {}}
              onPublish={() => setDemoKicked(true)}
            />
            {demoKicked && (
              <div style={{ textAlign: "center", marginTop: 18 }}>
                <button
                  onClick={startPenaltyDemo}
                  style={{
                    background: "transparent",
                    color: "#6cc4ee",
                    border: "1px solid rgba(108,196,238,.4)",
                    padding: "10px 28px",
                    borderRadius: 10,
                    fontSize: 12,
                    fontWeight: 900,
                    fontFamily: "var(--condensed)",
                    letterSpacing: 0.5,
                    cursor: "pointer",
                  }}
                >
                  ⚽ PATEAR DE NUEVO
                </button>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ── DEMO MERCADITO ── */}
      <section style={{ marginBottom: 60 }}>
        <MarketDemoSection />
      </section>

      {/* ── TECH STACK ── */}
      <section style={{ marginBottom: 60 }}>
        <div style={{
          fontFamily: "var(--condensed)",
          fontSize: 10,
          letterSpacing: 3,
          color: "var(--muted)",
          textAlign: "center",
          marginBottom: 28,
          fontWeight: 900,
        }}>
          {t.landing_tech_title}
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
          <TechBadge icon="🟣" label="Nostr" desc={t.landing_tech_nostr} />
          <TechBadge icon="⚡" label="Lightning" desc={t.landing_tech_lightning} />
          <TechBadge icon="₿" label="Bitcoin" desc={t.landing_tech_bitcoin} />
          <TechBadge icon="🎮" label="Three.js" desc={t.landing_tech_threejs} />
          <TechBadge icon="▲" label="Next.js 14" desc={t.landing_tech_nextjs} />
          <TechBadge icon="📂" label="Open Source" desc={t.landing_tech_oss} />
        </div>
      </section>

      {/* ── CTA FINAL ── */}
      <section style={{
        textAlign: "center",
        background: "var(--panel)",
        border: "1px solid var(--line)",
        borderRadius: 20,
        padding: "44px 28px",
      }}>
        <div style={{
          fontFamily: "var(--display)",
          fontSize: 20,
          color: "var(--ink)",
          marginBottom: 10,
        }}>
          {t.landing_cta_title}
        </div>
        <p style={{
          fontSize: 13,
          color: "var(--muted)",
          margin: "0 auto 28px",
          maxWidth: 400,
          lineHeight: 1.7,
        }}>
          {t.landing_cta_desc}
        </p>
        <div style={{ display: "flex", justifyContent: "center" }}>
          <Connect {...connectProps} />
        </div>
        <div style={{ marginTop: 16, fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
          {t.landing_cta_privacy}
        </div>
      </section>

    </div>
  );
}

function FeatureCard({
  icon,
  color,
  title,
  desc,
}: {
  icon: string;
  color: string;
  title: string;
  desc: string;
}) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--line)",
      borderRadius: 16,
      padding: "24px 20px",
      borderTop: `2px solid ${color}22`,
    }}>
      <div style={{ fontSize: 30, marginBottom: 12, lineHeight: 1 }}>{icon}</div>
      <div style={{
        fontFamily: "var(--condensed)",
        fontWeight: 900,
        fontSize: 13,
        letterSpacing: 1,
        color,
        marginBottom: 8,
      }}>
        {title}
      </div>
      <p style={{ fontSize: 13, color: "var(--muted)", margin: 0, lineHeight: 1.7 }}>
        {desc}
      </p>
    </div>
  );
}

function TechBadge({ icon, label, desc }: { icon: string; label: string; desc: string }) {
  return (
    <div style={{
      background: "var(--panel)",
      border: "1px solid var(--line)",
      borderRadius: 12,
      padding: "14px 16px",
      display: "flex",
      alignItems: "flex-start",
      gap: 10,
      width: 200,
    }}>
      <span style={{ fontSize: 20, flexShrink: 0, lineHeight: 1, marginTop: 1 }}>{icon}</span>
      <div>
        <div style={{
          fontFamily: "var(--condensed)",
          fontWeight: 900,
          fontSize: 13,
          color: "var(--ink)",
          letterSpacing: 0.4,
          marginBottom: 3,
        }}>
          {label}
        </div>
        <div style={{ fontSize: 11, color: "var(--muted)", lineHeight: 1.5 }}>
          {desc}
        </div>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────

function MarketDemoSection() {
  const [phase, setPhase] = useState<"idle" | "buying" | "done">("idle");
  // Empezamos en un número fijo para que SSR y el primer render del cliente
  // coincidan (sin esto, rollSticker() genera valores distintos en server/cliente
  // y React tira errores de hidratación). El número random se sortea recién
  // en el cliente, después de hidratar.
  const [stickerNum, setStickerNum] = useState(ALL_NUMBERS[0]);

  useEffect(() => {
    setStickerNum(rollSticker());
  }, []);

  function buy() {
    setPhase("buying");
    setTimeout(() => setPhase("done"), 1800);
  }

  function reset() {
    setStickerNum(rollSticker());
    setPhase("idle");
  }

  const sticker = CATALOG[stickerNum];
  const rarity = RARITY_META[sticker.rarity];

  return (
    <div style={{
      background: "linear-gradient(135deg, rgba(82,183,136,.07), rgba(82,183,136,.02))",
      border: "1px solid rgba(82,183,136,.3)",
      borderRadius: 20,
      padding: "36px 28px",
    }}>
      <div style={{ textAlign: "center", marginBottom: 28 }}>
        <div style={{ fontSize: 52, lineHeight: 1, marginBottom: 12 }}>🏷️</div>
        <div style={{ fontFamily: "var(--display)", fontSize: 22, color: "#52b788", marginBottom: 8 }}>
          COMPRÁ UNA FIGURITA
        </div>
        <p style={{ fontSize: 13, color: "var(--muted)", margin: "0 auto", maxWidth: 380, lineHeight: 1.7 }}>
          Comprá las figuritas que te faltan directamente de otros jugadores. Pagás en sats con Lightning.
        </p>
      </div>

      {phase !== "done" ? (
        <div style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 14,
          padding: 14,
          display: "flex",
          alignItems: "center",
          gap: 14,
          maxWidth: 400,
          margin: "0 auto",
        }}>
          <div style={{
            width: 66, height: 88, borderRadius: 9,
            border: `2px solid ${rarity.ring}`,
            overflow: "hidden", flexShrink: 0,
            boxShadow: `0 0 12px ${rarity.glow}44`,
          }}>
            <StickerFace num={stickerNum} compact />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 14, color: "var(--ink)", marginBottom: 2 }}>{sticker.name}</div>
            <div style={{ fontSize: 11, color: rarity.ring, fontFamily: "var(--condensed)", fontWeight: 700, marginBottom: 6 }}>{rarity.label}</div>
            <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}>
              <div style={{ width: 22, height: 22, borderRadius: "50%", background: "var(--panel2)", display: "grid", placeItems: "center", fontSize: 12, flexShrink: 0 }}>👤</div>
              <span style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>@satoshi_ar · ⚡ 21 sats</span>
            </div>
            <button
              onClick={buy}
              disabled={phase === "buying"}
              style={{
                background: phase === "buying" ? "var(--panel2)" : "linear-gradient(135deg,#52b788,#3a8f68)",
                color: phase === "buying" ? "var(--muted)" : "#fff",
                border: "none",
                padding: "8px 18px",
                borderRadius: 9,
                fontWeight: 900,
                fontSize: 12,
                fontFamily: "var(--condensed)",
                letterSpacing: 0.5,
                cursor: phase === "buying" ? "default" : "pointer",
                width: "100%",
              }}
            >
              {phase === "buying" ? "⏳ Pagando…" : `⚡ COMPRAR · 21 sats`}
            </button>
          </div>
        </div>
      ) : (
        <div style={{ textAlign: "center" }}>
          <div style={{ animation: "pop .35s cubic-bezier(.34,1.56,.64,1) both", marginBottom: 12 }}>
            <div style={{ fontSize: 36, lineHeight: 1 }}>✅</div>
            <div style={{ fontFamily: "var(--display)", fontSize: 20, color: "#52b788", marginTop: 6 }}>¡Compraste!</div>
            <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 4 }}>La figurita quedó en tu álbum</div>
          </div>
          <div style={{
            width: 120, height: 160, borderRadius: 12,
            border: `2px solid ${rarity.ring}`,
            overflow: "hidden", margin: "16px auto",
            boxShadow: `0 0 24px ${rarity.glow}66`,
            animation: "pop .4s .1s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            <StickerFace num={stickerNum} />
          </div>
          <button
            onClick={reset}
            style={{
              background: "transparent",
              color: "#52b788",
              border: "1px solid rgba(82,183,136,.4)",
              padding: "10px 28px",
              borderRadius: 10,
              fontSize: 12,
              fontWeight: 900,
              fontFamily: "var(--condensed)",
              letterSpacing: 0.5,
              cursor: "pointer",
              marginTop: 8,
            }}
          >
            PROBAR CON OTRA FIGURITA
          </button>
        </div>
      )}
    </div>
  );
}

// Resuelve la Lightning Address (lud16) del perfil kind:0 del vendedor
