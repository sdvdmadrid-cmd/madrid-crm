"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { apiFetch } from "@/lib/client-auth";

/**
 * Platform owners on production are redirected away from /website, /lead-inbox, etc.
 * Localhost uses dev-login as contractor — this switch matches that experience.
 */
export default function ContractorWorkspaceModeSwitch({ compact = false }) {
  const router = useRouter();
  const [preview, setPreview] = useState(false);
  const [canToggle, setCanToggle] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await apiFetch("/api/workspace/mode");
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.success) return;
        setPreview(json.data?.contractorWorkspacePreview === true);
        setCanToggle(json.data?.canToggle === true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const toggle = useCallback(async () => {
    setLoading(true);
    try {
      const enable = !preview;
      const res = await apiFetch("/api/workspace/mode", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enable }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json?.success) return;
      setPreview(enable);
      router.push(enable ? "/dashboard" : "/owner/overview");
      router.refresh();
    } finally {
      setLoading(false);
    }
  }, [preview, router]);

  if (!canToggle || loading) return null;

  return (
    <div
      style={{
        marginBottom: compact ? 12 : 20,
        padding: compact ? "10px 12px" : "14px 16px",
        borderRadius: 10,
        border: "1px solid rgba(59, 130, 246, 0.35)",
        background: "linear-gradient(135deg, rgba(29,78,216,0.12), rgba(15,23,42,0.6))",
      }}
    >
      <p style={{ margin: 0, fontSize: compact ? "0.8rem" : "0.88rem", fontWeight: 700, color: "#e2e8f0" }}>
        {preview ? "Vista contractor activa" : "¿No ves Website Builder / Lead Inbox?"}
      </p>
      <p style={{ margin: "6px 0 10px", fontSize: "0.78rem", color: "#94a3b8", lineHeight: 1.45 }}>
        En localhost entras como contractor (dev-login). En production como dueño de plataforma ves Mission
        Control. Activa la vista contractor para ver lo mismo que ayer en host.
      </p>
      <button
        type="button"
        onClick={toggle}
        disabled={loading}
        style={{
          padding: "8px 14px",
          borderRadius: 8,
          border: "none",
          background: preview ? "#475569" : "#2563eb",
          color: "#fff",
          fontWeight: 600,
          fontSize: "0.8rem",
          cursor: loading ? "wait" : "pointer",
        }}
      >
        {preview ? "Volver a Mission Control" : "Abrir workspace contractor"}
      </button>
    </div>
  );
}
