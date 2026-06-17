"use client";

import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-auth";
import { isClientLoggedOut } from "@/lib/auth-logout-guard.js";

const CHECK_LABELS = {
  openai: "OpenAI (AI website, AI image generation)",
  storage: "Supabase Storage (website-media bucket)",
  turnstile: "Cloudflare Turnstile (public lead form)",
  email: "Email delivery (Resend / EMAIL_PROVIDER)",
  stripe: "Stripe (payments, Connect)",
};

function StatusPill({ ok }) {
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 6,
        padding: "2px 10px",
        borderRadius: 999,
        fontSize: 12,
        fontWeight: 600,
        background: ok ? "rgba(16,185,129,0.18)" : "rgba(248,113,113,0.18)",
        color: ok ? "#34d399" : "#fca5a5",
        border: `1px solid ${ok ? "rgba(16,185,129,0.35)" : "rgba(248,113,113,0.35)"}`,
      }}
    >
      <span aria-hidden>{ok ? "●" : "●"}</span>
      {ok ? "OK" : "Action needed"}
    </span>
  );
}

export default function OwnerSystemStatusCard() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    if (isClientLoggedOut()) return;
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/owner/system-status", { cache: "no-store" });
      if (!res.ok) {
        setError(`Status check failed (${res.status})`);
        setData(null);
        return;
      }
      const payload = await res.json();
      setData(payload?.data || null);
    } catch (err) {
      setError(err?.message || "Status check failed");
      setData(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isClientLoggedOut()) return undefined;
    load();
  }, [load]);

  const checks = data?.checks || {};
  const allOk = Boolean(data?.ok);

  return (
    <section
      className="rounded-2xl border border-white/10 p-5 text-white"
      style={{
        background: allOk
          ? "linear-gradient(135deg, rgba(16,185,129,0.12) 0%, rgba(99,102,241,0.16) 100%)"
          : "linear-gradient(135deg, rgba(245,158,11,0.18) 0%, rgba(248,113,113,0.18) 100%)",
      }}
    >
      <header className="flex items-start justify-between gap-4">
        <div>
          <h2 className="text-lg font-semibold">Platform infrastructure</h2>
          <p className="mt-1 text-sm text-slate-300">
            One-glance health of the third-party integrations FieldBase depends on. Hidden
            from tenants — actionable items show only here.
          </p>
        </div>
        <button
          type="button"
          onClick={load}
          disabled={loading}
          className="rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/90 hover:bg-white/10 disabled:opacity-50"
        >
          {loading ? "Checking…" : "Re-check"}
        </button>
      </header>

      {error ? (
        <p className="mt-4 text-sm text-rose-200" role="alert">
          {error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-3">
        {Object.entries(CHECK_LABELS).map(([key, label]) => {
          const check = checks[key];
          const ok = Boolean(check?.ok);
          const hint = check?.hint || "";
          return (
            <article
              key={key}
              className="rounded-xl border border-white/10 bg-black/20 p-4"
            >
              <div className="flex items-center justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">{label}</h3>
                <StatusPill ok={ok} />
              </div>
              {check?.bucket ? (
                <p className="mt-1 text-xs text-slate-400">
                  Bucket: <code className="text-slate-200">{check.bucket}</code>
                </p>
              ) : null}
              {check?.provider ? (
                <p className="mt-1 text-xs text-slate-400">
                  Provider: <code className="text-slate-200">{check.provider}</code>
                </p>
              ) : null}
              {key === "turnstile" && check?.mode ? (
                <p className="mt-1 text-xs text-slate-400">
                  Mode: <code className="text-slate-200">{check.mode}</code>
                </p>
              ) : null}
              {key === "stripe" ? (
                <p className="mt-1 text-xs text-slate-400">
                  Stripe Connect:{" "}
                  <code className="text-slate-200">
                    {check?.connectEnabled ? "enabled" : "disabled"}
                  </code>
                </p>
              ) : null}
              {!ok && hint ? (
                <p className="mt-2 text-xs leading-relaxed text-amber-200">{hint}</p>
              ) : null}
            </article>
          );
        })}
      </div>

      {data?.generatedAt ? (
        <p className="mt-4 text-[11px] text-slate-400">
          Last checked: {new Date(data.generatedAt).toLocaleString()}
        </p>
      ) : null}
    </section>
  );
}
