"use client";

import { useState, useEffect } from "react";
import { useRouter, useParams, useSearchParams } from "next/navigation";

const SP_TYPE_OPTIONS = [
  { value: "any", label: "Any" },
  { value: "keyword", label: "Keyword" },
  { value: "url", label: "URL" },
  { value: "landing_page", label: "Landing Page" },
  { value: "campaign", label: "Campaign" },
  { value: "partner", label: "Partner / Affiliate" },
  { value: "brand", label: "Brand" },
  { value: "competitor_url", label: "Competitor URL" },
  { value: "question", label: "Research Question" },
];

const MODEL_SUGGESTIONS: { id: string; label: string; note: string }[] = [
  { id: "o4-mini",          label: "o4-mini",          note: "reasoning" },
  { id: "o4.5",             label: "o4.5",             note: "reasoning" },
  { id: "o3",               label: "o3",               note: "reasoning" },
  { id: "o3-mini",          label: "o3-mini",          note: "reasoning" },
  { id: "gpt-4.5-preview",  label: "gpt-4.5-preview",  note: "" },
  { id: "gpt-4.5",          label: "gpt-4.5",          note: "" },
  { id: "gpt-4o",           label: "gpt-4o",           note: "" },
  { id: "gpt-4o-mini",      label: "gpt-4o-mini",      note: "" },
];

const VARIABLES: { name: string; desc: string }[] = [
  { name: "{starting_point_type}", desc: "Type of asset being researched" },
  { name: "{starting_point_value}", desc: "The actual value — e.g. 'tirzepatide' or 'r4'" },
  { name: "{starting_point_reason}", desc: "Why this starting point was chosen" },
  { name: "{current_focus}", desc: "Current research direction (updates as agent pivots)" },
  { name: "{depth}", desc: "Research depth — quick / standard / deep / extreme" },
  { name: "{iteration}", desc: "Current step number" },
  { name: "{max_iterations}", desc: "Total steps available" },
  { name: "{remaining}", desc: "Steps remaining" },
  { name: "{actions_taken}", desc: "Formatted summary of all actions taken so far" },
  { name: "{findings}", desc: "Formatted summary of all findings recorded so far" },
  { name: "{direction_changes}", desc: "Any direction pivots made during the run" },
];

interface TemplateData {
  id: string;
  name: string;
  description: string;
  starting_point_types: string[];
  model: string | null;
  is_builtin: boolean;
  has_system_prompt: boolean;
  has_step_prompt: boolean;
  system_prompt: string | null;
  step_prompt: string | null;
}

