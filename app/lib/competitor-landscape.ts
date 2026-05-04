import { createHash } from "crypto";
import { mkdir, writeFile } from "fs/promises";
import path from "path";
import * as cheerio from "cheerio";
import { getPool } from "@/lib/db";

const hasDatabase = Boolean(process.env.DATABASE_URL);
const HISTORY_RETENTION_DAYS = Number(process.env.COMPETITOR_HISTORY_RETENTION_DAYS || "14");
const COMPETITOR_ARCHIVE_DIR = process.env.COMPETITOR_ARCHIVE_DIR || "";

export type CompetitorSource = {
  slug: string;
  name: string;
  url: string;
  is_internal: boolean;
  seed_order: number;
  seeded_partners: string[];
};

export type ExtractedPartner = {
  canonical_name: string;
  display_name: string;
  rank: number;
  score: number | null;
  description: string | null;
  marketing_lines: string[];
  raw_block: string;
};

type ExtractedSnapshot = {
  final_url: string;
  page_title: string | null;
  meta_description: string | null;
  content_hash: string;
  table_hash: string;
  text_excerpt: string;
  partners: ExtractedPartner[];
  raw_html: string;
};

type StructuredProviderCandidate = {
  name: string;
  score: number | null;
  description: string | null;
  marketing_lines: string[];
  raw_block: string;
};

type AlertRecord = {
  id: number;
  source_slug: string;
  source_name: string;
  source_url: string;
  snapshot_date: string;
  alert_type: string;
  severity: string;
  title: string;
  summary: string;
  details: Record<string, unknown>;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
};

type SnapshotRow = {
  id: number;
  source_slug: string;
  snapshot_date: string;
  fetched_at: string;
  http_status: number;
  final_url: string | null;
  page_title: string | null;
  meta_description: string | null;
  content_hash: string | null;
  table_hash: string | null;
  text_excerpt: string | null;
  raw_html: string | null;
  extracted_json: {
    partners?: ExtractedPartner[];
  } | null;
};

const COMPETITOR_SOURCES: CompetitorSource[] = [
  {
    slug: "our-table",
    name: "Our Table",
    url: "https://top5weightchoices.com/tables/top-5-weight-loss-injections/",
    is_internal: true,
    seed_order: 1,
    seeded_partners: ["MedVi", "Eden", "Sprout", "SHED", "MyStart Health", "Hims", "Clinic Secret"],
  },
  {
    slug: "forbes",
    name: "Forbes",
    url: "https://www.forbes.com/health/l/best-weight-loss-medications/",
    is_internal: false,
    seed_order: 2,
    seeded_partners: ["RemedyMeds", "Ro", "Noom", "Hers", "Fridays Health", "MedVi", "Sprout", "Mochi", "WeightWatchers", "Bodybuilding Health +"],
  },
  {
    slug: "top10",
    name: "Top10",
    url: "https://www.top10.com/weight-loss-treatments/weight-loss-injections-comparison",
    is_internal: false,
    seed_order: 3,
    seeded_partners: ["TrimRX", "Ro", "Noom", "MedVi", "Found", "SHED", "Sprout", "Eden", "Fridays", "Hers"],
  },
  {
    slug: "weight-loss-meds",
    name: "Weight Loss Meds",
    url: "https://10bestweightlossmeds.com/glp1/",
    is_internal: false,
    seed_order: 4,
    seeded_partners: ["TrimRX", "Ro", "MedVi", "MochiHealth", "Sprout", "Eden", "Fridays", "Hers", "Hims"],
  },
  {
    slug: "best-weightloss-meds",
    name: "Best Weightloss Meds",
    url: "https://bestweightlossmeds.io/oral_USA_D_ENG.html",
    is_internal: false,
    seed_order: 5,
    seeded_partners: ["Noom", "TrimRX", "Ro", "MedVi", "Mochi Health", "Fridays", "Sprout", "Vivim"],
  },
  {
    slug: "yahoo-health",
    name: "Yahoo Health",
    url: "https://health.yahoo.com/p/best-weight-loss-meds/",
    is_internal: false,
    seed_order: 6,
    seeded_partners: ["Ro", "Weight Watchers", "TrimRX", "Fridays", "GetThin", "Sprout", "Noom", "Remedy Meds", "Hers", "Mochi"],
  },
];

const PARTNER_ALIAS_ENTRIES: Array<[string, string[]]> = [
  ["MedVi", ["medvi", "med vi"]],
  ["Ro", ["ro", "ro.co"]],
  ["Noom", ["noom"]],
  ["Hers", ["hers", "forhers"]],
  ["Hims", ["hims", "forhims"]],
  ["Fridays", ["fridays", "fridays health"]],
  ["RemedyMeds", ["remedymeds", "remedy meds"]],
  ["TrimRX", ["trimrx", "trim rx"]],
  ["WeightWatchers", ["weightwatchers", "weight watchers"]],
  ["Mochi", ["mochi", "mochi health", "mochihealth"]],
  ["Sprout", ["sprout"]],
  ["Eden", ["eden"]],
  ["SHED", ["shed"]],
  ["Found", ["found"]],
  ["Vivim", ["vivim"]],
  ["GetThin", ["getthin", "get thin"]],
  ["MyStart Health", ["mystart health", "my start health"]],
  ["Clinic Secret", ["clinic secret", "clinicsecret"]],
  ["Bodybuilding Health +", ["bodybuilding health +", "bodybuilding health"]],
  ["Future Health", ["futurhealth", "future health"]],
  ["JRNYS", ["jrnys"]],
];

