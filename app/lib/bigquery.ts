import { BigQuery } from "@google-cloud/bigquery";

let client: BigQuery | null = null;

function getProjectId() {
  return process.env.BIGQUERY_PROJECT_ID || "weightagent";
}

function getCredentials() {
  const rawJson = process.env.BIGQUERY_SERVICE_ACCOUNT_JSON;
  if (!rawJson) {
    return undefined;
  }

  return JSON.parse(rawJson) as Record<string, unknown>;
}

export function getBigQueryClient() {
  if (!client) {
    client = new BigQuery({
      projectId: getProjectId(),
      credentials: getCredentials(),
      keyFilename: process.env.GOOGLE_APPLICATION_CREDENTIALS || undefined,
    });
  }

  return client;
}

function normalizeBigQueryValue(value: unknown): unknown {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (Array.isArray(value)) {
    return value.map(normalizeBigQueryValue);
  }

  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if ("value" in record && Object.keys(record).length === 1) {
      return normalizeBigQueryValue(record.value);
    }

    return Object.fromEntries(
      Object.entries(record).map(([key, entryValue]) => [key, normalizeBigQueryValue(entryValue)]),
    );
  }

  return value;
}

export async function runBigQuery<T = Record<string, unknown>>(
  query: string,
  params: Record<string, unknown> = {},
) {
  const [rows] = await getBigQueryClient().query({
    query,
    params,
    useLegacySql: false,
  });

  return rows.map((row) => normalizeBigQueryValue(row)) as T[];
}
