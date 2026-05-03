"use client";

import { useState, useEffect, useRef, use } from "react";
import { useRouter } from "next/navigation";

interface ResearchStep {
  step_number: number;
  action_type: string;
  title: string;
  thought: string;
  data_source: string;
  data_result: string;
  finding_type: string;
  finding_content: string;
  confidence: string;
  created_at: string;
}

interface Slide {
  id: string;
  type: string;
  title: string;
  content: string;
  evidence?: string[];
  confidence?: string;
  impact?: string;
  effort?: string;
  metric?: string;
  tags?: string[];
}

interface ResearchRun {
  run_id: string;
  status: string;
  created_at: string;
  starting_point_type: string;
  starting_point_value: string;
  starting_point_reason: string;
  depth: string;
  research_plan: string;
  slides: Slide[];
  findings: object[];
  executive_summary: string;
  iteration_count: number;
  duration_seconds: number | null;
  error_log: string[];
  steps: ResearchStep[];
}

interface LiveStep {
  step_number: number;
  action_type: string;
  title: string;
  thought: string;
}

const CONFIDENCE_COLORS: Record<string, string> = {
  high: "text-green-400 bg-green-950 border-green-800",
  medium: "text-yellow-400 bg-yellow-950 border-yellow-800",
  low: "text-gray-400 bg-gray-800 border-gray-700",
};

const FINDING_COLORS: Record<string, string> = {
  evidence: "border-l-blue-500 bg-blue-950/30",
  hypothesis: "border-l-purple-500 bg-purple-950/30",
  recommendation: "border-l-green-500 bg-green-950/30",
  open_question: "border-l-yellow-500 bg-yellow-950/30",
};

const ACTION_ICONS: Record<string, string> = {
  select_starting_point: "📍",
  build_plan: "📋",
  query_data: "🗃️",
  crawl_url: "🌐",
  record_finding: "📌",
  change_direction: "↩️",
  generate_slides: "🎨",
  finish: "✓",
  error: "⚠️",
};

const SLIDE_TYPE_ICONS: Record<string, string> = {
  executive_summary: "⚡",
  starting_point: "📍",
  why_interesting: "💡",
  research_plan: "📋",
  data_insight: "📊",
  funnel_view: "⬇️",
  hypothesis: "🔬",
  recommendation: "🎯",
  competitor_note: "🛰️",
  open_questions: "❓",
  next_paths: "🗺️",
};

// Markdown-lite: bold, bullet lists, headers
function SimpleMarkdown({ text }: { text: string }) {
  if (!text) return null;
  const lines = text.split("\n");
  return (
    <div className="space-y-1">
      {lines.map((line, i) => {
        if (line.startsWith("## ")) {
          return (
            <div key={i} className="font-semibold text-white mt-3 first:mt-0 text-sm">
              {line.slice(3)}
            </div>
          );
        }
        if (line.startsWith("# ")) {
          return (
            <div key={i} className="font-bold text-white mt-3 first:mt-0">
              {line.slice(2)}
            </div>
          );
        }
        if (line.startsWith("- ") || line.startsWith("• ")) {
          const content = line.slice(2);
          return (
            <div key={i} className="flex gap-2 text-sm text-gray-300">
              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
              <span dangerouslySetInnerHTML={{ __html: boldify(content) }} />
            </div>
          );
        }
        if (line.trim() === "") return <div key={i} className="h-1" />;
        return (
          <p
            key={i}
            className="text-sm text-gray-300 leading-relaxed"
            dangerouslySetInnerHTML={{ __html: boldify(line) }}
          />
        );
      })}
    </div>
  );
}

function boldify(text: string) {
  return text.replace(/\*\*(.+?)\*\*/g, '<strong class="text-white">$1</strong>');
}