const GENERIC_LINE_DENY_PATTERNS = [
  /\bread more\b/i,
  /\bread less\b/i,
  /\blearn how we score\b/i,
  /\blearn more\b/i,
  /\badvertising disclosure\b/i,
  /\beditorial\b/i,
  /\bdisclosure\b/i,
  /\bupdated\b/i,
  /\blast updated\b/i,
  /\bfaq\b/i,
  /\breviews?\b/i,
  /\babout us\b/i,
  /\bcontact us\b/i,
  /\bprivacy policy\b/i,
  /\bterms\b/i,
  /\bvisit site\b/i,
  /\bshop now\b/i,
  /\bget started\b/i,
  /\bsee details\b/i,
  /\bour most popular\b/i,
  /\bmost popular\b/i,
  /\bclinical researcher\b/i,
  /\blearn\b/i,
  /\bclick here\b/i,
  /\btable of contents\b/i,
  /\bweight loss medications of\b/i,
];

const ALIAS_TO_CANONICAL = new Map<string, string>();
for (const [canonical, aliases] of PARTNER_ALIAS_ENTRIES) {
  for (const alias of aliases) {
    ALIAS_TO_CANONICAL.set(normalizeKey(alias), canonical);
  }
}
for (const source of COMPETITOR_SOURCES) {
  for (const partner of source.seeded_partners) {
    const key = normalizeKey(partner);
    if (!ALIAS_TO_CANONICAL.has(key)) {
      ALIAS_TO_CANONICAL.set(key, partner);
    }
  }
}

let ensurePromise: Promise<void> | null = null;

