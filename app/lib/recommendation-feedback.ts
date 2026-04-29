import { getPool } from "@/lib/db";

export type RecommendationVerdict = "good" | "ok" | "bad";

type FeedbackRecord = {
  recommendation_id: string;
  verdict: RecommendationVerdict;
  note: string | null;
  area: string | null;
  title: string | null;
  updated_at: string;
};

const hasDatabase = Boolean(process.env.DATABASE_URL);
let ensurePromise: Promise<void> | null = null;

async function ensureTable() {
  if (!hasDatabase) {
    return;
  }

  if (!ensurePromise) {
    ensurePromise = getPool().query(`
      CREATE TABLE IF NOT EXISTS recommendation_feedback (
        recommendation_id TEXT PRIMARY KEY,
        verdict TEXT NOT NULL CHECK (verdict IN ('good', 'ok', 'bad')),
        note TEXT,
        area TEXT,
        title TEXT,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
    `).then(() => undefined);
  }

  await ensurePromise;
}

export async function getRecommendationFeedbackMap(ids: string[]) {
  if (!hasDatabase || ids.length === 0) {
    return new Map<string, FeedbackRecord>();
  }

  await ensureTable();
  const result = await getPool().query<FeedbackRecord>(
    `
      SELECT recommendation_id, verdict, note, area, title, updated_at::text AS updated_at
      FROM recommendation_feedback
      WHERE recommendation_id = ANY($1::text[])
    `,
    [ids],
  );

  return new Map(result.rows.map((row) => [row.recommendation_id, row]));
}

export async function upsertRecommendationFeedback(input: {
  recommendation_id: string;
  verdict: RecommendationVerdict;
  note?: string | null;
  area?: string | null;
  title?: string | null;
}) {
  if (!hasDatabase) {
    throw new Error("Feedback storage is not configured because DATABASE_URL is missing.");
  }

  await ensureTable();
  const result = await getPool().query<FeedbackRecord>(
    `
      INSERT INTO recommendation_feedback (
        recommendation_id,
        verdict,
        note,
        area,
        title
      )
      VALUES ($1, $2, $3, $4, $5)
      ON CONFLICT (recommendation_id)
      DO UPDATE SET
        verdict = EXCLUDED.verdict,
        note = EXCLUDED.note,
        area = EXCLUDED.area,
        title = EXCLUDED.title,
        updated_at = NOW()
      RETURNING recommendation_id, verdict, note, area, title, updated_at::text AS updated_at
    `,
    [
      input.recommendation_id,
      input.verdict,
      input.note || null,
      input.area || null,
      input.title || null,
    ],
  );

  return result.rows[0];
}

export function isRecommendationFeedbackEnabled() {
  return hasDatabase;
}
