"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

type StartingPointType =
  | "lucky"
  | "keyword"
  | "url"
  | "landing_page"
  | "campaign"
  | "partner"
  | "brand"
  | "competitor_url"
  | "question";

type Depth = "quick" | "standard" | "deep" | "extreme";

interface ResearchRunSummary {
  run_id: string;
  status: string;
  created_at: string;
  starting_point_type: string;
  starting_point_value: string;
  depth: string;
  iteration_count: number;
  duration_seconds: number | null;
  executive_summary: string;
}

const DEPTH_OPTIONS: { value: Depth; label: string; desc: string; time: string }[] = [
  { value: "quick", label: "Quick Scan", desc: "3–4 key threads, fast POV", time: "~2 min" },
  { value: "standard", label: "Standard", desc: "Full funnel, key findings, test ideas", time: "~5 min" },
  { value: "deep", label: "Deep Dive", desc: "Multiple threads, competitor comparisons", time: "~10 min" },
  { value: "extreme", label: "Extreme", desc: "Full rabbit-hole, broad market view", time: "~20 min" },
];

const SP_TYPES: { value: StartingPointType; label: string; placeholder: string }[] = [
  { value: "keyword", label: "Keyword", placeholder: "e.g. tirzepatide for weight loss" },
  { value: "url", label: "URL", placeholder: "e.g. https://top5weightchoices.com/..." },
  { value: "landing_page", label: "Landing Page (DTI)", placeholder: "e.g. r4" },
  { value: "campaign", label: "Campaign", placeholder: "e.g. Search-generics-[tirzepatide]-en-dt-us" },
  { value: "partner", label: "Partner / Affiliate", placeholder: "e.g. Medvi" },
  { value: "brand", label: "Brand", placeholder: "e.g. Ro, SkinnyRX" },
  { value: "competitor_url", label: "Competitor URL", placeholder: "e.g. https://forbes.com/..." },
  { value: "question", label: "Research Question", placeholder: "e.g. Why is mobile CVR lower than desktop?" },
];

const STATUS_COLORS: Record<string, string> = {
  running: "text-yellow-400",
  completed: "text-green-400",
  failed: "text-red-400",
  stopped: "text-gray-400",
};

const STATUS_ICONS: Record<string, string> = {
  running: "⟳",
  completed: "✓",
  failed: "✕",
  stopped: "◼",
};