function normalizeWhitespace(value: string | null | undefined) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalizeKey(value: string | null | undefined) {
  return normalizeWhitespace(value)
    .toLowerCase()
    .replace(/&amp;/g, "&")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function hashText(value: string) {
  return createHash("sha256").update(value).digest("hex");
}

function safeJsonParse<T>(value: unknown, fallback: T): T {
  if (!value) return fallback;
  if (typeof value === "object") return value as T;
  try {
    return JSON.parse(String(value)) as T;
  } catch {
    return fallback;
  }
}

function canonicalizePartnerName(value: string) {
  const normalized = normalizeKey(value);
  if (!normalized) return null;
  if (ALIAS_TO_CANONICAL.has(normalized)) {
    return ALIAS_TO_CANONICAL.get(normalized)!;
  }
  const direct = Array.from(ALIAS_TO_CANONICAL.entries()).find(([alias]) => normalized.includes(alias));
  if (direct) return direct[1];
  return null;
}

function isLikelyGenericLine(value: string) {
  const normalized = normalizeKey(value);
  if (!normalized) return true;
  if (GENERIC_LINE_DENY_PATTERNS.some((pattern) => pattern.test(value))) return true;
  return [
    "visit site",
    "go to",
    "learn more",
    "editorial score",
    "advertiser disclosure",
    "most popular",
    "all rights reserved",
    "weight loss medications",
    "top weight loss",
  ].includes(normalized);
}

function cleanDescription(value: string | null | undefined) {
  const cleaned = normalizeWhitespace(value);
  if (!cleaned) return null;
  if (GENERIC_LINE_DENY_PATTERNS.some((pattern) => pattern.test(cleaned))) return null;
  if (cleaned.length < 12) return null;
  return cleaned;
}

function isKnownPartnerName(value: string) {
  return Boolean(canonicalizePartnerName(value));
}

function finalizePartnerRows(rows: ExtractedPartner[], source: CompetitorSource) {
  const allowedSeeds = new Set(
    [...source.seeded_partners, ...COMPETITOR_SOURCES.flatMap((item) => item.seeded_partners)].map((item) =>
      canonicalizePartnerName(item) || item,
    ),
  );
  const cleaned: ExtractedPartner[] = [];
  const seen = new Set<string>();

  for (const row of rows) {
    const canonical = canonicalizePartnerName(row.display_name) || canonicalizePartnerName(row.canonical_name) || row.canonical_name;
    if (!canonical) continue;
    if (seen.has(canonical)) continue;
    if (GENERIC_LINE_DENY_PATTERNS.some((pattern) => pattern.test(row.display_name))) continue;
    if (!allowedSeeds.has(canonical) && !isKnownPartnerName(row.display_name)) continue;

    const marketingLines = row.marketing_lines
      .map((line) => cleanDescription(line))
      .filter((line): line is string => Boolean(line))
      .slice(0, 3);

    const description = cleanDescription(row.description) || marketingLines[0] || null;

    cleaned.push({
      ...row,
      canonical_name: canonical,
      display_name: canonical,
      description,
      marketing_lines: marketingLines,
    });
    seen.add(canonical);
  }

  return cleaned.slice(0, 10).map((row, index) => ({
    ...row,
    rank: index + 1,
  }));
}

function scoreFromBlock(block: string) {
  const matches = Array.from(block.matchAll(/\b(10\.0|[5-9]\.\d)\b/g)).map((match) => Number(match[1]));
  return matches.length > 0 ? matches[0] : null;
}

function textExcerpt(value: string, limit = 600) {
  const cleaned = normalizeWhitespace(value);
  return cleaned.length > limit ? `${cleaned.slice(0, limit - 1)}…` : cleaned;
}

function extractVisibleLines($: cheerio.CheerioAPI) {
  const lines: string[] = [];
  $("script, style, noscript, svg, path").remove();

  $("body")
    .find("h1, h2, h3, h4, h5, a, p, li, button, strong, span, div")
    .each((_, element) => {
      const text = normalizeWhitespace($(element).text());
      if (!text || text.length < 2) return;
      if (lines[lines.length - 1] === text) return;
      lines.push(text);
    });

  return lines;
}

function looksLikeStructuredProviderArray(items: unknown[]): boolean {
  if (!Array.isArray(items) || items.length === 0) return false;
  return items.some((item) => {
    if (!item || typeof item !== "object") return false;
    const row = item as Record<string, unknown>;
    return typeof row.name === "string" || typeof row.title === "string";
  });
}

function toStructuredProviderCandidate(item: Record<string, unknown>): StructuredProviderCandidate | null {
  const rawName =
    (typeof item.name === "string" && item.name) ||
    (typeof item.title === "string" && item.title) ||
    (typeof item.providerName === "string" && item.providerName) ||
    "";
  const canonicalName = canonicalizePartnerName(rawName);
  if (!canonicalName) return null;

  const rawScore =
    (item.providerRating as { value?: number | string } | undefined)?.value ??
    (typeof item.score === "string" || typeof item.score === "number" ? item.score : null);
  const numericScore = rawScore == null ? null : Number(rawScore);

  const features =
    Array.isArray(item.providerFeatures)
      ? item.providerFeatures
          .map((entry) => (entry && typeof entry === "object" ? (entry as { text?: string }).text : null))
          .filter((entry): entry is string => Boolean(entry))
      : Array.isArray(item.itemBullets)
        ? item.itemBullets
            .map((entry) => (entry && typeof entry === "object" ? (entry as { text?: string }).text : null))
            .filter((entry): entry is string => Boolean(entry))
        : [];

  const cleanedLines = features
    .map((line) => cleanDescription(line))
    .filter((line): line is string => Boolean(line))
    .slice(0, 4);

  return {
    name: canonicalName,
    score: Number.isFinite(numericScore) ? numericScore : null,
    description: cleanedLines[0] || null,
    marketing_lines: cleanedLines,
    raw_block: textExcerpt(JSON.stringify(item), 1200),
  };
}

function collectStructuredProviderArrays(node: unknown, acc: Record<string, unknown>[][] = []) {
  if (!node || typeof node !== "object") return acc;

  if (Array.isArray(node)) {
    if (looksLikeStructuredProviderArray(node)) {
      acc.push(node as Record<string, unknown>[]);
    }
    for (const entry of node) {
      collectStructuredProviderArrays(entry, acc);
    }
    return acc;
  }

  const obj = node as Record<string, unknown>;
  for (const value of Object.values(obj)) {
    collectStructuredProviderArrays(value, acc);
  }
  return acc;
}

function extractJsonScriptContent(html: string, scriptId: string) {
  const match = html.match(new RegExp(`<script[^>]*id=["']${scriptId}["'][^>]*>([\\s\\S]*?)<\\/script>`, "i"));
  return match?.[1] || null;
}

function extractBalancedArray(source: string, startIndex: number) {
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = -1;

  for (let i = startIndex; i < source.length; i += 1) {
    const char = source[i];
    if (start === -1) {
      if (char === "[") {
        start = i;
        depth = 1;
      }
      continue;
    }

    if (escaped) {
      escaped = false;
      continue;
    }
    if (char === "\\") {
      escaped = true;
      continue;
    }
    if (char === "\"") {
      inString = !inString;
      continue;
    }
    if (inString) continue;
    if (char === "[") depth += 1;
    if (char === "]") depth -= 1;
    if (depth === 0) {
      return source.slice(start, i + 1);
    }
  }

  return null;
}

function extractSeperiaProviders(source: CompetitorSource, html: string): ExtractedPartner[] {
  // WordPress Seperia theme stores rankings as custom HTML attributes
  const pattern = /sep-data-attr-position=(\d+)[^>]*?sep-data-attr-partner-name="([^"]+)"[^>]*?sep-data-attr-partner-score="([^"]*)"/g;
  const entries: Array<{ position: number; name: string; score: number | null }> = [];
  const seen = new Set<number>();
  let match: RegExpExecArray | null;

  while ((match = pattern.exec(html)) !== null) {
    const position = parseInt(match[1], 10);
    if (!position || seen.has(position)) continue;
    seen.add(position);
    const scoreNum = parseFloat(match[3]);
    entries.push({ position, name: match[2], score: Number.isFinite(scoreNum) ? scoreNum : null });
  }

  if (entries.length === 0) return [];

  entries.sort((a, b) => a.position - b.position);

  return finalizePartnerRows(
    entries.map((m) => ({
      canonical_name: canonicalizePartnerName(m.name) || m.name,
      display_name: canonicalizePartnerName(m.name) || m.name,
      rank: m.position,
      score: m.score,
      description: null,
      marketing_lines: [],
      raw_block: `${m.name} score:${m.score ?? "—"}`,
    })),
    source,
  );
}

function extractStructuredProvidersFromNextData(source: CompetitorSource, html: string): ExtractedPartner[] {
  const script = extractJsonScriptContent(html, "__NEXT_DATA__");
  if (!script) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(script);
  } catch {
    return [];
  }

  const candidates = collectStructuredProviderArrays(parsed)
    .map((items) => items.map(toStructuredProviderCandidate).filter((row): row is StructuredProviderCandidate => Boolean(row)))
    .filter((items) => items.length > 0);

  if (candidates.length === 0) return [];

  const best = candidates.sort((a, b) => b.length - a.length)[0];
  return finalizePartnerRows(
    best.map((item, index) => ({
      canonical_name: item.name,
      display_name: item.name,
      rank: index + 1,
      score: item.score,
      description: item.description,
      marketing_lines: item.marketing_lines,
      raw_block: item.raw_block,
    })),
    source,
  );
}

