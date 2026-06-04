"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useWebsiteBuilderAi } from "@/contexts/WebsiteBuilderAiContext";
import { useWorkspaceAgentSession } from "@/hooks/useWorkspaceAgentSession";
import {
  executeWorkspaceActions,
  mergeAgentSummaries,
  normalizeAgentSummaries,
} from "@/lib/workspace-agent/client-executor";

const TEXT = {
  en: {
    open: "AI Assistant",
    close: "Close",
    title: "FieldBase Assistant",
    subtitle: "Operations assistant — creates estimates, invoices, jobs, appointments, and more.",
    agentMode: "Agent Mode",
    agentModeHint: "When on, I can apply approved changes across this workspace.",
    placeholder: "e.g. Create estimate for John Smith — spring cleanup… or /help",
    slashHint: "Quick commands",
    send: "Send",
    voice: "Voice",
    voiceStop: "Stop",
    sending: "Working…",
    clearChat: "Clear chat",
    confirmPlan: "Apply plan",
    cancelPlan: "Cancel",
    summaries: "Changes",
    legacyTools: "More tools",
    errorFallback: "Assistant request failed.",
    applied: "Changes applied to your workspace.",
  },
  es: {
    open: "Asistente IA",
    close: "Cerrar",
    title: "Asistente FieldBase",
    subtitle: "Operador del espacio de trabajo — pregunta, planifica y aplica cambios.",
    agentMode: "Modo agente",
    agentModeHint: "Cuando está activo, puedo aplicar cambios aprobados en el espacio de trabajo.",
    placeholder: "Pregunta o usa /help, /audit, /hero, /leads…",
    slashHint: "Comandos rápidos",
    send: "Enviar",
    voice: "Voz",
    voiceStop: "Detener",
    sending: "Trabajando…",
    clearChat: "Limpiar chat",
    confirmPlan: "Aplicar plan",
    cancelPlan: "Cancelar",
    summaries: "Cambios",
    legacyTools: "Más herramientas",
    errorFallback: "La solicitud del asistente falló.",
    applied: "Cambios aplicados en tu espacio de trabajo.",
  },
  pl: {
    open: "Asystent AI",
    close: "Zamknij",
    title: "Asystent FieldBase",
    subtitle: "Operator workspace — pyta, planuje i stosuje zmiany.",
    agentMode: "Tryb agenta",
    agentModeHint: "Gdy włączony, mogę stosować zatwierdzone zmiany w workspace.",
    placeholder: "Zapytaj lub użyj /help, /audit, /hero, /leads…",
    slashHint: "Szybkie polecenia",
    send: "Wyślij",
    voice: "Głos",
    voiceStop: "Stop",
    sending: "Pracuję…",
    clearChat: "Wyczyść czat",
    confirmPlan: "Zastosuj plan",
    cancelPlan: "Anuluj",
    summaries: "Zmiany",
    legacyTools: "Więcej narzędzi",
    errorFallback: "Żądanie asystenta nie powiodło się.",
    applied: "Zmiany zastosowane w workspace.",
  },
};