export default function ResearchRunPage({ params }: { params: Promise<{ runId: string }> }) {
  const { runId } = use(params);
  const router = useRouter();

  const [run, setRun] = useState<ResearchRun | null>(null);
  const [liveSteps, setLiveSteps] = useState<LiveStep[]>([]);
  const [currentSlide, setCurrentSlide] = useState(0);
  const [viewMode, setViewMode] = useState<"slides" | "trail">("slides");
  const [loading, setLoading] = useState(true);
  const [polling, setPolling] = useState(false);
  const eventSourceRef = useRef<EventSource | null>(null);

  const fetchRun = async () => {
    const res = await fetch(`/api/research/${runId}`);
    if (!res.ok) return;
    const data: ResearchRun = await res.json();
    setRun(data);
    setLoading(false);
    return data;
  };

  useEffect(() => {
    fetchRun().then((data) => {
      if (data?.status === "running") {
        startStream();
        setPolling(true);
      }
    });

    return () => {
      eventSourceRef.current?.close();
    };
    // fetchRun and startStream are stable closures over runId
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [runId]);

  function startStream() {
    if (eventSourceRef.current) return;
    const es = new EventSource(`/api/research/${runId}/stream`);
    eventSourceRef.current = es;

    es.onmessage = (e) => {
      try {
        const payload = JSON.parse(e.data);
        if (payload.event === "step") {
          setLiveSteps((prev) => {
            const exists = prev.find((s) => s.step_number === payload.step.step_number);
            if (exists) return prev;
            return [...prev, payload.step];
          });
        }
        if (payload.event === "done") {
          es.close();
          eventSourceRef.current = null;
          setPolling(false);
          fetchRun();
        }
      } catch (_) { /* ignore malformed SSE frames */ }
    };

    es.onerror = () => {
      es.close();
      eventSourceRef.current = null;
      setPolling(false);
      // Fallback: poll every 3s if SSE fails
      const interval = setInterval(async () => {
        const data = await fetchRun();
        if (data?.status !== "running") clearInterval(interval);
      }, 3000);
    };
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64 text-gray-500 text-sm">
        Loading research run...
      </div>
    );
  }

  if (!run) {
    return (
      <div className="text-center text-gray-500 text-sm py-16">
        Research run not found.{" "}
        <button onClick={() => router.push("/research")} className="text-indigo-400 hover:underline">
          Back
        </button>
      </div>
    );
  }

  const isRunning = run.status === "running";
  const slides = run.slides || [];
  const slide = slides[currentSlide];
  const allSteps = isRunning ? liveSteps : run.steps || [];

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      {/* Top bar */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/research")}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ← Research
          </button>
          <div className="text-gray-700">/</div>
          <div className="text-sm text-gray-300 font-medium">
            <span className="text-gray-500">[{run.starting_point_type}]</span>{" "}
            {run.starting_point_value || "Agent chose"}
          </div>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-600 capitalize">{run.depth}</span>
          {run.duration_seconds && (
            <span className="text-xs text-gray-600">{Math.round(run.duration_seconds)}s</span>
          )}
          {run.iteration_count > 0 && (
            <span className="text-xs text-gray-600">{run.iteration_count} steps</span>
          )}
          <span
            className={`text-xs px-2 py-0.5 rounded-full font-medium ${
              run.status === "completed"
                ? "bg-green-950 text-green-400"
                : run.status === "running"
                ? "bg-yellow-950 text-yellow-400"
                : "bg-red-950 text-red-400"
            }`}
          >
            {run.status}
          </span>
          {!isRunning && (
            <div className="flex rounded-lg border border-gray-800 overflow-hidden text-xs">
              <button
                onClick={() => setViewMode("slides")}
                className={`px-3 py-1.5 transition-colors ${viewMode === "slides" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Slides
              </button>
              <button
                onClick={() => setViewMode("trail")}
                className={`px-3 py-1.5 transition-colors ${viewMode === "trail" ? "bg-indigo-600 text-white" : "text-gray-400 hover:text-white"}`}
              >
                Trail
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Live progress */}
      {isRunning && (
        <div className="rounded-2xl border border-yellow-800/40 bg-yellow-950/20 p-5 space-y-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-yellow-400 animate-pulse" />
            <div className="text-sm font-semibold text-yellow-300">
              Research Agent is investigating...
            </div>
          </div>
          {allSteps.length > 0 && (
            <div className="space-y-1.5 max-h-64 overflow-y-auto">
              {allSteps.map((s) => (
                <div key={s.step_number} className="flex items-start gap-2 text-xs text-gray-400">
                  <span className="shrink-0 mt-0.5 text-base">
                    {ACTION_ICONS[s.action_type] || "○"}
                  </span>
                  <span className="leading-relaxed">{s.title || s.thought || s.action_type}</span>
                </div>
              ))}
              {polling && (
                <div className="flex items-center gap-2 text-xs text-gray-600 animate-pulse">
                  <span>⟳</span>
                  <span>Working...</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Slide viewer */}
      {!isRunning && viewMode === "slides" && slides.length > 0 && (
        <div className="space-y-4">
          {/* Nav */}
          <div className="flex items-center justify-between gap-4">
            <button
              onClick={() => setCurrentSlide((i) => Math.max(0, i - 1))}
              disabled={currentSlide === 0}
              className="text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 disabled:border-gray-900"
            >
              ← Previous
            </button>
            <div className="flex items-center gap-3 text-xs text-gray-500">
              <span>
                Slide {currentSlide + 1} / {slides.length}
              </span>
              <div className="flex gap-1">
                {slides.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCurrentSlide(i)}
                    className={`w-1.5 h-1.5 rounded-full transition-all ${
                      i === currentSlide ? "bg-indigo-500 scale-125" : "bg-gray-700 hover:bg-gray-500"
                    }`}
                  />
                ))}
              </div>
            </div>
            <button
              onClick={() => setCurrentSlide((i) => Math.min(slides.length - 1, i + 1))}
              disabled={currentSlide === slides.length - 1}
              className="text-sm text-gray-400 hover:text-white disabled:opacity-30 disabled:cursor-default transition-colors px-3 py-1.5 rounded-lg border border-gray-800 hover:border-gray-600 disabled:border-gray-900"
            >
              Next →
            </button>
          </div>

          {/* Slide content */}
          {slide && <SlideCard slide={slide} />}

          {/* Slide index */}
          <div className="flex flex-wrap gap-2 pt-2">
            {slides.map((s, i) => (
              <button
                key={s.id}
                onClick={() => setCurrentSlide(i)}
                className={`text-xs px-2 py-1 rounded-lg transition-all ${
                  i === currentSlide
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-900 border border-gray-800 text-gray-500 hover:text-gray-300 hover:border-gray-600"
                }`}
              >
                {SLIDE_TYPE_ICONS[s.type] || "○"} {s.title}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Research trail */}
      {!isRunning && viewMode === "trail" && (
        <div className="space-y-3">
          <div className="text-xs font-semibold text-gray-500 uppercase tracking-widest">
            Research Trail — {run.steps?.length || 0} steps
          </div>
          {(run.steps || []).map((step) => (
            <div
              key={step.step_number}
              className="rounded-xl border border-gray-800 bg-gray-900 p-4 space-y-2"
            >
              <div className="flex items-center gap-2">
                <span className="text-base">{ACTION_ICONS[step.action_type] || "○"}</span>
                <span className="text-xs font-medium text-gray-400 uppercase">
                  {step.action_type?.replace(/_/g, " ")}
                </span>
                <span className="text-gray-700 text-xs">#{step.step_number}</span>
              </div>
              {step.thought && (
                <div className="text-sm text-gray-300 leading-relaxed">{step.thought}</div>
              )}
              {step.data_source && (
                <details className="text-xs text-gray-600 group">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors">
                    Show source
                  </summary>
                  <pre className="mt-2 bg-gray-950 rounded p-3 overflow-x-auto text-gray-400 text-xs leading-relaxed whitespace-pre-wrap">
                    {step.data_source}
                  </pre>
                </details>
              )}
              {step.data_result && (
                <details className="text-xs text-gray-600">
                  <summary className="cursor-pointer text-gray-500 hover:text-gray-300 transition-colors">
                    Show result
                  </summary>
                  <pre className="mt-2 bg-gray-950 rounded p-3 overflow-x-auto text-gray-400 text-xs leading-relaxed whitespace-pre-wrap max-h-64 overflow-y-auto">
                    {step.data_result}
                  </pre>
                </details>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Completed but no slides yet */}
      {!isRunning && slides.length === 0 && run.status === "completed" && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-8 text-center space-y-3">
          <div className="text-gray-500 text-sm">Research completed. No slides were generated.</div>
          {run.executive_summary && (
            <div className="text-gray-300 text-sm max-w-lg mx-auto">{run.executive_summary}</div>
          )}
          {run.error_log && run.error_log.length > 0 && (
            <div className="text-red-400 text-xs">{run.error_log[0]}</div>
          )}
        </div>
      )}
    </div>
  );
}

function SlideCard({ slide }: { slide: Slide }) {
  return (
    <div
      className={`rounded-2xl border p-7 min-h-[320px] transition-all ${
        slide.type === "executive_summary"
          ? "border-indigo-800 bg-gradient-to-br from-indigo-950 via-gray-900 to-gray-900"
          : slide.type === "recommendation"
          ? "border-green-800 bg-gray-900"
          : slide.type === "hypothesis"
          ? "border-purple-800 bg-gray-900"
          : slide.type === "competitor_note"
          ? "border-orange-800 bg-gray-900"
          : "border-gray-800 bg-gray-900"
      }`}
    >
      {/* Slide header */}
      <div className="flex items-start justify-between gap-4 mb-5">
        <div className="flex items-center gap-3">
          <span className="text-2xl">{SLIDE_TYPE_ICONS[slide.type] || "○"}</span>
          <div>
            <div className="text-xs text-gray-500 uppercase tracking-wider">
              {slide.type?.replace(/_/g, " ")}
            </div>
            <h2 className="text-xl font-bold text-white mt-0.5">{slide.title}</h2>
          </div>
        </div>
        <div className="flex flex-col items-end gap-1.5 shrink-0">
          {slide.confidence && (
            <span
              className={`text-xs px-2 py-0.5 rounded-full border font-medium ${
                CONFIDENCE_COLORS[slide.confidence] || CONFIDENCE_COLORS.low
              }`}
            >
              {slide.confidence} confidence
            </span>
          )}
          {slide.impact && (
            <span className="text-xs text-gray-500">{slide.impact} impact</span>
          )}
          {slide.effort && (
            <span className="text-xs text-gray-500">{slide.effort} effort</span>
          )}
        </div>
      </div>

      {/* Main content */}
      <div className="mb-5">
        <SimpleMarkdown text={slide.content} />
      </div>

      {/* Evidence bullets */}
      {slide.evidence && slide.evidence.length > 0 && (
        <div
          className={`rounded-xl border-l-4 p-4 space-y-1.5 ${
            FINDING_COLORS[slide.type] || "border-l-gray-600 bg-gray-800/50"
          }`}
        >
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wider mb-2">
            Evidence
          </div>
          {slide.evidence.map((e, i) => (
            <div key={i} className="flex gap-2 text-sm text-gray-300">
              <span className="text-gray-600 mt-0.5 shrink-0">•</span>
              <span>{e}</span>
            </div>
          ))}
        </div>
      )}

      {/* Metric for recommendations */}
      {slide.metric && (
        <div className="mt-4 text-xs text-gray-500">
          <span className="text-gray-600">Success metric:</span>{" "}
          <span className="text-gray-300">{slide.metric}</span>
        </div>
      )}

      {/* Tags */}
      {slide.tags && slide.tags.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-1.5">
          {slide.tags.map((tag) => (
            <span
              key={tag}
              className="text-xs bg-gray-800 text-gray-500 px-2 py-0.5 rounded-full"
            >
              {tag}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