function extractStructuredProvidersFromEscapedData(source: CompetitorSource, html: string): ExtractedPartner[] {
  const normalized = html
    .replace(/\\"/g, "\"")
    .replace(/\\u0026/g, "&")
    .replace(/\\u003c/g, "<")
    .replace(/\\u003e/g, ">")
    .replace(/\\n/g, "\n");

  const dataIndex = normalized.indexOf("\"data\":[");
  if (dataIndex === -1) return [];

  const arrayStart = normalized.indexOf("[", dataIndex);
  if (arrayStart === -1) return [];

  const arrayText = extractBalancedArray(normalized, arrayStart);
  if (!arrayText) return [];

  let parsed: unknown;
  try {
    parsed = JSON.parse(arrayText);
  } catch {
    return [];
  }
  if (!Array.isArray(parsed)) return [];

  const structured = parsed
    .map((item) => (item && typeof item === "object" ? toStructuredProviderCandidate(item as Record<string, unknown>) : null))
    .filter((row): row is StructuredProviderCandidate => Boolean(row));

  return finalizePartnerRows(
    structured.map((item, index) => ({
      canonical_name: item.name,
      display_name: item.name,
      rank: index + 1,
      score: item.score,
      description: item.description,
      marketing_lines: item.marketing_lines,
      raw_block: item.raw_block,
    })),
    source,
  );
}

function inferPartnerRowsFromLines(lines: string[], source: CompetitorSource): ExtractedPartner[] {
  const rows: ExtractedPartner[] = [];

  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const chosenCanonical = canonicalizePartnerName(line);
    if (!chosenCanonical) {
      continue;
    }

    const windowLines = lines.slice(i, i + 10);
    const block = normalizeWhitespace(windowLines.join(" | "));
    const marketingLines = windowLines
      .slice(1)
      .filter((value) => !isLikelyGenericLine(value) && !canonicalizePartnerName(value) && value.length > 12)
      .slice(0, 3);

    rows.push({
      canonical_name: chosenCanonical,
      display_name: chosenCanonical,
      rank: rows.length + 1,
      score: scoreFromBlock(block),
      description: marketingLines[0] || null,
      marketing_lines: marketingLines,
      raw_block: textExcerpt(block, 1200),
    });
  }

  return finalizePartnerRows(rows, source);
}

function fallbackSeedRows(source: CompetitorSource): ExtractedPartner[] {
  return source.seeded_partners.map((partner, index) => ({
    canonical_name: partner,
    display_name: partner,
    rank: index + 1,
    score: null,
    description: null,
    marketing_lines: [],
    raw_block: "",
  }));
}

function extractSnapshotFromHtml(source: CompetitorSource, html: string, finalUrl: string): ExtractedSnapshot {
  const $ = cheerio.load(html);
  const lines = extractVisibleLines($);
  const pageTitle = normalizeWhitespace($("title").first().text()) || null;
  const metaDescription =
    normalizeWhitespace($('meta[name="description"]').attr("content")) ||
    normalizeWhitespace($('meta[property="og:description"]').attr("content")) ||
    null;

  let partners = extractSeperiaProviders(source, html);
  if (partners.length === 0) {
    partners = extractStructuredProvidersFromNextData(source, html);
  }
  if (partners.length === 0) {
    partners = extractStructuredProvidersFromEscapedData(source, html);
  }
  if (partners.length === 0) {
    partners = inferPartnerRowsFromLines(lines, source);
  }
  if (partners.length === 0) {
    partners = fallbackSeedRows(source);
  }
  partners = finalizePartnerRows(partners, source);

  const contentBasis = normalizeWhitespace(lines.join("\n"));
  const tableBasis = JSON.stringify(
    partners.map((row) => ({
      partner: row.canonical_name,
      rank: row.rank,
      score: row.score,
      description: row.description,
      marketing_lines: row.marketing_lines,
    })),
  );

  return {
    final_url: finalUrl,
    page_title: pageTitle,
    meta_description: metaDescription,
    content_hash: hashText(contentBasis),
    table_hash: hashText(tableBasis),
    text_excerpt: textExcerpt(contentBasis),
    partners,
    raw_html: html,
  };
}