export default function WorkspaceAgentBubble({
  authUser,
  pathname,
  websiteBuilderMode = false,
}) {
  const { i18n } = useTranslation();
  const language = i18n.language?.split("-")[0] || "en";
  const lang = ["en", "es", "pl"].includes(language) ? language : "en";
  const t = TEXT[lang];

  const router = useRouter();
  const wbAi = useWebsiteBuilderAi();
  const onWebsiteBuilder =
    websiteBuilderMode || Boolean(pathname?.startsWith("/website"));

  const {
    messages,
    agentMode,
    setAgentMode,
    appendMessage,
    clearSession,
    hydrated,
  } = useWorkspaceAgentSession();

  const [isOpen, setIsOpen] = useState(false);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [pendingPlan, setPendingPlan] = useState(null);
  const [lastSummaries, setLastSummaries] = useState([]);
  const [listening, setListening] = useState(false);
  const scrollRef = useRef(null);
  const recognitionRef = useRef(null);

  const historyForApi = useMemo(
    () =>
      messages.map((m) => ({
        role: m.role,
        content: m.content,
      })),
    [messages],
  );

  useEffect(() => {
    if (!scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages, loading, pendingPlan]);

  const runAgent = async ({ message, confirmPlan = null }) => {
    const prompt = String(message || "").trim();
    if (!prompt && !confirmPlan) return;

    setLoading(true);
    setError("");

    try {
      const snapshot = onWebsiteBuilder ? wbAi?.getSnapshot?.() || {} : null;
      const res = await apiFetch("/api/workspace-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: prompt || "confirm",
          pathname,
          agentMode,
          history: historyForApi,
          snapshot,
          confirmPlan,
        }),
      });
      const payload = await getJsonOrThrow(res, t.errorFallback);
      const data = payload?.data || {};

      if (data.requiresConfirmation && data.plan) {
        setPendingPlan(data.plan);
        appendMessage("assistant", data.answer, {
          plan: true,
          summaries: normalizeAgentSummaries(data.summaries, "planSummaries"),
        });
        return;
      }

      setPendingPlan(null);
      let clientSummaries = [];

      if (agentMode && Array.isArray(data.actions) && data.actions.length > 0) {
        clientSummaries = await executeWorkspaceActions(data.actions, {
          applyWebsitePatches: (p) => {
            wbAi?.applyPatches?.(p);
          },
          navigate: (path) => router.push(path),
          apiFetch,
          getJsonOrThrow,
        });
      } else if (data.patches && onWebsiteBuilder) {
        wbAi?.applyPatches?.(data.patches);
        clientSummaries = [t.applied];
      }

      const summaries = mergeAgentSummaries(data.summaries, clientSummaries);
      setLastSummaries(summaries);
      appendMessage("assistant", data.answer, { summaries, source: data.source });
    } catch (err) {
      setError(err?.message || t.errorFallback);
    } finally {
      setLoading(false);
    }
  };

  const handleSend = async () => {
    const prompt = input.trim();
    if (!prompt || loading) return;
    setInput("");
    appendMessage("user", prompt);
    await runAgent({ message: prompt });
  };

  const toggleVoiceInput = () => {
    if (typeof window === "undefined") return;
    const SpeechRecognition =
      window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      setError("Voice input is not supported in this browser.");
      return;
    }
    if (listening && recognitionRef.current) {
      recognitionRef.current.stop();
      setListening(false);
      return;
    }
    const recognition = new SpeechRecognition();
    recognition.lang = language === "es" ? "es-US" : language === "pl" ? "pl-PL" : "en-US";
    recognition.interimResults = false;
    recognition.maxAlternatives = 1;
    recognition.onresult = (event) => {
      const transcript = event.results?.[0]?.[0]?.transcript || "";
      if (transcript) setInput((prev) => (prev ? `${prev} ${transcript}` : transcript));
    };
    recognition.onerror = () => setListening(false);
    recognition.onend = () => setListening(false);
    recognitionRef.current = recognition;
    setListening(true);
    recognition.start();
  };

  const handleConfirmPlan = async () => {
    if (!pendingPlan || loading) return;
    appendMessage("user", "Confirm plan");
    await runAgent({ message: "confirm", confirmPlan: pendingPlan });
    setPendingPlan(null);
  };

  const panelWidth = "min(92vw, 440px)";

  return (
    <div style={{ position: "fixed", right: 18, bottom: 18, zIndex: 1200 }}>
      {isOpen ? (
        <section
          style={{
            width: panelWidth,
            maxHeight: "78vh",
            display: "flex",
            flexDirection: "column",
            background: "#0f172a",
            border: "1px solid rgba(148,163,184,0.25)",
            borderRadius: 16,
            boxShadow: "0 30px 70px rgba(2,6,23,0.55)",
            color: "#e2e8f0",
            marginBottom: 10,
            overflow: "hidden",
          }}
        >
          <header
            style={{
              padding: "12px 14px",
              borderBottom: "1px solid rgba(148,163,184,0.2)",
              display: "flex",
              justifyContent: "space-between",
              gap: 8,
            }}
          >
            <div>
              <div style={{ fontWeight: 800, fontSize: 15 }}>{t.title}</div>
              <div style={{ color: "#94a3b8", fontSize: 11, lineHeight: 1.4 }}>
                {t.subtitle}
              </div>
            </div>
            <button
              type="button"
              onClick={() => setIsOpen(false)}
              style={iconBtnStyle}
              aria-label={t.close}
            >
              {t.close}
            </button>
          </header>

          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid rgba(148,163,184,0.15)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              gap: 8,
              fontSize: 12,
            }}
          >
            <label style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }}>
              <input
                type="checkbox"
                checked={agentMode}
                onChange={(e) => setAgentMode(e.target.checked)}
              />
              <span>
                <strong>{t.agentMode}</strong>
                <span style={{ color: "#64748b", marginLeft: 6 }}>{t.agentModeHint}</span>
              </span>
            </label>
            <button type="button" onClick={clearSession} style={iconBtnStyle}>
              {t.clearChat}
            </button>
          </div>

          <div
            ref={scrollRef}
            style={{
              flex: 1,
              overflowY: "auto",
              padding: "12px 14px",
              minHeight: 200,
              maxHeight: "42vh",
            }}
          >
            {!hydrated ? (
              <p style={{ color: "#94a3b8", fontSize: 13 }}>…</p>
            ) : messages.length === 0 ? (
              <div style={{ color: "#94a3b8", fontSize: 13, lineHeight: 1.55 }}>
                <p style={{ marginBottom: 8, fontWeight: 700, color: "#cbd5e1" }}>
                  {t.slashHint}
                </p>
                <ul style={{ margin: "0 0 12px 18px", padding: 0 }}>
                  <li>
                    <code style={codeStyle}>/audit</code> — site health check
                  </li>
                  <li>
                    <code style={codeStyle}>/hero premium</code> — rewrite hero (auto-applies)
                  </li>
                  <li>
                    <code style={codeStyle}>/pricing</code> — remove service prices
                  </li>
                  <li>
                    <code style={codeStyle}>/services</code> — landscaping catalog
                  </li>
                  <li>
                    <code style={codeStyle}>/leads</code> — summarize new leads
                  </li>
                  <li>
                    <code style={codeStyle}>/leads contacted</code> — mark new as contacted
                  </li>
                  <li>
                    <code style={codeStyle}>/help</code> — full command list
                  </li>
                </ul>
                <p style={{ margin: 0 }}>Or describe changes in plain English.</p>
              </div>
            ) : (
              messages.map((msg) => (
                <div
                  key={msg.id}
                  style={{
                    marginBottom: 10,
                    textAlign: msg.role === "user" ? "right" : "left",
                  }}
                >
                  <div
                    style={{
                      display: "inline-block",
                      maxWidth: "92%",
                      padding: "10px 12px",
                      borderRadius: 12,
                      background:
                        msg.role === "user"
                          ? "rgba(37,99,235,0.35)"
                          : "rgba(15,23,42,0.9)",
                      border: `1px solid ${
                        msg.role === "user"
                          ? "rgba(96,165,250,0.4)"
                          : "rgba(148,163,184,0.25)"
                      }`,
                      fontSize: 13,
                      lineHeight: 1.55,
                      whiteSpace: "pre-wrap",
                      textAlign: "left",
                    }}
                  >
                    {msg.content}
                  </div>
                  {normalizeAgentSummaries(msg.meta?.summaries, "messageSummaries").length ? (
                    <div style={{ marginTop: 6, display: "flex", flexWrap: "wrap", gap: 4 }}>
                      {normalizeAgentSummaries(msg.meta?.summaries, "messageSummaries").map((s) => (
                        <span key={s} style={summaryChipStyle}>
                          {s}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              ))
            )}

            {pendingPlan ? (
              <div style={planCardStyle}>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>{pendingPlan.title}</div>
                <ul style={{ margin: "0 0 10px 16px", padding: 0, fontSize: 12 }}>
                  {(pendingPlan.steps || []).map((step) => (
                    <li key={step} style={{ marginBottom: 4 }}>
                      {step}
                    </li>
                  ))}
                </ul>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={handleConfirmPlan}
                    disabled={loading}
                    style={primaryBtnStyle}
                  >
                    {t.confirmPlan}
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingPlan(null)}
                    style={secondaryBtnStyle}
                  >
                    {t.cancelPlan}
                  </button>
                </div>
              </div>
            ) : null}

            {lastSummaries.length > 0 && !pendingPlan ? (
              <div style={{ marginTop: 8 }}>
                <div style={{ fontSize: 11, color: "#64748b", marginBottom: 4 }}>
                  {t.summaries}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {lastSummaries.map((s) => (
                    <span key={s} style={summaryChipStyle}>
                      {s}
                    </span>
                  ))}
                </div>
              </div>
            ) : null}

            {error ? (
              <div style={{ ...planCardStyle, borderColor: "rgba(248,113,113,0.45)" }}>
                {error}
              </div>
            ) : null}
          </div>

          <div style={{ padding: "10px 14px 12px", borderTop: "1px solid rgba(148,163,184,0.2)" }}>
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder={t.placeholder}
              rows={3}
              style={{
                width: "100%",
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(148,163,184,0.3)",
                background: "#111827",
                color: "#e2e8f0",
                resize: "vertical",
                fontSize: 13,
              }}
            />
            <div style={{ display: "flex", gap: 8, marginTop: 8, flexWrap: "wrap" }}>
              <button
                type="button"
                onClick={toggleVoiceInput}
                disabled={loading}
                title={listening ? t.voiceStop : t.voice}
                style={{
                  ...secondaryBtnStyle,
                  borderColor: listening ? "rgba(248,113,113,0.6)" : secondaryBtnStyle.border,
                }}
              >
                {listening ? "⏹" : "🎤"}
              </button>
              <button
                type="button"
                onClick={handleSend}
                disabled={loading || !input.trim()}
                style={{
                  ...primaryBtnStyle,
                  opacity: loading || !input.trim() ? 0.65 : 1,
                }}
              >
                {loading ? t.sending : t.send}
              </button>
            </div>
          </div>
        </section>
      ) : null}

      <button
        type="button"
        onClick={() => setIsOpen((v) => !v)}
        style={{
          border: "none",
          borderRadius: 999,
          background: "linear-gradient(135deg, #1d4ed8, #7c3aed)",
          color: "#fff",
          padding: "11px 18px",
          fontWeight: 800,
          fontSize: 13,
          boxShadow: "0 14px 30px rgba(15,23,42,0.45)",
          cursor: "pointer",
        }}
      >
        {isOpen ? t.close : t.open}
      </button>
    </div>
  );
}

