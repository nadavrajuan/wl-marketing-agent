"use client";

import { useEffect, useMemo, useState } from "react";
import StatCard from "./StatCard";

type Feedback = {
  verdict: "good" | "ok" | "bad";
  note: string | null;
  updated_at: string;
};

type RecommendationCard = {
  id: string;
  area: "google_assets" | "bing_assets" | "keywords" | "budgets" | "landing_pages" | "partners" | "search_terms";
  depth: "deep" | "light";
  platform: string;
  priority: "high" | "medium";
  action_type: "pause" | "rewrite" | "scale" | "shift_budget" | "tighten_targeting" | "review_lp" | "review_partner_mix";
  title: string;
  summary: string;
  problem: string;
  why_now: string;
  metrics: Array<{ label: string; value: string }>;
  evidence: string[];
  actions: string[];
  competitor_moves: string[];
  copy_snippets: string[];
  feedback: Feedback | null;
};

type RecommendationResponse = {
  summary: {
    deep_count: number;
    light_count: number;
    google_asset_count: number;
    bing_asset_count: number;
    feedback_enabled: boolean;
  };
  deep_recommendations: RecommendationCard[];
  light_recommendations: RecommendationCard[];
};

type DraftState = Record<
  string,
  {
    verdict: "good" | "ok" | "bad" | "";
    note: string;
    saving?: boolean;
    error?: string | null;
  }
>;

function badgeClass(value: string) {
  if (value === "high") return "bg-rose-950 text-rose-300 border border-rose-800";
  if (value === "google") return "bg-emerald-950 text-emerald-300 border border-emerald-800";
  if (value === "bing") return "bg-blue-950 text-blue-300 border border-blue-800";
  if (value === "deep") return "bg-indigo-950 text-indigo-200 border border-indigo-800";
  return "bg-gray-900 text-gray-300 border border-gray-800";
}

function verdictButtonClass(active: boolean, verdict: "good" | "ok" | "bad") {
  if (!active) {
    return "border border-gray-700 bg-gray-900 text-gray-300 hover:border-gray-500";
  }
  if (verdict === "good") return "border border-emerald-700 bg-emerald-950 text-emerald-200";
  if (verdict === "ok") return "border border-amber-700 bg-amber-950 text-amber-200";
  return "border border-rose-700 bg-rose-950 text-rose-200";
}

