"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const THEME_PRESETS = [
  { label: "Green",   value: "#16a34a" },
  { label: "Blue",    value: "#2563eb" },
  { label: "Orange",  value: "#ea580c" },
  { label: "Purple",  value: "#7c3aed" },
  { label: "Red",     value: "#dc2626" },
  { label: "Teal",    value: "#0d9488" },
];

const UI = {
  en: {
    title: "Website Builder",
    subtitle: "Build your contractor website with AI. Publish a professional site in minutes.",
    generate: "Generate with AI",
    generating: "Generating...",
    save: "Save Changes",
    saving: "Saving...",
    publish: "Publish",
    unpublish: "Unpublish",
    publishing: "Updating...",
    viewSite: "View Live Site",
    previewLabel: "Preview",
    editLabel: "Editor",
    sectionHeadline: "Hero Headline",
    sectionSub: "Subheadline",
    sectionAbout: "About Text",
    sectionCta: "CTA Button Text",
    sectionTheme: "Brand Color",
    sectionServices: "Services",
    addService: "+ Add Service",
    removeService: "Remove",
    serviceNameLabel: "Service name",
    serviceDescLabel: "Short description",
    servicePriceLabel: "Price (optional)",
    publishedBadge: "🟢 Published",
    draftBadge: "⚪ Draft",
    generateHint: "AI uses your company profile + services catalog to write the content.",
    savedNotice: "Changes saved.",
    errorGenerate: "AI generation failed. Check OpenAI key.",
    errorSave: "Save failed. Try again.",
    slugLabel: "Your site URL",
    noApiKey: "OpenAI key not configured — you can still edit manually.",
    breadcrumbHome: "Home",
  },
  es: {
    title: "Constructor de Sitio Web",
    subtitle: "Crea tu sitio web con IA. Publica un sitio profesional en minutos.",
    generate: "Generar con IA",
    generating: "Generando...",
    save: "Guardar Cambios",
    saving: "Guardando...",
    publish: "Publicar",
    unpublish: "Despublicar",
    publishing: "Actualizando...",
    viewSite: "Ver Sitio",
    previewLabel: "Vista Previa",
    editLabel: "Editor",
    sectionHeadline: "Titular Principal",
    sectionSub: "Subtítulo",
    sectionAbout: "Acerca de",
    sectionCta: "Texto del Botón CTA",
    sectionTheme: "Color de Marca",
    sectionServices: "Servicios",
    addService: "+ Agregar Servicio",
    removeService: "Eliminar",
    serviceNameLabel: "Nombre del servicio",
    serviceDescLabel: "Descripción corta",
    servicePriceLabel: "Precio (opcional)",
    publishedBadge: "🟢 Publicado",
    draftBadge: "⚪ Borrador",
    generateHint: "La IA usa tu perfil de empresa + catálogo de servicios.",
    savedNotice: "Cambios guardados.",
    errorGenerate: "Falló la generación. Verifica la clave de OpenAI.",
    errorSave: "Error al guardar. Intenta de nuevo.",
    slugLabel: "URL de tu sitio",
    noApiKey: "Clave OpenAI no configurada — puedes editar manualmente.",
    breadcrumbHome: "Inicio",
  },
  pl: {
    title: "Kreator Strony",
    subtitle: "Zbuduj swoją stronę z pomocą AI. Opublikuj profesjonalną stronę w minuty.",
    generate: "Wygeneruj z AI",
    generating: "Generowanie...",
    save: "Zapisz Zmiany",
    saving: "Zapisywanie...",
    publish: "Opublikuj",
    unpublish: "Cofnij publikację",
    publishing: "Aktualizowanie...",
    viewSite: "Zobacz stronę",
    previewLabel: "Podgląd",
    editLabel: "Edytor",
    sectionHeadline: "Główny nagłówek",
    sectionSub: "Podtytuł",
    sectionAbout: "O nas",
    sectionCta: "Tekst przycisku CTA",
    sectionTheme: "Kolor marki",
    sectionServices: "Usługi",
    addService: "+ Dodaj usługę",
    removeService: "Usuń",
    serviceNameLabel: "Nazwa usługi",
    serviceDescLabel: "Krótki opis",
    servicePriceLabel: "Cena (opcjonalnie)",
    publishedBadge: "🟢 Opublikowano",
    draftBadge: "⚪ Wersja robocza",
    generateHint: "AI używa profilu firmy i katalogu usług.",
    savedNotice: "Zmiany zapisane.",
    errorGenerate: "Generowanie nie powiodło się. Sprawdź klucz OpenAI.",
    errorSave: "Nie udało się zapisać. Spróbuj ponownie.",
    slugLabel: "URL Twojej strony",
    noApiKey: "Klucz OpenAI nie skonfigurowany — możesz edytować ręcznie.",
    breadcrumbHome: "Główna",
  },
};