async function ensureTables() {
  if (!hasDatabase) return;
  if (!ensurePromise) {
    ensurePromise = (async () => {
      const pool = getPool();
      await pool.query(`
        CREATE TABLE IF NOT EXISTS competitor_landscape_sources (
          slug TEXT PRIMARY KEY,
          name TEXT NOT NULL,
          url TEXT NOT NULL,
          is_internal BOOLEAN NOT NULL DEFAULT FALSE,
          seed_order INTEGER NOT NULL,
          active BOOLEAN NOT NULL DEFAULT TRUE,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS competitor_landscape_snapshots (
          id BIGSERIAL PRIMARY KEY,
          source_slug TEXT NOT NULL REFERENCES competitor_landscape_sources(slug) ON DELETE CASCADE,
          snapshot_date DATE NOT NULL,
          fetched_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          http_status INTEGER NOT NULL,
          final_url TEXT,
          page_title TEXT,
          meta_description TEXT,
          content_hash TEXT,
          table_hash TEXT,
          text_excerpt TEXT,
          raw_html TEXT,
          extracted_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
          UNIQUE(source_slug, snapshot_date)
        );
      `);
      await pool.query(`
        CREATE TABLE IF NOT EXISTS competitor_landscape_alerts (
          id BIGSERIAL PRIMARY KEY,
          source_slug TEXT NOT NULL REFERENCES competitor_landscape_sources(slug) ON DELETE CASCADE,
          snapshot_date DATE NOT NULL,
          alert_type TEXT NOT NULL,
          severity TEXT NOT NULL,
          title TEXT NOT NULL,
          summary TEXT NOT NULL,
          details_json JSONB NOT NULL DEFAULT '{}'::jsonb,
          dedupe_key TEXT NOT NULL UNIQUE,
          is_read BOOLEAN NOT NULL DEFAULT FALSE,
          read_at TIMESTAMPTZ,
          read_by TEXT,
          created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
        );
      `);

      for (const source of COMPETITOR_SOURCES) {
        await pool.query(
          `
            INSERT INTO competitor_landscape_sources (slug, name, url, is_internal, seed_order)
            VALUES ($1, $2, $3, $4, $5)
            ON CONFLICT (slug)
            DO UPDATE SET
              name = EXCLUDED.name,
              url = EXCLUDED.url,
              is_internal = EXCLUDED.is_internal,
              seed_order = EXCLUDED.seed_order,
              updated_at = NOW()
          `,
          [source.slug, source.name, source.url, source.is_internal, source.seed_order],
        );
      }
    })();
  }
  await ensurePromise;
}

async function archiveSnapshotIfNeeded(source: CompetitorSource, snapshotDate: string, snapshot: ExtractedSnapshot) {
  if (!COMPETITOR_ARCHIVE_DIR) return;
  const dir = path.join(COMPETITOR_ARCHIVE_DIR, snapshotDate, source.slug);
  await mkdir(dir, { recursive: true });
  await writeFile(path.join(dir, "page.html"), snapshot.raw_html, "utf8");
  await writeFile(
    path.join(dir, "parsed.json"),
    JSON.stringify(
      {
        source,
        snapshot_date: snapshotDate,
        title: snapshot.page_title,
        meta_description: snapshot.meta_description,
        partners: snapshot.partners,
        content_hash: snapshot.content_hash,
        table_hash: snapshot.table_hash,
      },
      null,
      2,
    ),
    "utf8",
  );
}

async function fetchSourceHtml(source: CompetitorSource) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(source.url, {
      signal: controller.signal,
      headers: {
        "user-agent":
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/135.0.0.0 Safari/537.36",
        accept: "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
        "accept-language": "en-US,en;q=0.9",
        "cache-control": "no-cache",
      },
      redirect: "follow",
    });
    const html = await response.text();
    return {
      status: response.status,
      finalUrl: response.url || source.url,
      html,
    };
  } finally {
    clearTimeout(timeout);
  }
}

