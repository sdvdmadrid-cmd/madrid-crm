"use client";

import { useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const QUICK_QUESTIONS = [
  "Who are the most active users by estimates?",
  "Which users are inactive and have not logged in recently?",
  "Show trial accounts expiring soon.",
  "Give me platform usage patterns.",
  "What should I improve this week?",
];

export default function AdminAiAssistantClient() {
  const [question, setQuestion] = useState(QUICK_QUESTIONS[0]);
  const [answer, setAnswer] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const ask = async (prompt) => {
    const text = String(prompt || question || "").trim();
    if (!text || loading) return;

    setLoading(true);
    setError("");
    try {
      const response = await apiFetch("/api/admin/ai", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ question: text }),
      });
      const payload = await getJsonOrThrow(response, "Unable to query AI assistant.");
      setAnswer(String(payload?.data?.answer || "No answer returned."));
    } catch (err) {
      setError(err?.message || "Unable to query AI assistant.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="mb-6 overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm">
      <div className="border-b border-slate-200 bg-slate-50 px-4 py-4">
        <h2 className="text-lg font-semibold tracking-tight text-slate-900">
          Owner AI Assistant
        </h2>
        <p className="mt-1 text-sm text-slate-600">
          Ask platform questions instantly: activity, trials, churn risk, and subscription signals.
        </p>
      </div>

      <div className="grid gap-3 p-4">
        <div className="flex flex-wrap gap-2">
          {QUICK_QUESTIONS.map((q) => (
            <button
              key={q}
              type="button"
              onClick={() => {
                setQuestion(q);
                ask(q);
              }}
              disabled={loading}
              className="rounded-full border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {q}
            </button>
          ))}
        </div>

        <div className="grid gap-2 md:grid-cols-[minmax(0,1fr)_auto]">
          <input
            value={question}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder="Ask about users, trial dates, payments, or growth signals..."
            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={() => ask(question)}
            disabled={loading}
            className="rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Analyzing..." : "Ask AI"}
          </button>
        </div>

        {error ? (
          <div className="rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">
            {error}
          </div>
        ) : null}

        {answer ? (
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 whitespace-pre-wrap text-sm leading-6 text-slate-800">
            {answer}
          </div>
        ) : null}
      </div>
    </section>
  );
}
