"use client";

import { useState } from "react";
import { getNwcString, saveNwcString, clearNwcString, parseNwc } from "@/lib/nwc";
import { getLocalKeys } from "@/lib/identity";
import type { Identity } from "@/lib/identity";
import { useLang } from "@/contexts/LangContext";

function maskNwc(str: string): string {
  const pfx = "nostr+walletconnect://";
  const body = str.startsWith(pfx) ? str.slice(pfx.length) : str;
  return `${pfx}${body.slice(0, 8)}${"•".repeat(12)}${body.slice(-6)}`;
}

function CopyButton({ value, label }: { value: string; label?: string }) {
  const { t } = useLang();
  const [copied, setCopied] = useState(false);
  async function copy() {
    await navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <button
      onClick={copy}
      style={{
        background: copied ? "rgba(100,220,130,0.15)" : "var(--panel2)",
        border: `1px solid ${copied ? "rgba(100,220,130,0.4)" : "var(--line)"}`,
        color: copied ? "rgb(100,220,130)" : "var(--muted)",
        padding: "5px 10px", borderRadius: 7,
        fontSize: 10, fontFamily: "var(--condensed)", fontWeight: 900,
        flexShrink: 0, whiteSpace: "nowrap", cursor: "pointer",
        letterSpacing: 0.3,
      }}
    >
      {copied ? t.cfg_copied : (label ?? t.cfg_copy)}
    </button>
  );
}