function diffPartners(previous: ExtractedPartner[], current: ExtractedPartner[]) {
  const alerts: Array<{
    type: string;
    severity: string;
    title: string;
    summary: string;
    details: Record<string, unknown>;
  }> = [];

  const previousMap = new Map(previous.map((row) => [row.canonical_name, row]));
  const currentMap = new Map(current.map((row) => [row.canonical_name, row]));

  for (const row of current) {
    if (!previousMap.has(row.canonical_name)) {
      alerts.push({
        type: "partner_added",
        severity: row.rank <= 3 ? "high" : "medium",
        title: `${row.display_name} entered the landscape`,
        summary: `${row.display_name} is new in the latest crawl at rank ${row.rank}.`,
        details: { after: row },
      });
    }
  }

  for (const row of previous) {
    if (!currentMap.has(row.canonical_name)) {
      alerts.push({
        type: "partner_removed",
        severity: row.rank <= 3 ? "high" : "medium",
        title: `${row.display_name} dropped out`,
        summary: `${row.display_name} was present before at rank ${row.rank} and is now missing.`,
        details: { before: row },
      });
    }
  }

  for (const currentRow of current) {
    const previousRow = previousMap.get(currentRow.canonical_name);
    if (!previousRow) continue;

    if (previousRow.rank !== currentRow.rank) {
      alerts.push({
        type: "partner_rank_changed",
        severity: currentRow.rank <= 3 || previousRow.rank <= 3 ? "high" : "medium",
        title: `${currentRow.display_name} changed position`,
        summary: `${currentRow.display_name} moved from rank ${previousRow.rank} to rank ${currentRow.rank}.`,
        details: { before: previousRow, after: currentRow },
      });
    }

    if ((previousRow.score ?? null) !== (currentRow.score ?? null)) {
      alerts.push({
        type: "score_changed",
        severity: "medium",
        title: `${currentRow.display_name} score changed`,
        summary: `${currentRow.display_name} score moved from ${previousRow.score ?? "—"} to ${currentRow.score ?? "—"}.`,
        details: { before: previousRow, after: currentRow },
      });
    }

    const previousDescription = normalizeWhitespace(previousRow.description);
    const currentDescription = normalizeWhitespace(currentRow.description);
    if (previousDescription !== currentDescription) {
      alerts.push({
        type: "description_changed",
        severity: "medium",
        title: `${currentRow.display_name} description changed`,
        summary: `${currentRow.display_name} has updated copy in its listing.`,
        details: {
          before: previousRow,
          after: currentRow,
          before_text: previousDescription,
          after_text: currentDescription,
        },
      });
    }

    const previousLines = previousRow.marketing_lines.join(" | ");
    const currentLines = currentRow.marketing_lines.join(" | ");
    if (normalizeWhitespace(previousLines) !== normalizeWhitespace(currentLines)) {
      alerts.push({
        type: "marketing_lines_changed",
        severity: "low",
        title: `${currentRow.display_name} marketing lines changed`,
        summary: `${currentRow.display_name} updated one or more support bullets or selling points.`,
        details: { before: previousRow, after: currentRow },
      });
    }
  }

  return alerts;
}

function diffSnapshot(previous: ExtractedSnapshot | null, current: ExtractedSnapshot) {
  const alerts: Array<{
    type: string;
    severity: string;
    title: string;
    summary: string;
    details: Record<string, unknown>;
  }> = [];

  if (!previous) {
    alerts.push({
      type: "initial_snapshot",
      severity: "low",
      title: "Initial snapshot stored",
      summary: "The first competitor snapshot was captured for this source.",
      details: {
        after: {
          title: current.page_title,
          meta_description: current.meta_description,
          partners: current.partners,
        },
      },
    });
    return alerts;
  }

  if (normalizeWhitespace(previous.page_title) !== normalizeWhitespace(current.page_title)) {
    alerts.push({
      type: "title_changed",
      severity: "medium",
      title: "Page title changed",
      summary: "The page title changed on this competitor landing page.",
      details: { before: previous.page_title, after: current.page_title },
    });
  }

  if (normalizeWhitespace(previous.meta_description) !== normalizeWhitespace(current.meta_description)) {
    alerts.push({
      type: "meta_description_changed",
      severity: "medium",
      title: "Meta description changed",
      summary: "The page description changed on this competitor landing page.",
      details: { before: previous.meta_description, after: current.meta_description },
    });
  }

  alerts.push(...diffPartners(previous.partners, current.partners));

  if (previous.content_hash !== current.content_hash && alerts.length === 0) {
    alerts.push({
      type: "page_content_changed",
      severity: "low",
      title: "Page content changed",
      summary: "The page HTML changed, even though no structured partner changes were detected yet.",
      details: {
        before_excerpt: previous.text_excerpt,
        after_excerpt: current.text_excerpt,
      },
    });
  }

  return alerts;
}

async function getLatestPreviousSnapshot(sourceSlug: string, snapshotDate: string) {
  const pool = getPool();
  const result = await pool.query<SnapshotRow>(
    `
      SELECT
        id,
        source_slug,
        snapshot_date::text AS snapshot_date,
        fetched_at::text AS fetched_at,
        http_status,
        final_url,
        page_title,
        meta_description,
        content_hash,
        table_hash,
        text_excerpt,
        raw_html,
        extracted_json
      FROM competitor_landscape_snapshots
      WHERE source_slug = $1 AND snapshot_date < $2::date
      ORDER BY snapshot_date DESC
      LIMIT 1
    `,
    [sourceSlug, snapshotDate],
  );
  return result.rows[0] || null;
}

function rowToExtractedSnapshot(row: SnapshotRow | null): ExtractedSnapshot | null {
  if (!row) return null;
  const extracted = safeJsonParse<{ partners?: ExtractedPartner[] }>(row.extracted_json, {});
  return {
    final_url: row.final_url || "",
    page_title: row.page_title,
    meta_description: row.meta_description,
    content_hash: row.content_hash || "",
    table_hash: row.table_hash || "",
    text_excerpt: row.text_excerpt || "",
    partners: Array.isArray(extracted.partners) ? extracted.partners : [],
    raw_html: row.raw_html || "",
  };
}