function useUiLanguage() {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ui_language") || "en";
      if (stored in UI) setLang(stored);
    } catch { /* noop */ }
  }, []);
  return UI[lang] || UI.en;
}

export default function WebsiteBuilderPage() {
  const t = useUiLanguage();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [featureAiDescription, setFeatureAiDescription] = useState(true);
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [tab, setTab] = useState("edit"); // "edit" | "preview"
  const [slug, setSlug] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [form, setForm] = useState({
    headline: "",
    subheadline: "",
    aboutText: "",
    ctaText: "",
    themeColor: "#16a34a",
    services: [],
  });

  const saveTimerRef = useRef(null);

  const showNotice = useCallback((msg, isError = false) => {
    if (isError) setError(msg);
    else setNotice(msg);
    setTimeout(() => {
      setError("");
      setNotice("");
    }, 4000);
  }, []);

  // Load website data
  useEffect(() => {
    apiFetch("/api/website-builder")
      .then((res) => getJsonOrThrow(res, "Load failed"))
      .then(({ data }) => {
        setSlug(data.slug || "");
        setPublicUrl(data.publicUrl || "");
        setPublished(data.published === true);
        setCompanyProfile(data.companyProfile || null);
        setForm({
          headline: data.headline || "",
          subheadline: data.subheadline || "",
          aboutText: data.aboutText || "",
          ctaText: data.ctaText || "",
          themeColor: data.themeColor || "#16a34a",
          services: Array.isArray(data.services) ? data.services : [],
        });
      })
      .catch((err) => setError(err.message || "Load failed"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    let cancelled = false;

    apiFetch("/api/feature-flags", { suppressUnauthorizedEvent: true })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled) return;
        if (!payload?.success || !payload?.data) return;
        if (typeof payload.data.featureAiDescription === "boolean") {
          setFeatureAiDescription(payload.data.featureAiDescription);
        }
      })
      .catch(() => {
        // Keep default behavior if flags endpoint is unavailable.
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError("");
    try {
      const catalogServices = (form.services || []).slice(0, 20).map((service) => ({
        name: service?.name || "",
        description: service?.description || "",
      }));

      const res = await apiFetch("/api/website-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: catalogServices }),
      });
      const payload = await getJsonOrThrow(res, t.errorGenerate);
      setForm((prev) => ({
        ...prev,
        headline: payload.data.headline || prev.headline,
        subheadline: payload.data.subheadline || prev.subheadline,
        aboutText: payload.data.aboutText || prev.aboutText,
        ctaText: payload.data.ctaText || prev.ctaText,
        services: payload.data.services?.length ? payload.data.services : prev.services,
      }));
      setTab("preview");
    } catch (err) {
      showNotice(err.message || t.errorGenerate, true);
    } finally {
      setGenerating(false);
    }
  }, [form.services, t, showNotice]);

  const handleSave = useCallback(async (data) => {
    setSaving(true);
    setError("");
    try {
      const res = await apiFetch("/api/website-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        const detail = payload?.error || payload?.message || `HTTP ${res.status}`;
        throw new Error(detail);
      }
      showNotice(t.savedNotice);
    } catch (err) {
      showNotice(err.message || t.errorSave, true);
    } finally {
      setSaving(false);
    }
  }, [t, showNotice]);

  const handlePublishToggle = useCallback(async () => {
    setPublishing(true);
    const newPublished = !published;
    try {
      const res = await apiFetch("/api/website-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, published: newPublished }),
      });
      await getJsonOrThrow(res, t.errorSave);
      setPublished(newPublished);
      showNotice(newPublished ? t.publishedBadge : t.draftBadge);
    } catch (err) {
      showNotice(err.message || t.errorSave, true);
    } finally {
      setPublishing(false);
    }
  }, [published, form, t, showNotice]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
  }, []);

  const setServiceField = useCallback((index, key, value) => {
    setForm((prev) => {
      const next = [...prev.services];
      next[index] = { ...next[index], [key]: value };
      return { ...prev, services: next };
    });
  }, []);

  const addService = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      services: [...prev.services, { name: "", description: "", price: "" }],
    }));
  }, []);

  const removeService = useCallback((index) => {
    setForm((prev) => ({
      ...prev,
      services: prev.services.filter((_, i) => i !== index),
    }));
  }, []);

  const siteUrl = publicUrl || (slug ? `/site/${slug}` : null);
  const theme = form.themeColor || "#16a34a";

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#64748b", fontSize: 16 }}>
        Loading...
      </div>
    );
  }

  return (
    <>
      <style>{`
        .wb-shell { min-height: 100vh; background: #f8fafc; font-family: 'Inter', system-ui, sans-serif; }
        .wb-header { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 0 28px; display: flex; align-items: center; justify-content: space-between; min-height: 64px; gap: 16px; flex-wrap: wrap; }
        .wb-breadcrumb { font-size: 13px; color: #64748b; display: flex; align-items: center; gap: 6px; }
        .wb-breadcrumb a { color: #64748b; text-decoration: none; }
        .wb-breadcrumb a:hover { color: #0f172a; }
        .wb-title { font-weight: 800; font-size: 20px; letter-spacing: -0.5px; color: #0f172a; }
        .wb-header-actions { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; }
        .wb-badge { padding: 4px 12px; border-radius: 999px; font-size: 12px; font-weight: 700; }
        .wb-badge-pub { background: #dcfce7; color: #15803d; }
        .wb-badge-draft { background: #f1f5f9; color: #64748b; }
        .wb-btn { border: none; border-radius: 10px; padding: 10px 18px; font-weight: 700; font-size: 14px; cursor: pointer; transition: filter 0.15s; }
        .wb-btn:disabled { opacity: 0.55; cursor: not-allowed; }
        .wb-btn-ai { background: linear-gradient(135deg, #7c3aed, #4f46e5); color: #fff; }
        .wb-btn-save { background: #0f172a; color: #fff; }
        .wb-btn-pub { background: #16a34a; color: #fff; }
        .wb-btn-unpub { background: #dc2626; color: #fff; }
        .wb-btn-view { background: transparent; border: 1px solid #e2e8f0 !important; color: #0f172a; text-decoration: none; display: inline-flex; align-items: center; gap: 6px; }
        .wb-tabs { background: #fff; border-bottom: 1px solid #e2e8f0; padding: 0 28px; display: flex; gap: 0; }
        .wb-tab { padding: 14px 20px; font-weight: 600; font-size: 14px; cursor: pointer; border: none; background: transparent; color: #64748b; border-bottom: 3px solid transparent; transition: color 0.15s; }
        .wb-tab.active { color: #0f172a; border-bottom-color: var(--theme, #16a34a); }
        .wb-body { display: grid; grid-template-columns: 1fr 1fr; gap: 0; min-height: calc(100vh - 130px); }
        .wb-editor { padding: 32px 28px; overflow-y: auto; border-right: 1px solid #e2e8f0; }
        .wb-preview { overflow-y: auto; background: #fff; }
        .wb-notice { background: #dcfce7; color: #15803d; border-radius: 10px; padding: 12px 18px; font-size: 14px; font-weight: 600; margin-bottom: 16px; }
        .wb-error { background: #fee2e2; color: #b91c1c; border-radius: 10px; padding: 12px 18px; font-size: 14px; font-weight: 600; margin-bottom: 16px; }
        .wb-field { margin-bottom: 24px; }
        .wb-label { font-size: 13px; font-weight: 700; color: #374151; margin-bottom: 6px; display: block; letter-spacing: 0.3px; }
        .wb-input { width: 100%; border: 1px solid #e2e8f0; border-radius: 10px; padding: 11px 14px; font-size: 15px; font-family: inherit; color: #0f172a; background: #fafafa; transition: border-color 0.15s; resize: vertical; }
        .wb-input:focus { outline: none; border-color: var(--theme, #16a34a); background: #fff; }
        .wb-section-title { font-size: 16px; font-weight: 800; color: #0f172a; margin: 32px 0 16px; padding-top: 24px; border-top: 1px solid #e2e8f0; }
        .wb-section-title:first-child { margin-top: 0; border-top: none; padding-top: 0; }
        .theme-swatches { display: flex; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
        .theme-swatch { width: 34px; height: 34px; border-radius: 999px; cursor: pointer; border: 3px solid transparent; transition: transform 0.15s; }
        .theme-swatch:hover { transform: scale(1.15); }
        .theme-swatch.selected { border-color: #0f172a; }
        .service-row { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 12px; padding: 16px; margin-bottom: 12px; position: relative; }
        .service-row-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 12px; }
        .service-num { font-size: 12px; font-weight: 700; color: #94a3b8; }
        .service-remove { font-size: 12px; color: #dc2626; cursor: pointer; background: none; border: none; font-weight: 700; }
        .wb-add-service { width: 100%; padding: 12px; border: 2px dashed #e2e8f0; border-radius: 12px; background: transparent; font-size: 14px; font-weight: 700; color: #64748b; cursor: pointer; transition: border-color 0.15s; }
        .wb-add-service:hover { border-color: var(--theme, #16a34a); color: var(--theme, #16a34a); }
        .wb-slug-row { display: flex; align-items: center; gap: 10px; background: #f1f5f9; border-radius: 10px; padding: 12px 16px; margin-bottom: 24px; }
        .wb-slug-url { font-size: 13px; color: #334155; font-family: monospace; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
        .wb-save-row { display: flex; gap: 10px; margin-top: 32px; flex-wrap: wrap; }
        /* ── Preview styles (mirror public site exactly) ── */
        .preview-nav { background: #1e293b; padding: 12px 20px; display: flex; justify-content: space-between; align-items: center; border-bottom: 1px solid rgba(255,255,255,0.1); position: sticky; top: 0; z-index: 10; }
        .preview-logo { color: #fff; font-weight: 800; font-size: 17px; display: flex; align-items: center; gap: 8px; }
        .preview-logo-icon { width: 28px; height: 28px; border-radius: 6px; background: var(--theme, #1d4ed8); display: flex; align-items: center; justify-content: center; flex-shrink: 0; }
        .preview-nav-links { display: flex; gap: 16px; font-size: 12px; }
        .preview-nav-links span { color: #94a3b8; font-weight: 600; }
        .preview-nav-cta { background: var(--theme, #1d4ed8); color: #fff; border-radius: 6px; padding: 6px 14px; font-size: 12px; font-weight: 700; }
        /* Hero */
        .preview-hero { background: #1e293b; color: #fff; padding: 48px 24px 0; }
        .preview-hero-inner { display: flex; gap: 24px; align-items: flex-start; max-width: 100%; }
        .preview-hero-left { flex: 1.1; padding-bottom: 40px; }
        .preview-badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 5px 12px; margin-bottom: 16px; font-size: 11px; font-weight: 700; background: rgba(29,78,216,0.2); color: #93c5fd; }
        .preview-hero h1 { font-size: clamp(1.5rem, 3.5vw, 2.4rem); font-weight: 900; letter-spacing: -1px; margin-bottom: 14px; line-height: 1.1; }
        .preview-hero-sub { font-size: 14px; color: #94a3b8; line-height: 1.6; margin-bottom: 12px; max-width: 400px; }
        .preview-hero-pill { display: inline-block; background: rgba(29,78,216,0.15); color: #93c5fd; border-radius: 8px; padding: 6px 12px; font-size: 11px; font-weight: 600; margin-bottom: 20px; }
        .preview-hero-actions { display: flex; gap: 10px; flex-wrap: wrap; margin-bottom: 20px; }
        .preview-btn-primary { background: var(--theme, #1d4ed8); color: #fff; border: none; border-radius: 6px; padding: 10px 20px; font-weight: 800; font-size: 13px; cursor: default; }
        .preview-btn-secondary { background: rgba(255,255,255,0.1); color: #fff; border: none; border-radius: 6px; padding: 10px 18px; font-weight: 700; font-size: 13px; cursor: default; }
        .preview-proof { display: flex; gap: 16px; flex-wrap: wrap; }
        .preview-proof-item { display: flex; align-items: center; gap: 6px; }
        .preview-proof-num { font-size: 12px; font-weight: 700; color: #fff; }
        .preview-proof-label { font-size: 11px; color: #64748b; }
        .preview-hero-right { flex: 0.9; display: grid; grid-template-columns: 1fr 1fr; gap: 8px; }
        .preview-photo-card { background: rgba(255,255,255,0.1); border: 1px solid rgba(255,255,255,0.15); border-radius: 10px; aspect-ratio: 16/10; display: flex; align-items: flex-end; padding: 8px; font-size: 10px; color: #e2e8f0; font-weight: 600; }
        /* Stats */
        .preview-stats { background: #1e293b; padding: 20px 24px 48px; }
        .preview-stats-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; }
        .preview-stat-tile { background: #1e3a5f; border-radius: 10px; padding: 14px; text-align: center; }
        .preview-stat-num { font-size: 1.4rem; font-weight: 900; color: #fff; }
        .preview-stat-label { font-size: 11px; color: #64748b; margin-top: 2px; }
        /* Wave */
        .preview-wave { height: 40px; overflow: hidden; position: relative; }
        /* Features grid */
        .preview-features { background: #fff; padding: 48px 24px; }
        .preview-features-title { font-size: 1.6rem; font-weight: 900; color: #1e293b; letter-spacing: -0.8px; text-align: center; margin-bottom: 10px; }
        .preview-features-sub { font-size: 14px; color: #6b7280; text-align: center; margin-bottom: 36px; }
        .preview-features-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; }
        .preview-feat-card { border: 1px solid #e2e8f0; border-radius: 14px; padding: 20px 18px; }
        .preview-feat-top { display: flex; align-items: flex-start; justify-content: space-between; margin-bottom: 12px; }
        .preview-feat-icon { width: 40px; height: 40px; border-radius: 8px; background: var(--theme, #1d4ed8); display: flex; align-items: center; justify-content: center; }
        .preview-feat-badge { font-size: 10px; font-weight: 700; padding: 3px 8px; border-radius: 999px; background: #eff6ff; color: #1d4ed8; }
        .preview-feat-title { font-size: 14px; font-weight: 800; color: #1e293b; margin-bottom: 6px; }
        .preview-feat-desc { font-size: 12px; color: #6b7280; line-height: 1.6; }
        .preview-feat-link { font-size: 12px; font-weight: 700; color: var(--theme, #1d4ed8); margin-top: 12px; }
        /* About */
        .preview-about { background: #eff6ff; padding: 48px 24px; }
        .preview-about h2 { font-size: 1.4rem; font-weight: 900; color: #1e293b; margin-bottom: 14px; }
        .preview-about p { font-size: 14px; line-height: 1.75; color: #334155; }
        /* Testimonials */
        .preview-testimonials { background: #eff6ff; padding: 0 24px 48px; }
        .preview-test-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
        .preview-test-card { background: #fff; border-radius: 16px; padding: 24px; box-shadow: 0 2px 12px rgba(0,0,0,0.05); }
        .preview-test-quote { font-size: 13px; color: #1e293b; line-height: 1.6; margin-bottom: 16px; font-style: italic; }
        .preview-test-author { display: flex; align-items: center; gap: 8px; }
        .preview-test-avatar { width: 32px; height: 32px; border-radius: 999px; background: #1e293b; color: #fff; display: flex; align-items: center; justify-content: center; font-weight: 800; font-size: 13px; }
        .preview-test-name { font-size: 12px; font-weight: 700; color: #1e293b; }
        .preview-test-co { font-size: 11px; color: #6b7280; }
        /* CTA dark */
        .preview-cta-section { background: #1e293b; color: #fff; padding: 56px 24px; text-align: center; }
        .preview-cta-section h2 { font-size: clamp(1.4rem, 3vw, 2rem); font-weight: 900; letter-spacing: -1px; margin-bottom: 14px; }
        .preview-cta-section p { font-size: 14px; color: #94a3b8; margin-bottom: 14px; }
        .preview-cta-phone { font-size: 1.6rem; font-weight: 900; color: #fff; display: block; margin-bottom: 24px; }
        .preview-cta-btn { background: var(--theme, #1d4ed8); color: #fff; border: none; border-radius: 6px; padding: 12px 28px; font-weight: 800; font-size: 15px; cursor: default; }
        .preview-footer { background: #0f172a; color: rgba(255,255,255,0.5); padding: 20px; text-align: center; font-size: 12px; }
        /* Mobile */
        @media (max-width: 900px) {
          .wb-body { grid-template-columns: 1fr; }
          .wb-editor { border-right: none; }
          .wb-preview { display: none; }
          .wb-preview.show { display: block; }
        }
        @media (max-width: 600px) {
          .wb-header { padding: 12px 16px; }
          .wb-tabs { padding: 0 16px; }
          .wb-editor { padding: 20px 16px; }
        }
      `}</style>

      <div className="wb-shell" style={{ "--theme": theme }}>
        {/* Header */}
        <header className="wb-header">
          <div>
            <div className="wb-breadcrumb">
              <a href="/">{t.breadcrumbHome}</a>
              <span>/</span>
              <span>{t.title}</span>
            </div>
            <div className="wb-title">{t.title}</div>
          </div>
          <div className="wb-header-actions">
            <span className={`wb-badge ${published ? "wb-badge-pub" : "wb-badge-draft"}`}>
              {published ? t.publishedBadge : t.draftBadge}
            </span>
            {siteUrl && published && (
              <a
                href={siteUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="wb-btn wb-btn-view"
              >
                {t.viewSite} ↗
              </a>
            )}
            <button
              className={`wb-btn ${published ? "wb-btn-unpub" : "wb-btn-pub"}`}
              disabled={publishing}
              onClick={handlePublishToggle}
            >
              {publishing ? t.publishing : (published ? t.unpublish : t.publish)}
            </button>
          </div>
        </header>

        {/* Tabs */}
        <div className="wb-tabs">
          <button
            className={`wb-tab${tab === "edit" ? " active" : ""}`}
            onClick={() => setTab("edit")}
          >
            {t.editLabel}
          </button>
          <button
            className={`wb-tab${tab === "preview" ? " active" : ""}`}
            onClick={() => setTab("preview")}
          >
            {t.previewLabel}
          </button>
        </div>

        {/* Body */}
        <div className="wb-body">
          {/* Editor panel */}
          <div className="wb-editor" style={{ display: tab === "preview" ? "none" : "block" }}>
            {notice && <div className="wb-notice">{notice}</div>}
            {error && <div className="wb-error">{error}</div>}

            {/* Site URL */}
            {slug && (
              <div className="wb-slug-row">
                <span style={{ fontSize: 13, color: "#64748b", fontWeight: 600 }}>{t.slugLabel}:</span>
                <span className="wb-slug-url">
                  {publicUrl || `${typeof window !== "undefined" ? window.location.origin : ""}/site/${slug}`}
                </span>
                {published && (
                  <a
                    href={siteUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ fontSize: 13, color: theme, fontWeight: 700, textDecoration: "none", whiteSpace: "nowrap" }}
                  >
                    ↗ Open
                  </a>
                )}
              </div>
            )}

            {/* AI generate */}
            {featureAiDescription ? (
              <div style={{ marginBottom: 28, background: "linear-gradient(135deg, #f5f3ff, #ede9fe)", borderRadius: 14, padding: "18px 20px" }}>
                <div style={{ fontSize: 14, fontWeight: 700, color: "#5b21b6", marginBottom: 6 }}>✨ AI Website Generator</div>
                <div style={{ fontSize: 13, color: "#6d28d9", marginBottom: 14 }}>{t.generateHint}</div>
                <button
                  className="wb-btn wb-btn-ai"
                  disabled={generating}
                  onClick={handleGenerate}
                >
                  {generating ? t.generating : t.generate}
                </button>
              </div>
            ) : null}

            {/* Headline */}
            <div className="wb-section-title">{t.sectionHeadline}</div>
            <div className="wb-field">
              <input
                className="wb-input"
                type="text"
                value={form.headline}
                maxLength={200}
                placeholder="Win more jobs. Get paid faster. Stay in control."
                onChange={(e) => setField("headline", e.target.value)}
              />
            </div>

            {/* Subheadline */}
            <div className="wb-section-title">{t.sectionSub}</div>
            <div className="wb-field">
              <input
                className="wb-input"
                type="text"
                value={form.subheadline}
                maxLength={300}
                placeholder="All-in-one platform for contractors, from first estimate to final payment, powered by AI."
                onChange={(e) => setField("subheadline", e.target.value)}
              />
            </div>

            {/* CTA text */}
            <div className="wb-section-title">{t.sectionCta}</div>
            <div className="wb-field">
              <input
                className="wb-input"
                type="text"
                value={form.ctaText}
                maxLength={100}
                placeholder="Start Free - 30 Days"
                onChange={(e) => setField("ctaText", e.target.value)}
              />
            </div>

            {/* About */}
            <div className="wb-section-title">{t.sectionAbout}</div>
            <div className="wb-field">
              <textarea
                className="wb-input"
                rows={5}
                value={form.aboutText}
                maxLength={2000}
                placeholder="FieldBase helps contractors run estimates, jobs, invoices, and follow-ups in one platform."
                onChange={(e) => setField("aboutText", e.target.value)}
              />
            </div>

            {/* Theme color */}
            <div className="wb-section-title">{t.sectionTheme}</div>
            <div className="wb-field">
              <div className="theme-swatches">
                {THEME_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    className={`theme-swatch${form.themeColor === p.value ? " selected" : ""}`}
                    style={{ background: p.value }}
                    title={p.label}
                    onClick={() => setField("themeColor", p.value)}
                  />
                ))}
                <input
                  type="color"
                  value={form.themeColor}
                  onChange={(e) => setField("themeColor", e.target.value)}
                  style={{ width: 34, height: 34, border: "none", padding: 2, borderRadius: 999, cursor: "pointer", background: "transparent" }}
                  title="Custom color"
                />
              </div>
            </div>

            {/* Services */}
            <div className="wb-section-title">{t.sectionServices}</div>
            {form.services.map((service, i) => (
              <div key={i} className="service-row">
                <div className="service-row-header">
                  <span className="service-num">#{i + 1}</span>
                  <button className="service-remove" onClick={() => removeService(i)}>
                    {t.removeService}
                  </button>
                </div>
                <div className="wb-field" style={{ marginBottom: 8 }}>
                  <label className="wb-label" htmlFor={`svc-name-${i}`}>{t.serviceNameLabel}</label>
                  <input
                    id={`svc-name-${i}`}
                    className="wb-input"
                    type="text"
                    value={service.name}
                    maxLength={100}
                    onChange={(e) => setServiceField(i, "name", e.target.value)}
                  />
                </div>
                <div className="wb-field" style={{ marginBottom: 8 }}>
                  <label className="wb-label" htmlFor={`svc-desc-${i}`}>{t.serviceDescLabel}</label>
                  <input
                    id={`svc-desc-${i}`}
                    className="wb-input"
                    type="text"
                    value={service.description}
                    maxLength={400}
                    onChange={(e) => setServiceField(i, "description", e.target.value)}
                  />
                </div>
                <div className="wb-field" style={{ marginBottom: 0 }}>
                  <label className="wb-label" htmlFor={`svc-price-${i}`}>{t.servicePriceLabel}</label>
                  <input
                    id={`svc-price-${i}`}
                    className="wb-input"
                    type="text"
                    value={service.price || ""}
                    maxLength={50}
                    placeholder="Included"
                    onChange={(e) => setServiceField(i, "price", e.target.value)}
                  />
                </div>
              </div>
            ))}
            {form.services.length < 12 && (
              <button className="wb-add-service" onClick={addService}>
                {t.addService}
              </button>
            )}

            {/* Save */}
            <div className="wb-save-row">
              <button
                className="wb-btn wb-btn-save"
                disabled={saving}
                onClick={() => handleSave(form)}
              >
                {saving ? t.saving : t.save}
              </button>
            </div>
          </div>

          {/* Preview panel — mirrors public site/[slug] exactly */}
          <div className={`wb-preview${tab === "preview" ? " show" : ""}`} style={{ display: tab === "edit" ? undefined : "block" }}>
            <div style={{ "--theme": theme }}>

              {/* Nav */}
              <div className="preview-nav">
                <div className="preview-logo">
                  <div className="preview-logo-icon">
                    <svg viewBox="0 0 24 24" fill="none" style={{ width: 14, height: 14 }}>
                      <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                      <path d="M9 22V12h6v10" stroke="#fff" strokeWidth="2" strokeLinejoin="round" />
                    </svg>
                  </div>
                  {companyProfile?.companyName || "Your Company"}
                </div>
                <div className="preview-nav-links">
                  <span>Services</span>
                  <span>About</span>
                  <span>Contact</span>
                </div>
                <span className="preview-nav-cta">
                  {companyProfile?.phone || "Get a Quote"}
                </span>
              </div>

              {/* Hero */}
              <div className="preview-hero">
                <div className="preview-hero-inner">
                  <div className="preview-hero-left">
                    <div className="preview-badge">⭐ Licensed &amp; Insured</div>
                    <h1>{form.headline || "Win more jobs. Get paid faster. Stay in control."}</h1>
                    <p className="preview-hero-sub">{form.subheadline || "Quality services you can count on. Licensed, insured, and trusted by homeowners."}</p>
                    <p className="preview-hero-pill">🎉 Free estimates — same-day response</p>
                    <div className="preview-hero-actions">
                      <button type="button" className="preview-btn-primary" tabIndex={-1}>
                        {form.ctaText || "Get a Free Quote"}
                      </button>
                      <button type="button" className="preview-btn-secondary" tabIndex={-1}>
                        Our Services
                      </button>
                    </div>
                    <div className="preview-proof">
                      <div className="preview-proof-item">
                        <span className="preview-proof-num">📱 4.8 ★★★★★</span>
                        <span className="preview-proof-label">App Store</span>
                      </div>
                      <div className="preview-proof-item">
                        <span className="preview-proof-num">▶️ 4.5 ★★★★½</span>
                        <span className="preview-proof-label">Google Play</span>
                      </div>
                    </div>
                  </div>
                  <div className="preview-hero-right">
                    <div className="preview-photo-card">Professional contractor at work</div>
                    <div className="preview-photo-card">Expert service team</div>
                    <div className="preview-photo-card">Outdoor project completed</div>
                    <div className="preview-photo-card">Construction professionals</div>
                    <div className="preview-photo-card">Skilled tradespeople</div>
                    <div className="preview-photo-card">Home services professional</div>
                  </div>
                </div>
              </div>

              {/* Stats bar */}
              <div className="preview-stats">
                <div className="preview-stats-grid">
                  {[{n:"Free Quote",l:"No obligation"},{n:"Licensed",l:"Fully insured"},{n:"5★",l:"Top-rated"},{n:"Same Day",l:"Fast response"}].map((s) => (
                    <div key={s.n} className="preview-stat-tile">
                      <div className="preview-stat-num">{s.n}</div>
                      <div className="preview-stat-label">{s.l}</div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Wave */}
              <div className="preview-wave" style={{ background: "#fff" }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ position: "absolute", width: "100%", height: "100%" }}>
                  <path d="M0 0 Q300 40 600 20 Q900 0 1200 28 L1200 0 Z" fill="#1e293b" />
                </svg>
              </div>

              {/* Services / Features grid */}
              {form.services.length > 0 && (
                <div className="preview-features">
                  <div className="preview-features-title">Our Services</div>
                  <div className="preview-features-sub">Everything you need — from initial quote to completed project.</div>
                  <div className="preview-features-grid">
                    {form.services.slice(0, 6).map((s, i) => (
                      <div key={i} className="preview-feat-card">
                        <div className="preview-feat-top">
                          <div className="preview-feat-icon">
                            <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ width: 18, height: 18 }}>
                              <path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" />
                            </svg>
                          </div>
                          {s.price && <span className="preview-feat-badge">{s.price}</span>}
                        </div>
                        <div className="preview-feat-title">{s.name || "Service"}</div>
                        {s.description && <div className="preview-feat-desc">{s.description}</div>}
                        <div className="preview-feat-link">Get a quote →</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Wave */}
              <div className="preview-wave" style={{ background: "#eff6ff" }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ position: "absolute", width: "100%", height: "100%" }}>
                  <path d="M0 0 Q300 40 600 20 Q900 0 1200 28 L1200 0 Z" fill="#fff" />
                </svg>
              </div>

              {/* About */}
              {form.aboutText && (
                <div className="preview-about">
                  <h2>About {companyProfile?.companyName || "Us"}</h2>
                  <p>{form.aboutText}</p>
                </div>
              )}

              {/* Testimonials */}
              <div className="preview-testimonials">
                <div className="preview-test-grid">
                  <div className="preview-test-card">
                    <p className="preview-test-quote">&ldquo;They were on time, professional, and did exactly what they promised. Highly recommend.&rdquo;</p>
                    <div className="preview-test-author">
                      <div className="preview-test-avatar">J</div>
                      <div>
                        <div className="preview-test-name">James R.</div>
                        <div className="preview-test-co">Local homeowner</div>
                      </div>
                    </div>
                  </div>
                  <div className="preview-test-card">
                    <p className="preview-test-quote">&ldquo;Fair pricing, great results. This is our go-to company for all future projects.&rdquo;</p>
                    <div className="preview-test-author">
                      <div className="preview-test-avatar">M</div>
                      <div>
                        <div className="preview-test-name">Maria L.</div>
                        <div className="preview-test-co">Repeat customer</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Wave into dark */}
              <div className="preview-wave" style={{ background: "#1e293b" }}>
                <svg viewBox="0 0 1200 40" preserveAspectRatio="none" style={{ position: "absolute", width: "100%", height: "100%" }}>
                  <path d="M0 0 Q300 40 600 20 Q900 0 1200 28 L1200 0 Z" fill="#eff6ff" />
                </svg>
              </div>

              {/* Dark CTA */}
              <div className="preview-cta-section">
                <h2>{companyProfile?.phone ? "Call us today." : "Get your free quote."}<br />We respond fast.</h2>
                <p className="preview-cta-sub">No obligation. Free estimate. Same-day response.</p>
                {companyProfile?.phone && (
                  <span className="preview-cta-phone">{companyProfile.phone}</span>
                )}
                <button type="button" className="preview-cta-btn" tabIndex={-1}>
                  {form.ctaText || "Get a Free Quote"}
                </button>
              </div>

              <div className="preview-footer">
                &copy; {new Date().getFullYear()} {companyProfile?.companyName || "Your Company"}. Powered by{" "}
                <a href="https://fieldbaseapp.net" target="_blank" rel="noopener noreferrer" style={{ color: "rgba(255,255,255,0.7)" }}>FieldBase</a>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
