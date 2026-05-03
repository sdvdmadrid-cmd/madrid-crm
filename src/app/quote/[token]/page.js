"use client";

import Image from "next/image";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import UniversalShareButton from "@/components/UniversalShareButton";
import {
  computeEstimateFinancials,
  getUsStateLabel,
} from "@/lib/estimate-pricing";
import { useStoredUiLanguage } from "@/lib/ui-language";

// ── i18n ──────────────────────────────────────────────────────────────────────
const UI_I18N = {
  en: {
    loading: "Loading your quote…",
    projectQuote: "Project Quote",
    priceBreakdown: "Price Breakdown",
    subtotal: "Subtotal",
    tax: "Tax",
    total: "Total",
    downPayment: "Down payment",
    balanceDue: "Balance due",
    scopeDetails: "Scope of Work",
    acceptQuote: "Accept Quote",
    requestChanges: "Request Changes",
    approveSection: "Accept this quote",
    approveDesc:
      "Enter your name to confirm acceptance. Add a digital signature if required.",
    requestSection: "Request changes",
    requestDesc:
      "Describe what you'd like changed and we'll review it promptly.",
    yourName: "Your full name",
    yourEmail: "Your email (optional)",
    yourSignature: "Type your signature (optional)",
    changeType: "Type of change",
    specificItem: "Specific item (optional)",
    description: "Describe the change in detail",
    contactEmail: "Your email",
    contactPhone: "Your phone (optional)",
    sending: "Sending…",
    processing: "Processing…",
    confirmApprove: "Confirm acceptance",
    confirmSign: "Confirm & sign",
    sendRequest: "Send request",
    successApproved: "Quote accepted successfully!",
    successSigned: "Quote signed successfully!",
    successApprovedSub:
      "The contractor has been notified. We'll be in touch with next steps.",
    successSignedSub:
      "Thank you for signing. The contractor has been notified.",
    successRequestSub: "We'll review your request and get back to you soon.",
    successRequest: "Request sent successfully!",
    alreadyApproved: "This quote has been accepted",
    alreadySigned: "This quote has been signed",
    changesRequested: "Changes have been requested",
    approvedBy: "Accepted by",
    signedBy: "Signed by",
    on: "on",
    dueDate: "Due date",
    service: "Service",
    client: "Client",
    backToQuote: "← Back",
    changeTypes: {
      change: "Modify an existing item",
      remove: "Remove an item",
      add: "Add a new item",
      other: "Other",
    },
    errors: {
      load: "Could not load quote. The link may have expired.",
      nameRequired: "Please enter your name.",
      signatureRequired: "Please type your signature.",
      describeChanges: "Please describe the changes you'd like.",
      submit: "Something went wrong. Please try again.",
    },
    footer: "Sent via FieldBase",
    shareQuote: "Share quote",
    shareHint: "Quick share via SMS, WhatsApp, email, or other apps.",
    linkCopied: "Link copied",
    copyFailed: "Could not copy link",
  },
  es: {
    loading: "Cargando tu cotización…",
    projectQuote: "Cotización",
    priceBreakdown: "Desglose de precio",
    subtotal: "Subtotal",
    tax: "Impuesto",
    total: "Total",
    downPayment: "Anticipo",
    balanceDue: "Saldo a pagar",
    scopeDetails: "Alcance del trabajo",
    acceptQuote: "Aceptar cotización",
    requestChanges: "Solicitar cambios",
    approveSection: "Aceptar esta cotización",
    approveDesc:
      "Ingresa tu nombre para confirmar. Opcionalmente puedes agregar una firma digital.",
    requestSection: "Solicitar cambios",
    requestDesc: "Describe lo que deseas cambiar y lo revisaremos pronto.",
    yourName: "Tu nombre completo",
    yourEmail: "Tu email (opcional)",
    yourSignature: "Escribe tu firma (opcional)",
    changeType: "Tipo de cambio",
    specificItem: "Ítem específico (opcional)",
    description: "Describe el cambio en detalle",
    contactEmail: "Tu email",
    contactPhone: "Tu teléfono (opcional)",
    sending: "Enviando…",
    processing: "Procesando…",
    confirmApprove: "Confirmar aceptación",
    confirmSign: "Confirmar y firmar",
    sendRequest: "Enviar solicitud",
    successApproved: "¡Cotización aceptada con éxito!",
    successSigned: "¡Cotización firmada con éxito!",
    successApprovedSub:
      "El contratista fue notificado. Te contactaremos con los próximos pasos.",
    successSignedSub: "Gracias por firmar. El contratista fue notificado.",
    successRequestSub: "Revisaremos tu solicitud y te contactaremos pronto.",
    successRequest: "¡Solicitud enviada con éxito!",
    alreadyApproved: "Esta cotización ya fue aceptada",
    alreadySigned: "Esta cotización ya fue firmada",
    changesRequested: "Se solicitaron cambios",
    approvedBy: "Aceptado por",
    signedBy: "Firmado por",
    on: "el",
    dueDate: "Fecha límite",
    service: "Servicio",
    client: "Cliente",
    backToQuote: "← Volver",
    changeTypes: {
      change: "Modificar un ítem existente",
      remove: "Quitar un ítem",
      add: "Agregar un ítem nuevo",
      other: "Otro",
    },
    errors: {
      load: "No se pudo cargar la cotización. El enlace puede haber expirado.",
      nameRequired: "Por favor ingresa tu nombre.",
      signatureRequired: "Por favor escribe tu firma.",
      describeChanges: "Por favor describe los cambios que deseas.",
      submit: "Algo salió mal. Intenta de nuevo.",
    },
    footer: "Enviado con FieldBase",
    shareQuote: "Compartir cotización",
    shareHint:
      "Comparte rápido por SMS, WhatsApp, email u otras apps.",
    linkCopied: "Enlace copiado",
    copyFailed: "No se pudo copiar el enlace",
  },
  pl: {
    loading: "Ładowanie wyceny…",
    projectQuote: "Wycena projektu",
    priceBreakdown: "Zestawienie cen",
    subtotal: "Suma częściowa",
    tax: "Podatek",
    total: "Łącznie",
    downPayment: "Zaliczka",
    balanceDue: "Pozostałe saldo",
    scopeDetails: "Zakres prac",
    acceptQuote: "Akceptuj wycenę",
    requestChanges: "Poproś o zmiany",
    approveSection: "Zaakceptuj tę wycenę",
    approveDesc:
      "Wpisz imię, aby potwierdzić akceptację. Możesz też dodać podpis cyfrowy.",
    requestSection: "Poproś o zmiany",
    requestDesc: "Opisz co chcesz zmienić, a my to przejrzymy.",
    yourName: "Twoje imię i nazwisko",
    yourEmail: "Twój email (opcjonalnie)",
    yourSignature: "Wpisz podpis (opcjonalnie)",
    changeType: "Rodzaj zmiany",
    specificItem: "Konkretna pozycja (opcjonalnie)",
    description: "Opisz zmianę szczegółowo",
    contactEmail: "Twój email",
    contactPhone: "Twój telefon (opcjonalnie)",
    sending: "Wysyłanie…",
    processing: "Przetwarzanie…",
    confirmApprove: "Potwierdź akceptację",
    confirmSign: "Potwierdź i podpisz",
    sendRequest: "Wyślij prośbę",
    successApproved: "Wycena zaakceptowana pomyślnie!",
    successSigned: "Wycena podpisana pomyślnie!",
    successApprovedSub:
      "Wykonawca został powiadomiony. Wkrótce się skontaktujemy.",
    successSignedSub:
      "Dziękujemy za podpisanie. Wykonawca został powiadomiony.",
    successRequestSub: "Przejrzymy Twoją prośbę i wkrótce się odezwiemy.",
    successRequest: "Prośba wysłana pomyślnie!",
    alreadyApproved: "Ta wycena została zaakceptowana",
    alreadySigned: "Ta wycena została podpisana",
    changesRequested: "Zgłoszono prośbę o zmiany",
    approvedBy: "Zaakceptował",
    signedBy: "Podpisał",
    on: "dnia",
    dueDate: "Termin",
    service: "Usługa",
    client: "Klient",
    backToQuote: "← Powrót",
    changeTypes: {
      change: "Zmień istniejącą pozycję",
      remove: "Usuń pozycję",
      add: "Dodaj nową pozycję",
      other: "Inne",
    },
    errors: {
      load: "Nie udało się załadować wyceny. Link mógł wygasnąć.",
      nameRequired: "Proszę podać swoje imię.",
      signatureRequired: "Proszę wpisać podpis.",
      describeChanges: "Proszę opisać żądane zmiany.",
      submit: "Coś poszło nie tak. Spróbuj ponownie.",
    },
    footer: "Wysłane przez FieldBase",
    shareQuote: "Udostępnij wycenę",
    shareHint:
      "Szybkie udostępnianie przez SMS, WhatsApp, email i inne aplikacje.",
    linkCopied: "Link skopiowany",
    copyFailed: "Nie udało się skopiować linku",
  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────
function money(v) {
  return `$${Number(v || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

const BASE_INPUT = {
  width: "100%",
  padding: "11px 14px",
  borderRadius: 8,
  border: "1.5px solid #e2e8f0",
  fontSize: 15,
  fontFamily: "inherit",
  color: "#1e293b",
  background: "white",
  boxSizing: "border-box",
  outline: "none",
  transition: "border-color 0.15s, box-shadow 0.15s",
};

function focusGreen(e) {
  e.target.style.borderColor = "#16a34a";
  e.target.style.boxShadow = "0 0 0 3px rgba(22,163,74,0.12)";
}
function focusAmber(e) {
  e.target.style.borderColor = "#f59e0b";
  e.target.style.boxShadow = "0 0 0 3px rgba(245,158,11,0.12)";
}
function blurReset(e) {
  e.target.style.borderColor = "#e2e8f0";
  e.target.style.boxShadow = "none";
}

// ── Component ─────────────────────────────────────────────────────────────────
export default function QuoteClientPage() {
  const params = useParams();
  const token = String(params?.token || "");
  const [uiLanguage] = useStoredUiLanguage();
  const t = UI_I18N[uiLanguage] || UI_I18N.en;

  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [payload, setPayload] = useState(null);

  const [activePanel, setActivePanel] = useState(null); // null | "approve" | "changes"
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState(""); // "" | "approved" | "signed" | "changes"
  const [formError, setFormError] = useState("");

  const [approvalForm, setApprovalForm] = useState({
    contactName: "",
    contactEmail: "",
    signatureText: "",
  });
  const [changesForm, setChangesForm] = useState({
    requestType: "change",
    item: "",
    message: "",
    contactName: "",
    contactEmail: "",
    contactPhone: "",
  });

  const approveRef = useRef(null);
  const changesRef = useRef(null);

  // Auto-open panel from email anchor (#approve / #changes)
  useEffect(() => {
    const hash = window.location.hash;
    if (hash === "#approve") setActivePanel("approve");
    else if (hash === "#changes") setActivePanel("changes");
  }, []);

  // Scroll to revealed panel
  useEffect(() => {
    if (activePanel === "approve" && approveRef.current) {
      setTimeout(
        () =>
          approveRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        80,
      );
    } else if (activePanel === "changes" && changesRef.current) {
      setTimeout(
        () =>
          changesRef.current?.scrollIntoView({
            behavior: "smooth",
            block: "start",
          }),
        80,
      );
    }
  }, [activePanel]);

  // Load quote data
  useEffect(() => {
    if (!token) return;
    (async () => {
      setLoading(true);
      setLoadError("");
      try {
        const res = await fetch(
          `/api/public/quotes/${encodeURIComponent(token)}`,
          { cache: "no-store" },
        );
        const data = await res.json();
        if (!res.ok || !data?.success)
          throw new Error(data?.error || t.errors.load);
        setPayload(data.data);
      } catch (err) {
        setLoadError(err.message || t.errors.load);
      } finally {
        setLoading(false);
      }
    })();
  }, [token, t.errors.load]);

  const company = payload?.companyProfile || {};
  const job = payload?.job || {};
  const financials = useMemo(
    () =>
      computeEstimateFinancials({
        baseAmount: job.price,
        taxState: job.taxState,
        downPaymentPercent: job.downPaymentPercent,
      }),
    [job.price, job.taxState, job.downPaymentPercent],
  );

  const quoteStatus = String(job.quoteStatus || "sent").toLowerCase();
  const isFinalized = quoteStatus === "approved" || quoteStatus === "signed";
  const isSigned = quoteStatus === "signed";
  const changesWereRequested = quoteStatus === "changes_requested";

  const submitApproval = async (action) => {
    setFormError("");
    if (!approvalForm.contactName.trim()) {
      setFormError(t.errors.nameRequired);
      return;
    }
    if (action === "sign" && !approvalForm.signatureText.trim()) {
      setFormError(t.errors.signatureRequired);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/public/quotes/${encodeURIComponent(token)}/approval`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, ...approvalForm }),
        },
      );
      const data = await res.json();
      if (!res.ok || !data?.success)
        throw new Error(data?.error || t.errors.submit);
      setPayload((prev) => ({
        ...prev,
        job: { ...(prev?.job || {}), ...data.data },
      }));
      setSuccess(action === "sign" ? "signed" : "approved");
      setActivePanel(null);
    } catch (err) {
      setFormError(err.message || t.errors.submit);
    } finally {
      setSubmitting(false);
    }
  };

  const submitChanges = async () => {
    setFormError("");
    if (!changesForm.message.trim()) {
      setFormError(t.errors.describeChanges);
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(
        `/api/public/quotes/${encodeURIComponent(token)}/requests`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(changesForm),
        },
      );
      const data = await res.json();
      if (!res.ok || !data?.success)
        throw new Error(data?.error || t.errors.submit);
      setPayload((prev) => ({
        ...prev,
        job: { ...(prev?.job || {}), quoteStatus: "changes_requested" },
      }));
      setSuccess("changes");
      setChangesForm({
        requestType: "change",
        item: "",
        message: "",
        contactName: "",
        contactEmail: "",
        contactPhone: "",
      });
      setActivePanel(null);
    } catch (err) {
      setFormError(err.message || t.errors.submit);
    } finally {
      setSubmitting(false);
    }
  };

  const companyName = company.companyName || "FieldBase";
  const shareTitle = `${companyName} - ${job.title || t.projectQuote}`;
  const shareText = `${t.projectQuote}: ${job.title || t.projectQuote} · ${money(financials.total)}`;

  // ── Loading ────────────────────────────────────────────────────────────────
  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f5f7",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div style={{ textAlign: "center", color: "#64748b" }}>
          <div
            style={{
              width: 36,
              height: 36,
              borderRadius: "50%",
              border: "3px solid #e2e8f0",
              borderTopColor: "#16a34a",
              animation: "qspin 0.8s linear infinite",
              margin: "0 auto 12px",
            }}
          />
          {t.loading}
        </div>
        <style>{`@keyframes qspin { to { transform: rotate(360deg); } }`}</style>
      </div>
    );
  }

  // ── Hard error ─────────────────────────────────────────────────────────────
  if (loadError && !payload) {
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f5f7",
          padding: 24,
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <div
          style={{
            maxWidth: 420,
            width: "100%",
            textAlign: "center",
            background: "white",
            borderRadius: 20,
            padding: "48px 32px",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
          }}
        >
          <div style={{ fontSize: 44, marginBottom: 16 }}>🔗</div>
          <div
            style={{
              fontWeight: 700,
              fontSize: 18,
              color: "#0f172a",
              marginBottom: 8,
            }}
          >
            Quote not found
          </div>
          <div style={{ color: "#64748b", fontSize: 14, lineHeight: 1.5 }}>
            {loadError}
          </div>
        </div>
      </div>
    );
  }

  // ── Post-action success screen ─────────────────────────────────────────────
  if (success) {
    const isGreen = success !== "changes";
    return (
      <div
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: "#f4f5f7",
          padding: "24px 16px",
          fontFamily:
            "-apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif",
        }}
      >
        <style>{`@keyframes qfadeIn { from { opacity:0; transform:translateY(12px); } to { opacity:1; transform:translateY(0); } }`}</style>
        <div
          style={{
            maxWidth: 480,
            width: "100%",
            background: "white",
            borderRadius: 20,
            padding: "48px 32px",
            textAlign: "center",
            boxShadow: "0 4px 24px rgba(0,0,0,0.08)",
            animation: "qfadeIn 0.4s ease",
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: "50%",
              background: isGreen ? "#dcfce7" : "#fef3c7",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              margin: "0 auto 20px",
              fontSize: 32,
            }}
          >
            {isGreen ? "✓" : "✎"}
          </div>
          <div
            style={{
              fontWeight: 800,
              fontSize: 22,
              color: "#0f172a",
              marginBottom: 10,
            }}
          >
            {success === "approved"
              ? t.successApproved
              : success === "signed"
                ? t.successSigned
                : t.successRequest}
          </div>
          <div
            style={{
              color: "#64748b",
              fontSize: 15,
              lineHeight: 1.6,
              marginBottom: 28,
            }}
          >
            {success === "approved"
              ? t.successApprovedSub
              : success === "signed"
                ? t.successSignedSub
                : t.successRequestSub}
          </div>
          <div
            style={{
              background: "#f8fafc",
              borderRadius: 12,
              padding: "14px 20px",
              fontSize: 14,
              color: "#475569",
            }}
          >
            <strong style={{ color: "#0f172a" }}>{job.title}</strong>
            {" · "}
            <span style={{ color: "#16a34a", fontWeight: 700 }}>
              {money(financials.total)}
            </span>
          </div>
          <div style={{ marginTop: 24, fontSize: 12, color: "#94a3b8" }}>
            {t.footer}
          </div>
        </div>
      </div>
    );
  }

  // ── Full quote page ────────────────────────────────────────────────────────
  const statusColors = {
    approved: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", icon: "✓" },
    signed: { bg: "#f0fdf4", border: "#bbf7d0", text: "#166534", icon: "✓" },
    changes_requested: {
      bg: "#fffbeb",
      border: "#fde68a",
      text: "#92400e",
      icon: "✎",
    },
  };
  const statusInfo = statusColors[quoteStatus];

  return (
    <>
      <style>{`
        @keyframes qfadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
        .q-page { min-height:100vh; background:#f4f5f7; font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',system-ui,sans-serif; }
        .q-wrap { max-width:680px; margin:0 auto; padding:32px 20px 56px; }
        .q-card { background:white; border-radius:20px; box-shadow:0 2px 16px rgba(0,0,0,0.07),0 0 0 1px rgba(0,0,0,0.04); overflow:hidden; animation:qfadeIn 0.35s ease; }
        .q-sec { padding:28px 32px; border-bottom:1px solid #f1f5f9; }
        .q-sec:last-child { border-bottom:none; }
        .q-panel { animation:qfadeIn 0.25s ease; }
        .q-btn-row { display:flex; gap:12px; }
        .q-btn-accept { flex:1; padding:14px 20px; border-radius:10px; border:none; background:#16a34a; color:white; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; transition:background 0.15s,transform 0.1s; letter-spacing:-0.01em; }
        .q-btn-accept:hover:not(:disabled) { background:#15803d; }
        .q-btn-accept:active:not(:disabled) { transform:scale(0.98); }
        .q-btn-changes { flex:1; padding:14px 20px; border-radius:10px; border:1.5px solid #cbd5e1; background:white; color:#374151; font-size:15px; font-weight:600; cursor:pointer; font-family:inherit; transition:border-color 0.15s,background 0.15s,transform 0.1s; letter-spacing:-0.01em; }
        .q-btn-changes:hover:not(:disabled) { border-color:#94a3b8; background:#f8fafc; }
        .q-btn-changes:active:not(:disabled) { transform:scale(0.98); }
        .q-price-row { display:flex; justify-content:space-between; align-items:center; padding:8px 0; font-size:15px; color:#374151; }
        .q-price-total { border-top:1.5px solid #e2e8f0; margin-top:4px; padding-top:16px; }
        .q-label { font-size:11px; font-weight:700; color:#94a3b8; letter-spacing:0.08em; text-transform:uppercase; margin-bottom:14px; }
        @media (max-width:520px) {
          .q-wrap { padding:12px 10px 40px; }
          .q-sec { padding:20px 20px; }
          .q-btn-row { flex-direction:column; }
          .q-btn-accept, .q-btn-changes { flex:none; }
        }
      `}</style>
      <div className="q-page">
        <div className="q-wrap">
          <div className="q-card">
            {/* ── Header bar ─────────────────────────────────────────────── */}
            <div
              style={{
                background: "#1F2937",
                padding: "22px 32px",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                gap: 16,
              }}
            >
              <div>
                <div
                  style={{
                    fontSize: 11,
                    color: "#6b7280",
                    fontWeight: 600,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 4,
                  }}
                >
                  {t.projectQuote}
                </div>
                <div
                  style={{
                    fontSize: 20,
                    fontWeight: 700,
                    color: "white",
                    lineHeight: 1.2,
                  }}
                >
                  {companyName}
                </div>
                {company.phone && (
                  <div style={{ fontSize: 13, color: "#6b7280", marginTop: 4 }}>
                    {company.phone}
                  </div>
                )}
              </div>
              {company.logoDataUrl && (
                <div
                  style={{
                    flexShrink: 0,
                    background: "white",
                    borderRadius: 10,
                    padding: "6px 10px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                  }}
                >
                  <Image
                    src={company.logoDataUrl}
                    alt={companyName}
                    width={120}
                    height={48}
                    unoptimized
                    style={{
                      maxHeight: 48,
                      maxWidth: 120,
                      objectFit: "contain",
                      display: "block",
                    }}
                  />
                </div>
              )}
            </div>

            {/* ── Status banner (finalized / changes_requested) ────────── */}
            {statusInfo && (
              <div
                style={{
                  padding: "14px 32px",
                  background: statusInfo.bg,
                  borderBottom: `1px solid ${statusInfo.border}`,
                  display: "flex",
                  alignItems: "flex-start",
                  gap: 10,
                }}
              >
                <span
                  style={{
                    width: 28,
                    height: 28,
                    flexShrink: 0,
                    borderRadius: 14,
                    background: statusInfo.border,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 14,
                    color: statusInfo.text,
                    fontWeight: 700,
                    marginTop: 1,
                  }}
                >
                  {statusInfo.icon}
                </span>
                <div>
                  <div
                    style={{
                      fontWeight: 700,
                      fontSize: 14,
                      color: statusInfo.text,
                    }}
                  >
                    {isSigned
                      ? t.alreadySigned
                      : isFinalized
                        ? t.alreadyApproved
                        : t.changesRequested}
                  </div>
                  {isFinalized &&
                    (job.quoteApprovedByName || job.quoteSignedByName) && (
                      <div
                        style={{ fontSize: 13, color: "#4b5563", marginTop: 2 }}
                      >
                        {isSigned ? t.signedBy : t.approvedBy}{" "}
                        <strong>
                          {job.quoteSignedByName || job.quoteApprovedByName}
                        </strong>
                        {(() => {
                          const d = job.quoteSignedAt || job.quoteApprovedAt;
                          return d
                            ? ` ${t.on} ${new Date(d).toLocaleDateString()}`
                            : "";
                        })()}
                      </div>
                    )}
                </div>
              </div>
            )}

            {/* ── Project details ─────────────────────────────────────────── */}
            <div className="q-sec">
              <div className="q-label">{t.projectQuote}</div>
              <h1
                style={{
                  margin: "0 0 20px",
                  fontSize: 22,
                  fontWeight: 800,
                  color: "#0f172a",
                  lineHeight: 1.2,
                  letterSpacing: "-0.5px",
                }}
              >
                {job.title || t.projectQuote}
              </h1>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                  gap: "12px 24px",
                }}
              >
                {job.clientName && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t.client}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#1e293b",
                        marginTop: 3,
                        fontWeight: 600,
                      }}
                    >
                      {job.clientName}
                    </div>
                  </div>
                )}
                {job.service && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t.service}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#1e293b",
                        marginTop: 3,
                        fontWeight: 600,
                      }}
                    >
                      {job.service}
                    </div>
                  </div>
                )}
                {job.dueDate && (
                  <div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "#94a3b8",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        letterSpacing: "0.06em",
                      }}
                    >
                      {t.dueDate}
                    </div>
                    <div
                      style={{
                        fontSize: 14,
                        color: "#1e293b",
                        marginTop: 3,
                        fontWeight: 600,
                      }}
                    >
                      {job.dueDate}
                    </div>
                  </div>
                )}
              </div>
              {job.scopeDetails && (
                <div style={{ marginTop: 20 }}>
                  <div
                    style={{
                      fontSize: 11,
                      fontWeight: 700,
                      color: "#94a3b8",
                      letterSpacing: "0.08em",
                      textTransform: "uppercase",
                      marginBottom: 8,
                    }}
                  >
                    {t.scopeDetails}
                  </div>
                  <div
                    style={{
                      fontSize: 14,
                      color: "#374151",
                      lineHeight: 1.7,
                      whiteSpace: "pre-wrap",
                      background: "#f8fafc",
                      borderRadius: 10,
                      padding: "14px 16px",
                      border: "1px solid #e2e8f0",
                    }}
                  >
                    {job.scopeDetails}
                  </div>
                </div>
              )}
            </div>

            {/* ── Price breakdown ──────────────────────────────────────────── */}
            <div className="q-sec">
              <div className="q-label">{t.priceBreakdown}</div>
              <div>
                <div className="q-price-row">
                  <span style={{ color: "#6b7280" }}>{t.subtotal}</span>
                  <span style={{ fontWeight: 500 }}>{money(job.price)}</span>
                </div>
                {financials.taxRate > 0 && (
                  <div className="q-price-row">
                    <span style={{ color: "#6b7280" }}>
                      {t.tax} ({getUsStateLabel(financials.taxState)}{" "}
                      {financials.taxRate.toFixed(2)}%)
                    </span>
                    <span style={{ fontWeight: 500 }}>
                      {money(financials.taxAmount)}
                    </span>
                  </div>
                )}
                <div className="q-price-row q-price-total">
                  <span
                    style={{ fontWeight: 700, fontSize: 17, color: "#0f172a" }}
                  >
                    {t.total}
                  </span>
                  <span
                    style={{ fontWeight: 800, fontSize: 22, color: "#16a34a" }}
                  >
                    {money(financials.total)}
                  </span>
                </div>
                {financials.downPaymentPercent > 0 && (
                  <>
                    <div className="q-price-row" style={{ marginTop: 8 }}>
                      <span style={{ color: "#6b7280" }}>
                        {t.downPayment} (
                        {financials.downPaymentPercent.toFixed(0)}%)
                      </span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>
                        {money(financials.downPaymentAmount)}
                      </span>
                    </div>
                    <div className="q-price-row">
                      <span style={{ color: "#6b7280" }}>{t.balanceDue}</span>
                      <span style={{ fontWeight: 600, color: "#0f172a" }}>
                        {money(financials.balanceAfterDownPayment)}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>

            {/* ── Quick share ─────────────────────────────────────────────── */}
            <div className="q-sec">
              <div className="q-label">{t.shareQuote}</div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 16,
                  flexWrap: "wrap",
                }}
              >
                <div style={{ flex: "1 1 260px" }}>
                  <div
                    style={{
                      fontSize: 14,
                      color: "#475569",
                      lineHeight: 1.6,
                    }}
                  >
                    {t.shareHint}
                  </div>
                </div>
                <UniversalShareButton
                  label={t.shareQuote}
                  copiedLabel={t.linkCopied}
                  copyFailedLabel={t.copyFailed}
                  title={shareTitle}
                  text={shareText}
                  style={{ minWidth: 180 }}
                />
              </div>
            </div>

            {/* ── CTA buttons ──────────────────────────────────────────────── */}
            {!isFinalized && (
              <div className="q-sec">
                <div className="q-btn-row">
                  <button
                    type="button"
                    className="q-btn-accept"
                    onClick={() => {
                      setActivePanel(
                        activePanel === "approve" ? null : "approve",
                      );
                      setFormError("");
                    }}
                  >
                    ✓ {t.acceptQuote}
                  </button>
                  {!changesWereRequested && (
                    <button
                      type="button"
                      className="q-btn-changes"
                      onClick={() => {
                        setActivePanel(
                          activePanel === "changes" ? null : "changes",
                        );
                        setFormError("");
                      }}
                    >
                      ✎ {t.requestChanges}
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* ── Approve panel ────────────────────────────────────────────── */}
            {activePanel === "approve" && (
              <div
                className="q-sec q-panel"
                ref={approveRef}
                style={{
                  background: "#f0fdf4",
                  borderTop: "1px solid #bbf7d0",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#166534",
                    marginBottom: 4,
                  }}
                >
                  {t.approveSection}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#4b7c55",
                    marginBottom: 18,
                    lineHeight: 1.5,
                  }}
                >
                  {t.approveDesc}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <input
                    placeholder={t.yourName}
                    value={approvalForm.contactName}
                    onChange={(e) =>
                      setApprovalForm({
                        ...approvalForm,
                        contactName: e.target.value,
                      })
                    }
                    style={{ ...BASE_INPUT }}
                    onFocus={focusGreen}
                    onBlur={blurReset}
                  />
                  <input
                    placeholder={t.yourEmail}
                    type="email"
                    value={approvalForm.contactEmail}
                    onChange={(e) =>
                      setApprovalForm({
                        ...approvalForm,
                        contactEmail: e.target.value,
                      })
                    }
                    style={{ ...BASE_INPUT }}
                    onFocus={focusGreen}
                    onBlur={blurReset}
                  />
                  <input
                    placeholder={t.yourSignature}
                    value={approvalForm.signatureText}
                    onChange={(e) =>
                      setApprovalForm({
                        ...approvalForm,
                        signatureText: e.target.value,
                      })
                    }
                    style={{
                      ...BASE_INPUT,
                      fontStyle: approvalForm.signatureText
                        ? "italic"
                        : "normal",
                      fontFamily: approvalForm.signatureText
                        ? "Georgia, 'Times New Roman', serif"
                        : "inherit",
                      fontSize: approvalForm.signatureText ? 17 : 15,
                    }}
                    onFocus={focusGreen}
                    onBlur={blurReset}
                  />
                  {formError && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#dc2626",
                        padding: "9px 12px",
                        background: "#fef2f2",
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                      }}
                    >
                      {formError}
                    </div>
                  )}
                  <div className="q-btn-row" style={{ marginTop: 4 }}>
                    <button
                      type="button"
                      className="q-btn-accept"
                      onClick={() => submitApproval("approve")}
                      disabled={submitting}
                      style={{ opacity: submitting ? 0.7 : 1 }}
                    >
                      {submitting ? t.processing : t.confirmApprove}
                    </button>
                    {approvalForm.signatureText.trim() && (
                      <button
                        type="button"
                        onClick={() => submitApproval("sign")}
                        disabled={submitting}
                        style={{
                          flex: 1,
                          padding: "14px 20px",
                          borderRadius: 10,
                          border: "none",
                          background: "#0f172a",
                          color: "white",
                          fontSize: 15,
                          fontWeight: 600,
                          cursor: submitting ? "not-allowed" : "pointer",
                          fontFamily: "inherit",
                          opacity: submitting ? 0.7 : 1,
                          letterSpacing: "-0.01em",
                        }}
                      >
                        {submitting ? t.processing : t.confirmSign}
                      </button>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ── Changes panel ────────────────────────────────────────────── */}
            {activePanel === "changes" && (
              <div
                className="q-sec q-panel"
                ref={changesRef}
                style={{
                  background: "#fffbeb",
                  borderTop: "1px solid #fde68a",
                }}
              >
                <div
                  style={{
                    fontSize: 15,
                    fontWeight: 700,
                    color: "#92400e",
                    marginBottom: 4,
                  }}
                >
                  {t.requestSection}
                </div>
                <div
                  style={{
                    fontSize: 13,
                    color: "#78350f",
                    marginBottom: 18,
                    lineHeight: 1.5,
                  }}
                >
                  {t.requestDesc}
                </div>
                <div style={{ display: "grid", gap: 10 }}>
                  <select
                    value={changesForm.requestType}
                    onChange={(e) =>
                      setChangesForm({
                        ...changesForm,
                        requestType: e.target.value,
                      })
                    }
                    style={{ ...BASE_INPUT, cursor: "pointer" }}
                    onFocus={focusAmber}
                    onBlur={blurReset}
                  >
                    <option value="change">{t.changeTypes.change}</option>
                    <option value="remove">{t.changeTypes.remove}</option>
                    <option value="add">{t.changeTypes.add}</option>
                    <option value="other">{t.changeTypes.other}</option>
                  </select>
                  <input
                    placeholder={t.specificItem}
                    value={changesForm.item}
                    onChange={(e) =>
                      setChangesForm({ ...changesForm, item: e.target.value })
                    }
                    style={{ ...BASE_INPUT }}
                    onFocus={focusAmber}
                    onBlur={blurReset}
                  />
                  <textarea
                    placeholder={t.description}
                    value={changesForm.message}
                    onChange={(e) =>
                      setChangesForm({
                        ...changesForm,
                        message: e.target.value,
                      })
                    }
                    style={{
                      ...BASE_INPUT,
                      minHeight: 100,
                      resize: "vertical",
                    }}
                    onFocus={focusAmber}
                    onBlur={blurReset}
                  />
                  <input
                    placeholder={t.yourName}
                    value={changesForm.contactName}
                    onChange={(e) =>
                      setChangesForm({
                        ...changesForm,
                        contactName: e.target.value,
                      })
                    }
                    style={{ ...BASE_INPUT }}
                    onFocus={focusAmber}
                    onBlur={blurReset}
                  />
                  <input
                    placeholder={t.contactEmail}
                    type="email"
                    value={changesForm.contactEmail}
                    onChange={(e) =>
                      setChangesForm({
                        ...changesForm,
                        contactEmail: e.target.value,
                      })
                    }
                    style={{ ...BASE_INPUT }}
                    onFocus={focusAmber}
                    onBlur={blurReset}
                  />
                  <input
                    placeholder={t.contactPhone}
                    type="tel"
                    value={changesForm.contactPhone}
                    onChange={(e) =>
                      setChangesForm({
                        ...changesForm,
                        contactPhone: e.target.value,
                      })
                    }
                    style={{ ...BASE_INPUT }}
                    onFocus={focusAmber}
                    onBlur={blurReset}
                  />
                  {formError && (
                    <div
                      style={{
                        fontSize: 13,
                        color: "#dc2626",
                        padding: "9px 12px",
                        background: "#fef2f2",
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                      }}
                    >
                      {formError}
                    </div>
                  )}
                  <button
                    type="button"
                    onClick={submitChanges}
                    disabled={submitting}
                    style={{
                      padding: "14px 20px",
                      borderRadius: 10,
                      border: "none",
                      background: "#b45309",
                      color: "white",
                      fontSize: 15,
                      fontWeight: 600,
                      cursor: submitting ? "not-allowed" : "pointer",
                      fontFamily: "inherit",
                      opacity: submitting ? 0.7 : 1,
                      transition: "background 0.15s",
                      letterSpacing: "-0.01em",
                    }}
                  >
                    {submitting ? t.sending : t.sendRequest}
                  </button>
                </div>
              </div>
            )}

            {/* ── Footer ───────────────────────────────────────────────────── */}
            <div
              style={{
                padding: "14px 32px",
                textAlign: "center",
                color: "#94a3b8",
                fontSize: 12,
              }}
            >
              {t.footer}
              {company.websiteUrl && (
                <>
                  {" · "}
                  <a
                    href={company.websiteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: "#94a3b8", textDecoration: "underline" }}
                  >
                    {company.websiteUrl.replace(/^https?:\/\//, "")}
                  </a>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