export function SettingsModal({
  onClose,
  identity,
  onImportNsec,
  onOpenRelaySync,
}: {
  onClose: () => void;
  identity: Identity | null;
  onImportNsec: (raw: string) => void;
  /** Abre el modal de resiliencia (replicar figus en relays). */
  onOpenRelaySync?: () => void;
}) {
  const { t } = useLang();

  // ── NWC state ──
  const current = getNwcString();
  const [nwcInput, setNwcInput]   = useState("");
  const [editing,  setEditing]    = useState(!current);
  const [nwcSaved, setNwcSaved]   = useState(false);
  const [nwcError, setNwcError]   = useState<string | null>(null);

  // ── Keys state ──
  const [showNsec,    setShowNsec]    = useState(false);
  const [importing,   setImporting]   = useState(false);
  const [importInput, setImportInput] = useState("");
  const [importError, setImportError] = useState<string | null>(null);
  const [importOk,    setImportOk]    = useState(false);

  const keys = identity?.mode === "local" ? getLocalKeys() : null;

  // ── NWC handlers ──
  function saveNwc() {
    const str = nwcInput.trim();
    if (!str) {
      clearNwcString();
      setNwcSaved(true);
      setEditing(false);
      setTimeout(() => setNwcSaved(false), 2000);
      return;
    }
    if (!str.startsWith("nostr+walletconnect://")) {
      setNwcError(t.cfg_nwc_invalid);
      return;
    }
    try {
      parseNwc(str);
      saveNwcString(str);
      setNwcError(null);
      setNwcInput("");
      setEditing(false);
      setNwcSaved(true);
      setTimeout(() => setNwcSaved(false), 2000);
    } catch (e: any) {
      setNwcError(e.message);
    }
  }

  function clearNwc() {
    clearNwcString();
    setNwcInput("");
    setEditing(false);
    setNwcSaved(false);
  }

  const hasNwc = Boolean(getNwcString());

  // ── Import nsec handler ──
  function handleImport() {
    try {
      onImportNsec(importInput);
      setImportError(null);
      setImportInput("");
      setImporting(false);
      setImportOk(true);
      setTimeout(() => setImportOk(false), 3000);
    } catch (e: any) {
      setImportError(e.message || t.cfg_key_invalid);
    }
  }

  const SectionLabel = ({ children }: { children: string }) => (
    <div style={{
      fontSize: 10, color: "var(--gold)", fontFamily: "var(--condensed)",
      fontWeight: 900, letterSpacing: 1.5, marginBottom: 12,
      borderBottom: "1px solid var(--line)", paddingBottom: 6,
    }}>
      {children}
    </div>
  );

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed", inset: 0,
        background: "rgba(3,11,24,.92)",
        backdropFilter: "blur(8px)",
        display: "grid", placeItems: "center",
        zIndex: 50, padding: 20,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          background: "var(--panel)",
          border: "1px solid var(--line)",
          borderRadius: 20,
          padding: "24px 20px",
          maxWidth: 420, width: "100%",
          maxHeight: "88vh",
          overflowY: "auto",
          display: "flex", flexDirection: "column", gap: 24,
        }}
      >
        {/* Header */}
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 900, letterSpacing: 2, color: "var(--gold)" }}>
            {t.cfg_title}
          </div>
          <button
            onClick={onClose}
            style={{ background: "transparent", border: "none", color: "var(--muted)", fontSize: 20, cursor: "pointer", lineHeight: 1, padding: "0 4px" }}
          >
            ✕
          </button>
        </div>

        {/* ── RESILIENCIA DE FIGUS ── */}
        {identity && onOpenRelaySync && (
          <div>
            <SectionLabel>RESILIENCIA DE FIGUS</SectionLabel>
            <p style={{
              fontSize: 11, color: "var(--muted)", margin: "0 0 10px",
              lineHeight: 1.6, fontFamily: "var(--condensed)",
            }}>
              Tus figus son eventos de Nostr: replicalas en varios relays y guardá
              una copia local para que nunca se pierdan.
            </p>
            <button
              onClick={onOpenRelaySync}
              style={{
                width: "100%",
                background: "linear-gradient(135deg, var(--gold), #d4920a)",
                color: "#030b18", border: "none",
                padding: "11px 0", borderRadius: 10,
                fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                letterSpacing: 0.8, cursor: "pointer",
              }}
            >
              🛰 REPLICAR MIS FIGUS EN LOS RELAYS
            </button>
          </div>
        )}

        {/* ── CLAVES NOSTR (solo modo local) ── */}
        {keys && (
          <div>
            <SectionLabel>{t.cfg_nostr_keys}</SectionLabel>

            {/* npub */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
                {t.cfg_npub_label}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{
                  flex: 1, fontFamily: "monospace", fontSize: 10,
                  color: "var(--ink)", background: "var(--panel2)",
                  borderRadius: 8, padding: "8px 10px",
                  wordBreak: "break-all", lineHeight: 1.5,
                }}>
                  {keys.npub}
                </div>
                <CopyButton value={keys.npub} />
              </div>
            </div>

            {/* nsec */}
            <div style={{ marginBottom: 10 }}>
              <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 0.5, marginBottom: 5 }}>
                {t.cfg_nsec_label}
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <div style={{
                  flex: 1, fontFamily: "monospace", fontSize: 10,
                  color: showNsec ? "var(--gold)" : "var(--muted)",
                  background: "var(--panel2)",
                  borderRadius: 8, padding: "8px 10px",
                  wordBreak: "break-all", lineHeight: 1.5,
                  filter: showNsec ? "none" : "blur(4px)",
                  userSelect: showNsec ? "text" : "none",
                }}>
                  {keys.nsec}
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 5, flexShrink: 0 }}>
                  <button
                    onClick={() => setShowNsec(!showNsec)}
                    style={{
                      background: "var(--panel2)", border: "1px solid var(--line)",
                      color: "var(--muted)", padding: "5px 10px", borderRadius: 7,
                      fontSize: 10, fontFamily: "var(--condensed)", fontWeight: 900,
                      cursor: "pointer", whiteSpace: "nowrap",
                    }}
                  >
                    {showNsec ? t.cfg_nsec_hide : t.cfg_nsec_show}
                  </button>
                  {showNsec && <CopyButton value={keys.nsec} />}
                </div>
              </div>
            </div>

            {/* Aviso de seguridad */}
            <div style={{
              background: "rgba(255,180,0,0.07)", border: "1px solid rgba(255,180,0,0.2)",
              borderRadius: 8, padding: "8px 12px", marginBottom: 10,
              fontSize: 11, color: "var(--muted)", lineHeight: 1.6,
              fontFamily: "var(--condensed)",
            }}>
              {t.cfg_nsec_warning}
            </div>

            {/* Importar otra clave */}
            {!importing ? (
              <button
                onClick={() => setImporting(true)}
                style={{
                  width: "100%", background: "transparent",
                  border: "1px solid var(--line)", color: "var(--muted)",
                  padding: "8px 0", borderRadius: 8,
                  fontSize: 11, fontFamily: "var(--condensed)", fontWeight: 700,
                  cursor: "pointer", letterSpacing: 0.3,
                }}
              >
                {t.cfg_import_btn}
              </button>
            ) : (
              <div>
                <div style={{ fontSize: 10, color: "var(--muted)", fontFamily: "var(--condensed)", fontWeight: 700, letterSpacing: 0.5, marginBottom: 6 }}>
                  {t.cfg_import_paste}
                </div>
                <textarea
                  autoFocus
                  value={importInput}
                  onChange={(e) => { setImportInput(e.target.value); setImportError(null); }}
                  placeholder="nsec1…"
                  rows={2}
                  style={{
                    width: "100%", background: "var(--panel2)",
                    border: `1px solid ${importError ? "#cc2244" : "var(--line)"}`,
                    borderRadius: 8, padding: "8px 10px",
                    color: "var(--ink)", fontSize: 12, fontFamily: "monospace",
                    resize: "none", boxSizing: "border-box", marginBottom: 6,
                    outline: "none",
                  }}
                />
                {importError && (
                  <div style={{ fontSize: 11, color: "#cc2244", marginBottom: 8, fontFamily: "var(--condensed)" }}>
                    {importError}
                  </div>
                )}
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    onClick={handleImport}
                    disabled={!importInput.trim()}
                    style={{
                      flex: 1, background: "var(--fifa-blue)", color: "#fff",
                      border: "none", padding: "9px 0", borderRadius: 8,
                      fontWeight: 900, fontSize: 12, fontFamily: "var(--condensed)",
                      cursor: importInput.trim() ? "pointer" : "not-allowed",
                      opacity: importInput.trim() ? 1 : 0.5,
                    }}
                  >
                    {t.cfg_import_submit}
                  </button>
                  <button
                    onClick={() => { setImporting(false); setImportInput(""); setImportError(null); }}
                    style={{
                      background: "transparent", border: "1px solid var(--line)",
                      color: "var(--muted)", padding: "9px 14px", borderRadius: 8,
                      fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t.cfg_cancel}
                  </button>
                </div>
              </div>
            )}
            {importOk && (
              <div style={{ fontSize: 11, color: "rgb(100,220,130)", fontFamily: "var(--condensed)", marginTop: 8, textAlign: "center" }}>
                {t.cfg_import_ok}
              </div>
            )}
          </div>
        )}

        {/* ── NOSTR WALLET CONNECT ── */}
        <div>
          <SectionLabel>NOSTR WALLET CONNECT (NWC)</SectionLabel>

          {hasNwc && !editing && (
            <div>
              <div style={{
                display: "flex", alignItems: "center", gap: 8,
                background: "var(--panel2)", borderRadius: 8,
                padding: "10px 12px", marginBottom: 12,
              }}>
                <div style={{
                  flex: 1, fontFamily: "monospace", fontSize: 11,
                  color: "var(--gold)", wordBreak: "break-all", lineHeight: 1.4,
                }}>
                  {maskNwc(getNwcString()!)}
                </div>
                <CopyButton value={getNwcString()!} />
              </div>
              {nwcSaved && (
                <div style={{ fontSize: 11, color: "var(--gold)", fontFamily: "var(--condensed)", marginBottom: 10, textAlign: "center" }}>
                  {t.cfg_nwc_saved}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={() => { setEditing(true); setNwcInput(""); }}
                  style={{
                    flex: 1, background: "var(--fifa-blue)", color: "#fff",
                    border: "none", padding: "9px 0", borderRadius: 8,
                    fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                    cursor: "pointer",
                  }}
                >
                  {t.cfg_nwc_change}
                </button>
                <button
                  onClick={clearNwc}
                  style={{
                    background: "transparent", border: "1px solid var(--line)",
                    color: "var(--muted)", padding: "9px 14px", borderRadius: 8,
                    fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t.cfg_nwc_clear}
                </button>
              </div>
            </div>
          )}

          {(!hasNwc || editing) && (
            <div>
              {!hasNwc && (
                <div style={{ fontSize: 11, color: "var(--muted)", background: "var(--panel2)", borderRadius: 8, padding: "7px 10px", marginBottom: 10, fontFamily: "var(--condensed)" }}>
                  {t.cfg_nwc_no_wallet}
                </div>
              )}
              <textarea
                value={nwcInput}
                onChange={(e) => { setNwcInput(e.target.value); setNwcError(null); }}
                placeholder="nostr+walletconnect://..."
                rows={4}
                autoFocus={!keys}
                style={{
                  width: "100%", background: "var(--panel2)",
                  border: `1px solid ${nwcError ? "#cc2244" : "var(--line)"}`,
                  borderRadius: 8, padding: "8px 10px",
                  color: "var(--ink)", fontSize: 11, fontFamily: "monospace",
                  resize: "none", boxSizing: "border-box", marginBottom: nwcError ? 6 : 10,
                  outline: "none",
                }}
              />
              {nwcError && (
                <div style={{ fontSize: 11, color: "#cc2244", marginBottom: 10, fontFamily: "var(--condensed)" }}>
                  {nwcError}
                </div>
              )}
              <div style={{ display: "flex", gap: 8 }}>
                <button
                  onClick={saveNwc}
                  style={{
                    flex: 1, background: "var(--fifa-blue)", color: "#fff",
                    border: "none", padding: "10px 0", borderRadius: 8,
                    fontWeight: 900, fontSize: 13, fontFamily: "var(--condensed)",
                    letterSpacing: 0.5, cursor: "pointer",
                  }}
                >
                  {t.cfg_save}
                </button>
                {editing && hasNwc && (
                  <button
                    onClick={() => { setEditing(false); setNwcError(null); setNwcInput(""); }}
                    style={{
                      background: "transparent", border: "1px solid var(--line)",
                      color: "var(--muted)", padding: "10px 14px", borderRadius: 8,
                      fontSize: 12, fontFamily: "var(--condensed)", fontWeight: 700,
                      cursor: "pointer",
                    }}
                  >
                    {t.cfg_cancel}
                  </button>
                )}
              </div>
            </div>
          )}

          <p style={{ fontSize: 10, color: "var(--muted)", marginTop: 12, marginBottom: 0, fontFamily: "var(--condensed)", lineHeight: 1.6 }}>
            {t.cfg_nwc_hint}
          </p>
        </div>
      </div>
    </div>
  );
}