export default function TemplateEditorPage() {
  const router = useRouter();
  const params = useParams<{ templateId: string }>();
  const searchParams = useSearchParams();
  const templateId = params.templateId;
  const isNew = templateId === "new";

  const [loading, setLoading] = useState(!isNew);
  const [saving, setSaving] = useState(false);
  const [savedMsg, setSavedMsg] = useState("");
  const [error, setError] = useState("");
  const [showModelDropdown, setShowModelDropdown] = useState(false);

  // Form state
  const [name, setName] = useState("New Template");
  const [description, setDescription] = useState("");
  const [spTypes, setSpTypes] = useState<string[]>(["any"]);
  const [model, setModel] = useState("");
  const [systemPrompt, setSystemPrompt] = useState("");
  const [stepPrompt, setStepPrompt] = useState("");
  const [isBuiltin, setIsBuiltin] = useState(false);
  const [activeTab, setActiveTab] = useState<"system" | "step">("system");

  useEffect(() => {
    if (isNew) {
      const typeParam = searchParams.get("type");
      if (typeParam && typeParam !== "any") {
        setSpTypes([typeParam]);
      }
      setLoading(false);
      return;
    }

    // Load existing template by fetching all and finding by id
    fetch("/api/research/templates")
      .then((r) => r.json())
      .then((data: TemplateData[]) => {
        const tpl = data.find((t) => t.id === templateId);
        if (!tpl) {
          setError("Template not found.");
          return;
        }
        setName(tpl.name);
        setDescription(tpl.description || "");
        setSpTypes(tpl.starting_point_types || ["any"]);
        setModel(tpl.model || "");
        setSystemPrompt(tpl.system_prompt || "");
        setStepPrompt(tpl.step_prompt || "");
        setIsBuiltin(tpl.is_builtin);
      })
      .catch(() => setError("Failed to load template."))
      .finally(() => setLoading(false));
  }, [templateId, isNew, searchParams]);

  function toggleSpType(val: string) {
    if (val === "any") {
      setSpTypes(["any"]);
      return;
    }
    setSpTypes((prev) => {
      const without = prev.filter((t) => t !== "any");
      if (without.includes(val)) {
        const next = without.filter((t) => t !== val);
        return next.length === 0 ? ["any"] : next;
      }
      return [...without, val];
    });
  }

  async function save() {
    setSaving(true);
    setSavedMsg("");
    setError("");
    const payload = {
      name,
      description,
      starting_point_types: spTypes,
      model: model.trim() || null,
      system_prompt: systemPrompt.trim() || null,
      step_prompt: stepPrompt.trim() || null,
    };

    try {
      if (isNew) {
        const res = await fetch("/api/research/templates", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const data = await res.json();
        if (data.id) {
          router.replace(`/research/templates/${data.id}`);
          setSavedMsg("Template created.");
        } else {
          setError("Failed to create template.");
        }
      } else {
        const res = await fetch(`/api/research/templates/${templateId}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        await res.json();
        setSavedMsg("Saved.");
      }
    } catch {
      setError("Save failed.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteOrReset() {
    if (isBuiltin) {
      if (!confirm("Reset this built-in template to its default values?")) return;
    } else {
      if (!confirm("Delete this template? This cannot be undone.")) return;
    }
    try {
      const res = await fetch(`/api/research/templates/${templateId}`, { method: "DELETE" });
      const data = await res.json();
      if (data.reset) {
        // Reload
        window.location.reload();
      } else {
        router.push("/research");
      }
    } catch {
      setError("Operation failed.");
    }
  }

  if (loading) {
    return <div className="text-sm text-gray-500 py-16 text-center">Loading...</div>;
  }

  if (error && !isNew) {
    return <div className="text-sm text-red-400 py-16 text-center">{error}</div>;
  }

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
          <h1 className="text-lg font-bold text-white">
            {isNew ? "New Template" : name}
          </h1>
          {isBuiltin && (
            <span className="rounded bg-gray-800 border border-gray-700 px-2 py-0.5 text-xs text-gray-500">
              built-in
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          {savedMsg && <span className="text-xs text-green-400">{savedMsg}</span>}
          {error && <span className="text-xs text-red-400">{error}</span>}
          {!isNew && (
            <button
              onClick={deleteOrReset}
              className="rounded-lg border border-gray-700 hover:border-red-800 text-gray-500 hover:text-red-400 text-sm px-3 py-2 transition-all"
            >
              {isBuiltin ? "Reset to default" : "Delete"}
            </button>
          )}
          <button
            onClick={save}
            disabled={saving}
            className="rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-sm font-medium px-4 py-2 transition-all"
          >
            {saving ? "Saving…" : isNew ? "Create Template" : "Save Changes"}
          </button>
        </div>
      </div>

      {/* Basic info */}
      <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Name</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors"
            />
          </div>
          <div className="relative">
            <label className="block text-xs font-semibold text-gray-400 mb-1.5">Model Override</label>
            <div className="flex gap-2">
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. o4-mini  (blank = global default)"
                className="flex-1 rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
              />
              <button
                onClick={() => setShowModelDropdown((o) => !o)}
                className="rounded-lg bg-gray-800 border border-gray-700 px-3 py-2 text-gray-400 hover:text-gray-200 text-xs transition-colors"
              >
                ▾
              </button>
            </div>
            {showModelDropdown && (
              <div className="absolute right-0 top-full mt-1 z-50 rounded-xl border border-gray-700 bg-gray-900 shadow-xl overflow-hidden min-w-[220px]">
                {MODEL_SUGGESTIONS.map((m) => (
                  <button
                    key={m.id}
                    onClick={() => { setModel(m.id); setShowModelDropdown(false); }}
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-300 hover:bg-gray-800 transition-colors flex items-center justify-between gap-3"
                  >
                    <span className="font-mono">{m.label}</span>
                    {m.note && (
                      <span className="text-xs text-amber-500 shrink-0">{m.note}</span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
          <div className="text-xs text-gray-600 mt-1.5">
            o-series models (o3, o4-mini, o4.5…) don&apos;t accept temperature — handled automatically.
          </div>
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-1.5">Description</label>
          <input
            type="text"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Short description of what this template is for"
            className="w-full rounded-lg bg-gray-800 border border-gray-700 text-white px-3 py-2 text-sm focus:outline-none focus:border-indigo-500 transition-colors placeholder-gray-600"
          />
        </div>

        <div>
          <label className="block text-xs font-semibold text-gray-400 mb-2">Starting Point Types</label>
          <div className="flex flex-wrap gap-2">
            {SP_TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                onClick={() => toggleSpType(opt.value)}
                className={`rounded-full px-3 py-1 text-xs font-medium transition-all ${
                  spTypes.includes(opt.value)
                    ? "bg-indigo-600 text-white"
                    : "bg-gray-800 text-gray-400 hover:bg-gray-700 hover:text-gray-200"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <div className="mt-1.5 text-xs text-gray-600">
            Select which starting point types this template appears for. &quot;Any&quot; matches all types.
          </div>
        </div>
      </div>

      {/* Prompt editor tabs */}
      <div className="flex gap-2">
        <button
          onClick={() => setActiveTab("system")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "system"
              ? "bg-indigo-600 text-white"
              : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600"
          }`}
        >
          System Prompt
        </button>
        <button
          onClick={() => setActiveTab("step")}
          className={`rounded-lg px-4 py-2 text-sm font-medium transition-all ${
            activeTab === "step"
              ? "bg-indigo-600 text-white"
              : "bg-gray-900 border border-gray-800 text-gray-400 hover:text-white hover:border-gray-600"
          }`}
        >
          Step Prompt
        </button>
      </div>

      {/* System prompt editor */}
      <div className={activeTab === "system" ? "" : "hidden"}>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="border-b border-gray-800 px-5 py-3">
            <div className="text-sm font-semibold text-white">System Prompt</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Defines the agent&apos;s persona, investigation approach, and priorities for this template.
              Leave blank to use the global default.
            </div>
          </div>
          <textarea
            value={systemPrompt}
            onChange={(e) => setSystemPrompt(e.target.value)}
            rows={28}
            placeholder="Leave blank to use the global system prompt from Prompt Settings."
            className="w-full bg-gray-950 text-gray-200 text-sm font-mono px-5 py-4 focus:outline-none resize-none leading-relaxed placeholder-gray-700"
            spellCheck={false}
          />
        </div>
      </div>

      {/* Step prompt editor */}
      <div className={activeTab === "step" ? "" : "hidden"}>
        <div className="rounded-2xl border border-gray-800 bg-gray-900 overflow-hidden">
          <div className="border-b border-gray-800 px-5 py-3">
            <div className="text-sm font-semibold text-white">Step Prompt</div>
            <div className="text-xs text-gray-500 mt-0.5">
              Per-step instructions sent to the agent at each iteration. Leave blank to use the global default.
            </div>
          </div>
          <textarea
            value={stepPrompt}
            onChange={(e) => setStepPrompt(e.target.value)}
            rows={22}
            placeholder="Leave blank to use the global step prompt from Prompt Settings."
            className="w-full bg-gray-950 text-gray-200 text-sm font-mono px-5 py-4 focus:outline-none resize-none leading-relaxed placeholder-gray-700"
            spellCheck={false}
          />
        </div>

        {/* Variable legend */}
        <div className="rounded-2xl border border-gray-800 bg-gray-900 p-5 mt-4">
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
            Use double braces to include literal braces: <code className="text-gray-500">{"{{literal}}"}</code>
          </div>
        </div>
      </div>
    </div>
  );
}
