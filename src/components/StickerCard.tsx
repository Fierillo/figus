"use client";

import React, { useState } from "react";
import { CATALOG, RARITY_META, TEAMS, FWC_CHAMPION_TEAMS, FWC_IMAGE_STICKERS } from "@/lib/catalog";
import { Flag } from "./Flag";
import FACES from "@/lib/faces-manifest.json";

// ─── Derive sticker metadata ──────────────────────────────────────────────────

function teamPos(num: number): number | null {
  if (num <= 20) return null;
  if (num >= 981) return null; // DT stickers
  return ((num - 21) % 20) + 1; // 1-based within team (1=shield, 2=GK, 13=photo, rest=players)
}

function isManager(num: number): boolean {
  return num >= 981 && num <= 1028;
}

function silhouetteType(num: number): string {
  if (num <= 20) {
    const name = CATALOG[num].name.toLowerCase();
    if (name.includes("logo") || name.includes("figu")) return "logo";
    if (name.includes("mascota"))                         return "mascot";
    if (name.includes("trofeo"))                          return "trophy";
    if (name.includes("est."))                            return "stadium";
    if (name.includes("emblema"))                         return "emblem";
    if (name.includes("balón") || name.includes("balon")) return "ball";
    if (FWC_CHAMPION_TEAMS[num])                          return "champion";
    return "globe";
  }
  if (isManager(num)) return "coach";
  const pos = teamPos(num)!;
  if (pos === 1) return "shield";
  if (pos === 2) return "keeper";
  if (pos === 13) return "squad";
  const poses = ["run", "kick", "jump", "dribble"] as const;
  return poses[pos % 4];
}

function positionLabel(num: number): string {
  if (num <= 20) return "FWC";
  if (isManager(num)) return "DT";
  const pos = teamPos(num)!;
  if (pos === 1) return "ESCUDO";
  if (pos === 2) return "POR";
  if (pos <= 7) return "DEF";
  if (pos <= 12) return "MED";
  if (pos === 13) return "EQUIPO";
  return "DEL";
}

