"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import {
  CATALOG, PAGES, RARITY_META, TEAMS, TEAM_FLAGS, TEAM_GROUPS, ALL_NUMBERS, suggestedPrice, teamName,
} from "@/lib/catalog";
import type { Listing, Ownership, Page } from "@/lib/types";
import { ShareButton } from "./ShareButton";
import type { Identity } from "@/lib/identity";
import { SITE_URL } from "@/lib/share";
import { StickerFace } from "./StickerCard";
import { StickerZoom } from "./StickerZoom";
import { Flag } from "./Flag";
import { useLang } from "@/contexts/LangContext";

// ─── Group navigation index ───────────────────────────────────────────────────
const GROUPS_ORDER = ["A", "B", "C", "D", "E", "F", "G", "H", "I", "J", "K", "L"];

const GROUP_FIRST_PAGE: Record<string, number> = { fwc: 0 };
PAGES.forEach((p, i) => {
  const g = TEAM_GROUPS[p.id];
  if (g && GROUP_FIRST_PAGE[g] === undefined) GROUP_FIRST_PAGE[g] = i;
});

type FlipDir   = "next" | "prev";
type FlipPhase = "idle" | "out" | "in";

// ─── Album component ──────────────────────────────────────────────────────────
export function Album({
  ownership,
  onClaim,
  onClaimAlbum,
  onSell,
  claimedPages = [],
  myListings = [],
  otherListings = [],
  onGoToMarket,
  identity,
  focusSticker = null,
  busy = false,
}: {
  ownership: Ownership;
  onClaim: (page: Page) => void;
  onClaimAlbum: () => void;
  onSell: (num: number, price: number) => void;
  claimedPages?: string[];
  myListings?: Listing[];
  otherListings?: Listing[];
  onGoToMarket?: (n: number) => void;
  identity?: Identity;
  /** Pedido externo de saltar a la página que contiene esta figurita (token fuerza re-trigger). */
  focusSticker?: { num: number; token: number } | null;
  busy?: boolean;
}) {
  const listedNums = new Set(myListings.map(l => l.stickerNum));

  // Mapa de figuritas disponibles en mercadito: num → precio mínimo
  const availableMap = useMemo(() => {
    const map = new Map<number, number>();
    for (const l of otherListings) {
      const cur = map.get(l.stickerNum);
      if (cur === undefined || l.price < cur) map.set(l.stickerNum, l.price);
    }
    return map;
  }, [otherListings]);
  const [idx,         setIdx]         = useState(0);
  const [flipPhase,   setFlipPhase]   = useState<FlipPhase>("idle");
  const [flipDir,     setFlipDir]     = useState<FlipDir>("next");
  const [cornerHover, setCornerHover] = useState<"next" | "prev" | null>(null);
  const [zoomedNum,   setZoomedNum]   = useState<number | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const { t, lang } = useLang();

  const searchResults = searchQuery.trim().length > 0
    ? PAGES
        .map((p, i) => ({ page: p, idx: i }))
        .filter(({ page }) =>
          page.id !== "fwc" &&
          TEAMS[page.id]?.name.toLowerCase().includes(searchQuery.toLowerCase().trim())
        )
        .slice(0, 8)
    : [];

  const go = useCallback((next: number) => {
    if (next < 0 || next >= PAGES.length || next === idx || flipPhase !== "idle") return;
    const dir: FlipDir = next > idx ? "next" : "prev";
    setFlipDir(dir);
    setFlipPhase("out");

    setTimeout(() => {
      setIdx(next);
      setFlipPhase("in");
      setTimeout(() => setFlipPhase("idle"), 280);
    }, 280);
  }, [idx, flipPhase]);

  // Keyboard navigation
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft")  go(idx - 1);
      if (e.key === "ArrowRight") go(idx + 1);
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [go, idx]);

  // Salto externo de página (revelado de figurita): va directo a la página
  // destino con la animación de entrada, sin pasar por el bloqueo de `go`.
  useEffect(() => {
    if (!focusSticker) return;
    const pi = PAGES.findIndex(p => p.numbers.includes(focusSticker.num));
    if (pi < 0 || pi === idx) return;
    setFlipDir(pi > idx ? "next" : "prev");
    setIdx(pi);
    setFlipPhase("in");
    const t = setTimeout(() => setFlipPhase("idle"), 280);
    return () => clearTimeout(t);
  }, [focusSticker, idx]);

  const page          = PAGES[idx];
  const team          = TEAMS[page.id];
  const flag          = TEAM_FLAGS[page.id] ?? "🏆";
  const isFwc         = page.id === "fwc";
  const group         = TEAM_GROUPS[page.id] ?? "";
  const owned         = page.numbers.filter((n) => (ownership[n] || 0) > 0).length;
  const total         = page.numbers.length;
  const complete      = owned === total;
  const pct           = (owned / total) * 100;
  const albumComplete = ALL_NUMBERS.every((n) => (ownership[n] || 0) > 0);
  const albumClaimed  = claimedPages.includes("album");

  const headerBg = isFwc
    ? "linear-gradient(160deg,#003087 0%,#001450 50%,#0a0030 100%)"
    : `linear-gradient(90deg,${team.color} 0%,${team.accent} 100%)`;

  // ── Flip animation style ──────────────────────────────────────────────────
  const pageFlipStyle: React.CSSProperties = {
    transformOrigin: flipPhase === "out"
      ? (flipDir === "next" ? "right center" : "left center")
      : flipPhase === "in"
      ? (flipDir === "next" ? "left center"  : "right center")
      : "center center",
    animation: flipPhase === "out"
      ? `albumFlipOut${flipDir === "next" ? "Fwd" : "Back"} 0.28s ease-in  both`
      : flipPhase === "in"
      ? `albumFlipIn${flipDir  === "next" ? "Fwd" : "Back"} 0.28s ease-out both`
      : "none",
    backfaceVisibility: "hidden",
    willChange: "transform",
  };

  return (
    <div className="fade-in" style={{ userSelect: "none" }}>

      {/* ── Group tab strip + buscador ──────────────────────────── */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: "flex", gap: 4, flexWrap: "wrap", alignItems: "center" }}>
          <GroupTab
            label={t.album_cover}
            active={isFwc}
            onClick={() => { go(GROUP_FIRST_PAGE["fwc"]); setSearchQuery(""); }}
          />
          {GROUPS_ORDER.map((g) => (
            <GroupTab
              key={g}
              label={`GRP ${g}`}
              active={!isFwc && group === g}
              onClick={() => { go(GROUP_FIRST_PAGE[g] ?? 0); setSearchQuery(""); }}
            />
          ))}
          {/* Buscador */}
          <div style={{ marginLeft: "auto", position: "relative" }}>
            <input
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder={t.album_search_placeholder}
              style={{
                background: searchQuery ? "var(--panel)" : "transparent",
                border: `1px solid ${searchQuery ? "var(--gold)" : "var(--line)"}`,
                borderRadius: 6, padding: "4px 10px",
                color: "var(--ink)", fontSize: 11,
                fontFamily: "var(--condensed)", fontWeight: 700,
                width: searchQuery ? 150 : 100,
                outline: "none", transition: "width .2s, border-color .2s",
              }}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery("")}
                style={{
                  position: "absolute", right: 6, top: "50%", transform: "translateY(-50%)",
                  background: "none", border: "none", color: "var(--muted)",
                  cursor: "pointer", fontSize: 12, padding: 0, lineHeight: 1,
                }}
              >✕</button>
            )}
          </div>
        </div>

        {/* Resultados de búsqueda */}
        {searchResults.length > 0 && (
          <div style={{
            marginTop: 6, background: "var(--panel)",
            border: "1px solid var(--gold)", borderRadius: 8,
            overflow: "hidden",
            boxShadow: "0 4px 16px rgba(0,0,0,.3)",
          }}>
            {searchResults.map(({ page, idx: pi }) => {
              const tm = TEAMS[page.id];
              const grp = TEAM_GROUPS[page.id];
              const ownedCount = page.numbers.filter(n => (ownership[n] || 0) > 0).length;
              return (
                <button
                  key={page.id}
                  onClick={() => { go(pi); setSearchQuery(""); }}
                  style={{
                    display: "flex", alignItems: "center", gap: 10,
                    width: "100%", background: "none", border: "none",
                    borderBottom: "1px solid var(--line)",
                    padding: "8px 12px", cursor: "pointer",
                    textAlign: "left",
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = "rgba(232,185,35,.08)")}
                  onMouseLeave={e => (e.currentTarget.style.background = "none")}
                >
                  <Flag team={page.id} height={20} style={{ borderRadius: 2, flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 900, fontSize: 12, color: "var(--ink)", fontFamily: "var(--condensed)" }}>
                      {teamName(page.id, lang)}
                    </div>
                    <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
                      {t.album_group_label} {grp} · {ownedCount}/{page.numbers.length}
                    </div>
                  </div>
                  <div style={{ fontSize: 10, color: "var(--muted)" }}>→</div>
                </button>
              );
            })}
          </div>
        )}
        {searchQuery.trim() && searchResults.length === 0 && (
          <div style={{ marginTop: 6, fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)", padding: "6px 2px" }}>
            {t.album_no_results} &ldquo;{searchQuery}&rdquo;
          </div>
        )}
      </div>

      {/* ── Navigation bar ──────────────────────────────────────── */}
      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <NavArrow dir="prev" disabled={idx === 0} onClick={() => go(idx - 1)} />

        <div style={{ flex: 1, textAlign: "center" }}>
          <div style={{
            fontFamily: "var(--condensed)", fontWeight: 900,
            fontSize: 14, color: "var(--ink)", lineHeight: 1.2,
            display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
          }}>
            {isFwc ? "🏆 FIFA WORLD CUP 2026™" : (
              <><Flag team={page.id} height={16} />{teamName(page.id, lang).toUpperCase()}</>
            )}
          </div>
          <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", marginTop: 1 }}>
            {!isFwc && `${t.album_group_label} ${group} · `}
            {t.album_page} {idx + 1}/{PAGES.length}
            {!isFwc && ` · ${owned}/${total} ${t.album_stuck}`}
          </div>
        </div>

        <NavArrow dir="next" disabled={idx === PAGES.length - 1} onClick={() => go(idx + 1)} />
      </div>

      {/* ── Album page ──────────────────────────────────────────── */}
      <div style={{ position: "relative" }}>

        {/* Page itself with flip animation */}
        <div style={{
          ...pageFlipStyle,
          background: "#f2ede3",
          borderRadius: 14,
          overflow: "hidden",
          boxShadow: [
            "0 2px 0 #c8bfa0",
            "0 10px 36px rgba(0,0,0,.28)",
            "inset 0 0 0 1px rgba(0,0,0,.07)",
          ].join(", "),
        }}>

          {isFwc ? (
            /* ── PORTADA ────────────────────────────────────────── */
            <AlbumCover
              ownership={ownership} total={total} owned={owned} onZoom={setZoomedNum}
              albumComplete={albumComplete} albumClaimed={albumClaimed} onClaimAlbum={onClaimAlbum}
              fwcComplete={complete} fwcClaimed={claimedPages.includes("fwc")} onClaimFwc={() => onClaim(page)}
              identity={identity} busy={busy}
              availableMap={availableMap} onGoToMarket={onGoToMarket}
            />
          ) : (
            /* ── Páginas de equipo ──────────────────────────────── */
            <>
              {/* Team header */}
              <div style={{
                background: headerBg,
                padding: "14px 16px",
                display: "flex",
                alignItems: "center",
                gap: 12,
              }}>
                <Flag
                  team={page.id}
                  height={44}
                  style={{ borderRadius: 4, boxShadow: "0 2px 8px rgba(0,0,0,.4)" }}
                />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--condensed)", fontWeight: 900,
                    fontSize: 20, color: "#fff", lineHeight: 1, letterSpacing: 0.5,
                    display: "flex", alignItems: "center", gap: 8,
                  }}>
                    <Flag team={page.id} height={20} style={{ borderRadius: 2 }} />
                    {teamName(page.id, lang).toUpperCase()}
                  </div>
                  <div style={{ fontSize: 11, color: "rgba(255,255,255,.65)", fontFamily: "var(--condensed)", fontWeight: 700, marginTop: 2 }}>
                    {t.album_group_label} {group}
                  </div>
                </div>

                {/* Progress */}
                <div style={{ flexShrink: 0, textAlign: "right" }}>
                  <div style={{
                    fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 13,
                    color: complete ? "var(--gold)" : "rgba(255,255,255,.85)",
                  }}>
                    {owned}/{total}
                  </div>
                  <div style={{
                    width: 50, height: 5, background: "rgba(0,0,0,.3)",
                    borderRadius: 99, overflow: "hidden", marginTop: 4,
                  }}>
                    <div style={{
                      height: "100%", width: `${pct}%`,
                      background: complete ? "var(--gold)" : "#fff",
                      borderRadius: 99, transition: "width .4s ease",
                    }}/>
                  </div>
                </div>

                {complete && (() => {
                  const claimed = claimedPages.includes(page.id);
                  const teamLabel = lang === "en"
                    ? (page.id !== "fwc" ? page.id.toUpperCase() : "World Cup")
                    : (page.name ?? page.id);
                  const shareContent = `🏆 ¡Completé el equipo de ${teamLabel} en el álbum del Mundial 2026!\n\nArmá tu álbum en ${SITE_URL} ⚽🎴 #FIFAWorldCup2026 #Figus`;
                  const claimDisabled = claimed || busy;
                  return (
                    <div style={{ display: "flex", gap: 6, alignItems: "center" }} className="pop-in">
                      <button
                        onClick={() => !claimDisabled && onClaim(page)}
                        disabled={claimDisabled}
                        style={{
                          background: claimed
                            ? "rgba(255,255,255,0.15)"
                            : busy
                            ? "rgba(255,255,255,0.1)"
                            : "linear-gradient(135deg,var(--gold),#d4920a)",
                          color: claimed ? "rgba(255,255,255,0.6)" : busy ? "rgba(255,255,255,0.5)" : "#030b18",
                          border: (claimed || busy) ? "1px solid rgba(255,255,255,0.2)" : 0,
                          padding: "8px 14px", borderRadius: 8,
                          fontWeight: 900, fontSize: 12, fontFamily: "var(--condensed)",
                          flexShrink: 0, letterSpacing: 0.3,
                          cursor: claimDisabled ? "default" : "pointer",
                          opacity: busy && !claimed ? 0.7 : 1,
                        }}
                      >
                        {claimed ? t.album_claimed : busy ? "…" : t.album_prize}
                      </button>
                      {identity && (
                        <ShareButton
                          content={shareContent}
                          identity={identity}
                          style={{ padding: "8px 10px", fontSize: 10 }}
                        />
                      )}
                    </div>
                  );
                })()}
              </div>

              {/* Sticker grid */}
              <div style={{ padding: 10 }}>
                <div style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(4, 1fr)",
                  gap: 7,
                }}>
                  {page.numbers.map((n) => {
                    const count    = ownership[n] || 0;
                    const has      = count > 0;
                    const dupe     = count > 1;
                    const r        = RARITY_META[CATALOG[n].rarity];
                    const minPrice = !has ? (availableMap.get(n) ?? null) : null;
                    const forSale  = minPrice !== null;

                    return (
                      <div
                        key={n}
                        data-figu-slot={n}
                        className={has ? "pop-in" : ""}
                        onClick={() => {
                          if (has) setZoomedNum(n);
                          else if (forSale && onGoToMarket) onGoToMarket(n);
                        }}
                        style={{
                          aspectRatio: "3/4",
                          borderRadius: 6,
                          border: has
                            ? `2px solid ${r.ring}`
                            : forSale
                              ? "1.5px dashed #22c55e"
                              : "1.5px dashed #bbb",
                          boxShadow: has ? `0 3px 14px ${r.glow}` : "none",
                          position: "relative",
                          overflow: "hidden",
                          background: has ? "transparent" : "rgba(0,0,0,.04)",
                          transition: "box-shadow .25s",
                          cursor: has || forSale ? "pointer" : "default",
                        }}
                      >
                        {has ? (
                          <>
                            <StickerFace num={n} compact />
                            {dupe && (
                              listedNums.has(n) ? (
                                <div style={{
                                  position: "absolute", bottom: 0, left: 0, right: 0,
                                  background: "rgba(34,197,94,.85)",
                                  color: "#030b18", fontSize: 7, fontWeight: 900,
                                  padding: "3px 0", fontFamily: "var(--condensed)",
                                  letterSpacing: 0.3, textAlign: "center",
                                }}>
                                  {t.album_listed}
                                </div>
                              ) : (
                                <button
                                  onClick={() => onSell(n, suggestedPrice(n))}
                                  style={{
                                    position: "absolute", bottom: 0, left: 0, right: 0,
                                    background: "rgba(232,185,35,.95)",
                                    color: "#030b18", border: 0,
                                    fontSize: 8, fontWeight: 900,
                                    padding: "3px 0", fontFamily: "var(--condensed)",
                                    letterSpacing: 0.3,
                                  }}
                                >
                                  ×{count} · {t.album_sell_dupe}
                                </button>
                              )
                            )}
                          </>
                        ) : (
                          <div style={{
                            width: "100%", height: "100%",
                            display: "flex", flexDirection: "column",
                            alignItems: "center", justifyContent: "center",
                            gap: 2, opacity: forSale ? 0.55 : 0.38,
                          }}>
                            <span style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 14, color: "#555" }}>{n}</span>
                            <span style={{ fontSize: 6.5, color: "#888", fontFamily: "var(--condensed)", letterSpacing: 0.5 }}>{t.album_paste}</span>
                          </div>
                        )}
                        {forSale && (
                          <div style={{
                            position: "absolute", bottom: 0, left: 0, right: 0,
                            background: "rgba(34,197,94,.9)",
                            color: "#030b18", fontSize: 7, fontWeight: 900,
                            padding: "3px 0", fontFamily: "var(--condensed)",
                            letterSpacing: 0.3, textAlign: "center",
                          }}>
                            {t.album_in_market} {minPrice}⚡
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}
        </div>

        {/* ── Corner fold: avanzar página ───────────────────────── */}
        {idx < PAGES.length - 1 && (
          <div
            onClick={() => go(idx + 1)}
            onMouseEnter={() => setCornerHover("next")}
            onMouseLeave={() => setCornerHover(null)}
            title="Página siguiente"
            style={{
              position: "absolute", bottom: 0, right: 0,
              width:  cornerHover === "next" ? 52 : 28,
              height: cornerHover === "next" ? 52 : 28,
              cursor: "pointer",
              transition: "width 0.2s ease, height 0.2s ease",
              zIndex: 4,
              background: "linear-gradient(135deg, transparent 50%, #c8bfa0 50%)",
              borderRadius: "0 0 14px 0",
              filter: cornerHover === "next"
                ? "drop-shadow(-3px -3px 8px rgba(0,0,0,.35))"
                : "drop-shadow(-1px -1px 4px rgba(0,0,0,.2))",
              animation: cornerHover === "next" ? "cornerPulse 0.6s ease-in-out" : "none",
            }}
          />
        )}

        {/* ── Corner fold: retroceder página ────────────────────── */}
        {idx > 0 && (
          <div
            onClick={() => go(idx - 1)}
            onMouseEnter={() => setCornerHover("prev")}
            onMouseLeave={() => setCornerHover(null)}
            title="Página anterior"
            style={{
              position: "absolute", bottom: 0, left: 0,
              width:  cornerHover === "prev" ? 52 : 28,
              height: cornerHover === "prev" ? 52 : 28,
              cursor: "pointer",
              transition: "width 0.2s ease, height 0.2s ease",
              zIndex: 4,
              background: "linear-gradient(225deg, transparent 50%, #c8bfa0 50%)",
              borderRadius: "0 0 0 14px",
              filter: cornerHover === "prev"
                ? "drop-shadow(3px -3px 8px rgba(0,0,0,.35))"
                : "drop-shadow(1px -1px 4px rgba(0,0,0,.2))",
              animation: cornerHover === "prev" ? "cornerPulse 0.6s ease-in-out" : "none",
            }}
          />
        )}
      </div>

      {/* ── Bottom navigation ────────────────────────────────────── */}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 12 }}>
        <button
          onClick={() => go(idx - 1)}
          disabled={idx === 0}
          style={bottomNavBtn(idx === 0)}
        >
          {t.album_prev}
        </button>

        {/* Dot indicator */}
        <div style={{ display: "flex", gap: 5, alignItems: "center" }}>
          {[-2, -1, 0, 1, 2].map((offset) => {
            const i      = idx + offset;
            const valid  = i >= 0 && i < PAGES.length;
            const active = offset === 0;
            return (
              <button
                key={offset}
                onClick={() => valid && go(i)}
                disabled={!valid}
                style={{
                  width: active ? 20 : 6, height: 6,
                  borderRadius: 99, border: "none", padding: 0,
                  background: !valid ? "transparent" : active ? "var(--gold)" : "var(--line)",
                  transition: "all .2s",
                  cursor: valid && !active ? "pointer" : "default",
                }}
              />
            );
          })}
        </div>

        <button
          onClick={() => go(idx + 1)}
          disabled={idx === PAGES.length - 1}
          style={bottomNavBtn(idx === PAGES.length - 1)}
        >
          {t.album_next}
        </button>
      </div>

      <div style={{ textAlign: "center", marginTop: 8, fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
        {t.album_hint}
      </div>

      {/* Zoom modal */}
      {zoomedNum !== null && (
        <StickerZoom
          num={zoomedNum}
          ownership={ownership}
          onClose={() => setZoomedNum(null)}
          onSell={onSell}
          myListings={myListings}
        />
      )}
    </div>
  );
}

// ─── Portada del álbum (página 0) ─────────────────────────────────────────────
function AlbumCover({
  ownership, total, owned, onZoom,
  albumComplete, albumClaimed, onClaimAlbum,
  fwcComplete, fwcClaimed, onClaimFwc,
  identity, busy = false,
  availableMap = new Map(), onGoToMarket,
}: {
  ownership: Ownership; total: number; owned: number; onZoom: (n: number) => void;
  albumComplete: boolean; albumClaimed: boolean; onClaimAlbum: () => void;
  fwcComplete: boolean; fwcClaimed: boolean; onClaimFwc: () => void;
  identity?: Identity;
  busy?: boolean;
  availableMap?: Map<number, number>;
  onGoToMarket?: (n: number) => void;
}) {
  const { t } = useLang();
  const pct = Math.round((owned / total) * 100);
  return (
    <div style={{ position: "relative", overflow: "hidden" }}>

      {/* ── Fondo principal ── */}
      <div style={{
        background: "linear-gradient(160deg,#00227a 0%,#001450 35%,#070020 65%,#120038 100%)",
        padding: "0 0 20px",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        minHeight: 540,
        position: "relative",
        overflow: "hidden",
      }}>

        {/* Trama hexagonal sutil */}
        <svg
          style={{ position: "absolute", inset: 0, width: "100%", height: "100%", opacity: 0.045, pointerEvents: "none" }}
          xmlns="http://www.w3.org/2000/svg"
        >
          <defs>
            <pattern id="hexCover" x="0" y="0" width="56" height="48" patternUnits="userSpaceOnUse">
              <polygon
                points="28,1 55,14 55,34 28,47 1,34 1,14"
                fill="none" stroke="white" strokeWidth="1"
              />
            </pattern>
          </defs>
          <rect width="100%" height="100%" fill="url(#hexCover)" />
        </svg>

        {/* Franjas diagonales decorativas */}
        <div style={{
          position: "absolute", top: 0, right: -40,
          width: 180, height: "100%",
          background: "linear-gradient(180deg,rgba(232,185,35,.12) 0%,rgba(232,185,35,.04) 100%)",
          transform: "skewX(-12deg)",
          pointerEvents: "none",
        }} />
        <div style={{
          position: "absolute", top: 0, right: 60,
          width: 60, height: "100%",
          background: "rgba(232,185,35,.05)",
          transform: "skewX(-12deg)",
          pointerEvents: "none",
        }} />

        {/* Borde dorado superior */}
        <div style={{ width: "100%", height: 6, background: "linear-gradient(90deg,#c8940a,#f5d060,#e8b923,#c8940a)", flexShrink: 0 }} />

        {/* Logo PANINI-style top */}
        <div style={{ marginTop: 16, zIndex: 1, display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{
            background: "var(--gold)",
            color: "#030b18",
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 12,
            letterSpacing: 3,
            padding: "4px 14px",
            borderRadius: 3,
          }}>
            FIGUS
          </div>
          <div style={{ width: 1, height: 20, background: "rgba(255,255,255,.2)" }} />
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.5)", fontFamily: "var(--condensed)", letterSpacing: 2, fontWeight: 700 }}>
            {t.cover_official}
          </div>
        </div>

        {/* FIFA title */}
        <div style={{ zIndex: 1, textAlign: "center", marginTop: 18, lineHeight: 1 }}>
          <div style={{
            fontFamily: "var(--condensed)", fontWeight: 900,
            fontSize: 13, letterSpacing: 5,
            color: "rgba(255,255,255,.7)", marginBottom: 2,
          }}>
            FIFA
          </div>
          <div style={{
            fontFamily: "var(--display)",
            fontSize: 30, color: "#fff",
            lineHeight: 1, letterSpacing: 1,
            textShadow: "0 2px 24px rgba(0,48,135,.9)",
          }}>
            WORLD CUP
          </div>
          <div style={{
            fontFamily: "var(--display)",
            fontSize: 58, color: "var(--gold)",
            lineHeight: 0.88, letterSpacing: 2,
            textShadow: "0 4px 28px rgba(0,0,0,.7), 0 0 40px rgba(232,185,35,.4)",
          }}>
            2026™
          </div>
        </div>

        {/* Trofeo SVG */}
        <div style={{ zIndex: 1, marginTop: 14, marginBottom: 14, filter: "drop-shadow(0 8px 32px rgba(232,185,35,.5))" }}>
          <TrophySvg />
        </div>

        {/* Banderas anfitrionas */}
        <div style={{ zIndex: 1, display: "flex", gap: 14, alignItems: "center", marginBottom: 6 }}>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>🇺🇸</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,.5)", fontFamily: "var(--condensed)", letterSpacing: 1, marginTop: 2 }}>USA</div>
          </div>
          <div style={{ color: "rgba(255,255,255,.2)", fontSize: 20 }}>·</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>🇨🇦</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,.5)", fontFamily: "var(--condensed)", letterSpacing: 1, marginTop: 2 }}>CANADÁ</div>
          </div>
          <div style={{ color: "rgba(255,255,255,.2)", fontSize: 20 }}>·</div>
          <div style={{ textAlign: "center" }}>
            <div style={{ fontSize: 28 }}>🇲🇽</div>
            <div style={{ fontSize: 8, color: "rgba(255,255,255,.5)", fontFamily: "var(--condensed)", letterSpacing: 1, marginTop: 2 }}>MÉXICO</div>
          </div>
        </div>

        {/* Subtítulo */}
        <div style={{ zIndex: 1, textAlign: "center", marginBottom: 16 }}>
          <div style={{
            display: "inline-block",
            background: "linear-gradient(135deg,var(--gold),#d4920a)",
            color: "#030b18",
            padding: "6px 20px",
            borderRadius: 4,
            fontFamily: "var(--condensed)",
            fontWeight: 900,
            fontSize: 11,
            letterSpacing: 2,
          }}>
            {t.cover_album}
          </div>
          <div style={{ marginTop: 6, fontSize: 8.5, color: "rgba(255,255,255,.35)", fontFamily: "var(--condensed)", letterSpacing: 1.5 }}>
            {t.cover_digital}
          </div>
        </div>

        {/* Progreso global en portada */}
        <div style={{
          zIndex: 1,
          background: "rgba(0,0,0,.35)",
          border: "1px solid rgba(232,185,35,.2)",
          borderRadius: 10,
          padding: "10px 18px",
          marginTop: 4,
          minWidth: 200,
          textAlign: "center",
        }}>
          <div style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 22, color: "var(--gold)", lineHeight: 1 }}>
            {owned}<span style={{ fontSize: 14, color: "rgba(232,185,35,.6)" }}>/{total}</span>
          </div>
          <div style={{ height: 5, background: "rgba(255,255,255,.1)", borderRadius: 99, overflow: "hidden", marginTop: 6 }}>
            <div style={{ height: "100%", width: `${pct}%`, background: "linear-gradient(90deg,var(--gold),#d4920a)", borderRadius: 99, transition: "width .5s" }} />
          </div>
          <div style={{ fontSize: 9, color: "rgba(255,255,255,.4)", fontFamily: "var(--condensed)", letterSpacing: 1, marginTop: 5 }}>
            {t.album_complete} · {pct}% {t.album_pct_complete}
          </div>
          {fwcComplete && !albumComplete && (
            <div className="pop-in" style={{ marginTop: 12 }}>
              <button
                onClick={() => !(fwcClaimed || busy) && onClaimFwc()}
                disabled={fwcClaimed || busy}
                style={{
                  background: fwcClaimed
                    ? "rgba(255,255,255,0.12)"
                    : busy
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg,var(--gold),#d4920a)",
                  color: fwcClaimed ? "rgba(255,255,255,0.5)" : busy ? "rgba(255,255,255,0.4)" : "#030b18",
                  border: (fwcClaimed || busy) ? "1px solid rgba(255,255,255,0.2)" : "none",
                  padding: "10px 24px", borderRadius: 10,
                  fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                  letterSpacing: 0.5, cursor: (fwcClaimed || busy) ? "default" : "pointer",
                  width: "100%",
                }}
              >
                {fwcClaimed ? t.album_claimed : busy ? "…" : "🏆 " + (t.album_prize ?? "Reclamar premio FWC")}
              </button>
            </div>
          )}
          {albumComplete && (
            <div className="pop-in" style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 12 }}>
              <button
                onClick={() => !(albumClaimed || busy) && onClaimAlbum()}
                disabled={albumClaimed || busy}
                style={{
                  background: albumClaimed
                    ? "rgba(255,255,255,0.12)"
                    : busy
                    ? "rgba(255,255,255,0.08)"
                    : "linear-gradient(135deg,var(--gold),#d4920a)",
                  color: albumClaimed ? "rgba(255,255,255,0.5)" : busy ? "rgba(255,255,255,0.4)" : "#030b18",
                  border: (albumClaimed || busy) ? "1px solid rgba(255,255,255,0.2)" : "none",
                  padding: "10px 24px", borderRadius: 10,
                  fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                  letterSpacing: 0.5, cursor: (albumClaimed || busy) ? "default" : "pointer",
                }}
              >
                {albumClaimed ? t.album_complete_claimed : busy ? "…" : t.album_complete_btn}
              </button>
              {identity && (
                <ShareButton
                  content={`🏆 ¡Completé el álbum del Mundial 2026! ¡Todas las figuritas coleccionadas! 🎴⚽\n\nArmá el tuyo en ${SITE_URL} #FIFAWorldCup2026 #Figus`}
                  identity={identity}
                  style={{ width: "100%" }}
                />
              )}
            </div>
          )}
        </div>

        {/* Borde dorado inferior */}
        <div style={{ position: "absolute", bottom: 0, left: 0, right: 0 }}>
          <div style={{ height: 4, background: "linear-gradient(90deg,#c8940a,#f5d060,#e8b923,#c8940a)" }} />
          <div style={{ height: 2, background: "rgba(232,185,35,.3)", marginTop: 3 }} />
        </div>
      </div>

      {/* ── Figuras FWC abajo de la portada ── */}
      <div style={{ background: "#f2ede3", padding: "10px 10px 14px" }}>
        <div style={{
          fontFamily: "var(--condensed)", fontWeight: 900,
          fontSize: 9, letterSpacing: 2,
          color: "#888", textAlign: "center",
          marginBottom: 8,
        }}>
          {t.album_fwc_special}
        </div>
        <FwcGrid ownership={ownership} onZoom={onZoom} availableMap={availableMap} onGoToMarket={onGoToMarket} />
      </div>
    </div>
  );
}

