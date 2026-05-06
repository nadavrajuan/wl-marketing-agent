"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

type StartingPointType =
  | "keyword"
  | "url"
  | "landing_page"
  | "campaign"
  | "partner"
  | "brand"
  | "competitor_url"
  | "question";

interface Template {
  id: string;
  name: string;
  description: string;
  model: string | null;
  is_builtin: boolean;
  has_system_prompt: boolean;
  has_step_prompt: boolean;
}

interface LuckyCandidate {
  type: string;
  value: string;
  [key: string]: unknown;
}

interface PastRun {
  run_id: string;
  status: string;
  created_at: string | null;
  starting_point_type: string;
  starting_point_value: string;
  depth: string;
  iteration_count: number;
  duration_seconds: number | null;
  executive_summary: string;
}

const SP_TYPES: { value: StartingPointType; label: string; placeholder: string; luckyTypes: string[] }[] = [
  { value: "keyword", label: "Keyword", placeholder: "e.g. tirzepatide for weight loss", luckyTypes: ["keyword"] },
  { value: "url", label: "URL", placeholder: "e.g. https://top5weightchoices.com/...", luckyTypes: [] },
  { value: "landing_page", label: "Landing Page (DTI)", placeholder: "e.g. r4", luckyTypes: ["landing_page"] },
  { value: "campaign", label: "Campaign", placeholder: "e.g. Search-generics-[tirzepatide]-en-dt-us", luckyTypes: ["campaign"] },
  { value: "partner", label: "Partner / Affiliate", placeholder: "e.g. Medvi", luckyTypes: ["partner"] },
  { value: "brand", label: "Brand", placeholder: "e.g. Ro, SkinnyRX", luckyTypes: ["partner"] },
  { value: "competitor_url", label: "Competitor URL", placeholder: "e.g. https://forbes.com/...", luckyTypes: [] },
  { value: "question", label: "Research Question", placeholder: "e.g. Why is mobile CVR lower than desktop?", luckyTypes: [] },
];

const DEPTH_BREAKPOINTS = [
  { at: 6,  label: "Quick",    color: "text-gray-300",   time: "~3 min" },
  { at: 14, label: "Standard", color: "text-blue-300",   time: "~8 min" },
  { at: 25, label: "Deep",     color: "text-indigo-300", time: "~15 min" },
  { at: 50, label: "Advanced", color: "text-purple-300", time: "~30 min" },
  { at: 100,label: "Extreme",  color: "text-rose-300",   time: "~60+ min" },
];

function getDepthMeta(n: number) {
  for (let i = DEPTH_BREAKPOINTS.length - 1; i >= 0; i--) {
    if (n >= DEPTH_BREAKPOINTS[i].at) return DEPTH_BREAKPOINTS[i];
  }
  return DEPTH_BREAKPOINTS[0];
}

function getDepthKey(n: number): string {
  if (n <= 8) return "quick";
  if (n <= 16) return "standard";
  if (n <= 30) return "deep";
  if (n <= 60) return "advanced";
  return "extreme";
}

function DiceIcon({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.8"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <rect x="2" y="2" width="20" height="20" rx="3" ry="3" />
      <circle cx="8" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="8" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="12" cy="12" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="8" cy="16" r="1.2" fill="currentColor" stroke="none" />
      <circle cx="16" cy="16" r="1.2" fill="currentColor" stroke="none" />
    </svg>
  );
}

const STATUS_DOT: Record<string, string> = {
  completed: "bg-green-500",
  running:   "bg-blue-400 animate-pulse",
  failed:    "bg-red-500",
  stopped:   "bg-gray-500",
};

function fmtDuration(s: number | null): string {
  if (!s) return "";
  if (s < 60) return `${Math.round(s)}s`;
  return `${Math.round(s / 60)}m`;
}

function fmtDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return d.toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" });
}

