"use client";

// ─────────────────────────────────────────────────────────────────────────────
// RelaySyncModal — resiliencia de figus.
//
// Busca las pruebas de tenencia del usuario (30100 + 1573 del issuer) relay
// por relay, las respalda en IndexedDB y republica las que falten en cada
// relay. El usuario puede sumar relays (con sugerencias de los más populares)
// para aumentar la redundancia. Todo el proceso es observable: estado por
// relay, spinners, barras de progreso y resumen final.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from "react";
import { RELAYS } from "@/lib/constants";
import { backupCount } from "@/lib/figuDb";
import {
  POPULAR_RELAYS, getExtraRelays, addExtraRelay, removeExtraRelay,
  syncFigus, type SyncProgress, type RelayReport, type SyncMode,
} from "@/lib/relaySync";

const shortUrl = (u: string) => u.replace(/^wss?:\/\//, "").replace(/\/$/, "");

function StatusIcon({ r }: { r: RelayReport }) {
  switch (r.status) {
    case "pendiente":
      return <span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--line)", display: "inline-block" }} />;
    case "buscando":
    case "publicando":
      return (
        <span style={{
          width: 12, height: 12, display: "inline-block",
          border: "2px solid rgba(232,185,35,.25)", borderTopColor: "var(--gold)",
          borderRadius: "50%", animation: "rsSpin .7s linear infinite",
        }} />
      );
    case "ok":
      return <span style={{ width: 10, height: 10, borderRadius: "50%", background: "#60a5fa", display: "inline-block", boxShadow: "0 0 8px #60a5fa66" }} />;
    case "sincronizado":
      return <span style={{ color: "#4ade80", fontSize: 13, lineHeight: 1 }}>✓</span>;
    case "error":
      return <span style={{ color: "#ef4444", fontSize: 12, lineHeight: 1 }}>✕</span>;
  }
}

function RelayRow({ r, removable, onRemove }: { r: RelayReport; removable: boolean; onRemove: () => void }) {
  const publishing = r.status === "publicando";
  const total = r.published + r.failed;
  const pct = r.missing > 0 ? Math.min(100, (total / r.missing) * 100) : 0;
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 10,
      background: "var(--panel2)", border: "1px solid var(--line)",
      borderRadius: 10, padding: "9px 12px",
      animation: "rsRowIn .3s ease both",
      position: "relative", overflow: "hidden",
    }}>
      {/* barra de progreso de fondo mientras publica */}
      {publishing && (
        <div style={{
          position: "absolute", left: 0, top: 0, bottom: 0,
          width: `${pct}%`,
          background: "linear-gradient(90deg, rgba(232,185,35,.10), rgba(232,185,35,.18))",
          transition: "width .25s ease",
        }} />
      )}
      <div style={{ width: 16, display: "grid", placeItems: "center", flexShrink: 0, position: "relative" }}>
        <StatusIcon r={r} />
      </div>
      <div style={{ flex: 1, minWidth: 0, position: "relative" }}>
        <div style={{
          fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 12,
          color: "var(--ink)", letterSpacing: 0.3,
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
        }}>
          {shortUrl(r.url)}
        </div>
        <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", marginTop: 1 }}>
          {r.status === "pendiente" && "esperando…"}
          {r.status === "buscando" && "buscando tus figus…"}
          {r.status === "ok" && `${r.found} pruebas encontradas`}
          {r.status === "publicando" && `republicando ${total}/${r.missing}…`}
          {r.status === "sincronizado" && (
            r.published > 0
              ? `${r.found} tenía · ${r.published} republicadas${r.failed ? ` · ${r.failed} rechazadas` : ""}`
              : `al día (${r.found} pruebas)`
          )}
          {r.status === "error" && (r.error || "sin conexión")}
        </div>
      </div>
      {/* badge derecho */}
      <div style={{ flexShrink: 0, position: "relative", display: "flex", alignItems: "center", gap: 6 }}>
        {r.status === "sincronizado" && r.published > 0 && (
          <span style={{
            fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 9,
            color: "#030b18", background: "#4ade80",
            borderRadius: 99, padding: "2px 8px", letterSpacing: 0.5,
          }}>
            +{r.published}
          </span>
        )}
        {r.status === "ok" && r.missing > 0 && (
          <span style={{
            fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 9,
            color: "#030b18", background: "#fbbf24",
            borderRadius: 99, padding: "2px 8px", letterSpacing: 0.5,
          }}>
            faltan {r.missing}
          </span>
        )}
        {removable && (
          <button
            onClick={onRemove}
            title="Quitar relay"
            style={{
              background: "transparent", border: "none", color: "var(--muted)",
              cursor: "pointer", fontSize: 12, padding: 2, lineHeight: 1,
            }}
          >
            ✕
          </button>
        )}
      </div>
    </div>
  );
}

