"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

type StartingPointType =
  | "keyword"
  | "url"
  | "landing_page"
  | "campaign"
  | "partner"
  | "brand"
  | "competitor_url"
  | "question";

interface LuckyCandidate {
  type: string;
  value: string;
  [key: string]: unknown;
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

export default function ResearchPage() {
  const router = useRouter();
  const [maxIterations, setMaxIterations] = useState(20);
  const [spType, setSpType] = useState<StartingPointType>("keyword");
  const [spValue, setSpValue] = useState("");
  const [isStarting, setIsStarting] = useState(false);

  // Dice state
  const [diceLoading, setDiceLoading] = useState(false);
  const [luckyCache, setLuckyCache] = useState<LuckyCandidate[]>([]);
  const [usedIndices, setUsedIndices] = useState<Set<number>>(new Set());

  useEffect(() => {
    setUsedIndices(new Set());
  }, [spType]);

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
    try {
      const res = await fetch("/api/research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          starting_point_type: type,
          starting_point_value: value,
          depth: getDepthKey(maxIterations),
          max_iterations: maxIterations,
        }),
      });
      const data = await res.json();
      if (data.run_id) router.push(`/research/${data.run_id}`);
    } catch (e) {
      console.error(e);
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
      </div>
    </div>
  );
}
