"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const QUICK_AI_PROMPTS = [
  "Apply growth mode",
  "Apply security mode",
  "Apply lean mode",
  "Disable website builder and estimate builder",
  "Enable website builder and estimate builder",
  "Disable all AI features",
  "Enable support and AI only",
  "Disable support queue",
];

export default function AdminFeatureFlagsClient() {
  const [flags, setFlags] = useState([]);
  const [loading, setLoading] = useState(true);
  const [savingKey, setSavingKey] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [prompt, setPrompt] = useState(QUICK_AI_PROMPTS[0]);
  const [aiLoading, setAiLoading] = useState(false);
  const [suggestion, setSuggestion] = useState(null);

  const enabledCount = useMemo(
    () => flags.filter((f) => f.enabled === true).length,
    [flags],
  );

  const loadFlags = async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/feature-flags");
      const payload = await getJsonOrThrow(res, "Unable to load feature flags");
      setFlags(Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      setError(err?.message || "Unable to load feature flags");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadFlags();
  }, []);

  const toggleFlag = async (flag) => {
    setSavingKey(flag.key);
    setError("");
    setNotice("");

    try {
      const res = await apiFetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: flag.key,
          enabled: !flag.enabled,
          description: flag.description || "",
        }),
      });

      const payload = await getJsonOrThrow(res, "Unable to update feature flag");
      setFlags(Array.isArray(payload?.data) ? payload.data : []);
      setNotice(`Updated ${flag.key}`);
    } catch (err) {
      setError(err?.message || "Unable to update feature flag");
    } finally {
      setSavingKey("");
    }
  };

  const askAiSuggestion = async (nextPrompt = prompt) => {
    const text = String(nextPrompt || "").trim();
    if (!text) return;

    setAiLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/admin/feature-flags/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: text }),
      });
      const payload = await getJsonOrThrow(res, "Unable to generate AI suggestion");
      setSuggestion(payload?.data || null);
      setNotice("AI suggestion ready. Review and apply.");
    } catch (err) {
      setError(err?.message || "Unable to generate AI suggestion");
    } finally {
      setAiLoading(false);
    }
  };

  const applySuggestion = async () => {
    if (!suggestion?.recommendations || suggestion.recommendations.length === 0) {
      return;
    }

    setAiLoading(true);
    setError("");

    try {
      let nextFlags = flags;
      for (const rec of suggestion.recommendations) {
        const response = await apiFetch("/api/admin/feature-flags", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ key: rec.key, enabled: rec.enabled }),
        });
        const payload = await getJsonOrThrow(response, "Unable to apply AI suggestion");
        nextFlags = Array.isArray(payload?.data) ? payload.data : nextFlags;
      }
      setFlags(nextFlags);
      setNotice(`Applied AI plan: ${suggestion.mode}`);
    } catch (err) {
      setError(err?.message || "Unable to apply AI suggestion");
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <section className="rounded-2xl border border-white/10 bg-slate-900/70 p-5">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-white">Feature Flags</h2>
          <p className="mt-1 text-sm text-slate-400">
            Enable or disable platform modules in real time.
          </p>
        </div>
        <div className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300">
          {enabledCount}/{flags.length} enabled
        </div>
      </div>

      {error ? (
        <div className="mt-4 rounded-xl border border-rose-400/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
          {error}
        </div>
      ) : null}

      {notice ? (
        <div className="mt-4 rounded-xl border border-emerald-400/30 bg-emerald-500/10 px-3 py-2 text-sm text-emerald-200">
          {notice}
        </div>
      ) : null}

      <div className="mt-4 grid gap-2">
        {loading ? (
          <div className="rounded-xl border border-dashed border-white/10 bg-slate-950/40 p-4 text-sm text-slate-500">
            Loading feature flags...
          </div>
        ) : null}

        {!loading && flags.map((flag) => (
          <div key={flag.key} className="rounded-xl border border-white/10 bg-slate-950/60 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium text-slate-200">{flag.key}</p>
                <p className="mt-1 text-xs text-slate-500">{flag.description || "No description"}</p>
              </div>
              <button
                type="button"
                disabled={savingKey === flag.key}
                onClick={() => toggleFlag(flag)}
                className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${flag.enabled ? "border-emerald-300 bg-emerald-50 text-emerald-700" : "border-slate-300 bg-slate-100 text-slate-700"}`}
              >
                {savingKey === flag.key ? "Saving..." : flag.enabled ? "ON" : "OFF"}
              </button>
            </div>
          </div>
        ))}
      </div>

      <div className="mt-5 rounded-xl border border-white/10 bg-slate-950/50 p-4">
        <p className="text-sm font-medium text-slate-200">AI Feature Planner</p>
        <p className="mt-1 text-xs text-slate-500">
          Describe the mode you want, then apply the recommendation.
        </p>

        <div className="mt-3 flex flex-wrap gap-2">
          {QUICK_AI_PROMPTS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setPrompt(q);
                askAiSuggestion(q);
              }}
              disabled={aiLoading}
              className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-slate-300 hover:bg-white/10"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="mt-3 grid gap-2 md:grid-cols-[minmax(0,1fr)_auto_auto]">
          <input
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Example: apply security mode and disable support"
            className="rounded-lg border border-white/10 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          />
          <button
            type="button"
            onClick={() => askAiSuggestion(prompt)}
            disabled={aiLoading}
            className="rounded-lg border border-cyan-400/40 bg-cyan-500/10 px-4 py-2 text-sm font-semibold text-cyan-200 hover:bg-cyan-500/20"
          >
            {aiLoading ? "Thinking..." : "Suggest"}
          </button>
          <button
            type="button"
            onClick={applySuggestion}
            disabled={aiLoading || !suggestion}
            className="rounded-lg border border-emerald-400/40 bg-emerald-500/10 px-4 py-2 text-sm font-semibold text-emerald-200 hover:bg-emerald-500/20 disabled:cursor-not-allowed disabled:opacity-60"
          >
            Apply Plan
          </button>
        </div>

        {suggestion ? (
          <div className="mt-3 rounded-xl border border-white/10 bg-slate-900/70 p-3">
            <p className="text-sm font-semibold text-slate-100">Mode: {suggestion.mode}</p>
            <p className="mt-1 text-xs text-slate-400">{suggestion.summary}</p>
            <div className="mt-2 space-y-1">
              {suggestion.recommendations?.map((rec) => (
                <p key={rec.key} className="text-xs text-slate-300">
                  {rec.enabled ? "Enable" : "Disable"} {rec.key} - {rec.reason}
                </p>
              ))}
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