const iconBtnStyle = {
  border: "1px solid rgba(148,163,184,0.28)",
  background: "#111827",
  color: "#e2e8f0",
  borderRadius: 8,
  padding: "6px 10px",
  cursor: "pointer",
  fontSize: 12,
};

const primaryBtnStyle = {
  border: "none",
  background: "#2563eb",
  color: "white",
  borderRadius: 10,
  padding: "8px 14px",
  fontWeight: 700,
  cursor: "pointer",
  fontSize: 13,
};

const secondaryBtnStyle = {
  border: "1px solid rgba(148,163,184,0.35)",
  background: "#111827",
  color: "#e2e8f0",
  borderRadius: 10,
  padding: "8px 14px",
  fontWeight: 600,
  cursor: "pointer",
  fontSize: 13,
};

const planCardStyle = {
  marginTop: 10,
  background: "#0b1220",
  border: "1px solid rgba(94,234,212,0.35)",
  borderRadius: 12,
  padding: 12,
  fontSize: 13,
};

const summaryChipStyle = {
  fontSize: 10,
  fontWeight: 700,
  padding: "4px 8px",
  borderRadius: 999,
  background: "rgba(22,163,74,0.2)",
  color: "#86efac",
  border: "1px solid rgba(34,197,94,0.35)",
};

const codeStyle = {
  fontSize: 11,
  background: "rgba(30,41,59,0.8)",
  padding: "2px 6px",
  borderRadius: 4,
  color: "#e2e8f0",
};