function isLightColor(hex: string): boolean {
  const c = hex.replace("#", "");
  const r = parseInt(c.substring(0, 2), 16);
  const g = parseInt(c.substring(2, 4), 16);
  const b = parseInt(c.substring(4, 6), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

// ─── SVG Silhouettes (60×80 viewBox) ─────────────────────────────────────────

function Silhouette({ type, light }: { type: string; light: boolean }) {
  const f  = light ? "rgba(0,20,70,0.58)"  : "rgba(255,255,255,0.85)";
  const f2 = light ? "rgba(0,20,70,0.28)"  : "rgba(255,255,255,0.42)";
  const props = { width: "100%", height: "100%", style: { display: "block" } as React.CSSProperties };

  if (type === "logo") return (
    // Stacked stickers / album icon
    <svg viewBox="0 0 60 80" {...props}>
      {/* Back sticker */}
      <g transform="rotate(-8 24 40)">
        <rect x="8" y="16" width="28" height="38" rx="4" fill={f} opacity="0.4"/>
      </g>
      {/* Mid sticker */}
      <g transform="rotate(5 30 40)">
        <rect x="10" y="14" width="28" height="38" rx="4" fill={f} opacity="0.6"/>
      </g>
      {/* Front sticker */}
      <rect x="14" y="12" width="32" height="44" rx="4" fill={f}/>
      <rect x="18" y="16" width="24" height="32" rx="2" fill={f2}/>
      {/* Star on front sticker */}
      <polygon points="30,20 32,27 39,27 34,31 36,38 30,34 24,38 26,31 21,27 28,27" fill={f}/>
      {/* Label line */}
      <rect x="20" y="50" width="20" height="3" rx="1.5" fill={f}/>
    </svg>
  );

  if (type === "mascot") return (
    // Big-headed mascot with arms raised in celebration
    <svg viewBox="0 0 60 80" {...props}>
      {/* Ears */}
      <ellipse cx="19" cy="9" rx="5" ry="7" fill={f}/>
      <ellipse cx="41" cy="9" rx="5" ry="7" fill={f}/>
      {/* Head */}
      <circle cx="30" cy="20" r="13" fill={f}/>
      {/* Eyes */}
      <circle cx="25" cy="18" r="2.5" fill={f2}/>
      <circle cx="35" cy="18" r="2.5" fill={f2}/>
      {/* Smile */}
      <path d="M24,24 Q30,30 36,24" fill="none" stroke={f2} strokeWidth="2" strokeLinecap="round"/>
      {/* Body */}
      <path d="M20,33 L40,33 L38,56 L22,56 Z" fill={f}/>
      {/* Arms raised */}
      <path d="M20,35 Q10,24 5,15 Q3,12 6,11 Q11,19 22,33 Z" fill={f}/>
      <path d="M40,35 Q50,24 55,15 Q57,12 54,11 Q49,19 38,33 Z" fill={f}/>
      {/* Legs */}
      <path d="M24,56 Q20,65 18,73 Q17,77 21,77 L26,65 L29,57 Z" fill={f}/>
      <path d="M36,56 Q40,65 42,73 Q43,77 39,77 L34,65 L31,57 Z" fill={f}/>
      {/* Stars beside head */}
      <polygon points="8,16 9.5,21 14,21 10.5,24 12,29 8,26 4,29 5.5,24 2,21 6.5,21" fill={f2}/>
      <polygon points="52,16 53.5,21 58,21 54.5,24 56,29 52,26 48,29 49.5,24 46,21 50.5,21" fill={f2}/>
    </svg>
  );

  if (type === "shield") return (
    <svg viewBox="0 0 60 80" {...props}>
      <path d="M10,8 L50,8 L50,46 Q50,64 30,76 Q10,64 10,46 Z" fill={f}/>
      <path d="M10,30 L50,30" stroke={f2} strokeWidth="1.5" fill="none"/>
      <path d="M30,8 L30,76" stroke={f2} strokeWidth="1.5" fill="none"/>
      <polygon points="30,36 33,46 42,46 35,52 38,61 30,55 22,61 25,52 18,46 27,46" fill={f2}/>
    </svg>
  );

  if (type === "keeper") return (
    <svg viewBox="0 0 60 80" {...props}>
      {/* Head */}
      <circle cx="30" cy="10" r="8" fill={f}/>
      {/* Body */}
      <path d="M22,18 L38,18 L36,44 L24,44 Z" fill={f}/>
      {/* Left arm spread wide */}
      <path d="M22,26 Q13,33 4,40 Q2,42 4,44 Q13,38 23,32 Z" fill={f}/>
      {/* Right arm spread wide */}
      <path d="M38,26 Q47,31 56,38 Q58,40 57,42 Q48,36 37,32 Z" fill={f}/>
      {/* Gloves */}
      <circle cx="3"  cy="43" r="4" fill={f}/>
      <circle cx="57" cy="41" r="4" fill={f}/>
      {/* Left leg */}
      <path d="M24,44 Q20,56 18,68 Q17,72 20,72 L24,60 L28,45 Z" fill={f}/>
      {/* Right leg */}
      <path d="M36,44 Q40,54 42,66 Q43,70 40,70 L36,60 L32,45 Z" fill={f}/>
    </svg>
  );

  if (type === "run") return (
    <svg viewBox="0 0 60 84" {...props}>
      {/* Shadow */}
      <ellipse cx="42" cy="81" rx="10" ry="3" fill={f2}/>
      {/* Ball */}
      <circle cx="50" cy="72" r="7" fill={f}/>
      <path d="M50,65 L50,79 M43,69 L57,75 M43,75 L57,69" stroke={f2} strokeWidth="1.2" fill="none"/>
      {/* Right leg — push */}
      <path d="M36,44 Q42,56 48,66 Q50,71 48,73 Q45,69 40,57 L34,45 Z" fill={f}/>
      {/* Left leg — stride forward */}
      <path d="M24,44 Q20,57 16,68 Q14,73 11,71 Q14,67 18,57 L22,45 Z" fill={f}/>
      {/* Left shoe */}
      <ellipse cx="10" cy="72" rx="7" ry="4" transform="rotate(-15 10 72)" fill={f}/>
      {/* Body */}
      <path d="M22,18 Q20,31 21,44 L39,44 Q40,31 38,18 Z" fill={f}/>
      {/* Left arm back */}
      <path d="M22,26 Q16,34 10,40 Q8,42 10,44 Q16,38 24,30 Z" fill={f}/>
      {/* Right arm forward */}
      <path d="M38,26 Q44,30 52,34 Q54,35 53,37 Q47,34 37,30 Z" fill={f}/>
      {/* Head */}
      <circle cx="30" cy="9" r="8" fill={f}/>
    </svg>
  );

  if (type === "kick") return (
    <svg viewBox="0 0 60 80" {...props}>
      {/* Head slightly forward */}
      <circle cx="27" cy="9" r="8" fill={f}/>
      {/* Body leaning */}
      <path d="M20,17 Q16,30 18,44 L34,44 Q37,32 33,17 Z" fill={f}/>
      {/* Support leg */}
      <path d="M20,44 Q17,56 15,68 Q14,72 17,72 L22,58 L26,45 Z" fill={f}/>
      {/* Kicking leg extended */}
      <path d="M32,44 Q38,52 46,60 Q50,64 52,62 Q49,58 42,51 L33,44 Z" fill={f}/>
      {/* Boot */}
      <ellipse cx="53" cy="62" rx="7" ry="4" transform="rotate(-35 53 62)" fill={f}/>
      {/* Ball being struck */}
      <circle cx="52" cy="55" r="7" fill={f2}/>
      {/* Left arm up (balance) */}
      <path d="M20,22 Q14,16 8,11 Q6,9 8,8 Q14,13 22,20 Z" fill={f}/>
      {/* Right arm out */}
      <path d="M33,24 Q40,28 46,34 Q48,36 46,38 Q41,33 34,28 Z" fill={f}/>
    </svg>
  );

  if (type === "jump") return (
    <svg viewBox="0 0 60 78" {...props}>
      {/* Ball at top — heading */}
      <circle cx="30" cy="5" r="6" fill={f2}/>
      {/* Head reaching up */}
      <circle cx="30" cy="16" r="8" fill={f}/>
      {/* Body */}
      <path d="M22,24 Q20,34 22,44 L38,44 Q40,34 38,24 Z" fill={f}/>
      {/* Both arms raised */}
      <path d="M22,28 Q16,20 10,14 Q8,12 10,11 Q15,16 24,24 Z" fill={f}/>
      <path d="M38,28 Q44,22 50,16 Q52,14 54,16 Q51,19 44,26 Z" fill={f}/>
      {/* Left leg bent */}
      <path d="M24,44 Q18,52 14,62 Q13,66 16,67 Q20,62 26,52 L28,44 Z" fill={f}/>
      {/* Right leg bent other way */}
      <path d="M36,44 Q40,50 46,58 Q48,62 46,64 Q42,60 36,52 L32,44 Z" fill={f}/>
    </svg>
  );

  if (type === "dribble") return (
    <svg viewBox="0 0 60 84" {...props}>
      {/* Head looking down */}
      <circle cx="28" cy="9" r="8" fill={f}/>
      {/* Body bent forward */}
      <path d="M20,17 Q16,30 18,44 L34,44 Q37,31 35,17 Z" fill={f}/>
      {/* Left arm controlling */}
      <path d="M20,26 Q14,34 10,44 Q8,47 11,48 Q15,41 22,32 Z" fill={f}/>
      {/* Right arm balance */}
      <path d="M34,22 Q40,26 50,28 Q52,30 51,32 Q46,30 36,27 Z" fill={f}/>
      {/* Left leg step */}
      <path d="M22,44 Q18,56 16,68 Q15,72 18,72 L22,60 L26,45 Z" fill={f}/>
      {/* Right leg push */}
      <path d="M32,44 Q36,54 40,64 Q42,68 40,70 Q36,66 32,56 L30,44 Z" fill={f}/>
      {/* Ball near feet */}
      <circle cx="20" cy="74" r="7" fill={f}/>
      <path d="M20,67 L20,81 M13,71 L27,77 M13,77 L27,71" stroke={f2} strokeWidth="1.2" fill="none"/>
    </svg>
  );

  if (type === "squad") return (
    <svg viewBox="0 0 60 72" {...props}>
      {/* Back row — 3 players */}
      <circle cx="12" cy="18" r="6" fill={f}/>
      <path d="M6,24 L18,24 L17,46 L7,46 Z" fill={f}/>
      <circle cx="30" cy="14" r="7" fill={f}/>
      <path d="M23,21 L37,21 L36,46 L24,46 Z" fill={f}/>
      <circle cx="48" cy="18" r="6" fill={f}/>
      <path d="M42,24 L54,24 L53,46 L43,46 Z" fill={f}/>
      {/* Front row — 2 players */}
      <circle cx="20" cy="44" r="5" fill={f2}/>
      <path d="M15,49 L25,49 L24,64 L16,64 Z" fill={f2}/>
      <circle cx="40" cy="44" r="5" fill={f2}/>
      <path d="M35,49 L45,49 L44,64 L36,64 Z" fill={f2}/>
    </svg>
  );

  if (type === "trophy") return (
    <svg viewBox="0 0 60 80" {...props}>
      <text x="30" y="11" textAnchor="middle" fontSize="11" fill={f} style={{ fontFamily: "sans-serif" }}>★★★</text>
      {/* Bowl */}
      <path d="M12,16 L48,16 Q52,34 46,46 Q38,60 30,62 Q22,60 14,46 Q8,34 12,16 Z" fill={f}/>
      {/* Handles */}
      <path d="M12,20 Q3,22 3,35 Q3,46 12,48" fill="none" stroke={f} strokeWidth="5" strokeLinecap="round"/>
      <path d="M48,20 Q57,22 57,35 Q57,46 48,48" fill="none" stroke={f} strokeWidth="5" strokeLinecap="round"/>
      {/* Inner shine */}
      <path d="M22,24 Q30,20 38,24" fill="none" stroke={f2} strokeWidth="2"/>
      {/* Stem */}
      <rect x="26" y="62" width="8" height="10" rx="2" fill={f}/>
      {/* Base */}
      <rect x="14" y="71" width="32" height="7" rx="3" fill={f}/>
    </svg>
  );

  if (type === "stadium") return (
    <svg viewBox="0 0 60 80" {...props}>
      {/* Grass */}
      <ellipse cx="30" cy="72" rx="28" ry="7" fill={f2}/>
      {/* Field lines */}
      <ellipse cx="30" cy="70" rx="18" ry="4" fill="none" stroke={f} strokeWidth="1"/>
      <line x1="30" y1="66" x2="30" y2="74" stroke={f} strokeWidth="1"/>
      {/* Stands */}
      <path d="M6,72 Q6,52 30,44 Q54,52 54,72 Z" fill={f} opacity="0.8"/>
      {/* Roof arch */}
      <path d="M6,58 Q6,30 30,24 Q54,30 54,58" fill="none" stroke={f} strokeWidth="3" strokeLinecap="round"/>
      {/* Light towers */}
      <rect x="4"  y="50" width="3" height="10" rx="1" fill={f}/>
      <rect x="53" y="50" width="3" height="10" rx="1" fill={f}/>
      <circle cx="5"  cy="49" r="3" fill={f2}/>
      <circle cx="55" cy="49" r="3" fill={f2}/>
    </svg>
  );

  if (type === "emblem") return (
    // Ornate FIFA-style badge with laurel and globe
    <svg viewBox="0 0 60 80" {...props}>
      {/* Outer badge */}
      <path d="M8,6 L52,6 L56,38 Q56,62 30,76 Q4,62 4,38 Z" fill={f}/>
      {/* Inner badge */}
      <path d="M13,10 L47,10 L51,36 Q51,57 30,70 Q9,57 9,36 Z" fill={f2}/>
      {/* Laurel left */}
      <path d="M11,26 Q2,20 4,12 Q10,16 11,26 Z" fill={f}/>
      <path d="M10,38 Q1,34 2,25 Q9,28 10,38 Z" fill={f}/>
      <path d="M10,50 Q1,48 2,39 Q9,42 10,50 Z" fill={f}/>
      {/* Laurel right */}
      <path d="M49,26 Q58,20 56,12 Q50,16 49,26 Z" fill={f}/>
      <path d="M50,38 Q59,34 58,25 Q51,28 50,38 Z" fill={f}/>
      <path d="M50,50 Q59,48 58,39 Q51,42 50,50 Z" fill={f}/>
      {/* Globe inside */}
      <circle cx="30" cy="36" r="13" fill={f}/>
      <ellipse cx="30" cy="36" rx="6.5" ry="13" fill="none" stroke={f2} strokeWidth="1.2"/>
      <ellipse cx="30" cy="36" rx="13" ry="5.5" fill="none" stroke={f2} strokeWidth="1.2"/>
      <line x1="17" y1="36" x2="43" y2="36" stroke={f2} strokeWidth="1"/>
      {/* Stars at top */}
      <polygon points="22,13 23.5,18 28,18 24.5,20.5 26,25 22,22 18,25 19.5,20.5 16,18 20.5,18" fill={f}/>
      <polygon points="30,10 31.5,15 36,15 32.5,17.5 34,22 30,19 26,22 27.5,17.5 24,15 28.5,15" fill={f}/>
      <polygon points="38,13 39.5,18 44,18 40.5,20.5 42,25 38,22 34,25 35.5,20.5 32,18 36.5,18" fill={f}/>
    </svg>
  );

  if (type === "ball") return (
    <svg viewBox="0 0 60 80" {...props}>
      <circle cx="30" cy="42" r="26" fill={f}/>
      {/* Classic football pentagon patches */}
      <polygon points="30,17 38,28 30,36 22,28" fill={f2}/>
      <polygon points="30,67 38,56 30,48 22,56" fill={f2}/>
      <polygon points="6,30 17,26 20,38 10,46" fill={f2}/>
      <polygon points="54,30 43,26 40,38 50,46" fill={f2}/>
      <polygon points="10,60 18,52 20,62 14,68" fill={f2}/>
      <polygon points="50,60 42,52 40,62 46,68" fill={f2}/>
    </svg>
  );

  if (type === "coach") return (
    // Coach/DT silhouette with clipboard
    <svg viewBox="0 0 60 80" {...props}>
      {/* Head */}
      <circle cx="30" cy="18" r="10" fill={f}/>
      {/* Body (suit) */}
      <path d="M18,30 L42,30 L44,60 L16,60 Z" fill={f}/>
      {/* Lapels */}
      <path d="M24,30 L30,48 L36,30" fill="none" stroke={f2} strokeWidth="1.5"/>
      {/* Clipboard */}
      <rect x="20" y="50" width="20" height="16" rx="2" fill={f2}/>
      <rect x="26" y="48" width="8" height="4" rx="1" fill={f}/>
      {/* Lines on clipboard */}
      <line x1="23" y1="55" x2="37" y2="55" stroke={f} strokeWidth="1" opacity="0.5"/>
      <line x1="23" y1="58" x2="37" y2="58" stroke={f} strokeWidth="1" opacity="0.5"/>
      <line x1="23" y1="61" x2="32" y2="61" stroke={f} strokeWidth="1" opacity="0.5"/>
      {/* Whistle */}
      <circle cx="42" cy="26" r="3" fill={f2}/>
      <line x1="42" y1="23" x2="42" y2="18" stroke={f2} strokeWidth="1.5"/>
    </svg>
  );

  // globe / FWC generic
  return (
    <svg viewBox="0 0 60 80" {...props}>
      <circle cx="30" cy="40" r="24" fill={f}/>
      <ellipse cx="30" cy="40" rx="12" ry="24" fill="none" stroke={f2} strokeWidth="1.5"/>
      <ellipse cx="30" cy="40" rx="24" ry="9"  fill="none" stroke={f2} strokeWidth="1.5"/>
      <line x1="6" y1="40" x2="54" y2="40" stroke={f2} strokeWidth="1.5"/>
      <line x1="30" y1="16" x2="30" y2="64" stroke={f2} strokeWidth="1.5"/>
      <polygon points="30,11 32.5,18 40,18 34,22 36.5,29 30,25 23.5,29 26,22 20,18 27.5,18" fill={f2}/>
    </svg>
  );
}

// ─── Squad image with fallback chain ─────────────────────────────────────────
// Tries: /faces/{team}/13.jpg (foto real del plantel) → /squad-{team}.png → /squad.png → SVG

function SquadImage({ team, light }: { team: string; light: boolean }) {
  const hasRealPhoto = ((FACES as Record<string, number[]>)[team] ?? []).includes(13);
  const [src, setSrc] = useState(hasRealPhoto ? `/faces/${team}/13.jpg` : `/squad-${team}.png`);
  const [useSvg, setUseSvg] = useState(false);

  if (useSvg) return <Silhouette type="squad" light={light} />;

  return (
    <img
      src={src}
      alt=""
      onError={() => {
        if (src.startsWith("/faces/")) setSrc(`/squad-${team}.png`);
        else if (!src.endsWith("/squad.png")) setSrc("/squad.png");
        else setUseSvg(true);
      }}
      style={{
        width: "100%", height: "100%",
        objectFit: "cover", objectPosition: "center top",
        display: "block",
      }}
    />
  );
}

// ─── Shield image with fallback ───────────────────────────────────────────────
// Tries: /shield-{team}.png → SVG silhouette

function ShieldImage({ team, light }: { team: string; light: boolean }) {
  const [useSvg, setUseSvg] = useState(false);

  if (useSvg) return <Silhouette type="shield" light={light} />;

  return (
    <img
      src={`/shield-${team}.png`}
      alt=""
      onError={() => setUseSvg(true)}
      style={{
        width: "100%", height: "100%",
        objectFit: "contain",
        padding: "12%",
        boxSizing: "border-box",
        display: "block",
        filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.35))",
      }}
    />
  );
}

