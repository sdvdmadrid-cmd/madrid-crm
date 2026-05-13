"use client";

import { useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const DIRECT_FLAG_ACTION_TERMS = [
  "enable",
  "disable",
  "on",
  "off",
  "activar",
  "desactivar",
  "encender",
  "apagar",
  "wlacz",
  "wylacz",
];

const DIRECT_FLAG_TARGET_TERMS = [
  "feature",
  "flag",
  "website",
  "builder",
  "estimate",
  "ai",
  "monitor",
  "security",
  "support",
  "stripe",
  "platform",
  "modulo",
  "module",
];

function isDirectFlagCommand(prompt) {
  const text = String(prompt || "").toLowerCase();
  const hasAction = DIRECT_FLAG_ACTION_TERMS.some((term) => text.includes(term));
  if (!hasAction) return false;
  return DIRECT_FLAG_TARGET_TERMS.some((term) => text.includes(term));
}

const TEXT = {
  en: {
    open: "AI",
    close: "Close",
    title: "AI Bubble",
    subtitle: "Ask questions or apply guided changes.",
    mode: "Mode",
    ask: "Ask",
    apply: "Apply suggested changes",
    applying: "Applying...",
    sending: "Thinking...",
    placeholder: "Ask AI what you need...",
    response: "Response",
    errorFallback: "AI request failed.",
    modes: {
      owner: "Owner insights",
      proposal: "Proposal generator",
      crm: "CRM summary",
      reply: "Client reply",
      schedule: "Scheduling",
      flags: "Feature flag changes",
    },
    applied: "Suggested feature flags were applied.",
    directApplied: "Command detected. Suggested feature flags were applied automatically.",
  },
  es: {
    open: "IA",
    close: "Cerrar",
    title: "Burbuja IA",
    subtitle: "Haz preguntas o aplica cambios guiados.",
    mode: "Modo",
    ask: "Preguntar",
    apply: "Aplicar cambios sugeridos",
    applying: "Aplicando...",
    sending: "Pensando...",
    placeholder: "Preguntale a la IA lo que necesitas...",
    response: "Respuesta",
    errorFallback: "La solicitud de IA fallo.",
    modes: {
      owner: "Insights owner",
      proposal: "Generador de propuesta",
      crm: "Resumen CRM",
      reply: "Respuesta a cliente",
      schedule: "Agenda",
      flags: "Cambios de feature flags",
    },
    applied: "Se aplicaron los feature flags sugeridos.",
    directApplied: "Comando detectado. Se aplicaron automaticamente los feature flags sugeridos.",
  },
  pl: {
    open: "AI",
    close: "Zamknij",
    title: "Dymek AI",
    subtitle: "Zadawaj pytania lub stosuj sugerowane zmiany.",
    mode: "Tryb",
    ask: "Zapytaj",
    apply: "Zastosuj sugerowane zmiany",
    applying: "Zastosowywanie...",
    sending: "Analiza...",
    placeholder: "Zapytaj AI, czego potrzebujesz...",
    response: "Odpowiedz",
    errorFallback: "Zapytanie AI nie powiodlo sie.",
    modes: {
      owner: "Wnioski ownera",
      proposal: "Generator oferty",
      crm: "Podsumowanie CRM",
      reply: "Odpowiedz klientowi",
      schedule: "Planowanie",
      flags: "Zmiany feature flag",
    },
    applied: "Zastosowano sugerowane feature flagi.",
    directApplied: "Wykryto polecenie. Sugerowane feature flagi zostaly zastosowane automatycznie.",
  },
};

export default function AiBubbleClient({ authUser, pathname }) {
  const { i18n } = useTranslation();
  const language = i18n.language?.split("-")[0] || "en";
  const lang = ["en", "es", "pl"].includes(language) ? language : "en";
  const t = TEXT[lang];

  const role = String(authUser?.role || "").toLowerCase();
  const isSuperAdmin = role === "super_admin";

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(isSuperAdmin ? "owner" : "proposal");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [responseText, setResponseText] = useState("");
  const [flagRecommendations, setFlagRecommendations] = useState([]);

  const applyRecommendations = async (rows) => {
    for (const row of rows) {
      const res = await apiFetch("/api/admin/feature-flags", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          key: row.key,
          enabled: row.enabled === true,
          description: row.reason || "AI suggestion",
        }),
      });
      await getJsonOrThrow(res, t.errorFallback);
    }
  };

  const modeOptions = useMemo(() => {
    const base = [
      { value: "proposal", label: t.modes.proposal },
      { value: "crm", label: t.modes.crm },
      { value: "reply", label: t.modes.reply },
      { value: "schedule", label: t.modes.schedule },
    ];
    if (isSuperAdmin) {
      return [
        { value: "owner", label: t.modes.owner },
        ...base,
        { value: "flags", label: t.modes.flags },
      ];
    }
    return base;
  }, [isSuperAdmin, t.modes]);

  const askAi = async () => {
    const prompt = String(question || "").trim();
    if (!prompt || loading) return;

    setLoading(true);
    setError("");
    setResponseText("");
    setFlagRecommendations([]);

    try {
      if (mode === "owner") {
        const res = await apiFetch("/api/admin/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: prompt }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        setResponseText(String(payload?.data?.answer || ""));
        return;
      }

      if (mode === "proposal") {
        const res = await apiFetch("/api/ai/proposal", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            projectType: "General",
            scope: prompt,
            context: `Path: ${pathname}`,
          }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        setResponseText(String(payload?.data?.proposal || ""));
        return;
      }

      if (mode === "crm") {
        const res = await apiFetch("/api/ai/crm-summary", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: prompt }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        setResponseText(String(payload?.data?.summary || ""));
        return;
      }

      if (mode === "reply") {
        const res = await apiFetch("/api/ai/client-reply", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            clientMessage: prompt,
            context: `Path: ${pathname}`,
            tone: "professional",
          }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        setResponseText(String(payload?.data?.reply || ""));
        return;
      }

      if (mode === "schedule") {
        const res = await apiFetch("/api/ai/scheduling", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            jobSummary: prompt,
            constraints: `Path context: ${pathname}`,
            availability: [],
            weatherSummary: "N/A",
          }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        const plan = String(payload?.data?.schedulePlan || "").trim();
        const risks = Array.isArray(payload?.data?.riskNotes)
          ? payload.data.riskNotes.join("; ")
          : "";
        const backups = Array.isArray(payload?.data?.backupSlots)
          ? payload.data.backupSlots.join(", ")
          : "";
        setResponseText(
          [
            plan,
            risks ? `Risks: ${risks}` : "",
            backups ? `Backups: ${backups}` : "",
          ]
            .filter(Boolean)
            .join("\n\n"),
        );
        return;
      }

      if (mode === "flags") {
        const res = await apiFetch("/api/admin/feature-flags/ai", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        const summary = String(payload?.data?.summary || "").trim();
        const rows = Array.isArray(payload?.data?.recommendations)
          ? payload.data.recommendations
          : [];
        setFlagRecommendations(rows);
        const preview = rows
          .slice(0, 10)
          .map((row) => `${row.enabled ? "ON" : "OFF"} - ${row.key}`)
          .join("\n");
        const baseResponse = [summary, preview].filter(Boolean).join("\n\n");

        if (isSuperAdmin && isDirectFlagCommand(prompt) && rows.length > 0) {
          setApplying(true);
          await applyRecommendations(rows);
          setApplying(false);
          setResponseText([baseResponse, t.directApplied].filter(Boolean).join("\n\n"));
          return;
        }

        setResponseText(baseResponse);
      }
    } catch (err) {
      setError(err?.message || t.errorFallback);
      setApplying(false);
    } finally {
      setLoading(false);
    }
  };

  const applyFlagChanges = async () => {
    if (!isSuperAdmin || mode !== "flags" || applying) return;
    if (!Array.isArray(flagRecommendations) || flagRecommendations.length === 0)
      return;

    setApplying(true);
    setError("");
    try {
      await applyRecommendations(flagRecommendations);
      setResponseText((prev) => [prev, t.applied].filter(Boolean).join("\n\n"));
    } catch (err) {
      setError(err?.message || t.errorFallback);
    } finally {
      setApplying(false);
    }
  };

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1200 }}>
      {isOpen ? (
        <section
          style={{
            width: "min(92vw, 420px)",
            maxHeight: "76vh",
            overflow: "auto",
            background: "#0f172a",
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            boxShadow: "0 30px 70px rgba(2,6,23,0.55)",
            color: "#e2e8f0",
            padding: 14,
            marginBottom: 10,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
              alignItems: "center",
            }}
          >
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>{t.title}</div>
              <div style={{ color: "#94a3b8", fontSize: 12 }}>{t.subtitle}</div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={{
                border: "1px solid rgba(148,163,184,0.28)",
                background: "#111827",
                color: "#e2e8f0",
                borderRadius: 8,
                padding: "6px 10px",
                cursor: "pointer",
              }}
            >
              {t.close}
            </button>
          </div>

          <label
            style={{
              display: "block",
              marginTop: 12,
              fontSize: 12,
              color: "#94a3b8",
            }}
          >
            {t.mode}
          </label>
          <select
            value={mode}
            onChange={(event) => setMode(event.target.value)}
            style={{
              width: "100%",
              marginTop: 6,
              padding: "8px 10px",
              borderRadius: 8,
              border: "1px solid rgba(148,163,184,0.3)",
              background: "#111827",
              color: "#e2e8f0",
            }}
          >
            {modeOptions.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>

          <textarea
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            placeholder={t.placeholder}
            rows={4}
            style={{
              width: "100%",
              marginTop: 10,
              padding: "10px 12px",
              borderRadius: 10,
              border: "1px solid rgba(148,163,184,0.3)",
              background: "#111827",
              color: "#e2e8f0",
            }}
          />

          <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={askAi}
              disabled={loading}
              style={{
                border: "none",
                background: "#2563eb",
                color: "white",
                borderRadius: 10,
                padding: "9px 14px",
                fontWeight: 700,
                cursor: "pointer",
                opacity: loading ? 0.7 : 1,
              }}
            >
              {loading ? t.sending : t.ask}
            </button>

            {isSuperAdmin && mode === "flags" ? (
              <button
                type="button"
                onClick={applyFlagChanges}
                disabled={applying || flagRecommendations.length === 0}
                style={{
                  border: "none",
                  background: "#7c3aed",
                  color: "white",
                  borderRadius: 10,
                  padding: "9px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                  opacity: applying || flagRecommendations.length === 0 ? 0.65 : 1,
                }}
              >
                {applying ? t.applying : t.apply}
              </button>
            ) : null}
          </div>

          {error ? (
            <div
              style={{
                marginTop: 10,
                background: "rgba(127,29,29,0.35)",
                border: "1px solid rgba(248,113,113,0.45)",
                color: "#fecaca",
                borderRadius: 10,
                padding: "10px 12px",
                fontSize: 12,
              }}
            >
              {error}
            </div>
          ) : null}

          {responseText ? (
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 12, color: "#94a3b8", marginBottom: 6 }}>
                {t.response}
              </div>
              <textarea
                readOnly
                value={responseText}
                rows={10}
                style={{
                  width: "100%",
                  padding: "10px 12px",
                  borderRadius: 10,
                  border: "1px solid rgba(148,163,184,0.3)",
                  background: "#0b1220",
                  color: "#e2e8f0",
                }}
              />
            </div>
          ) : null}
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((value) => !value)}
        style={{
          border: "none",
          borderRadius: 999,
          background: "#111827",
          color: "#fff",
          padding: "10px 16px",
          fontWeight: 700,
          boxShadow: "0 14px 30px rgba(15,23,42,0.45)",
          cursor: "pointer",
        }}
      >
        {isOpen ? t.close : t.open}
      </button>
    </div>
  );
}
