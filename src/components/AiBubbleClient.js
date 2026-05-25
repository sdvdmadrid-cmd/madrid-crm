"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useWebsiteBuilderAi } from "@/contexts/WebsiteBuilderAiContext";

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
      schedule: "Schedule a job",
      estimate: "Draft an estimate",
      flags: "Feature flag changes",
    },
    applied: "Suggested feature flags were applied.",
    directApplied: "Command detected. Suggested feature flags were applied automatically.",
    websiteMode: "Website co-pilot",
    websitePlaceholder: "Ask about your site draft, missing sections, or copy…",
    applyPatches: "Apply suggested edits",
    patchesApplied: "Suggestions applied to your website draft.",
    runFullGenerate: "Generate full website",
    schedulePlaceholder: "e.g. Schedule snowplowing for John on Maple St tomorrow 9am",
    estimatePlaceholder: "e.g. Estimate snowplowing for 3 driveways on Maple St, two large",
    scheduleConfirm: "Create appointment",
    scheduleConfirming: "Creating…",
    scheduleCreated: "Appointment created.",
    scheduleSyncedGoogle: "Synced to Google Calendar.",
    scheduleSyncFailed: "Google Calendar sync skipped.",
    scheduleMissing: "Please fill in the missing fields before creating.",
    estimateOpenForm: "Open in estimate form",
    estimateDraftReady: "Draft ready — review and save in the estimate form.",
    cancel: "Cancel",
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
      schedule: "Agendar un trabajo",
      estimate: "Crear un estimado",
      flags: "Cambios de feature flags",
    },
    applied: "Se aplicaron los feature flags sugeridos.",
    directApplied: "Comando detectado. Se aplicaron automaticamente los feature flags sugeridos.",
    websiteMode: "Copiloto del sitio",
    websitePlaceholder: "Pregunta sobre tu borrador, secciones faltantes o textos…",
    applyPatches: "Aplicar sugerencias",
    patchesApplied: "Sugerencias aplicadas al borrador.",
    runFullGenerate: "Generar sitio completo",
    schedulePlaceholder: "ej. Agendame snowplowing con Juan en Maple St mañana 9am",
    estimatePlaceholder: "ej. Estimado de snowplowing para 3 driveways en Maple St, dos grandes",
    scheduleConfirm: "Crear cita",
    scheduleConfirming: "Creando…",
    scheduleCreated: "Cita creada.",
    scheduleSyncedGoogle: "Sincronizada con Google Calendar.",
    scheduleSyncFailed: "No se sincronizo con Google Calendar.",
    scheduleMissing: "Por favor completa los campos faltantes antes de crear.",
    estimateOpenForm: "Abrir en formulario de estimado",
    estimateDraftReady: "Borrador listo — revisa y guarda en el formulario.",
    cancel: "Cancelar",
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
      schedule: "Zaplanuj zlecenie",
      estimate: "Wstepny kosztorys",
      flags: "Zmiany feature flag",
    },
    applied: "Zastosowano sugerowane feature flagi.",
    directApplied: "Wykryto polecenie. Sugerowane feature flagi zostaly zastosowane automatycznie.",
    websiteMode: "Asystent strony",
    websitePlaceholder: "Zapytaj o szkic strony, brakujace sekcje lub teksty…",
    applyPatches: "Zastosuj sugestie",
    patchesApplied: "Sugestie zastosowane w szkicu strony.",
    runFullGenerate: "Wygeneruj cala strone",
    schedulePlaceholder: "np. Zaplanuj odsniezanie z Janem na Maple St jutro 9:00",
    estimatePlaceholder: "np. Kosztorys odsniezania 3 podjazdow na Maple St, dwa duze",
    scheduleConfirm: "Utworz spotkanie",
    scheduleConfirming: "Tworzenie…",
    scheduleCreated: "Spotkanie utworzone.",
    scheduleSyncedGoogle: "Zsynchronizowano z Google Calendar.",
    scheduleSyncFailed: "Nie zsynchronizowano z Google Calendar.",
    scheduleMissing: "Uzupelnij brakujace pola przed utworzeniem.",
    estimateOpenForm: "Otworz w formularzu kosztorysu",
    estimateDraftReady: "Szkic gotowy — przejrzyj i zapisz w formularzu.",
    cancel: "Anuluj",
  },
};