// ─── StickerFace (main export used by Album + PackReveal) ─────────────────────

export function StickerFace({
  num,
  compact = false,
}: {
  num: number;
  compact?: boolean;
}) {
  const s      = CATALOG[num];
  const r      = RARITY_META[s.rarity];
  const sType  = silhouetteType(num);
  const pos    = positionLabel(num);

  // FWC stickers with a real image asset (fwc-{num}.png)
  const hasFwcImage = FWC_IMAGE_STICKERS.has(num);

  // Champion historical stickers use the country's colors, not the FWC gold
  const championCode = FWC_CHAMPION_TEAMS[num] ?? null;
  const team   = (championCode && TEAMS[championCode])
    ? TEAMS[championCode]
    : TEAMS[s.team];

  const isLeg   = s.rarity === "legendary";
  const isShiny = s.rarity === "shiny" || isLeg;
  const light   = isLightColor(team.color);
  const nameColor = light ? "#111" : "#fff";
  const muteColor = light ? "rgba(0,0,0,0.55)" : "rgba(255,255,255,0.65)";

  // SVG-only types (shield has its own image component with SVG fallback)
  const isSVGType = ["squad", "trophy", "stadium", "ball", "globe", "logo", "mascot", "emblem"].includes(sType);
  // For champion stickers, load ostrich from the mapped country
  const ostrichTeam = sType === "champion" ? (championCode ?? s.team) : s.team;

  // Real player face downloaded by scripts/fetch-faces.ts (manifest = positions on disk)
  const facePos = isManager(num) ? 21 : teamPos(num);
  const hasFace =
    num > 20 && facePos !== null &&
    ((FACES as Record<string, number[]>)[s.team] ?? []).includes(facePos);

  return (
    <div className="sticker-card">

      {/* ── Header ─────────────────────────────────────────── */}
      <div style={{
        background: team.color,
        padding: compact ? "3px 5px" : "4px 7px",
        display: "flex",
        justifyContent: "space-between",
        alignItems: "center",
        flexShrink: 0,
      }}>
        <span style={{ fontFamily: "var(--condensed)", fontWeight: 900, fontSize: compact ? 9 : 11, color: nameColor, lineHeight: 1 }}>
          {num}
        </span>
        <span style={{ fontSize: compact ? 6 : 7, color: muteColor, letterSpacing: 0.3, fontWeight: 700, fontFamily: "var(--condensed)" }}>
          FIFA WC 2026™
        </span>
      </div>

      {/* ── Illustration area ───────────────────────────────── */}
      <div style={{
        flex: 1,
        position: "relative",
        background: `linear-gradient(160deg, ${team.color} 0%, ${team.accent} 60%, ${team.color}99 100%)`,
        overflow: "hidden",
      }}>
        {/* Jersey texture */}
        <div style={{
          position: "absolute", inset: 0,
          backgroundImage: "repeating-linear-gradient(-45deg, transparent, transparent 4px, rgba(255,255,255,0.04) 4px, rgba(255,255,255,0.04) 5px)",
        }}/>

        {/* Foil effects */}
        {isLeg   && <div className="shine-legendary"/>}
        {isShiny && !isLeg && <div className="shine"/>}

        {/* Illustration */}
        <div style={{ position: "absolute", top: 2, left: 4, right: 4, bottom: compact ? 14 : 18, zIndex: 1, overflow: "hidden", borderRadius: 2 }}>
          {sType === "squad" ? (
            <SquadImage team={s.team} light={light} />
          ) : sType === "shield" ? (
            <ShieldImage team={s.team} light={light} />
          ) : hasFwcImage ? (
            <img
              src={`/fwc-${num}.png`}
              alt=""
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 5%",
                mixBlendMode: "multiply",
                display: "block",
              }}
            />
          ) : hasFace ? (
            // No mixBlendMode: real photos must not be tinted by the gradient
            <img
              src={`/faces/${s.team}/${facePos}.jpg`}
              alt=""
              onError={(e) => {
                e.currentTarget.src = `/ostrich-${ostrichTeam}.png`;
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 20%",
                display: "block",
              }}
            />
          ) : !isSVGType ? (
            <img
              src={`/ostrich-${ostrichTeam}.png`}
              alt=""
              onError={(e) => {
                const img = e.currentTarget as HTMLImageElement;
                if (img.src.endsWith(".png")) {
                  img.src = `/ostrich-${ostrichTeam}.jpeg`;
                } else {
                  img.src = "/ostrich.png";
                }
              }}
              style={{
                width: "100%",
                height: "100%",
                objectFit: "cover",
                objectPosition: "center 5%",
                mixBlendMode: "multiply",
                display: "block",
              }}
            />
          ) : (
            <Silhouette type={sType} light={light} />
          )}
        </div>

        {/* Trophy badge on champion stickers */}
        {sType === "champion" && !compact && (
          <div style={{
            position: "absolute",
            top: 3,
            right: 5,
            zIndex: 3,
            fontSize: 13,
            lineHeight: 1,
            filter: "drop-shadow(0 1px 3px rgba(0,0,0,0.6))",
          }}>
            🏆
          </div>
        )}

        {/* Flag + rarity badge at bottom of illustration */}
        <div style={{
          position: "absolute", bottom: 2, left: 4, right: 4,
          display: "flex", justifyContent: "space-between", alignItems: "center",
          zIndex: 2,
        }}>
          <Flag
            team={s.team}
            height={compact ? 9 : 13}
            style={{ borderRadius: 1, boxShadow: "0 1px 3px rgba(0,0,0,0.5)" }}
          />
          {!compact && (
            <div style={{
              background: r.ring, color: "#000",
              fontSize: 6, fontWeight: 900, padding: "2px 4px", borderRadius: 3,
              letterSpacing: 0.4, fontFamily: "var(--condensed)",
            }}>
              {r.label.toUpperCase()}
            </div>
          )}
        </div>
      </div>

      {/* ── Name strip ─────────────────────────────────────── */}
      <div style={{ background: "#fff", padding: compact ? "2px 5px" : "3px 6px", flexShrink: 0 }}>
        <div style={{
          fontFamily: "var(--condensed)", fontWeight: 900,
          fontSize: compact ? 8 : 9.5, lineHeight: 1.1,
          color: light ? "#003087" : team.color,
          textTransform: "uppercase", letterSpacing: 0.3,
          whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis",
        }}>
          {s.name}
        </div>

        {!compact && (
          <div style={{
            fontSize: 7, color: "#555", marginTop: 1,
            fontFamily: "var(--condensed)", fontWeight: 700,
            display: "flex", justifyContent: "space-between", alignItems: "center", gap: 2,
          }}>
            <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis", flex: 1 }}>
              {team.name.toUpperCase()}
            </span>
            <span style={{
              background: team.color, color: light ? "#000" : "#fff",
              fontSize: 6, fontWeight: 900, padding: "1px 3px", borderRadius: 2,
              flexShrink: 0, fontFamily: "var(--condensed)", letterSpacing: 0.3,
            }}>
              {pos}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