export function RelaySyncModal({ pubkey, onClose }: { pubkey: string; onClose: () => void }) {
  const [extraRelays, setExtraRelays] = useState<string[]>(getExtraRelays());
  const [input, setInput] = useState("");
  const [inputError, setInputError] = useState(false);
  const [running, setRunning] = useState(false);
  const [runMode, setRunMode] = useState<SyncMode>("full");
  const [progress, setProgress] = useState<SyncProgress | null>(null);
  const [localCount, setLocalCount] = useState<number | null>(null);
  const cancelRef = useRef({ cancelled: false });

  const allRelays = [...new Set([...RELAYS, ...extraRelays])];
  const suggestions = POPULAR_RELAYS.filter((r) => !allRelays.includes(r)).slice(0, 6);

  useEffect(() => {
    backupCount(pubkey).then(setLocalCount).catch(() => setLocalCount(0));
  }, [pubkey, progress?.phase]);

  useEffect(() => () => { cancelRef.current.cancelled = true; }, []);

  function handleAdd(url?: string) {
    const added = addExtraRelay(url ?? input);
    if (!added) { setInputError(true); return; }
    setInputError(false);
    setInput("");
    setExtraRelays(getExtraRelays());
  }

  function handleRemove(url: string) {
    removeExtraRelay(url);
    setExtraRelays(getExtraRelays());
  }

  async function run(mode: SyncMode) {
    if (running) return;
    setRunning(true);
    setRunMode(mode);
    setProgress(null);
    cancelRef.current = { cancelled: false };
    try {
      await syncFigus({
        user: pubkey,
        relays: allRelays,
        onProgress: setProgress,
        signal: cancelRef.current,
        mode,
      });
    } finally {
      setRunning(false);
    }
  }

  const done = progress?.phase === "done";
  const pct = Math.round((progress?.overall ?? 0) * 100);
  const totalPublished = progress?.relays.reduce((a, r) => a + r.published, 0) ?? 0;
  const okRelays = progress?.relays.filter((r) => r.status === "sincronizado").length ?? 0;

  return (
    <div
      onClick={() => { if (!running) onClose(); }}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(3,11,24,.92)", backdropFilter: "blur(8px)",
        display: "grid", placeItems: "center", zIndex: 55, padding: 20,
      }}
    >
      <style>{`
        @keyframes rsSpin { to { transform: rotate(360deg); } }
        @keyframes rsRowIn { 0% { opacity: 0; transform: translateY(6px); } 100% { opacity: 1; transform: none; } }
        @keyframes rsBarStripes { 0% { background-position: 0 0; } 100% { background-position: 28px 0; } }
        @keyframes rsPulse { 0%,100% { opacity: .55; } 50% { opacity: 1; } }
        @keyframes rsPop { 0% { transform: scale(.6); opacity: 0; } 70% { transform: scale(1.08); } 100% { transform: scale(1); opacity: 1; } }
      `}</style>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)", border: "1px solid var(--gold)",
          borderRadius: 20, padding: "22px 20px",
          width: "min(560px, 96vw)", maxHeight: "90vh",
          overflowY: "auto", display: "flex", flexDirection: "column", gap: 16,
          boxShadow: "0 18px 60px rgba(0,0,0,.6)",
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 2, color: "var(--gold)" }}>
            🛰 RESILIENCIA DE FIGUS
          </div>
          <button
            onClick={onClose}
            disabled={running}
            style={{
              background: "transparent", border: "none", color: "var(--muted)",
              fontSize: 20, cursor: running ? "default" : "pointer",
              opacity: running ? 0.3 : 1, lineHeight: 1, padding: "0 4px",
            }}
          >
            ✕
          </button>
        </div>

        <p style={{ fontSize: 12, color: "var(--muted)", margin: 0, lineHeight: 1.6, fontFamily: "var(--condensed)" }}>
          Tus figus viven como eventos firmados por el issuer en relays de Nostr.
          Este proceso las busca en todos los relays, guarda una copia en este
          dispositivo y <strong style={{ color: "var(--ink)" }}>republica las que falten</strong> en
          cada relay — cuantos más relays las tengan, más difícil que se pierdan.
        </p>

        {/* Respaldo local */}
        <div style={{
          display: "flex", alignItems: "center", gap: 10,
          background: "rgba(96,165,250,.08)", border: "1px solid rgba(96,165,250,.25)",
          borderRadius: 10, padding: "9px 12px",
        }}>
          <span style={{ fontSize: 16 }}>💾</span>
          <div style={{ flex: 1, fontSize: 11, color: "var(--muted)", fontFamily: "var(--condensed)" }}>
            Respaldo local (IndexedDB)
          </div>
          <div style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 12, color: "#60a5fa" }}>
            {localCount === null ? "…" : `${localCount} pruebas`}
          </div>
        </div>

        {/* Lista de relays */}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <div style={{
            display: "flex", justifyContent: "space-between", alignItems: "baseline",
            fontSize: 10, color: "var(--gold)", fontFamily: "var(--condensed)",
            fontWeight: 900, letterSpacing: 1.5,
            borderBottom: "1px solid var(--line)", paddingBottom: 6, marginBottom: 4,
          }}>
            <span>RELAYS ({allRelays.length})</span>
            {progress && <span style={{ color: "var(--muted)", letterSpacing: 0.5 }}>{progress.totalEvents > 0 ? `${progress.totalEvents} pruebas de figus` : ""}</span>}
          </div>
          {allRelays.map((url) => {
            const report = progress?.relays.find((r) => r.url === url)
              ?? { url, status: "pendiente" as const, found: 0, missing: 0, published: 0, failed: 0 };
            return (
              <RelayRow
                key={url}
                r={report}
                removable={!running && extraRelays.includes(url)}
                onRemove={() => handleRemove(url)}
              />
            );
          })}
        </div>

        {/* Agregar relay */}
        {!running && (
          <div>
            <div style={{ display: "flex", gap: 8 }}>
              <input
                value={input}
                onChange={(e) => { setInput(e.target.value); setInputError(false); }}
                onKeyDown={(e) => e.key === "Enter" && handleAdd()}
                placeholder="wss://otro.relay.com"
                style={{
                  flex: 1, background: "var(--panel2)",
                  border: `1px solid ${inputError ? "#ef4444" : "var(--line)"}`,
                  borderRadius: 8, padding: "8px 10px",
                  color: "var(--ink)", fontSize: 12, fontFamily: "monospace",
                  outline: "none",
                }}
              />
              <button
                onClick={() => handleAdd()}
                disabled={!input.trim()}
                style={{
                  background: input.trim() ? "var(--fifa-blue)" : "var(--panel2)",
                  color: input.trim() ? "#fff" : "var(--muted)",
                  border: "none", borderRadius: 8, padding: "8px 16px",
                  fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 11,
                  cursor: input.trim() ? "pointer" : "default", letterSpacing: 0.5,
                }}
              >
                AGREGAR
              </button>
            </div>
            {suggestions.length > 0 && (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 9, color: "var(--muted)", fontFamily: "var(--condensed)", letterSpacing: 1, marginBottom: 5 }}>
                  SUGERIDOS (populares):
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 5 }}>
                  {suggestions.map((url) => (
                    <button
                      key={url}
                      onClick={() => handleAdd(url)}
                      style={{
                        background: "var(--panel2)", border: "1px dashed var(--line)",
                        color: "var(--muted)", borderRadius: 99, padding: "4px 10px",
                        fontSize: 10, fontFamily: "var(--condensed)", fontWeight: 700,
                        cursor: "pointer", letterSpacing: 0.3,
                      }}
                    >
                      + {shortUrl(url)}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Progreso global */}
        {progress && !done && (
          <div>
            <div style={{
              display: "flex", justifyContent: "space-between", marginBottom: 6,
              fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 700,
            }}>
              <span style={{ color: "var(--muted)", animation: "rsPulse 1.4s ease-in-out infinite" }}>
                {progress.message}
              </span>
              <span style={{ color: "var(--gold)", fontWeight: 900 }}>{pct}%</span>
            </div>
            <div style={{
              height: 10, background: "var(--panel2)", borderRadius: 99,
              border: "1px solid var(--line)", overflow: "hidden",
            }}>
              <div style={{
                height: "100%", width: `${pct}%`,
                borderRadius: 99,
                background: "repeating-linear-gradient(45deg, var(--gold) 0 10px, #d4920a 10px 20px)",
                backgroundSize: "28px 28px",
                animation: "rsBarStripes .8s linear infinite",
                transition: "width .3s ease",
              }} />
            </div>
          </div>
        )}

        {/* Resumen final */}
        {done && progress && (
          <div style={{
            background: "linear-gradient(135deg, rgba(74,222,128,.10), rgba(74,222,128,.03))",
            border: "1px solid rgba(74,222,128,.4)",
            borderRadius: 12, padding: "14px 16px",
            animation: "rsPop .35s cubic-bezier(.34,1.56,.64,1) both",
          }}>
            <div style={{
              fontFamily: "var(--condensed)", fontWeight: 900, fontSize: 13,
              color: "#4ade80", letterSpacing: 0.5, marginBottom: 8, textAlign: "center",
            }}>
              {progress.message}
            </div>
            <div style={{ display: "flex", justifyContent: "center", gap: 18, textAlign: "center" }}>
              {[
                { v: progress.totalEvents, l: "PRUEBAS" },
                ...(runMode === "entrada"
                  ? [{ v: progress.newLocal, l: "NUEVAS EN LOCAL" }]
                  : [
                      { v: `${okRelays}/${allRelays.length}`, l: "RELAYS AL DÍA" },
                      { v: totalPublished, l: "REPUBLICADAS" },
                    ]),
                { v: progress.backedUp, l: "EN RESPALDO" },
              ].map((s) => (
                <div key={s.l}>
                  <div style={{ fontFamily: "var(--display)", fontSize: 20, color: "var(--ink)", lineHeight: 1 }}>{s.v}</div>
                  <div style={{ fontSize: 8, color: "var(--muted)", fontFamily: "var(--condensed)", letterSpacing: 1, marginTop: 3 }}>{s.l}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* CTAs: entrada / salida / ciclo completo */}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            onClick={() => run("entrada")}
            disabled={running}
            title="Trae TODAS tus figus de todos los relays y las guarda en este dispositivo"
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid rgba(96,165,250,.5)",
              color: running && runMode === "entrada" ? "var(--muted)" : "#60a5fa",
              padding: "10px 0", borderRadius: 10,
              fontWeight: 900, fontSize: 11, fontFamily: "var(--condensed)",
              letterSpacing: 0.5, cursor: running ? "default" : "pointer",
              opacity: running && runMode !== "entrada" ? 0.4 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {running && runMode === "entrada" ? (
              <span style={{
                width: 11, height: 11,
                border: "2px solid rgba(96,165,250,.3)", borderTopColor: "#60a5fa",
                borderRadius: "50%", animation: "rsSpin .7s linear infinite", display: "inline-block",
              }} />
            ) : "⬇"}
            ENTRADA · TRAER A LOCAL
          </button>
          <button
            onClick={() => run("salida")}
            disabled={running || localCount === 0}
            title="Republica tu respaldo local en todos los relays donde falte"
            style={{
              flex: 1,
              background: "transparent",
              border: "1px solid rgba(74,222,128,.5)",
              color: running && runMode === "salida" ? "var(--muted)" : "#4ade80",
              padding: "10px 0", borderRadius: 10,
              fontWeight: 900, fontSize: 11, fontFamily: "var(--condensed)",
              letterSpacing: 0.5, cursor: running || localCount === 0 ? "default" : "pointer",
              opacity: (running && runMode !== "salida") || localCount === 0 ? 0.4 : 1,
              display: "flex", alignItems: "center", justifyContent: "center", gap: 7,
            }}
          >
            {running && runMode === "salida" ? (
              <span style={{
                width: 11, height: 11,
                border: "2px solid rgba(74,222,128,.3)", borderTopColor: "#4ade80",
                borderRadius: "50%", animation: "rsSpin .7s linear infinite", display: "inline-block",
              }} />
            ) : "⬆"}
            SALIDA · REPUBLICAR
          </button>
        </div>
        <button
          onClick={() => run("full")}
          disabled={running}
          style={{
            background: running
              ? "var(--panel2)"
              : "linear-gradient(135deg, var(--gold), #d4920a)",
            color: running ? "var(--muted)" : "#030b18",
            border: "none", padding: "13px 0", borderRadius: 12,
            fontWeight: 900, fontSize: 14, fontFamily: "var(--condensed)",
            letterSpacing: 1, cursor: running ? "default" : "pointer",
            display: "flex", alignItems: "center", justifyContent: "center", gap: 10,
            marginTop: -8,
          }}
        >
          {running && runMode === "full" && (
            <span style={{
              width: 14, height: 14,
              border: "2px solid rgba(232,185,35,.3)", borderTopColor: "var(--gold)",
              borderRadius: "50%", animation: "rsSpin .7s linear infinite", display: "inline-block",
            }} />
          )}
          {running ? "SINCRONIZANDO…" : done ? "🔄 VOLVER A SINCRONIZAR TODO" : "🔄 SINCRONIZACIÓN COMPLETA (ENTRADA + SALIDA)"}
        </button>
      </div>
    </div>
  );
}