export default function AiBubbleClient({
  authUser,
  pathname,
  websiteBuilderMode = false,
}) {
  const { i18n } = useTranslation();
  const language = i18n.language?.split("-")[0] || "en";
  const lang = ["en", "es", "pl"].includes(language) ? language : "en";
  const t = TEXT[lang];

  const role = String(authUser?.role || "").toLowerCase();
  const isSuperAdmin = role === "super_admin";

  const router = useRouter();

  const [isOpen, setIsOpen] = useState(false);
  const [mode, setMode] = useState(isSuperAdmin ? "owner" : "proposal");
  const [question, setQuestion] = useState("");
  const [loading, setLoading] = useState(false);
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState("");
  const [responseText, setResponseText] = useState("");
  const [flagRecommendations, setFlagRecommendations] = useState([]);
  const [websitePatches, setWebsitePatches] = useState(null);
  // Action-capable mode state: each agent mode that produces a structured
  // draft stores it here so the UI can render a confirmation card with
  // explicit "Create" / "Open" buttons. Only one draft can be staged at
  // a time — switching modes or asking again clears the previous draft.
  const [scheduleDraft, setScheduleDraft] = useState(null);
  const [estimateDraft, setEstimateDraft] = useState(null);

  const wbAi = useWebsiteBuilderAi();
  const onWebsiteBuilder =
    websiteBuilderMode || Boolean(pathname?.startsWith("/website"));

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
    if (onWebsiteBuilder) {
      return [{ value: "website", label: t.websiteMode }];
    }
    const base = [
      { value: "proposal", label: t.modes.proposal },
      { value: "crm", label: t.modes.crm },
      { value: "reply", label: t.modes.reply },
      { value: "schedule", label: t.modes.schedule },
      { value: "estimate", label: t.modes.estimate },
    ];
    if (isSuperAdmin) {
      return [
        { value: "owner", label: t.modes.owner },
        ...base,
        { value: "flags", label: t.modes.flags },
      ];
    }
    return base;
  }, [isSuperAdmin, t.modes, onWebsiteBuilder, t.websiteMode]);

  useEffect(() => {
    if (onWebsiteBuilder) setMode("website");
  }, [onWebsiteBuilder]);

  const askAi = async () => {
    const prompt = String(question || "").trim();
    if (!prompt || loading) return;

    setLoading(true);
    setError("");
    setResponseText("");
    setFlagRecommendations([]);
    setWebsitePatches(null);
    setScheduleDraft(null);
    setEstimateDraft(null);

    try {
      if (mode === "website" || onWebsiteBuilder) {
        const snapshot = wbAi?.getSnapshot?.() || {};
        const res = await apiFetch("/api/website-builder/assistant", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ question: prompt, snapshot }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        setResponseText(String(payload?.data?.answer || ""));
        setWebsitePatches(payload?.data?.patches || null);
        return;
      }

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
        // Parse the free-form prompt into a structured appointment draft.
        // The contractor reviews/edits before we POST to /api/appointments
        // (which auto-syncs to Google Calendar when connected).
        const res = await apiFetch("/api/ai/scheduling/parse", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        const draft = payload?.data?.draft;
        if (!draft || typeof draft !== "object") {
          setError(t.errorFallback);
          return;
        }
        setScheduleDraft({
          title: draft.title || "",
          clientName: draft.clientName || "",
          date: draft.date || "",
          time: draft.time || "",
          endTime: draft.endTime || "",
          location: draft.location || "",
          notes: draft.notes || "",
          missing: Array.isArray(draft.missing) ? draft.missing : [],
        });
        return;
      }

      if (mode === "estimate") {
        // Parse the free-form prompt into a structured estimate draft and
        // hand it off to the /estimates/new editor for review + save.
        const res = await apiFetch("/api/ai/estimate/from-text", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt }),
        });
        const payload = await getJsonOrThrow(res, t.errorFallback);
        const draft = payload?.data?.draft;
        if (!draft || typeof draft !== "object") {
          setError(t.errorFallback);
          return;
        }
        setEstimateDraft({
          title: draft.title || "",
          clientName: draft.clientName || "",
          address: draft.address || "",
          services: Array.isArray(draft.services) ? draft.services : [],
          scopeNotes: draft.scopeNotes || "",
          subtotal: Number(draft.subtotal) || 0,
          assumptions: Array.isArray(draft.assumptions) ? draft.assumptions : [],
          missing: Array.isArray(draft.missing) ? draft.missing : [],
          heuristicReference: payload?.data?.heuristicReference || null,
        });
        setResponseText(t.estimateDraftReady);
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

  const applyWebsitePatches = async () => {
    if (!websitePatches || typeof websitePatches !== "object") return;
    try {
      wbAi?.applyPatches?.(websitePatches);
      setResponseText((prev) => [prev, t.patchesApplied].filter(Boolean).join("\n\n"));
      setWebsitePatches(null);
    } catch (err) {
      setError(err?.message || t.errorFallback);
    }
  };

  // Confirm the parsed appointment by POSTing to /api/appointments. The
  // server-side handler is responsible for the Google Calendar sync, so a
  // single "Create appointment" click can land both records.
  const confirmScheduleDraft = async () => {
    if (!scheduleDraft || applying) return;
    if (!scheduleDraft.title?.trim() || !scheduleDraft.clientName?.trim() ||
        !scheduleDraft.date?.trim() || !scheduleDraft.time?.trim()) {
      setError(t.scheduleMissing || t.errorFallback);
      return;
    }

    setApplying(true);
    setError("");
    try {
      const res = await apiFetch("/api/appointments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: scheduleDraft.title,
          clientName: scheduleDraft.clientName,
          date: scheduleDraft.date,
          time: scheduleDraft.time,
          endTime: scheduleDraft.endTime || "",
          location: scheduleDraft.location || "",
          notes: scheduleDraft.notes || "",
          status: "Scheduled",
        }),
      });
      const payload = await getJsonOrThrow(res, t.errorFallback);
      const synced = payload?.data?.google?.synced === true;
      const link = String(payload?.data?.google?.htmlLink || "");
      const lines = [t.scheduleCreated];
      if (synced) {
        lines.push(t.scheduleSyncedGoogle);
        if (link) lines.push(link);
      } else if (payload?.data?.google?.error) {
        lines.push(t.scheduleSyncFailed);
      }
      setResponseText(lines.filter(Boolean).join("\n"));
      setScheduleDraft(null);
    } catch (err) {
      setError(err?.message || t.errorFallback);
    } finally {
      setApplying(false);
    }
  };

  // Hand the AI's estimate draft off to the editor. We URL-encode the
  // payload so the editor's existing hydration path can pick it up via
  // a query string parameter — no extra global state needed.
  const openEstimateDraft = () => {
    if (!estimateDraft) return;
    try {
      const encoded =
        typeof window !== "undefined"
          ? window.btoa(unescape(encodeURIComponent(JSON.stringify(estimateDraft))))
          : "";
      const target = encoded
        ? `/estimates/new?aiDraft=${encodeURIComponent(encoded)}`
        : "/estimates/new";
      setIsOpen(false);
      router.push(target);
    } catch (err) {
      setError(err?.message || t.errorFallback);
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
            disabled={onWebsiteBuilder}
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
            placeholder={
              onWebsiteBuilder
                ? t.websitePlaceholder
                : mode === "schedule"
                  ? t.schedulePlaceholder || t.placeholder
                  : mode === "estimate"
                    ? t.estimatePlaceholder || t.placeholder
                    : t.placeholder
            }
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

            {onWebsiteBuilder && websitePatches ? (
              <button
                type="button"
                onClick={applyWebsitePatches}
                style={{
                  border: "none",
                  background: "#16a34a",
                  color: "white",
                  borderRadius: 10,
                  padding: "9px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.applyPatches}
              </button>
            ) : null}
            {onWebsiteBuilder && wbAi?.runGenerateFull ? (
              <button
                type="button"
                onClick={() => wbAi.runGenerateFull()}
                disabled={loading}
                style={{
                  border: "1px solid rgba(148,163,184,0.35)",
                  background: "#111827",
                  color: "#e2e8f0",
                  borderRadius: 10,
                  padding: "9px 14px",
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {t.runFullGenerate}
              </button>
            ) : null}
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

          {scheduleDraft ? (
            <div
              style={{
                marginTop: 12,
                background: "#0b1220",
                border: "1px solid rgba(94,234,212,0.35)",
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {t.modes.schedule}
              </div>
              <ScheduleDraftFields draft={scheduleDraft} onChange={setScheduleDraft} />
              {scheduleDraft.missing && scheduleDraft.missing.length > 0 ? (
                <div style={{ color: "#fbbf24", fontSize: 11, marginTop: 6 }}>
                  Missing: {scheduleDraft.missing.join(", ")}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={confirmScheduleDraft}
                  disabled={applying}
                  style={{
                    border: "none",
                    background: "#16a34a",
                    color: "white",
                    borderRadius: 10,
                    padding: "9px 14px",
                    fontWeight: 700,
                    cursor: applying ? "wait" : "pointer",
                    opacity: applying ? 0.7 : 1,
                  }}
                >
                  {applying ? t.scheduleConfirming || t.applying : t.scheduleConfirm || t.apply}
                </button>
                <button
                  type="button"
                  onClick={() => setScheduleDraft(null)}
                  disabled={applying}
                  style={{
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "#111827",
                    color: "#e2e8f0",
                    borderRadius: 10,
                    padding: "9px 14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t.cancel || t.close}
                </button>
              </div>
            </div>
          ) : null}

          {estimateDraft ? (
            <div
              style={{
                marginTop: 12,
                background: "#0b1220",
                border: "1px solid rgba(96,165,250,0.35)",
                borderRadius: 12,
                padding: 12,
                fontSize: 13,
              }}
            >
              <div style={{ fontWeight: 700, marginBottom: 6 }}>
                {t.modes.estimate}
              </div>
              <div style={{ color: "#94a3b8", fontSize: 12, marginBottom: 4 }}>
                {estimateDraft.title || "Draft"}
                {estimateDraft.clientName ? ` · ${estimateDraft.clientName}` : ""}
              </div>
              {estimateDraft.services?.length ? (
                <ul style={{ margin: "6px 0 6px 14px", padding: 0 }}>
                  {estimateDraft.services.map((svc, idx) => (
                    <li key={idx} style={{ marginBottom: 2 }}>
                      {svc.name} · {svc.qty} × ${Number(svc.unitPrice).toFixed(2)} = ${Number(svc.price).toFixed(2)}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div style={{ fontWeight: 600, marginTop: 4 }}>
                Subtotal: ${Number(estimateDraft.subtotal || 0).toFixed(2)}
              </div>
              {estimateDraft.missing && estimateDraft.missing.length > 0 ? (
                <div style={{ color: "#fbbf24", fontSize: 11, marginTop: 6 }}>
                  Missing: {estimateDraft.missing.join(", ")}
                </div>
              ) : null}
              <div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={openEstimateDraft}
                  style={{
                    border: "none",
                    background: "#2563eb",
                    color: "white",
                    borderRadius: 10,
                    padding: "9px 14px",
                    fontWeight: 700,
                    cursor: "pointer",
                  }}
                >
                  {t.estimateOpenForm}
                </button>
                <button
                  type="button"
                  onClick={() => setEstimateDraft(null)}
                  style={{
                    border: "1px solid rgba(148,163,184,0.35)",
                    background: "#111827",
                    color: "#e2e8f0",
                    borderRadius: 10,
                    padding: "9px 14px",
                    fontWeight: 600,
                    cursor: "pointer",
                  }}
                >
                  {t.cancel || t.close}
                </button>
              </div>
            </div>
          ) : null}

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

// Small editable form for the parsed appointment draft so the contractor
// can fill in anything the AI couldn't infer (e.g. exact address) before
// hitting "Create appointment". Kept inline since this is the only place
// in the app that consumes this shape today.
function ScheduleDraftFields({ draft, onChange }) {
  const fieldStyle = {
    width: "100%",
    padding: "6px 8px",
    borderRadius: 6,
    border: "1px solid rgba(148,163,184,0.3)",
    background: "#111827",
    color: "#e2e8f0",
    fontSize: 12,
  };
  const labelStyle = { fontSize: 11, color: "#94a3b8", marginBottom: 2, display: "block" };
  const rowStyle = { marginTop: 6 };
  const set = (key) => (event) => onChange({ ...draft, [key]: event.target.value });
  return (
    <div>
      <div style={rowStyle}>
        <label style={labelStyle}>Title</label>
        <input type="text" value={draft.title || ""} onChange={set("title")} style={fieldStyle} />
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Client</label>
        <input type="text" value={draft.clientName || ""} onChange={set("clientName")} style={fieldStyle} />
      </div>
      <div style={{ ...rowStyle, display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
        <div>
          <label style={labelStyle}>Date</label>
          <input type="date" value={draft.date || ""} onChange={set("date")} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>Start</label>
          <input type="time" value={draft.time || ""} onChange={set("time")} style={fieldStyle} />
        </div>
        <div>
          <label style={labelStyle}>End</label>
          <input type="time" value={draft.endTime || ""} onChange={set("endTime")} style={fieldStyle} />
        </div>
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Location</label>
        <input type="text" value={draft.location || ""} onChange={set("location")} style={fieldStyle} />
      </div>
      <div style={rowStyle}>
        <label style={labelStyle}>Notes</label>
        <textarea
          value={draft.notes || ""}
          onChange={set("notes")}
          rows={2}
          style={{ ...fieldStyle, resize: "vertical" }}
        />
      </div>
    </div>
  );
}