export default function ResearchPage() {
  const router = useRouter();
  const [depth, setDepth] = useState<Depth>("standard");
  const [spType, setSpType] = useState<StartingPointType>("keyword");
  const [spValue, setSpValue] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [runs, setRuns] = useState<ResearchRunSummary[]>([]);
  const [loadingRuns, setLoadingRuns] = useState(true);

  useEffect(() => {
    fetch("/api/research")
      .then((r) => r.json())
      .then((data) => {
        setRuns(Array.isArray(data) ? data : []);
        setLoadingRuns(false);
      })
      .catch(() => setLoadingRuns(false));
  }, []);

  async function startRun(type: StartingPointType, value: string) {
    setIsStarting(true);
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starting_point_type: type,
          starting_point_value: value,
          depth,
        }),
      });
      const data = await res.json();
      if (data.run_id) {
        router.push(`/research/${data.run_id}`);
      }
    } catch (e) {
      console.error(e);
      setIsStarting(false);
    }
  }

  const currentSPType = SP_TYPES.find((s) => s.value === spType);

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Research Agent</h1>
          <p className="mt-2 text-gray-400 text-sm max-w-2xl">
            Start from one marketing asset — keyword, landing page, partner, or URL — and follow the
            full user journey. The agent investigates outward, surfaces hypotheses, and returns a
            visual research story with testable ideas.
          </p>
        </div>
        <button
          onClick={() => router.push("/research/settings")}
          className="shrink-0 text-xs text-gray-600 hover:text-gray-400 border border-gray-800 hover:border-gray-600 rounded-lg px-3 py-1.5 transition-all mt-1"
        >
          ⚙ Prompts
        </button>
      </div>

      {/* Depth selector */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Research Depth
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {DEPTH_OPTIONS.map((d) => (
            <button
              key={d.value}
              onClick={() => setDepth(d.value)}
              className={`rounded-xl border p-3 text-left transition-all ${
                depth === d.value
                  ? "border-indigo-500 bg-indigo-950 text-white"
                  : "border-gray-700 bg-gray-900 text-gray-400 hover:border-gray-600 hover:text-gray-200"
              }`}
            >
              <div className="text-sm font-semibold">{d.label}</div>
              <div className="text-xs mt-0.5 opacity-70">{d.desc}</div>
              <div className="text-xs mt-1 text-gray-500">{d.time}</div>
            </button>
          ))}
        </div>
      </div>

      {/* I Feel Lucky */}
      <div className="rounded-2xl border border-orange-800 bg-gradient-to-br from-orange-950 via-amber-950 to-gray-900 p-6">
        <div className="flex items-start gap-4">
          <div className="text-3xl">🎲</div>
          <div className="flex-1">
            <div className="text-lg font-bold text-white">I Feel Lucky</div>
            <div className="text-sm text-orange-300 mt-1">
              Let the agent choose something interesting. It won&apos;t just pick the biggest loser —
              it looks for surprising, volatile, strategic, or ambiguous assets worth investigating.
            </div>
          </div>
        </div>
        <button
          onClick={() => startRun("lucky", "")}
          disabled={isStarting}
          className="mt-4 w-full rounded-xl bg-orange-500 hover:bg-orange-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 text-sm transition-all"
        >
          {isStarting ? "Starting research…" : "Start Research (Agent Chooses)"}
        </button>
      </div>

      {/* Manual starting point */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <div className="text-sm font-semibold text-gray-300">Choose Your Starting Point</div>

        {/* Type pills */}
        <div className="flex flex-wrap gap-2">
          {SP_TYPES.map((s) => (
            <button
              key={s.value}
              onClick={() => {
                setSpType(s.value);
                setSpValue("");
              }}
              className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                spType === s.value
                  ? "bg-indigo-600 text-white"
                  : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
              }`}
            >
              {s.label}
            </button>
          ))}
        </div>

        {/* Value input */}
        <input
          type="text"
          value={spValue}
          onChange={(e) => setSpValue(e.target.value)}
          placeholder={currentSPType?.placeholder || "Enter value..."}
          className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500"
          onKeyDown={(e) => {
            if (e.key === "Enter" && spValue.trim()) startRun(spType, spValue.trim());
          }}
        />

        <button
          onClick={() => startRun(spType, spValue.trim())}
          disabled={isStarting || !spValue.trim()}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 text-sm transition-all"
        >
          {isStarting ? "Starting research…" : `Start Research from this ${currentSPType?.label}`}
        </button>
      </div>

      {/* Previous runs */}
      <div>
        <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">
          Previous Research Runs
        </div>
        {loadingRuns ? (
          <div className="text-sm text-gray-500">Loading...</div>
        ) : runs.length === 0 ? (
          <div className="text-sm text-gray-600 border border-dashed border-gray-800 rounded-xl p-6 text-center">
            No research runs yet. Start your first investigation above.
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((r) => (
              <button
                key={r.run_id}
                onClick={() => router.push(`/research/${r.run_id}`)}
                className="w-full text-left rounded-xl border border-gray-800 bg-gray-900 hover:border-gray-600 hover:bg-gray-850 transition-all p-4 group"
              >
                <div className="flex items-center justify-between gap-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <span className={`text-sm ${STATUS_COLORS[r.status] || "text-gray-400"}`}>
                      {STATUS_ICONS[r.status] || "•"}
                    </span>
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-white truncate">
                        <span className="text-gray-500 font-normal">
                          [{r.starting_point_type}]
                        </span>{" "}
                        {r.starting_point_value || "(agent chose)"}
                      </div>
                      {r.executive_summary && (
                        <div className="text-xs text-gray-500 mt-0.5 truncate">
                          {r.executive_summary}
                        </div>
                      )}
                    </div>
                  </div>
                  <div className="shrink-0 flex items-center gap-3 text-xs text-gray-600">
                    <span className="capitalize">{r.depth}</span>
                    {r.duration_seconds && (
                      <span>{Math.round(r.duration_seconds)}s</span>
                    )}
                    <span>
                      {new Date(r.created_at).toLocaleDateString("en-US", {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </span>
                    <span className="text-gray-700 group-hover:text-gray-400 transition-colors">→</span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