async function upsertSnapshotAndAlerts(
  source: CompetitorSource,
  snapshotDate: string,
  httpStatus: number,
  snapshot: ExtractedSnapshot,
) {
  const pool = getPool();
  const previousRow = await getLatestPreviousSnapshot(source.slug, snapshotDate);
  const previous = rowToExtractedSnapshot(previousRow);
  const alerts = diffSnapshot(previous, snapshot);

  await pool.query(
    `
      INSERT INTO competitor_landscape_snapshots (
        source_slug,
        snapshot_date,
        fetched_at,
        http_status,
        final_url,
        page_title,
        meta_description,
        content_hash,
        table_hash,
        text_excerpt,
        raw_html,
        extracted_json
      )
      VALUES ($1, $2::date, NOW(), $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb)
      ON CONFLICT (source_slug, snapshot_date)
      DO UPDATE SET
        fetched_at = NOW(),
        http_status = EXCLUDED.http_status,
        final_url = EXCLUDED.final_url,
        page_title = EXCLUDED.page_title,
        meta_description = EXCLUDED.meta_description,
        content_hash = EXCLUDED.content_hash,
        table_hash = EXCLUDED.table_hash,
        text_excerpt = EXCLUDED.text_excerpt,
        raw_html = EXCLUDED.raw_html,
        extracted_json = EXCLUDED.extracted_json
    `,
    [
      source.slug,
      snapshotDate,
      httpStatus,
      snapshot.final_url,
      snapshot.page_title,
      snapshot.meta_description,
      snapshot.content_hash,
      snapshot.table_hash,
      snapshot.text_excerpt,
      snapshot.raw_html,
      JSON.stringify({ partners: snapshot.partners }),
    ],
  );

  for (const alert of alerts) {
    const dedupeKey = hashText(
      `${source.slug}|${snapshotDate}|${alert.type}|${alert.summary}|${JSON.stringify(alert.details)}`,
    );
    await pool.query(
      `
        INSERT INTO competitor_landscape_alerts (
          source_slug,
          snapshot_date,
          alert_type,
          severity,
          title,
          summary,
          details_json,
          dedupe_key
        )
        VALUES ($1, $2::date, $3, $4, $5, $6, $7::jsonb, $8)
        ON CONFLICT (dedupe_key) DO NOTHING
      `,
      [
        source.slug,
        snapshotDate,
        alert.type,
        alert.severity,
        alert.title,
        alert.summary,
        JSON.stringify(alert.details),
        dedupeKey,
      ],
    );
  }
}

async function pruneOldSnapshots() {
  if (!hasDatabase) return;
  const pool = getPool();
  await pool.query(
    `
      DELETE FROM competitor_landscape_snapshots
      WHERE snapshot_date < CURRENT_DATE - ($1::int * INTERVAL '1 day')
    `,
    [HISTORY_RETENTION_DAYS],
  );
}

export async function syncCompetitorLandscape() {
  if (!hasDatabase) {
    throw new Error("Competitor monitoring requires DATABASE_URL.");
  }

  await ensureTables();
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const results: Array<Record<string, unknown>> = [];

  for (const source of COMPETITOR_SOURCES) {
    try {
      const response = await fetchSourceHtml(source);
      const extracted = extractSnapshotFromHtml(source, response.html, response.finalUrl);
      await archiveSnapshotIfNeeded(source, snapshotDate, extracted);
      await upsertSnapshotAndAlerts(source, snapshotDate, response.status, extracted);
      results.push({
        source: source.name,
        status: response.status,
        partners_found: extracted.partners.length,
        changed: true,
      });
    } catch (error) {
      results.push({
        source: source.name,
        status: "error",
        error: error instanceof Error ? error.message : "Unknown sync failure",
      });
    }
  }

  await pruneOldSnapshots();

  return {
    snapshot_date: snapshotDate,
    retention_days: HISTORY_RETENTION_DAYS,
    sources: results,
  };
}

export async function markCompetitorAlertsRead(input: { ids?: number[]; mark_all?: boolean; read_by?: string | null }) {
  if (!hasDatabase) {
    throw new Error("Competitor monitoring requires DATABASE_URL.");
  }
  await ensureTables();

  const pool = getPool();
  if (input.mark_all) {
    await pool.query(
      `
        UPDATE competitor_landscape_alerts
        SET is_read = TRUE, read_at = NOW(), read_by = COALESCE($1, read_by)
        WHERE is_read = FALSE
      `,
      [input.read_by || null],
    );
    return;
  }

  if (!input.ids?.length) return;

  await pool.query(
    `
      UPDATE competitor_landscape_alerts
      SET is_read = TRUE, read_at = NOW(), read_by = COALESCE($2, read_by)
      WHERE id = ANY($1::bigint[])
    `,
    [input.ids, input.read_by || null],
  );
}

