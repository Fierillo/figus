// Descarga caras de jugadores para las figuritas.
//
//   npm run faces -- --team cuw          un equipo (o lista: --team cuw,arg)
//   npm run faces -- --all               los 48 equipos
//   npm run faces -- --all --squads      fotos del equipo (pos 13) en vez de jugadores
//   npm run faces -- --all --managers    fotos de DTs (pos 21)
//   npm run faces -- --all --missing-only  reintenta solo missing/low_confidence
//   npm run faces -- --team cuw --force  re-descarga aunque el archivo exista
//   npm run faces -- --nums 363,365,373  re-procesa esas figuritas (fuerza re-descarga)
//
// Fuentes (cascada): overrides manuales → TheSportsDB → Wikipedia.
// Salidas:
//   public/faces/{team}/{pos}.jpg        512×512 JPEG q80
//   scripts/faces-report.json            estado por jugador (ok|low_confidence|missing)
//   src/lib/faces-manifest.json          {team: [pos,...]} regenerado del disco
//
// Overrides manuales en scripts/faces-overrides.json:
//   { "col:19": { "url": "https://..." } }  — URL directa de imagen, gana siempre.

import fs from "node:fs";
import path from "node:path";
import sharp from "sharp";
import { CATALOG, teamName, TEAMS, TEAM_MANAGERS } from "../src/lib/catalog";

const ROOT = path.join(__dirname, "..");
const FACES_DIR = path.join(ROOT, "public", "faces");
const REPORT_PATH = path.join(__dirname, "faces-report.json");
const OVERRIDES_PATH = path.join(__dirname, "faces-overrides.json");
const MANIFEST_PATH = path.join(ROOT, "src", "lib", "faces-manifest.json");

const THROTTLE_MS = 600;
const UA = "figus-album/1.0 (sticker face fetcher; hackathon project)";

// ─── Tipos ────────────────────────────────────────────────────────────────────

interface Job { team: string; pos: number; num: number; name: string }

interface ReportEntry {
  name: string;
  status: "ok" | "low_confidence" | "missing";
  source: "thesportsdb" | "wikipedia" | "override" | null;
  sourceUrl: string | null;
  candidates: number;
  nationalityMatch: boolean;
  note?: string;
}

type Report = Record<string, ReportEntry>;
type Overrides = Record<string, { url: string }>;

// ─── Nacionalidades (cómo las escribe TheSportsDB) ───────────────────────────

const NATIONALITY_OVERRIDES: Record<string, string[]> = {
  cuw: ["Curacao", "Curaçao"],
  irn: ["Iran"],
  civ: ["Ivory Coast", "Côte d'Ivoire", "Cote d'Ivoire"],
  kor: ["South Korea", "Korea Republic", "Korea"],
  tur: ["Turkey", "Türkiye", "Turkiye"],
  bih: ["Bosnia and Herzegovina", "Bosnia"],
  cod: ["DR Congo", "Congo DR", "Democratic Republic of Congo", "Congo"],
  usa: ["United States", "USA"],
  cze: ["Czech Republic", "Czechia"],
  cpv: ["Cape Verde", "Cabo Verde"],
};

function nationalities(team: string): string[] {
  return NATIONALITY_OVERRIDES[team] ?? [teamName(team, "en")];
}

