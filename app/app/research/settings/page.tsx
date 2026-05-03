"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

interface PromptData {
  content: string;
  display_name: string;
  description: string;
}

interface Prompts {
  research_system: PromptData;
  research_step_human: PromptData;
}

const VARIABLES: { name: string; desc: string }[] = [
  { name: "{starting_point_type}", desc: "Type of asset being researched — keyword, url, landing_page, partner, campaign" },
  { name: "{starting_point_value}", desc: "The actual value — e.g. 'tirzepatide' or 'r4'" },
  { name: "{starting_point_reason}", desc: "Why this starting point was chosen" },
  { name: "{current_focus}", desc: "Current research direction (updates as agent pivots)" },
  { name: "{depth}", desc: "Research depth — quick / standard / deep / extreme" },
  { name: "{iteration}", desc: "Current step number" },
  { name: "{max_iterations}", desc: "Total steps available" },
  { name: "{remaining}", desc: "Steps remaining" },
  { name: "{research_plan}", desc: "The research plan created at the start of the run" },
  { name: "{actions_taken}", desc: "Formatted summary of all actions taken so far" },
  { name: "{findings}", desc: "Formatted summary of all findings recorded so far" },
  { name: "{direction_changes}", desc: "Any direction pivots made during the run" },
];

export default function ResearchSettingsPage() {
  const router = useRouter();
  const [prompts, setPrompts] = useState<Prompts | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [activeKey, setActiveKey] = useState<keyof Prompts>("research_system");
  const [editedContent, setEditedContent] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch("/api/research/prompt")
      .then((r) => r.json())
      .then((data: Prompts) => {
        setPrompts(data);
        setEditedContent({
          research_system:     data.research_system.content,
          research_step_human: data.research_step_human.content,
        });
      });
  }, []);

  async function save() {
    setSaving(true);
    setSavedMsg("");
    try {
      await fetch("/api/research/prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editedContent),
      });
      setSavedMsg("Saved. Changes take effect on the next research run.");
    } finally {
      setSaving(false);
    }
  }

  async function reset(key: string) {
    if (!confirm("Reset this prompt to the built-in default?")) return;
    const res = await fetch("/api/research/prompt/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ key }),
    });
    const data = await res.json();
    setEditedContent((prev) => ({ ...prev, [key]: data.content }));
    setSavedMsg("Reset to default.");
  }

  if (!prompts) {
    return (
      <div className="text-sm text-gray-500 py-16 text-center">Loading prompts...</div>
    );
  }

  const KEYS: (keyof Prompts)[] = ["research_system", "research_step_human"];

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <button
            onClick={() => router.push("/research")}
            className="text-gray-500 hover:text-gray-300 text-sm transition-colors"
          >
            ← Research
          </button>
          <div className="text-gray-700">/</div>
          <h1 className="text-lg font-bold text-white">Prompt Settings</h1>
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && (
            <span className="text-xs text-green-400">{savedMsg}</span>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-all"
          >
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Prompt tabs */}
      <div className="flex gap-2">
        {KEYS.map((k) => (
          <button
            key={k}
            onClick={() => setActiveKey(k)}
            className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
              activeKey === k
                ? "bg-indigo-600 text-white"
                : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600"
            }`}
          >
            {prompts[k].display_name}
          </button>
        ))}
      </div>

      {/* Active prompt editor */}
      {KEYS.map((k) => (
        <div key={k} className={k === activeKey ? "" : "hidden"}>
          <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
            <div className="border-b border-gray-800 px-5 py-3 flex items-center justify-between">
              <div>
                <div className="text-sm font-semibold text-white">{prompts[k].display_name}</div>
                <div className="text-xs text-gray-500 mt-0.5">{prompts[k].description}</div>
              </div>
              <button
                onClick={() => reset(k)}
                className="text-xs text-gray-600 hover:text-gray-400 transition-colors"
              >
                Reset to default
              </button>
            </div>
            <textarea
              value={editedContent[k] || ""}
              onChange={(e) =>
                setEditedContent((prev) => ({ ...prev, [k]: e.target.value }))
              }
              rows={24}
              className="w-full bg-gray-950 text-gray-200 text-sm font-mono px-5 py-4 focus:outline-none resize-none leading-relaxed"
              spellCheck={false}
            />
          </div>
        </div>
      ))}

      {/* Variable legend — only shown for step prompt */}
      {activeKey === "research_step_human" && (
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-widest mb-4">
            Available Variables
          </div>
          <div className="space-y-2">
            {VARIABLES.map((v) => (
              <div key={v.name} className="flex gap-3 items-start text-sm">
                <code className="shrink-0 text-indigo-400 font-mono text-xs bg-indigo-950 px-2 py-0.5 rounded">
                  {v.name}
                </code>
                <span className="text-gray-400 text-xs">{v.desc}</span>
              </div>
            ))}
          </div>
          <div className="mt-4 pt-4 border-t border-gray-800 text-xs text-gray-600">
            Use double braces to include literal braces in your prompt: <code className="text-gray-500">{{{{ literal }}</code>
          </div>
        </div>
      )}

      {/* Hint for system prompt */}
      {activeKey === "research_system" && (
        <div className="rounded-xl border border-gray-800 bg-gray-900 p-4 text-xs text-gray-500 space-y-1">
          <div className="font-semibold text-gray-400">What this controls</div>
          <div>
            The system prompt defines the agent&apos;s persona, thinking style, and priorities.
            Changes here affect what it looks for, how it classifies findings, and how specific
            its recommendations are. The step prompt (second tab) controls the per-action instructions.
          </div>
        </div>
      )}
    </div>
  );
}
