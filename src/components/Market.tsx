"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { CATALOG, RARITY_META, TEAMS, PAGES, TEAM_FLAGS } from "@/lib/catalog";
import type { Listing, Ownership, Settlement } from "@/lib/types";
import { useLang } from "@/contexts/LangContext";
import { Flag } from "./Flag";
import { Traders } from "./Traders";
import { StickerFace } from "./StickerCard";
import { NostrAvatar } from "./NostrAvatar";

export function Market({
  listings,
  settlements,
  myOwnership,
  myPubkey,
  onBuy,
  onCancel,
  onCancelAll,
}: {
  listings: Listing[];
  settlements: Settlement[];
  myOwnership: Ownership;
  myPubkey: string | null;
  onBuy: (listing: Listing) => void;
  onCancel: (listing: Listing) => void;
  onCancelAll?: (listings: Listing[]) => Promise<void>;
}) {
  const { t } = useLang();
  const [zoomed, setZoomed] = useState<Listing | null>(null);
  const [cancelingAll, setCancelingAll] = useState(false);
  const [ownerFilter, setOwnerFilter] = useState<"all" | "missing" | "have">("all");
  const [sortBy, setSortBy] = useState<"none" | "price_asc" | "price_desc">("none");
  const [teamFilter, setTeamFilter] = useState<string | null>(null);
  const [showAllMine, setShowAllMine] = useState(false);

  const teams = PAGES.filter((p) => p.id !== "fwc").map((p) => ({ id: p.id, name: p.name.split(" · ")[1] ?? p.id })).sort((a, b) => a.name.localeCompare(b.name));

  const mine  = listings.filter((l) => l.seller === myPubkey);
  let others = listings.filter((l) => {
    if (l.seller === myPubkey) return false;
    if (ownerFilter === "missing") return (myOwnership[l.stickerNum] ?? 0) === 0;
    if (ownerFilter === "have")    return (myOwnership[l.stickerNum] ?? 0) > 0;
    return true;
  });
  if (teamFilter) {
    others = others.filter((l) => CATALOG[l.stickerNum]?.team === teamFilter);
  }
  if (sortBy === "price_asc") {
    others = [...others].sort((a, b) => a.price - b.price);
  } else if (sortBy === "price_desc") {
    others = [...others].sort((a, b) => b.price - a.price);
  }

  async function handleCancelAll() {
    if (!onCancelAll || mine.length === 0) return;
    setCancelingAll(true);
    try { await onCancelAll(mine); } finally { setCancelingAll(false); }
  }

  useEffect(() => {
    if (!zoomed) return;
    const handler = (e: KeyboardEvent) => { if (e.key === "Escape") setZoomed(null); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [zoomed]);

  return (
    <div className="fade-in">
      <h2 style={{ fontFamily: "var(--display)", fontSize: 20, margin: 0 }}>
        {t.market_title}
      </h2>
      <p style={{ opacity: 0.65, fontSize: 13, marginTop: 4, marginBottom: 14 }}>
        {t.market_subtitle}
      </p>

      {/* ── INTERCAMBIOS ── */}
      <div style={{ marginBottom: 28, borderBottom: "1px solid var(--line)", paddingBottom: 24 }}>
        <Traders myOwnership={myOwnership} myPubkey={myPubkey} />
      </div>

      {/* ── COMPRAR/VENDER ── */}
      <>
          {/* Mis ventas activas */}
          {mine.length > 0 && (
            <div style={{ marginBottom: 18 }}>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
                <div style={{
                  fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)",
                  fontWeight: 900, letterSpacing: 1.5,
                }}>
                  MIS VENTAS ACTIVAS ({mine.length})
                </div>
                {onCancelAll && mine.length > 1 && (
                  <button
                    onClick={handleCancelAll}
                    disabled={cancelingAll}
                    style={{
                      background: "transparent",
                      border: "1px solid rgba(255,80,80,0.4)",
                      color: "rgba(255,120,120,0.9)",
                      padding: "5px 12px", borderRadius: 7,
                      fontSize: 10, fontFamily: "var(--condensed)", fontWeight: 900,
                      cursor: cancelingAll ? "default" : "pointer",
                      opacity: cancelingAll ? 0.5 : 1,
                      letterSpacing: 0.3, flexShrink: 0,
                    }}
                  >
                    {cancelingAll ? "CANCELANDO…" : `CANCELAR TODAS (${mine.length})`}
                  </button>
                )}
              </div>
              <div style={{ display: "grid", gap: 8 }}>
                {(showAllMine ? mine : mine.slice(0, 10)).map((l) => {
                  const s = CATALOG[l.stickerNum];
                  const r = RARITY_META[s.rarity];
                  return (
                    <div key={l.id} style={{
                      display: "flex", alignItems: "center", gap: 10,
                      background: "rgba(232,185,35,0.06)",
                      border: "1px solid rgba(232,185,35,0.25)",
                      borderRadius: 12, padding: 10,
                    }}>
                      <div style={{
                        width: 44, height: 58, borderRadius: 7,
                        border: `2px solid ${r.ring}`, overflow: "hidden", flexShrink: 0,
                      }}>
                        <StickerFace num={l.stickerNum} compact />
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 13, color: "var(--ink)" }}>{s.name}</div>
                        <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "var(--condensed)", fontWeight: 700 }}>
                          ⚡ {l.price} sats
                        </div>
                      </div>
                      <button
                        onClick={() => onCancel(l)}
                        style={{
                          background: "transparent",
                          border: "1px solid rgba(255,80,80,0.4)",
                          color: "rgba(255,120,120,0.9)",
                          padding: "7px 12px", borderRadius: 8,
                          fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 900,
                          cursor: "pointer", flexShrink: 0, letterSpacing: 0.3,
                        }}
                      >
                        CANCELAR
                      </button>
                    </div>
                  );
                })}
              </div>
              {mine.length > 10 && (
                <button
                  onClick={() => setShowAllMine(v => !v)}
                  style={{
                    marginTop: 8,
                    width: "100%",
                    background: "transparent",
                    border: "1px solid rgba(232,185,35,0.3)",
                    color: "var(--gold)",
                    padding: "8px 0",
                    borderRadius: 9,
                    fontSize: 11,
                    fontFamily: "var(--condensed)",
                    fontWeight: 900,
                    letterSpacing: 0.5,
                    cursor: "pointer",
                  }}
                >
                  {showAllMine ? `▲ VER MENOS` : `▼ VER TODAS (${mine.length})`}
                </button>
              )}
            </div>
          )}

          {/* Filtros */}
          {myPubkey && (
            <>
              {/* Ownership filter */}
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {(["all", "missing", "have"] as const).map((f) => {
                  const label = f === "all" ? t.market_filter_all : f === "missing" ? t.market_filter_missing : t.market_filter_have;
                  const active = ownerFilter === f;
                  return (
                    <button
                      key={f}
                      onClick={() => setOwnerFilter(f)}
                      style={{
                        padding: "6px 14px", borderRadius: 99, fontSize: 11,
                        fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 0.5,
                        cursor: "pointer", border: "1px solid",
                        borderColor: active ? "var(--gold)" : "var(--line)",
                        background: active ? "rgba(232,185,35,0.15)" : "transparent",
                        color: active ? "var(--gold)" : "var(--muted)",
                      }}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>

              {/* Sort + Team filter row */}
              <div style={{ display: "flex", gap: 6, marginBottom: 10, flexWrap: "wrap", alignItems: "center" }}>
                {/* Sort by price */}
                <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 1, marginRight: 2 }}>
                  {t.market_sort.toUpperCase()}
                </span>
                {([
                  ["none", t.market_sort_none],
                  ["price_asc", t.market_sort_asc],
                  ["price_desc", t.market_sort_desc],
                ] as const).map(([val, label]) => {
                  const active = sortBy === val;
                  return (
                    <button
                      key={val}
                      onClick={() => setSortBy(val)}
                      style={{
                        padding: "5px 10px", borderRadius: 99, fontSize: 10,
                        fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 0.3,
                        cursor: "pointer", border: "1px solid",
                        borderColor: active ? "var(--gold)" : "var(--line)",
                        background: active ? "rgba(232,185,35,0.15)" : "transparent",
                        color: active ? "var(--gold)" : "var(--muted)",
                      }}
                    >
                      {val === "price_asc" ? "↑ " : val === "price_desc" ? "↓ " : ""}{label}
                    </button>
                  );
                })}

                <div style={{ width: 1, height: 16, background: "var(--line)", margin: "0 4px", flexShrink: 0 }} />

                {/* Team filter */}
                <span style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 1, marginRight: 2 }}>
                  {t.market_filter_team.toUpperCase()}
                </span>
                <select
                  value={teamFilter ?? ""}
                  onChange={(e) => setTeamFilter(e.target.value || null)}
                  style={{
                    padding: "5px 10px", borderRadius: 99, fontSize: 10,
                    fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 0.3,
                    cursor: "pointer", border: "1px solid var(--line)",
                    background: "var(--panel2)", color: teamFilter ? "var(--gold)" : "var(--muted)",
                    outline: "none",
                  }}
                >
                  <option value="">{t.market_filter_all_teams}</option>
                  {teams.map((tm) => {
                    const flag = TEAM_FLAGS[tm.id] ?? "";
                    return <option key={tm.id} value={tm.id}>{flag} {tm.name}</option>;
                  })}
                </select>
              </div>
            </>
          )}

          <div style={{ display: "grid", gap: 8, gridTemplateColumns: "repeat(3, 1fr)" }}>
            {others.length === 0 && (
              <p style={{ opacity: 0.5, gridColumn: "1 / -1" }}>{t.market_no_offers}</p>
            )}
            {others.map((l) => {
              const s = CATALOG[l.stickerNum];
              const r = RARITY_META[s.rarity];
              const team = TEAMS[s.team];
              const alreadyOwn = (myOwnership[l.stickerNum] ?? 0) > 0;
              return (
                <div
                  key={l.id}
                  onClick={() => setZoomed(l)}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 6,
                    background: "var(--panel)",
                    border: `1px solid ${alreadyOwn ? "rgba(34,197,94,.35)" : "var(--line)"}`,
                    borderRadius: 12,
                    padding: "10px 8px 8px",
                    cursor: "pointer",
                    position: "relative",
                  }}
                >
                  {alreadyOwn && (
                    <span style={{
                      position: "absolute", top: 6, right: 6,
                      fontSize: 8, fontFamily: "var(--condensed)", fontWeight: 900,
                      letterSpacing: 0.3, color: "rgb(34,197,94)",
                      background: "rgba(34,197,94,.15)", border: "1px solid rgba(34,197,94,.3)",
                      borderRadius: 99, padding: "2px 5px",
                    }}>
                      {t.market_i_have_it}
                    </span>
                  )}
                  <div style={{
                    width: 64, height: 84,
                    borderRadius: 8,
                    border: `2px solid ${r.ring}`,
                    overflow: "hidden",
                    boxShadow: `0 0 10px ${r.glow}55`,
                    flexShrink: 0,
                  }}>
                    <StickerFace num={l.stickerNum} compact />
                  </div>
                  <div style={{
                    fontFamily: "var(--condensed)", fontWeight: 700,
                    fontSize: 11, color: "var(--ink)",
                    textAlign: "center", lineHeight: 1.2,
                    maxWidth: "100%", overflow: "hidden",
                    textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {s.name}
                  </div>
                  <div style={{ fontSize: 9, color: r.ring, fontFamily: "var(--condensed)", fontWeight: 700 }}>
                    {r.label.toUpperCase()}
                  </div>
                  <NostrAvatar pubkey={l.seller} size={16} fontSize={9} nameColor="var(--muted)" />
                  <button
                    onClick={(e) => { e.stopPropagation(); onBuy(l); }}
                    style={{
                      width: "100%",
                      background: "linear-gradient(135deg,var(--grass),var(--pitch))",
                      color: "#fff",
                      border: 0,
                      padding: "7px 4px",
                      borderRadius: 8,
                      fontFamily: "var(--condensed)",
                      fontWeight: 900,
                      fontSize: 11,
                      whiteSpace: "nowrap",
                      cursor: "pointer",
                      marginTop: 2,
                    }}
                  >
                    ⚡ {l.price} sats
                  </button>
                </div>
              );
            })}
          </div>

          {settlements.length > 0 && (
            <div style={{ marginTop: 26 }}>
              <h3 style={{ fontSize: 14, opacity: 0.7 }}>{t.market_transfers} ({settlements.length})</h3>
              {settlements.map((s) => (
                <div
                  key={s.id}
                  style={{
                    display: "flex", alignItems: "center", gap: 6,
                    padding: "6px 0",
                    borderBottom: "1px solid var(--line)",
                    flexWrap: "wrap",
                  }}
                >
                  <span style={{ fontSize: 11, color: "var(--gold)" }}>✅ #{s.stickerNum}</span>
                  <NostrAvatar pubkey={s.from} size={18} fontSize={10} nameColor="var(--muted)" />
                  <span style={{ fontSize: 10, color: "var(--muted)" }}>→</span>
                  <NostrAvatar pubkey={s.to} size={18} fontSize={10} nameColor="var(--muted)" />
                  <span style={{ fontSize: 10, color: "var(--gold)", fontFamily: "var(--condensed)", fontWeight: 700, marginLeft: "auto" }}>
                    ⚡ {s.price} sats
                  </span>
                </div>
              ))}
            </div>
          )}
        </>

      {/* ── ZOOM OVERLAY ── */}
      {zoomed && typeof document !== "undefined" && createPortal(
        <ListingZoom listing={zoomed} onClose={() => setZoomed(null)} onBuy={onBuy} />,
        document.body
      )}
    </div>
  );
}