// Gentilicios para validar matches de Wikipedia ("Curacaoan footballer (born 1997)")
const DEMONYMS: Record<string, string[]> = {
  mex: ["Mexican"], rsa: ["South African"], kor: ["South Korean", "Korean"],
  cze: ["Czech"], can: ["Canadian"], bih: ["Bosnian"], qat: ["Qatari"],
  sui: ["Swiss"], bra: ["Brazilian"], mar: ["Moroccan"], hai: ["Haitian"],
  sco: ["Scottish"], usa: ["American"], par: ["Paraguayan"], aus: ["Australian"],
  tur: ["Turkish"], ger: ["German"], cuw: ["Curacao", "Curaçao", "Dutch"],
  civ: ["Ivorian"], ecu: ["Ecuadorian", "Ecuadorean"], ned: ["Dutch"],
  jpn: ["Japanese"], swe: ["Swedish"], tun: ["Tunisian"], bel: ["Belgian"],
  egy: ["Egyptian"], irn: ["Iranian"], nzl: ["New Zealand"], esp: ["Spanish"],
  cpv: ["Cape Verdean"], ksa: ["Saudi"], uru: ["Uruguayan"], fra: ["French"],
  sen: ["Senegalese"], irq: ["Iraqi"], nor: ["Norwegian"], alg: ["Algerian"],
  aut: ["Austrian"], jor: ["Jordanian"], por: ["Portuguese"], cod: ["Congolese"],
  uzb: ["Uzbek", "Uzbekistani"], col: ["Colombian"], eng: ["English"],
  cro: ["Croatian"], gha: ["Ghanaian"], pan: ["Panamanian"],
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function stripDiacritics(s: string): string {
  return s.normalize("NFD").replace(/\p{M}/gu, "");
}

function norm(s: unknown): string {
  return stripDiacritics(String(s ?? "")).toLowerCase().trim();
}

// Variantes de búsqueda: original → sin diacríticos → sin puntuación → tokens invertidos
function nameVariants(name: string): string[] {
  const out: string[] = [];
  const push = (v: string) => {
    v = v.trim().replace(/\s+/g, " ");
    if (v && !out.includes(v)) out.push(v);
  };
  push(name);
  push(stripDiacritics(name));
  const cleaned = stripDiacritics(name)
    .replace(/\bJr\.?$/i, "")
    .replace(/\./g, " ");
  push(cleaned);
  const toks = cleaned.trim().split(/\s+/);
  if (toks.length === 2) push(`${toks[1]} ${toks[0]}`); // orden coreano

  // Prefijo árabe "Al": "Aldawsari" → "Al-Dawsari" / "Al Dawsari"
  // (TheSportsDB registra a los sauditas/iraquíes con guion: Salem Al-Dawsari)
  const alSplit = cleaned.replace(/\bAl([a-z]+)/g, (_, rest: string) =>
    `Al-${rest[0].toUpperCase()}${rest.slice(1)}`
  );
  if (alSplit !== cleaned) {
    push(alSplit);
    push(alSplit.replace(/Al-/g, "Al "));
  }
  // También quitar guiones existentes ("Al-Sanbi" → "Al Sanbi")
  if (/-/.test(cleaned)) push(cleaned.replace(/-/g, " "));
  return out;
}

async function fetchWithRetry(url: string, asJson: boolean): Promise<any> {
  let lastErr: unknown;
  for (let attempt = 0; attempt < 3; attempt++) {
    if (attempt > 0) await sleep(1000 * 3 ** (attempt - 1) * 3); // 3s, 9s
    try {
      const res = await fetch(url, { headers: { "User-Agent": UA } });
      if (res.status === 429 || res.status >= 500) {
        lastErr = new Error(`HTTP ${res.status}`);
        continue;
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return asJson ? res.json() : Buffer.from(await res.arrayBuffer());
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr;
}

// ─── Fuentes ──────────────────────────────────────────────────────────────────

interface Candidate {
  imageUrl: string;
  isCutout: boolean;
  source: "thesportsdb" | "wikipedia";
  confident: boolean;
  candidates: number;
  nationalityMatch: boolean;
  note?: string;
}

async function searchTheSportsDB(job: Job): Promise<Candidate | null> {
  const natList = nationalities(job.team).map(norm);

  for (const variant of nameVariants(job.name)) {
    const url = `https://www.thesportsdb.com/api/v1/json/123/searchplayers.php?p=${encodeURIComponent(variant)}`;
    let data: any;
    try {
      data = await fetchWithRetry(url, true);
    } catch {
      continue;
    }
    await sleep(THROTTLE_MS);

    const soccer = ((data?.player ?? []) as any[]).filter(
      (p) => p?.strSport === "Soccer" && (p.strThumb || p.strCutout)
    );
    if (!soccer.length) continue;

    const natMatches = soccer.filter((p) =>
      natList.some((n) => norm(p.strNationality).includes(n) || n.includes(norm(p.strNationality)))
    );

    if (natMatches.length) {
      // Hay match de nacionalidad: preferir nombre exacto entre ellos
      const exact = natMatches.find((p) => norm(p.strPlayer) === norm(variant));
      const pick = exact ?? natMatches[0];
      return {
        imageUrl: pick.strThumb ?? pick.strCutout,
        isCutout: !pick.strThumb,
        source: "thesportsdb",
        confident: natMatches.length === 1 || !!exact,
        candidates: soccer.length,
        nationalityMatch: true,
      };
    }

    // Sin match de nacionalidad: solo aceptar si es nombre EXACTO (naturalizados,
    // p.ej. brasileños de Catar). Si la API afirma otra nacionalidad y el nombre
    // no es exacto, es un homónimo (Rodri→inglés, Pedri→portugués) → rechazar y
    // seguir con otra variante / Wikipedia.
    const exact = soccer.find((p) => norm(p.strPlayer) === norm(variant));
    if (!exact) continue;
    return {
      imageUrl: exact.strThumb ?? exact.strCutout,
      isCutout: !exact.strThumb,
      source: "thesportsdb",
      confident: false,
      candidates: soccer.length,
      nationalityMatch: false,
      note: `nacionalidad API: ${exact.strNationality}`,
    };
  }
  return null;
}

async function searchWikipedia(job: Job): Promise<Candidate | null> {
  const demonyms = [...(DEMONYMS[job.team] ?? []), ...nationalities(job.team)].map(norm);
  const demonym = (DEMONYMS[job.team] ?? [])[0] ?? "";
  const isManager = job.pos === 21;
  // Dos queries: con nacionalidad (apunta al jugador correcto entre homónimos)
  // y la genérica como respaldo. Para managers busca "football manager/coach".
  const queries = isManager
    ? [
        `${stripDiacritics(job.name)} ${demonym} football manager`.replace(/\s+/g, " ").trim(),
        `${stripDiacritics(job.name)} football coach`,
        `${stripDiacritics(job.name)}`,
      ]
    : [
        `${stripDiacritics(job.name)} ${demonym} footballer`.replace(/\s+/g, " ").trim(),
        `${stripDiacritics(job.name)} footballer`,
      ];

  for (const query of queries) {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&generator=search` +
      `&gsrsearch=${encodeURIComponent(query)}&gsrlimit=4` +
      `&prop=pageimages%7Cdescription&piprop=thumbnail&pithumbsize=512&format=json`;

    let data: any;
    try {
      data = await fetchWithRetry(url, true);
    } catch {
      continue;
    }
    await sleep(THROTTLE_MS);

    const pages = Object.values(data?.query?.pages ?? {}) as any[];
    pages.sort((a, b) => (a.index ?? 99) - (b.index ?? 99));

    // Preferir una página cuyo "description" mencione la nacionalidad del equipo
    const valid = pages.filter(
      (p) => p.thumbnail?.source && /footballer|soccer|football player|football manager|football coach|soccer coach/.test(norm(p.description))
    );
    const natPage = valid.find((p) => demonyms.some((d) => norm(p.description).includes(d)));
    const page = natPage ?? valid[0];
    if (!page) continue;

    const natMatch = !!natPage;
    return {
      imageUrl: page.thumbnail.source,
      isCutout: false,
      source: "wikipedia",
      confident: natMatch,
      candidates: pages.length,
      nationalityMatch: natMatch,
      note: page.description ?? undefined,
    };
  }
  return null;
}

// ─── Foto del equipo (pos 13) ─────────────────────────────────────────────────
// Fuente 1: Wikipedia — artículo de la selección → imagen principal del infobox
// Fuente 2: TheSportsDB fanart (fallback)

// Títulos de Wikipedia para selecciones con nombre no estándar
const SQUAD_WIKI_TITLES: Record<string, string[]> = {
  usa: ["United States men's national soccer team"],
  can: ["Canada men's national soccer team"],
  aus: ["Australia men's national soccer team"],
  nzl: ["New Zealand men's national association football team", "New Zealand national association football team"],
  kor: ["South Korea national football team"],
  cod: ["DR Congo national football team", "Democratic Republic of the Congo national football team"],
  irn: ["Iran national football team"],
  cuw: ["Curaçao national football team", "Curacao national football team"],
  civ: ["Ivory Coast national football team"],
  cze: ["Czech Republic national football team"],
  cpv: ["Cape Verde national football team"],
  bih: ["Bosnia and Herzegovina national football team"],
  tur: ["Turkey national football team"],
  ksa: ["Saudi Arabia national football team"],
  rsa: ["South Africa national football team"],
  por: ["Portugal national football team"],
  ned: ["Netherlands national football team"],
  sui: ["Switzerland national football team"],
  arg: ["Argentina national football team"],
  bra: ["Brazil national football team"],
  ger: ["Germany national football team"],
  esp: ["Spain national football team"],
  fra: ["France national football team"],
  eng: ["England national football team"],
  sco: ["Scotland national football team"],
  uru: ["Uruguay national football team"],
  col: ["Colombia national football team"],
  ecu: ["Ecuador national football team"],
  par: ["Paraguay national football team"],
  mex: ["Mexico national football team"],
  pan: ["Panama national football team"],
  jor: ["Jordan national football team"],
  qat: ["Qatar national football team"],
  irq: ["Iraq national football team"],
  mar: ["Morocco national football team"],
  alg: ["Algeria national football team"],
  tun: ["Tunisia national football team"],
  egy: ["Egypt national football team"],
  sen: ["Senegal national football team"],
  gha: ["Ghana national football team"],
  hai: ["Haiti national football team"],
  jpn: ["Japan national football team"],
  cro: ["Croatia national football team"],
  aut: ["Austria national football team"],
  bel: ["Belgium national football team"],
  nor: ["Norway national football team"],
  swe: ["Sweden national football team"],
  uzb: ["Uzbekistan national football team"],
};

async function searchSquadWikipedia(team: string): Promise<Candidate | null> {
  const titles = SQUAD_WIKI_TITLES[team] ?? [`${teamName(team, "en")} national football team`];
  for (const title of titles) {
    const url =
      `https://en.wikipedia.org/w/api.php?action=query&format=json` +
      `&titles=${encodeURIComponent(title)}&prop=pageimages&piprop=original&pithumbsize=1200`;
    let data: any;
    try {
      data = await fetchWithRetry(url, true);
    } catch {
      await sleep(THROTTLE_MS);
      continue;
    }
    await sleep(THROTTLE_MS);

    const pages = Object.values(data?.query?.pages ?? {}) as any[];
    const page = pages[0];
    if (!page || page.missing !== undefined) continue;

    const img =
      page.original?.source ??
      page.thumbnail?.source;
    if (!img) continue;

    // Filtrar logos/escudos — son PNG pequeños con "badge","crest","logo","kit","flag" en la URL
    if (/badge|crest|logo|kit|flag|emblem/i.test(img)) continue;

    return {
      imageUrl: img,
      isCutout: false,
      source: "wikipedia",
      confident: true,
      candidates: 1,
      nationalityMatch: true,
      note: `Wikipedia: ${title}`,
    };
  }
  return null;
}

// Nombres con los que TheSportsDB registra a las selecciones (cuando difieren del EN)
const SQUAD_TEAM_NAMES: Record<string, string[]> = {
  usa: ["USA", "United States"],
  kor: ["South Korea", "Korea Republic"],
  cod: ["DR Congo", "Congo DR"],
  irn: ["Iran"],
  cuw: ["Curacao", "Curaçao"],
  civ: ["Ivory Coast"],
  cze: ["Czech Republic", "Czechia"],
  cpv: ["Cape Verde", "Cabo Verde"],
  bih: ["Bosnia and Herzegovina"],
  tur: ["Turkey", "Türkiye"],
};

async function getContentLength(url: string): Promise<number> {
  try {
    const res = await fetch(url, { method: "HEAD", headers: { "User-Agent": UA }, signal: AbortSignal.timeout(5000) });
    return parseInt(res.headers.get("content-length") ?? "0", 10);
  } catch {
    return 0;
  }
}

async function searchSquadTSDB(team: string): Promise<Candidate | null> {
  const names = SQUAD_TEAM_NAMES[team] ?? [teamName(team, "en")];
  for (const name of names) {
    const url = `https://www.thesportsdb.com/api/v1/json/123/searchteams.php?t=${encodeURIComponent(name)}`;
    let data: any;
    try {
      data = await fetchWithRetry(url, true);
    } catch {
      continue;
    }
    await sleep(THROTTLE_MS);

    const teams = ((data?.teams ?? []) as any[]).filter(
      (t) => t?.strSport === "Soccer" && !/women|ladies/i.test(t?.strTeam ?? "")
    );
    if (!teams.length) continue;

    const national = teams.find((t) => /fifa world cup|international/i.test(t?.strLeague ?? ""));
    const pick = national ?? teams[0];

    // Collect all fanarts and pick the largest by Content-Length (real photos >> badges/flags)
    const candidates = [pick.strFanart1, pick.strFanart2, pick.strFanart3, pick.strFanart4, pick.strBanner]
      .filter(Boolean) as string[];
    if (!candidates.length) continue;

    const sizes = await Promise.all(candidates.map(getContentLength));
    const bestIdx = sizes.indexOf(Math.max(...sizes));
    const img = candidates[bestIdx];
    if (!img) continue;

    return {
      imageUrl: img,
      isCutout: false,
      source: "thesportsdb",
      confident: !!national,
      candidates: teams.length,
      nationalityMatch: !!national,
      note: `team: ${pick.strTeam} (${pick.strLeague})`,
    };
  }
  return null;
}

async function searchSquadPhoto(team: string): Promise<Candidate | null> {
  return (await searchSquadWikipedia(team)) ?? (await searchSquadTSDB(team));
}

// ─── Procesamiento de imagen ──────────────────────────────────────────────────

async function saveFace(buf: Buffer, isCutout: boolean, outPath: string): Promise<void> {
  let img = sharp(buf);
  if (isCutout) img = img.flatten({ background: "#e8e8e8" });
  const out = await img
    .resize(512, 512, { fit: "cover", position: "top" })
    .jpeg({ quality: 80 })
    .toBuffer();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
}

// Fotos de equipo: mantener aspecto (son apaisadas), solo limitar tamaño
async function saveSquad(buf: Buffer, outPath: string): Promise<void> {
  const out = await sharp(buf)
    .resize(1024, 1024, { fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 80 })
    .toBuffer();
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, out);
}

function saveReport(report: Report): void {
  const sorted: Report = Object.fromEntries(
    Object.entries(report).sort(([a], [b]) => a.localeCompare(b))
  );
  fs.writeFileSync(REPORT_PATH, JSON.stringify(sorted, null, 2) + "\n");
}

// ─── Manifest ─────────────────────────────────────────────────────────────────

function regenManifest(): number {
  const manifest: Record<string, number[]> = {};
  if (fs.existsSync(FACES_DIR)) {
    for (const team of fs.readdirSync(FACES_DIR).sort()) {
      const dir = path.join(FACES_DIR, team);
      if (!fs.statSync(dir).isDirectory()) continue;
      const positions = fs
        .readdirSync(dir)
        .map((f) => f.match(/^(\d+)\.jpg$/))
        .filter((m): m is RegExpMatchArray => !!m)
        .map((m) => Number(m[1]))
        .sort((a, b) => a - b);
      if (positions.length) manifest[team] = positions;
    }
  }
  fs.writeFileSync(MANIFEST_PATH, JSON.stringify(manifest, null, 2) + "\n");
  return Object.values(manifest).reduce((acc, p) => acc + p.length, 0);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const force = argv.includes("--force");
  const missingOnly = argv.includes("--missing-only");
  const all = argv.includes("--all");
  const squadsMode = argv.includes("--squads"); // solo fotos de equipo (pos 13)
  const managersMode = argv.includes("--managers"); // fotos de DTs (pos 21)
  const teamArgIdx = argv.indexOf("--team");
  const teamArg = teamArgIdx >= 0 ? argv[teamArgIdx + 1] : null;
  const numsArgIdx = argv.indexOf("--nums");
  const nums = numsArgIdx >= 0
    ? argv[numsArgIdx + 1].split(",").map((n) => parseInt(n.trim(), 10)).filter((n) => !isNaN(n))
    : null;

  const validTeams = Object.keys(TEAMS).filter((t) => t !== "fwc" && t !== "ita");
  let targetTeams: string[];
  if (all || nums) {
    targetTeams = validTeams;
  } else if (teamArg) {
    targetTeams = teamArg.split(",").map((t) => t.trim().toLowerCase());
    const bad = targetTeams.filter((t) => !validTeams.includes(t));
    if (bad.length) {
      console.error(`Equipos desconocidos: ${bad.join(", ")}\nVálidos: ${validTeams.join(", ")}`);
      process.exit(1);
    }
  } else {
    console.error("Uso: npm run faces -- --team <code>[,<code>...] | --all | --nums <n,n,...>  [--squads] [--managers] [--force] [--missing-only]");
    process.exit(1);
  }

  // Jugadores: pos 2-12 y 14-20 · Squads: pos 13 (1=escudo) · Managers: pos 21
  const jobs: Job[] = managersMode
    ? targetTeams
        .filter((t) => TEAM_MANAGERS[t])
        .map((t) => ({
          team: t,
          pos: 21,
          num: 981 + Object.keys(TEAM_MANAGERS).indexOf(t),
          name: TEAM_MANAGERS[t],
        }))
    : Object.values(CATALOG)
        .filter((s) => s.number > 20 && s.number <= 980 && targetTeams.includes(s.team))
        .map((s) => ({
          team: s.team,
          pos: ((s.number - 21) % 20) + 1,
          num: s.number,
          name: s.name,
        }))
        .filter((j) =>
          nums
            ? j.pos !== 1 && nums.includes(j.num) // --nums: jugadores y fotos de equipo
            : squadsMode
              ? j.pos === 13
              : j.pos !== 1 && j.pos !== 13
        )
    .sort((a, b) => a.num - b.num);

  const report: Report = fs.existsSync(REPORT_PATH)
    ? JSON.parse(fs.readFileSync(REPORT_PATH, "utf8"))
    : {};
  const overrides: Overrides = fs.existsSync(OVERRIDES_PATH)
    ? JSON.parse(fs.readFileSync(OVERRIDES_PATH, "utf8"))
    : {};

  console.log(`Equipos: ${targetTeams.length} · ${managersMode ? "DTs" : "jugadores"}: ${jobs.length}\n`);
  let done = 0;

  for (const job of jobs) {
    const key = `${job.team}:${job.pos}`;
    const outPath = path.join(FACES_DIR, job.team, `${job.pos}.jpg`);
    const fileExists = fs.existsSync(outPath);
    const override = overrides[key];
    const prev = report[key];

    // Idempotencia: skip salvo --force/--nums, override nuevo, o --missing-only sobre no-ok
    const mustRedo = force || (nums?.includes(job.num) ?? false);
    const overridePending = override && prev?.source !== "override";
    const retryNonOk = missingOnly && prev && prev.status !== "ok";
    if (!mustRedo && !overridePending && fileExists && !retryNonOk) {
      done++;
      continue;
    }
    if (missingOnly && fileExists && prev?.status === "ok" && !overridePending && !mustRedo) {
      done++;
      continue;
    }

    const label = `[${++done}/${jobs.length}] ${key} ${job.name}`;
    let entry: ReportEntry = {
      name: job.name,
      status: "missing",
      source: null,
      sourceUrl: null,
      candidates: 0,
      nationalityMatch: false,
    };

    try {
      if (override) {
        const buf = (await fetchWithRetry(override.url, false)) as Buffer;
        if (job.pos === 13) await saveSquad(buf, outPath);
        else await saveFace(buf, override.url.endsWith(".png"), outPath);
        entry = { ...entry, status: "ok", source: "override", sourceUrl: override.url, candidates: 1, nationalityMatch: true };
      } else {
        const cand = job.pos === 13
          ? await searchSquadPhoto(job.team)
          : (await searchTheSportsDB(job)) ?? (await searchWikipedia(job));
        if (cand) {
          const buf = (await fetchWithRetry(cand.imageUrl, false)) as Buffer;
          if (job.pos === 13) await saveSquad(buf, outPath);
          else await saveFace(buf, cand.isCutout, outPath);
          entry = {
            ...entry,
            status: cand.confident ? "ok" : "low_confidence",
            source: cand.source,
            sourceUrl: cand.imageUrl,
            candidates: cand.candidates,
            nationalityMatch: cand.nationalityMatch,
            note: cand.note,
          };
        }
      }
    } catch (e) {
      entry.note = `error: ${e instanceof Error ? e.message : String(e)}`;
    }

    report[key] = entry;
    const icon = entry.status === "ok" ? "✓" : entry.status === "low_confidence" ? "~" : "✗";
    console.log(`${icon} ${label}  ${entry.source ?? "sin fuente"}${entry.note ? ` (${entry.note})` : ""}`);
    saveReport(report); // incremental: una corrida cortada no pierde entradas
    await sleep(THROTTLE_MS);
  }

  saveReport(report);
  const totalFaces = regenManifest();

  // Resumen (solo equipos procesados)
  const entries = jobs.map((j) => report[`${j.team}:${j.pos}`]).filter(Boolean);
  const count = (s: string) => entries.filter((e) => e.status === s).length;
  console.log(`\n── Resumen ──────────────────────────────`);
  console.log(`ok:             ${count("ok")}`);
  console.log(`low_confidence: ${count("low_confidence")}`);
  console.log(`missing:        ${count("missing")}`);
  console.log(`manifest:       ${totalFaces} caras en total`);

  const problems = jobs.filter((j) => report[`${j.team}:${j.pos}`]?.status !== "ok");
  if (problems.length) {
    console.log(`\nRevisar (status != ok):`);
    for (const j of problems) {
      const e = report[`${j.team}:${j.pos}`];
      console.log(`  ${j.team}:${j.pos} ${j.name} — ${e?.status}${e?.note ? ` (${e.note})` : ""}`);
    }
    console.log(`\nFix manual: agregar URL en scripts/faces-overrides.json y re-correr con --missing-only`);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