export default function RecommendationsContent() {
  const [data, setData] = useState<RecommendationResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [areaFilter, setAreaFilter] = useState("");
  const [drafts, setDrafts] = useState<DraftState>({});

  useEffect(() => {
    fetch("/api/recommendations")
      .then(async (response) => {
        if (!response.ok) {
          const text = await response.text();
          throw new Error(text || `Request failed with status ${response.status}`);
        }
        return response.json();
      })
      .then((payload: RecommendationResponse) => {
        setData(payload);
        const nextDrafts: DraftState = {};
        for (const card of [...payload.deep_recommendations, ...payload.light_recommendations]) {
          nextDrafts[card.id] = {
            verdict: card.feedback?.verdict || "",
            note: card.feedback?.note || "",
            error: null,
          };
        }
        setDrafts(nextDrafts);
        setLoading(false);
      })
      .catch((err) => {
        setError(err instanceof Error ? err.message : "Failed to load recommendations.");
        setLoading(false);
      });
  }, []);

  const filtered = useMemo(() => {
    if (!data) return { deep: [], light: [] };

    const matches = (card: RecommendationCard) => {
      const haystack = [
        card.title,
        card.summary,
        card.problem,
        card.platform,
        card.area,
        card.actions.join(" "),
        card.evidence.join(" "),
      ]
        .join(" ")
        .toLowerCase();

      const searchOk = !search || haystack.includes(search.toLowerCase());
      const areaOk = !areaFilter || card.area === areaFilter;
      return searchOk && areaOk;
    };

    return {
      deep: data.deep_recommendations.filter(matches),
      light: data.light_recommendations.filter(matches),
    };
  }, [areaFilter, data, search]);

  function updateDraft(id: string, patch: Partial<DraftState[string]>) {
    setDrafts((current) => {
      const existing = current[id];
      return {
        ...current,
        [id]: {
          ...existing,
          verdict: patch.verdict ?? existing?.verdict ?? "",
          note: patch.note ?? existing?.note ?? "",
          error: patch.error ?? existing?.error ?? null,
          saving: patch.saving ?? existing?.saving ?? false,
        },
      };
    });
  }

  async function saveFeedback(card: RecommendationCard) {
    const draft = drafts[card.id];
    if (!draft?.verdict) {
      updateDraft(card.id, { error: "Choose Good, OK, or Bad before saving." });
      return;
    }

    updateDraft(card.id, { saving: true, error: null });

    try {
      const response = await fetch("/api/recommendation-feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          recommendation_id: card.id,
          verdict: draft.verdict,
          note: draft.note,
          area: card.area,
          title: card.title,
        }),
      });

      const payload = await response.json();
      if (!response.ok) {
        throw new Error(payload?.error || "Failed to save feedback.");
      }

      setData((current) =>
        current
          ? {
              ...current,
              deep_recommendations: current.deep_recommendations.map((item) =>
                item.id === card.id
                  ? {
                      ...item,
                      feedback: {
                        verdict: payload.verdict,
                        note: payload.note,
                        updated_at: payload.updated_at,
                      },
                    }
                  : item,
              ),
              light_recommendations: current.light_recommendations.map((item) =>
                item.id === card.id
                  ? {
                      ...item,
                      feedback: {
                        verdict: payload.verdict,
                        note: payload.note,
                        updated_at: payload.updated_at,
                      },
                    }
                  : item,
              ),
            }
          : current,
      );

      updateDraft(card.id, { saving: false, error: null });
    } catch (err) {
      updateDraft(card.id, {
        saving: false,
        error: err instanceof Error ? err.message : "Failed to save feedback.",
      });
    }
  }

  if (loading) {
    return <div className="mt-10 text-center text-gray-400">Loading recommendations...</div>;
  }

  if (error) {
    return (
      <div className="mt-10 rounded-xl border border-rose-800 bg-rose-950/30 px-5 py-4 text-sm text-rose-200">
        Recommendations failed to load: {error}
      </div>
    );
  }

  if (!data) {
    return null;
  }

  const allAreas = [
    { value: "", label: "All areas" },
    { value: "google_assets", label: "Google Assets" },
    { value: "bing_assets", label: "Bing Assets" },
    { value: "keywords", label: "Keywords" },
    { value: "budgets", label: "Budgets" },
    { value: "landing_pages", label: "Landing Pages" },
    { value: "partners", label: "Partners" },
    { value: "search_terms", label: "Search Terms" },
  ];

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Recommendations</h1>
        <p className="mt-1 text-sm text-gray-400">
          Deep card-by-card recommendations first, then lighter backlog recommendations. Feedback here can become the learning signal for the agent.
        </p>
      </div>

      <div className="mb-6 grid grid-cols-2 gap-4 md:grid-cols-4">
        <StatCard label="Deep Cards" value={data.summary.deep_count} sub="highest-priority breakdowns" color="purple" />
        <StatCard label="Light Cards" value={data.summary.light_count} sub="broader recommendation backlog" color="blue" />
        <StatCard label="Google Asset Cards" value={data.summary.google_asset_count} sub="native RSA diagnostics" color="green" />
        <StatCard label="Bing Asset Cards" value={data.summary.bing_asset_count} sub="native Bing copy diagnostics" color="orange" />
      </div>

      <div className="mb-6 rounded-xl border border-gray-800 bg-gray-900 p-4">
        <div className="mb-3 text-sm font-medium text-gray-300">Filter Recommendations</div>
        <div className="flex flex-wrap gap-3">
          <input
            className="w-72 rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
            placeholder="Search title, summary, evidence..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
          <select
            className="rounded-lg border border-gray-700 bg-gray-800 px-3 py-2 text-sm text-white"
            value={areaFilter}
            onChange={(event) => setAreaFilter(event.target.value)}
          >
            {allAreas.map((option) => (
              <option key={option.value || "all"} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <div className="self-center text-xs text-gray-500">
            Feedback storage: {data.summary.feedback_enabled ? "enabled" : "disabled until DATABASE_URL is configured"}
          </div>
        </div>
      </div>

      <section className="mb-8">
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Deep Recommendations</h2>
            <p className="text-sm text-gray-500">The first 20 are meant to be specific enough to act on now.</p>
          </div>
          <div className="text-xs text-gray-500">{filtered.deep.length} shown</div>
        </div>

        <div className="space-y-5">
          {filtered.deep.map((card) => {
            const draft = drafts[card.id] || { verdict: "", note: "", error: null };
            return (
              <article key={card.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
                <div className="mb-4 flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <div className="mb-2 flex flex-wrap gap-2">
                      <span className={`rounded-full px-2.5 py-1 text-xs ${badgeClass(card.platform)}`}>{card.platform}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${badgeClass(card.priority)}`}>{card.priority}</span>
                      <span className={`rounded-full px-2.5 py-1 text-xs ${badgeClass(card.depth)}`}>{card.area.replaceAll("_", " ")}</span>
                    </div>
                    <h3 className="text-lg font-semibold text-white">{card.title}</h3>
                    <p className="mt-1 text-sm text-gray-300">{card.summary}</p>
                  </div>
                  <div className="rounded-xl border border-gray-800 bg-gray-950 px-3 py-2 text-right">
                    <div className="text-xs uppercase tracking-wide text-gray-500">Action</div>
                    <div className="text-sm font-medium text-white">{card.action_type.replaceAll("_", " ")}</div>
                  </div>
                </div>

                <div className="mb-4 grid gap-4 lg:grid-cols-[1.25fr_1fr]">
                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                    <div className="mb-1 text-xs uppercase tracking-wide text-gray-500">Problem</div>
                    <div className="text-sm text-gray-200">{card.problem}</div>
                    <div className="mt-4 mb-1 text-xs uppercase tracking-wide text-gray-500">Why Now</div>
                    <div className="text-sm text-gray-300">{card.why_now}</div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {card.metrics.map((metric) => (
                      <div key={`${card.id}-${metric.label}`} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                        <div className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</div>
                        <div className="mt-1 text-base font-semibold text-white">{metric.value}</div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="grid gap-4 xl:grid-cols-4">
                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                    <div className="mb-2 text-sm font-medium text-gray-300">Evidence</div>
                    <div className="space-y-2 text-sm text-gray-300">
                      {card.evidence.map((item) => (
                        <div key={item} className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                    <div className="mb-2 text-sm font-medium text-gray-300">Recommended Actions</div>
                    <div className="space-y-2 text-sm text-emerald-100">
                      {card.actions.map((item) => (
                        <div key={item} className="rounded-lg border border-emerald-900/50 bg-emerald-950/20 px-3 py-2">
                          {item}
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                    <div className="mb-2 text-sm font-medium text-gray-300">Competitor Check</div>
                    <div className="space-y-2 text-sm text-amber-100">
                      {card.competitor_moves.length > 0 ? (
                        card.competitor_moves.map((item) => (
                          <div key={item} className="rounded-lg border border-amber-900/50 bg-amber-950/20 px-3 py-2">
                            {item}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-gray-400">
                          No competitor cue was attached to this card yet.
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="rounded-xl border border-gray-800 bg-gray-950 p-4">
                    <div className="mb-2 text-sm font-medium text-gray-300">Copy / Context</div>
                    <div className="space-y-2 text-sm text-cyan-100">
                      {card.copy_snippets.length > 0 ? (
                        card.copy_snippets.map((item) => (
                          <div key={item} className="rounded-lg border border-cyan-900/40 bg-cyan-950/20 px-3 py-2">
                            {item}
                          </div>
                        ))
                      ) : (
                        <div className="rounded-lg border border-gray-800 bg-gray-900 px-3 py-2 text-gray-400">
                          No raw copy snippet was attached to this card.
                        </div>
                      )}
                    </div>
                  </div>
                </div>

                <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                    <div>
                      <div className="text-sm font-medium text-gray-300">Your Feedback</div>
                      <div className="text-xs text-gray-500">
                        Mark whether this recommendation is useful and leave context so we can tune future suggestions.
                      </div>
                    </div>
                    {card.feedback && (
                      <div className="text-xs text-gray-500">
                        Last saved: {new Date(card.feedback.updated_at).toLocaleString()}
                      </div>
                    )}
                  </div>

                  <div className="mb-3 flex flex-wrap gap-2">
                    {(["good", "ok", "bad"] as const).map((verdict) => (
                      <button
                        key={`${card.id}-${verdict}`}
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${verdictButtonClass(draft.verdict === verdict, verdict)}`}
                        onClick={() => updateDraft(card.id, { verdict })}
                      >
                        {verdict === "good" ? "Good" : verdict === "ok" ? "OK" : "Bad"}
                      </button>
                    ))}
                  </div>

                  <textarea
                    className="min-h-24 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Why is this recommendation good, only partly useful, or wrong?"
                    value={draft.note}
                    onChange={(event) => updateDraft(card.id, { note: event.target.value })}
                  />

                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-rose-300">{draft.error || ""}</div>
                    <button
                      type="button"
                      disabled={!data.summary.feedback_enabled || Boolean(draft.saving)}
                      onClick={() => saveFeedback(card)}
                      className="rounded-lg border border-indigo-700 bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                    >
                      {draft.saving ? "Saving..." : "Save Feedback"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>

      <section>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-lg font-semibold text-white">Lighter Backlog</h2>
            <p className="text-sm text-gray-500">Still useful, just not expanded into full deep-dive cards.</p>
          </div>
          <div className="text-xs text-gray-500">{filtered.light.length} shown</div>
        </div>

        <div className="grid gap-4 xl:grid-cols-2">
          {filtered.light.map((card) => {
            const draft = drafts[card.id] || { verdict: "", note: "", error: null };
            return (
              <article key={card.id} className="rounded-2xl border border-gray-800 bg-gray-900 p-4">
                <div className="mb-3 flex flex-wrap gap-2">
                  <span className={`rounded-full px-2.5 py-1 text-xs ${badgeClass(card.platform)}`}>{card.platform}</span>
                  <span className={`rounded-full px-2.5 py-1 text-xs ${badgeClass(card.depth)}`}>{card.area.replaceAll("_", " ")}</span>
                </div>
                <h3 className="text-base font-semibold text-white">{card.title}</h3>
                <p className="mt-1 text-sm text-gray-300">{card.summary}</p>
                <div className="mt-3 grid grid-cols-2 gap-3">
                  {card.metrics.map((metric) => (
                    <div key={`${card.id}-${metric.label}`} className="rounded-xl border border-gray-800 bg-gray-950 p-3">
                      <div className="text-xs uppercase tracking-wide text-gray-500">{metric.label}</div>
                      <div className="mt-1 text-sm font-semibold text-white">{metric.value}</div>
                    </div>
                  ))}
                </div>
                <div className="mt-3 space-y-2">
                  {card.actions.map((item) => (
                    <div key={item} className="rounded-lg border border-gray-800 bg-gray-950 px-3 py-2 text-sm text-gray-200">
                      {item}
                    </div>
                  ))}
                </div>

                <div className="mt-4 rounded-xl border border-gray-800 bg-gray-950 p-4">
                  <div className="mb-3 text-sm font-medium text-gray-300">Feedback</div>
                  <div className="mb-3 flex flex-wrap gap-2">
                    {(["good", "ok", "bad"] as const).map((verdict) => (
                      <button
                        key={`${card.id}-${verdict}`}
                        type="button"
                        className={`rounded-lg px-3 py-1.5 text-sm transition-colors ${verdictButtonClass(draft.verdict === verdict, verdict)}`}
                        onClick={() => updateDraft(card.id, { verdict })}
                      >
                        {verdict === "good" ? "Good" : verdict === "ok" ? "OK" : "Bad"}
                      </button>
                    ))}
                  </div>
                  <textarea
                    className="min-h-20 w-full rounded-lg border border-gray-700 bg-gray-900 px-3 py-2 text-sm text-white focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    placeholder="Optional note about this recommendation..."
                    value={draft.note}
                    onChange={(event) => updateDraft(card.id, { note: event.target.value })}
                  />
                  <div className="mt-3 flex items-center justify-between gap-3">
                    <div className="text-xs text-rose-300">{draft.error || ""}</div>
                    <button
                      type="button"
                      disabled={!data.summary.feedback_enabled || Boolean(draft.saving)}
                      onClick={() => saveFeedback(card)}
                      className="rounded-lg border border-indigo-700 bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:cursor-not-allowed disabled:border-gray-700 disabled:bg-gray-800 disabled:text-gray-500"
                    >
                      {draft.saving ? "Saving..." : "Save Feedback"}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      </section>
    </div>
  );
}