function ListingZoom({
  listing,
  onClose,
  onBuy,
}: {
  listing: Listing;
  onClose: () => void;
  onBuy: (l: Listing) => void;
}) {
  const s = CATALOG[listing.stickerNum];
  const r = RARITY_META[s.rarity];
  const team = TEAMS[s.team];

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(3,11,24,.88)",
        backdropFilter: "blur(10px)",
        display: "grid", placeItems: "center",
        zIndex: 60, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          display: "flex", flexDirection: "column",
          alignItems: "center", gap: 16,
          maxWidth: 340, width: "100%",
        }}
      >
        {/* Figurita grande */}
        <div style={{
          width: 240, height: 320, borderRadius: 14,
          border: `3px solid ${r.ring}`, overflow: "hidden",
          boxShadow: `0 0 40px ${r.glow}, 0 24px 60px rgba(0,0,0,.7)`,
          animation: "pop .22s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          <StickerFace num={listing.stickerNum} />
        </div>

        {/* Info + comprar */}
        <div style={{
          background: "var(--panel)", border: "1px solid var(--line)",
          borderRadius: 14, padding: "14px 18px",
          width: "100%", textAlign: "center",
          animation: "popIn .22s cubic-bezier(.34,1.56,.64,1) both",
        }}>
          <div style={{
            fontFamily: "var(--condensed)", fontWeight: 900,
            fontSize: 18, color: "var(--ink)", lineHeight: 1.1, marginBottom: 4,
          }}>
            <Flag team={s.team} height={22} style={{ borderRadius: 3, marginRight: 6 }} />
            {s.name}
          </div>

          <div style={{
            fontSize: 12, color: "var(--muted)", fontFamily: "var(--condensed)",
            fontWeight: 700, marginBottom: 10,
          }}>
            {team.name.toUpperCase()} · #{listing.stickerNum}
          </div>

          <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 14 }}>
            <span style={{
              background: r.ring, color: "#000",
              fontSize: 10, fontWeight: 900,
              padding: "3px 10px", borderRadius: 99,
              fontFamily: "var(--condensed)", letterSpacing: 0.5,
            }}>
              {r.label.toUpperCase()}
            </span>
            <span style={{
              background: "var(--panel2)",
              padding: "4px 10px", borderRadius: 99,
            }}>
              <NostrAvatar pubkey={listing.seller} size={18} fontSize={10} nameColor="var(--muted)" />
            </span>
          </div>

          <button
            onClick={() => { onBuy(listing); onClose(); }}
            style={{
              width: "100%",
              background: "linear-gradient(135deg,var(--grass),var(--pitch))",
              color: "#fff", border: 0,
              padding: "12px 0", borderRadius: 10,
              fontWeight: 900, fontSize: 15,
              fontFamily: "var(--condensed)", letterSpacing: 0.5,
              cursor: "pointer", marginBottom: 8,
            }}
          >
            ⚡ COMPRAR · {listing.price} sats
          </button>

          <button
            onClick={onClose}
            style={{
              width: "100%", background: "var(--panel2)",
              border: "1px solid var(--line)", color: "var(--muted)",
              padding: "8px 0", borderRadius: 8,
              fontSize: 11, fontWeight: 700, fontFamily: "var(--condensed)",
              cursor: "pointer", letterSpacing: 0.5,
            }}
          >
            CERRAR
          </button>
        </div>
      </div>
    </div>
  );
}