// Muestra las 20 figuras FWC en un grid compacto dentro de la portada
function FwcGrid({ ownership, onZoom, availableMap = new Map(), onGoToMarket }: {
  ownership: Ownership; onZoom: (n: number) => void;
  availableMap?: Map<number, number>; onGoToMarket?: (n: number) => void;
}) {
  const { t } = useLang();
  const fwcNums = PAGES[0].numbers;
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(5, 1fr)", gap: 5 }}>
      {fwcNums.map((n) => {
        const count    = ownership[n] || 0;
        const has      = count > 0;
        const r        = RARITY_META[CATALOG[n].rarity];
        const minPrice = !has ? (availableMap.get(n) ?? null) : null;
        const forSale  = minPrice !== null;
        return (
          <div
            key={n}
            data-figu-slot={n}
            className={has ? "pop-in" : ""}
            onClick={() => {
              if (has) onZoom(n);
              else if (forSale && onGoToMarket) onGoToMarket(n);
            }}
            style={{
              aspectRatio: "3/4",
              borderRadius: 5,
              border: has ? `2px solid ${r.ring}` : forSale ? "1.5px dashed #22c55e" : "1.5px dashed #bbb",
              boxShadow: has ? `0 2px 10px ${r.glow}` : "none",
              position: "relative",
              overflow: "hidden",
              background: has ? "transparent" : "rgba(0,0,0,.04)",
              cursor: has || forSale ? "pointer" : "default",
            }}
          >
            {has ? (
              <StickerFace num={n} compact />
            ) : (
              <div style={{
                width: "100%", height: "100%",
                display: "flex", flexDirection: "column",
                alignItems: "center", justifyContent: "center",
                gap: 1, opacity: forSale ? 0.55 : 0.35,
              }}>
                <span style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11, color: "#555" }}>{n}</span>
                <span style={{ fontSize: 5.5, color: "#888", fontFamily: "var(--condensed)", letterSpacing: 0.5 }}>{t.album_paste}</span>
              </div>
            )}
            {forSale && (
              <div style={{
                position: "absolute", bottom: 0, left: 0, right: 0,
                background: "rgba(34,197,94,.9)",
                color: "#030b18", fontSize: 6, fontWeight: 900,
                padding: "2px 0", fontFamily: "var(--condensed)",
                letterSpacing: 0.3, textAlign: "center",
              }}>
                🛒 {minPrice}⚡
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ─── Trophy SVG ───────────────────────────────────────────────────────────────
function TrophySvg() {
  return (
    <svg width="110" height="148" viewBox="0 0 110 148" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id="tg1" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%"   stopColor="#f5d060" />
          <stop offset="45%"  stopColor="#e8b923" />
          <stop offset="100%" stopColor="#b8780a" />
        </linearGradient>
        <linearGradient id="tg2" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="#b8780a" />
          <stop offset="50%"  stopColor="#f5d060" />
          <stop offset="100%" stopColor="#b8780a" />
        </linearGradient>
        <linearGradient id="tgShine" x1="0" y1="0" x2="1" y2="0">
          <stop offset="0%"   stopColor="rgba(255,255,255,0)" />
          <stop offset="40%"  stopColor="rgba(255,255,255,0.35)" />
          <stop offset="100%" stopColor="rgba(255,255,255,0)" />
        </linearGradient>
        <filter id="glow">
          <feGaussianBlur stdDeviation="3" result="blur" />
          <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
        </filter>
      </defs>

      {/* Base */}
      <rect x="24" y="133" width="62" height="9" rx="2.5" fill="url(#tg1)" />
      <rect x="14" y="124" width="82" height="11" rx="3" fill="url(#tg1)" />
      <rect x="20" y="122" width="70" height="4" rx="1" fill="url(#tgShine)" opacity=".5" />

      {/* Stem */}
      <rect x="38" y="100" width="34" height="26" rx="2" fill="url(#tg1)" />
      <rect x="38" y="100" width="34" height="6" rx="1" fill="url(#tgShine)" opacity=".4" />

      {/* Handles */}
      <path d="M17 46 C8 46 5 58 5 70 C5 84 14 90 24 88" stroke="url(#tg1)" strokeWidth="9" fill="none" strokeLinecap="round" />
      <path d="M93 46 C102 46 105 58 105 70 C105 84 96 90 86 88" stroke="url(#tg1)" strokeWidth="9" fill="none" strokeLinecap="round" />

      {/* Cup body */}
      <path d="M17 16 L21 90 Q55 108 89 90 L93 16 Z" fill="url(#tg1)" filter="url(#glow)" />

      {/* Top rim */}
      <ellipse cx="55" cy="16" rx="38" ry="8.5" fill="url(#tg2)" />
      <ellipse cx="55" cy="16" rx="30" ry="4.5" fill="url(#tgShine)" opacity=".6" />

      {/* Shine on body */}
      <path d="M29 26 Q31 58 28 84" stroke="rgba(255,255,255,.35)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <path d="M39 20 Q41 50 39 78" stroke="rgba(255,255,255,.15)" strokeWidth="3" fill="none" strokeLinecap="round" />

      {/* Star on cup */}
      <text x="55" y="68" textAnchor="middle" fontSize="22" fill="rgba(255,255,255,.55)" fontFamily="sans-serif">★</text>

      {/* Small decorative lines */}
      <line x1="38" y1="100" x2="72" y2="100" stroke="rgba(255,255,255,.2)" strokeWidth="1" />
      <line x1="38" y1="124" x2="72" y2="124" stroke="rgba(255,255,255,.2)" strokeWidth="1" />
    </svg>
  );
}

// ─── Small helpers ────────────────────────────────────────────────────────────

function GroupTab({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{
        background: active ? "var(--gold)" : "var(--panel)",
        color: active ? "#030b18" : "var(--muted)",
        border: `1px solid ${active ? "var(--gold)" : "var(--line)"}`,
        padding: "4px 9px", borderRadius: 6,
        fontSize: 10, fontWeight: 900, fontFamily: "var(--condensed)",
        letterSpacing: 0.5, transition: "all .15s",
      }}
    >
      {label}
    </button>
  );
}

function NavArrow({ dir, disabled, onClick }: { dir: "prev" | "next"; disabled: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      disabled={disabled}
      style={{
        background: "var(--panel)",
        border: "1px solid var(--line)",
        color: disabled ? "var(--line)" : "var(--ink)",
        width: 36, height: 36, borderRadius: 8,
        fontSize: 16, display: "grid", placeItems: "center",
        flexShrink: 0,
      }}
    >
      {dir === "prev" ? "←" : "→"}
    </button>
  );
}

function bottomNavBtn(disabled: boolean): React.CSSProperties {
  return {
    background: "transparent",
    border: "1px solid var(--line)",
    color: disabled ? "var(--line)" : "var(--muted)",
    padding: "8px 14px", borderRadius: 8,
    fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 700,
    letterSpacing: 0.5,
  };
}