async function getAlerts(limit = 100, unreadOnly = false) {
  if (!hasDatabase) return [] as AlertRecord[];
  await ensureTables();

  const result = await getPool().query<
    AlertRecord & {
      source_name: string;
      source_url: string;
      details_json: unknown;
    }
  >(
    `
      SELECT
        a.id,
        a.source_slug,
        s.name AS source_name,
        s.url AS source_url,
        a.snapshot_date::text AS snapshot_date,
        a.alert_type,
        a.severity,
        a.title,
        a.summary,
        a.details_json,
        a.is_read,
        a.read_at::text AS read_at,
        a.created_at::text AS created_at
      FROM competitor_landscape_alerts a
      JOIN competitor_landscape_sources s
        ON s.slug = a.source_slug
      ${unreadOnly ? "WHERE a.is_read = FALSE" : ""}
      ORDER BY a.is_read ASC, a.snapshot_date DESC, a.id DESC
      LIMIT $1
    `,
    [limit],
  );

  return result.rows.map((row) => ({
    id: row.id,
    source_slug: row.source_slug,
    source_name: row.source_name,
    source_url: row.source_url,
    snapshot_date: row.snapshot_date,
    alert_type: row.alert_type,
    severity: row.severity,
    title: row.title,
    summary: row.summary,
    details: safeJsonParse<Record<string, unknown>>(row.details_json, {}),
    is_read: row.is_read,
    read_at: row.read_at,
    created_at: row.created_at,
  }));
}

async function getLatestSnapshots() {
  if (!hasDatabase) return [] as SnapshotRow[];
  await ensureTables();
  const result = await getPool().query<SnapshotRow>(
    `
      SELECT DISTINCT ON (s.slug)
        cs.id,
        s.slug AS source_slug,
        cs.snapshot_date::text AS snapshot_date,
        cs.fetched_at::text AS fetched_at,
        cs.http_status,
        cs.final_url,
        cs.page_title,
        cs.meta_description,
        cs.content_hash,
        cs.table_hash,
        cs.text_excerpt,
        cs.raw_html,
        cs.extracted_json
      FROM competitor_landscape_sources s
      LEFT JOIN competitor_landscape_snapshots cs
        ON cs.source_slug = s.slug
      ORDER BY s.slug, cs.snapshot_date DESC NULLS LAST
    `,
  );
  return result.rows;
}

export async function getCompetitorLandscapeData() {
  if (!hasDatabase) {
    const matrixRows = Array.from({ length: 10 }, (_, index) => ({
      rank: index + 1,
      values: Object.fromEntries(
        COMPETITOR_SOURCES.map((source) => [source.slug, source.seeded_partners[index] || null]),
      ),
    }));
    return {
      summary: {
        source_count: COMPETITOR_SOURCES.length,
        unread_alert_count: 0,
        changed_today_count: 0,
        retention_days: HISTORY_RETENTION_DAYS,
      },
      sources: COMPETITOR_SOURCES.map((source) => ({
        ...source,
        snapshot_date: null,
        fetched_at: null,
        page_title: null,
        meta_description: null,
        top_partners: source.seeded_partners.slice(0, 5),
        has_live_snapshot: false,
      })),
      matrix: matrixRows,
      alerts: [],
    };
  }

  await ensureTables();
  const [snapshots, alerts] = await Promise.all([getLatestSnapshots(), getAlerts(60, false)]);
  const unreadAlertCount = alerts.filter((alert) => !alert.is_read).length;
  const today = new Date().toISOString().slice(0, 10);
  const changedTodayCount = new Set(alerts.filter((alert) => alert.snapshot_date === today).map((alert) => alert.source_slug)).size;

  const snapshotMap = new Map(
    snapshots.map((row) => [
      row.source_slug,
      {
        snapshot_date: row.snapshot_date,
        fetched_at: row.fetched_at,
        page_title: row.page_title,
        meta_description: row.meta_description,
        partners: safeJsonParse<{ partners?: ExtractedPartner[] }>(row.extracted_json, {}).partners || [],
      },
    ]),
  );

  const sources = COMPETITOR_SOURCES.map((source) => {
    const snapshot = snapshotMap.get(source.slug);
    return {
      ...source,
      snapshot_date: snapshot?.snapshot_date || null,
      fetched_at: snapshot?.fetched_at || null,
      page_title: snapshot?.page_title || null,
      meta_description: snapshot?.meta_description || null,
      top_partners:
        snapshot?.partners?.slice(0, 5).map((partner) => partner.display_name) || source.seeded_partners.slice(0, 5),
      has_live_snapshot: Boolean(snapshot),
    };
  });

  const maxRank = Math.max(
    10,
    ...sources.map((source) => {
      const snapshot = snapshotMap.get(source.slug);
      return snapshot?.partners?.length || source.seeded_partners.length;
    }),
  );

  const matrix = Array.from({ length: maxRank }, (_, index) => {
    const values: Record<string, { partner: string | null; score: number | null; description: string | null }> = {};
    for (const source of COMPETITOR_SOURCES) {
      const snapshot = snapshotMap.get(source.slug);
      const partner = snapshot?.partners?.[index];
      const seeded = source.seeded_partners[index] || null;
      values[source.slug] = {
        partner: partner?.display_name || seeded,
        score: partner?.score ?? null,
        description: partner?.description ?? null,
      };
    }
    return { rank: index + 1, values };
  });

  return {
    summary: {
      source_count: COMPETITOR_SOURCES.length,
      unread_alert_count: unreadAlertCount,
      changed_today_count: changedTodayCount,
      retention_days: HISTORY_RETENTION_DAYS,
    },
    sources,
    matrix,
    alerts,
  };
}

export function getCompetitorLandscapeSources() {
  return COMPETITOR_SOURCES;
}