export default function ResearchPage() {
  const router = useRouter();
  const [maxIterations, setMaxIterations] = useState(20);
  const [spType, setSpType] = useState<StartingPointType>("keyword");
  const [spValue, setSpValue] = useState("");
  const [isStarting, setIsStarting] = useState(false);
  const [startError, setStartError] = useState("");

  // Dice state
  const [diceLoading, setDiceLoading] = useState(false);
  const [luckyCache, setLuckyCache] = useState<LuckyCandidate[]>([]);
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());

  // Template state
  const [templates, setTemplates] = useState<Template[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("default");
  const [templateOpen, setTemplateOpen] = useState(false);
  const templateRef = useRef<HTMLDivElement>(null);

  // Past runs
  const [pastRuns, setPastRuns] = useState<PastRun[]>([]);

  useEffect(() => {
    fetch("/api/research")
      .then((r) => r.json())
      .then((data) => { if (Array.isArray(data)) setPastRuns(data); })
      .catch(() => {});
  }, []);

  useEffect(() => {
    setUsedIndices(new Set());
  }, [spType]);

  // Load templates when spType changes
  useEffect(() => {
    fetch(`/api/research/templates?type=${spType}`)
      .then((r) => r.json())
      .then((data: Template[]) => {
        if (Array.isArray(data)) {
          setTemplates(data);
          // Auto-select "default" if available, else first
          const hasSelected = data.find((t) => t.id === selectedTemplateId);
          if (!hasSelected) {
            const def = data.find((t) => t.id === "default");
            setSelectedTemplateId(def ? def.id : data[0]?.id ?? "default");
          }
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spType]);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (templateRef.current && !templateRef.current.contains(e.target as Node)) {
        setTemplateOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const currentSPMeta = SP_TYPES.find((s) => s.value === spType)!;
  const hasDice = currentSPMeta.luckyTypes.length > 0;
  const depthMeta = getDepthMeta(maxIterations);

  const rollDice = useCallback(async () => {
    if (diceLoading) return;
    setDiceLoading(true);
    try {
      let candidates = luckyCache;
      if (candidates.length === 0) {
        const res = await fetch("/api/research/lucky");
        const data = await res.json();
        candidates = Array.isArray(data.candidates) ? data.candidates : [];
        setLuckyCache(candidates);
      }
      const matching = candidates.map((c, i) => ({ c, i })).filter(({ c }) => currentSPMeta.luckyTypes.includes(c.type));
      if (matching.length === 0) { setDiceLoading(false); return; }
      const unused = matching.filter(({ i }) => !usedIndices.has(i));
      const pool = unused.length > 0 ? unused : matching;
      const pick = pool[Math.floor(Math.random() * pool.length)];
      setUsedIndices((prev) => new Set([...prev, pick.i]));
      setSpValue(pick.c.value);
    } catch { /* silently fail */ }
    finally { setDiceLoading(false); }
  }, [diceLoading, luckyCache, currentSPMeta.luckyTypes, usedIndices]);

  async function startRun(type: StartingPointType, value: string) {
    setIsStarting(true);
    setStartError("");
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starting_point_type: type,
          starting_point_value: value,
          depth: getDepthKey(maxIterations),
          max_iterations: maxIterations,
          template_id: selectedTemplateId,
        }),
      });
      const data = await res.json();
      if (data.run_id) {
        router.push(`/research/${data.run_id}`);
      } else {
        setStartError(data.error || data.detail || "Failed to start run.");
        setIsStarting(false);
      }
    } catch (e) {
      console.error(e);
      setStartError("Could not reach the agent. Check server logs.");
      setIsStarting(false);
    }
  }

  return (
    <div className="max-w-4xl mx-auto space-y-10">
      {/* Header */}
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white tracking-tight">Research Agent</h1>
          <p className="mt-2 text-gray-400 text-sm max-w-2xl">
            Forensic investigation of paid search data. Start from one asset and let the data direct the inquiry.
          </p>
        </div>
        <button
          onClick={() => router.push("/research/settings")}
          className="shrink-0 text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition-all mt-1 flex items-center gap-1.5"
        >
          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 opacity-70">
            <path fillRule="evenodd" d="M6.5 1a.5.5 0 0 1 .5.5V2h2v-.5a.5.5 0 0 1 1 0V2h1a2 2 0 0 1 2 2v1h.5a.5.5 0 0 1 0 1H14v1h.5a.5.5 0 0 1 0 1H14v1h.5a.5.5 0 0 1 0 1H14v1a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h1v-.5a.5.5 0 0 1 .5-.5zM4 3a1 1 0 0 0-1 1v1h10V4a1 1 0 0 0-1-1H4zm9 3H3v6a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6z"/>
          </svg>
          Edit Prompts
        </button>
      </div>

      {/* Iteration slider */}
      <div>
        <div className="flex items-baseline justify-between mb-4">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Investigation Depth
          </div>
          <div className="flex items-baseline gap-2">
            <span className={`text-2xl font-bold tabular-nums ${depthMeta.color}`}>{maxIterations}</span>
            <span className="text-sm text-gray-400">steps</span>
            <span className={`text-sm font-semibold ${depthMeta.color}`}>· {depthMeta.label}</span>
            <span className="text-xs text-gray-600">{depthMeta.time}</span>
          </div>
        </div>

        <div className="relative">
          <input
            type="range"
            min={3}
            max={100}
            step={1}
            value={maxIterations}
            onChange={(e) => setMaxIterations(Number(e.target.value))}
            className="w-full h-1.5 rounded-full appearance-none cursor-pointer bg-gray-800 accent-indigo-500"
          />
          {/* Breakpoint labels */}
          <div className="flex justify-between mt-2 px-px">
            {DEPTH_BREAKPOINTS.map((bp) => (
              <button
                key={bp.at}
                onClick={() => setMaxIterations(bp.at)}
                className={`text-xs transition-colors ${maxIterations === bp.at ? bp.color + " font-semibold" : "text-gray-600 hover:text-gray-400"}`}
                style={{ minWidth: 0 }}
              >
                {bp.label}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Starting point */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-6 space-y-4">
        <div className="text-sm font-semibold text-gray-300">Choose Your Starting Point</div>

        {/* Type pills */}
        <div className="flex flex-wrap gap-2">
          {SP_TYPES.map((s) => (
            <button
              key={s.value}
              onClick={() => { setSpType(s.value); setSpValue(""); }}
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

        {/* Template selector */}
        {templates.length > 0 && (() => {
          const selectedTemplate = templates.find((t) => t.id === selectedTemplateId) ?? templates[0];
          return (
            <div ref={templateRef} className="relative">
              <div className="flex items-center gap-2">
                <span className="text-xs text-gray-500 shrink-0">Template:</span>
                <button
                  onClick={() => setTemplateOpen((o) => !o)}
                  className="flex items-center gap-2 rounded-lg border border-gray-700 bg-gray-800 hover:border-gray-600 px-3 py-1.5 text-xs text-gray-300 transition-all min-w-0"
                >
                  <span className="font-medium truncate max-w-[180px]">{selectedTemplate?.name ?? "Default"}</span>
                  {selectedTemplate?.model && (
                    <span className="shrink-0 rounded bg-gray-700 px-1.5 py-0.5 text-gray-400 font-mono text-[10px]">
                      {selectedTemplate.model}
                    </span>
                  )}
                  <svg viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3 shrink-0 text-gray-500">
                    <path d="M4 6l4 4 4-4" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                </button>
                <button
                  onClick={() => router.push(`/research/templates/${selectedTemplateId}`)}
                  title="Edit template"
                  className="rounded-md p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="w-3.5 h-3.5">
                    <path d="M11.5 2.5a1.414 1.414 0 0 1 2 2L5 13H3v-2L11.5 2.5z"/>
                  </svg>
                </button>
                <button
                  onClick={() => router.push(`/research/templates/new?type=${spType}`)}
                  title="Create new template"
                  className="rounded-md p-1.5 text-gray-500 hover:text-gray-300 hover:bg-gray-800 transition-all"
                >
                  <svg viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="w-3.5 h-3.5">
                    <path d="M8 3v10M3 8h10"/>
                  </svg>
                </button>
              </div>

              {templateOpen && (
                <div className="absolute left-0 top-full mt-1 z-50 min-w-[280px] rounded-xl border border-gray-700 bg-gray-900 shadow-xl overflow-hidden">
                  {templates.map((t) => (
                    <button
                      key={t.id}
                      onClick={() => { setSelectedTemplateId(t.id); setTemplateOpen(false); }}
                      className={`w-full text-left px-4 py-3 transition-colors border-b border-gray-800 last:border-0 ${
                        t.id === selectedTemplateId
                          ? "bg-indigo-950 text-white"
                          : "hover:bg-gray-800 text-gray-300"
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium">{t.name}</span>
                        {t.model && (
                          <span className="rounded bg-gray-700 px-1.5 py-0.5 text-gray-400 font-mono text-[10px]">{t.model}</span>
                        )}
                        {t.id === selectedTemplateId && (
                          <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 ml-auto text-indigo-400">
                            <path d="M13.5 4L6.5 11 2.5 7" stroke="currentColor" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/>
                          </svg>
                        )}
                      </div>
                      {t.description && (
                        <div className="text-xs text-gray-500 mt-0.5 line-clamp-2">{t.description}</div>
                      )}
                    </button>
                  ))}
                </div>
              )}
            </div>
          );
        })()}

        {/* Input with dice */}
        <div className="relative">
          <input
            type="text"
            value={spValue}
            onChange={(e) => setSpValue(e.target.value)}
            placeholder={currentSPMeta.placeholder}
            className={`w-full rounded-lg bg-gray-800 border border-gray-700 text-white placeholder-gray-500 px-4 py-2.5 text-sm focus:outline-none focus:border-indigo-500 transition-colors ${hasDice ? "pr-11" : ""}`}
            onKeyDown={(e) => { if (e.key === "Enter" && spValue.trim()) startRun(spType, spValue.trim()); }}
          />
          {hasDice && (
            <button
              onClick={rollDice}
              disabled={diceLoading}
              title="Pick a random suggestion"
              className={`absolute right-2 top-1/2 -translate-y-1/2 w-7 h-7 flex items-center justify-center rounded-md transition-all ${
                diceLoading ? "text-indigo-400 cursor-wait" : spValue ? "text-indigo-400 hover:text-indigo-300 hover:bg-indigo-950" : "text-gray-500 hover:text-gray-300 hover:bg-gray-700"
              }`}
            >
              {diceLoading ? (
                <svg className="w-4 h-4 animate-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M12 2v4M12 18v4M4.93 4.93l2.83 2.83M16.24 16.24l2.83 2.83M2 12h4M18 12h4M4.93 19.07l2.83-2.83M16.24 7.76l2.83-2.83" />
                </svg>
              ) : (
                <DiceIcon className="w-4 h-4" />
              )}
            </button>
          )}
        </div>

        <button
          onClick={() => startRun(spType, spValue.trim())}
          disabled={isStarting || !spValue.trim()}
          className="w-full rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold py-3 text-sm transition-all"
        >
          {isStarting ? "Starting…" : `Start ${maxIterations}-step investigation from this ${currentSPMeta.label}`}
        </button>
        {startError && (
          <div className="text-xs text-red-400 text-center mt-1">{startError}</div>
        )}
      </div>

      {/* Past runs */}
      {pastRuns.length > 0 && (
        <div>
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest mb-3">Past Runs</div>
          <div className="space-y-2">
            {pastRuns.map((run) => (
              <Link
                key={run.run_id}
                href={`/research/${run.run_id}`}
                className="flex items-start gap-3 rounded-xl border border-gray-800 bg-gray-900 px-4 py-3 hover:border-gray-600 hover:bg-gray-800/60 transition-all group"
              >
                {/* Status dot */}
                <div className="mt-1.5 shrink-0">
                  <span className={`block w-2 h-2 rounded-full ${STATUS_DOT[run.status] ?? "bg-gray-600"}`} />
                </div>

                {/* Main content */}
                <div className="min-w-0 flex-1">
                  <div className="flex items-baseline gap-2 flex-wrap">
                    <span className="text-sm font-medium text-white truncate max-w-xs">{run.starting_point_value}</span>
                    <span className="text-xs text-gray-500 shrink-0">{run.starting_point_type}</span>
                  </div>
                  {run.executive_summary && (
                    <p className="mt-0.5 text-xs text-gray-400 line-clamp-1">{run.executive_summary}</p>
                  )}
                </div>

                {/* Meta */}
                <div className="shrink-0 text-right text-xs text-gray-500 space-y-0.5">
                  <div>{fmtDate(run.created_at)}</div>
                  <div className="flex items-center gap-1.5 justify-end">
                    <span>{run.iteration_count} steps</span>
                    {run.duration_seconds && <span>· {fmtDuration(run.duration_seconds)}</span>}
                    <span className="capitalize">· {run.depth}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
