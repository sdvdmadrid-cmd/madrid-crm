"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  buildIndustryWebsiteDefaults,
  getWebsiteBuilderPack,
  sanitizeIndustryWebsiteContent,
} from "@/lib/website-builder-industry";
import DeployBuildBadge from "@/components/workspace/DeployBuildBadge";
import HeroImageEditor from "./HeroImageEditor";
import WebsiteBuilderPreview from "./WebsiteBuilderPreview";
import { WEBSITE_BUILDER_UI } from "./website-builder-ui";
import styles from "./website-builder.module.css";

const MAX_GALLERY_IMAGES = 8;
const MAX_GALLERY_IMAGE_SIZE = 3 * 1024 * 1024;
const IMAGE_STYLES = [
  { id: "realistic", label: "Realistic" },
  { id: "bright", label: "Bright & clean" },
  { id: "dramatic", label: "Dramatic lighting" },
];

const DEFAULT_OPEN = {
  hero: true,
  heroImages: true,
  brand: true,
  services: true,
  gallery: false,
  trust: false,
  social: false,
};

const AUTOSAVE_MS = 2200;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read image"));
    reader.readAsDataURL(file);
  });
}

function useUiLanguage() {
  const [lang, setLang] = useState("en");
  useEffect(() => {
    try {
      const stored = localStorage.getItem("ui_language") || "en";
      if (stored in WEBSITE_BUILDER_UI) setLang(stored);
    } catch {
      /* noop */
    }
  }, []);
  return WEBSITE_BUILDER_UI[lang] || WEBSITE_BUILDER_UI.en;
}

function CollapsibleSection({ title, open, onToggle, children }) {
  return (
    <div className={styles.section}>
      <button type="button" className={styles.sectionHead} onClick={onToggle}>
        <span>{title}</span>
        <span aria-hidden>{open ? "−" : "+"}</span>
      </button>
      {open ? <div className={styles.sectionBody}>{children}</div> : null}
    </div>
  );
}

export default function WebsiteBuilderClient() {
  const t = useUiLanguage();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [featureAiDescription, setFeatureAiDescription] = useState(true);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingSlotId, setGeneratingSlotId] = useState("");
  const [regeneratingSection, setRegeneratingSection] = useState("");
  const [industryMismatch, setIndustryMismatch] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autosaveTimer = useRef(null);
  const formRef = useRef(null);
  const skipAutosave = useRef(true);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageStyle, setImageStyle] = useState("realistic");
  const [saving, setSaving] = useState(false);
  const [publishing, setPublishing] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [mobileTab, setMobileTab] = useState("edit");
  const [device, setDevice] = useState("desktop");
  const [openSections, setOpenSections] = useState(DEFAULT_OPEN);
  const [slug, setSlug] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [industryKey, setIndustryKey] = useState("landscaping_hardscaping");
  const [industryLabel, setIndustryLabel] = useState("");
  const [industryIcon, setIndustryIcon] = useState("🌿");
  const [themePresets, setThemePresets] = useState([]);
  const [imagePresets, setImagePresets] = useState([]);
  const [requestServices, setRequestServices] = useState([]);
  const [ctaOptions, setCtaOptions] = useState([]);
  const [form, setForm] = useState({
    headline: "",
    subheadline: "",
    aboutText: "",
    ctaText: "",
    themeColor: "#16a34a",
    galleryPhotos: [],
    heroPhotos: [],
    services: [],
    testimonials: [],
    trustBadges: [],
    socialLinks: {
      facebook: "",
      instagram: "",
      yelp: "",
      tiktok: "",
      linkedin: "",
      google: "",
    },
    analytics: {
      ga4MeasurementId: "",
      plausibleDomain: "",
      metaPixelId: "",
      gtmContainerId: "",
    },
  });
  const [customDomain, setCustomDomain] = useState("");
  const [domainHint, setDomainHint] = useState("");

  const showNotice = useCallback((msg, isError = false) => {
    if (isError) setError(msg);
    else setNotice(msg);
    setTimeout(() => {
      setError("");
      setNotice("");
    }, 4000);
  }, []);

  const toggleSection = useCallback((key) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  }, []);

  const applyApiPayload = useCallback((data) => {
    setSlug(data.slug || "");
    setPublicUrl(data.publicUrl || "");
    setPublished(data.published === true);
    setCompanyProfile(data.companyProfile || null);
    setIndustryKey(data.industry || "landscaping_hardscaping");
    setIndustryLabel(data.industryLabel || "");
    setIndustryIcon(data.industryIcon || "🏗️");
    setThemePresets(Array.isArray(data.themePresets) ? data.themePresets : []);
    setImagePresets(Array.isArray(data.imagePresets) ? data.imagePresets : []);
    setRequestServices(
      Array.isArray(data.requestServices) ? data.requestServices : [],
    );
    setCtaOptions(Array.isArray(data.ctaOptions) ? data.ctaOptions : []);
    setForm({
      headline: data.headline || "",
      subheadline: data.subheadline || "",
      aboutText: data.aboutText || "",
      ctaText: data.ctaText || "",
      themeColor: data.themeColor || "#16a34a",
      galleryPhotos: Array.isArray(data.galleryPhotos) ? data.galleryPhotos : [],
      heroPhotos: Array.isArray(data.heroPhotos) ? data.heroPhotos : [],
      services: Array.isArray(data.services) ? data.services : [],
      testimonials: Array.isArray(data.testimonials) ? data.testimonials : [],
      trustBadges: Array.isArray(data.trustBadges) ? data.trustBadges : [],
      socialLinks: data.socialLinks || {
        facebook: "",
        instagram: "",
        yelp: "",
        tiktok: "",
        linkedin: "",
        google: "",
      },
      analytics: data.analytics || {
        ga4MeasurementId: "",
        plausibleDomain: "",
        metaPixelId: "",
        gtmContainerId: "",
      },
    });
    setIndustryMismatch(data.industryMismatch === true);
    skipAutosave.current = true;
  }, []);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  useEffect(() => {
    apiFetch("/api/website-builder")
      .then((res) => getJsonOrThrow(res, "Load failed"))
      .then(({ data }) => applyApiPayload(data))
      .catch((err) => setError(err.message || "Load failed"))
      .finally(() => setLoading(false));

    apiFetch("/api/website-builder/domain")
      .then((res) => getJsonOrThrow(res, "Domain load failed"))
      .then(({ data }) => {
        setCustomDomain(data?.domain?.hostname || "");
        setDomainHint(data?.dnsHint || "");
      })
      .catch(() => {});
  }, [applyApiPayload]);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/api/feature-flags", { suppressUnauthorizedEvent: true })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (cancelled || !payload?.success || !payload?.data) return;
        if (typeof payload.data.featureAiDescription === "boolean") {
          setFeatureAiDescription(payload.data.featureAiDescription);
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const handleSave = useCallback(
    async (data, options = {}) => {
      const { silent = false } = options;
      setSaving(true);
      if (!silent) setError("");
      try {
        const pack = getWebsiteBuilderPack(industryKey);
        const sanitized = sanitizeIndustryWebsiteContent(data, pack, companyProfile || {});
        const res = await apiFetch("/api/website-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            ...data,
            ...sanitized,
            heroPhotos: data.heroPhotos,
            galleryPhotos: data.galleryPhotos,
          }),
        });
        const payload = await res.json().catch(() => null);
        if (!res.ok) {
          throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
        }
        if (payload?.data) applyApiPayload(payload.data);
        if (silent) {
          setAutoSaved(true);
          setTimeout(() => setAutoSaved(false), 2000);
        } else {
          showNotice(t.savedNotice);
        }
      } catch (err) {
        if (!silent) showNotice(err.message || t.errorSave, true);
      } finally {
        setSaving(false);
      }
    },
    [t, showNotice, applyApiPayload, industryKey, companyProfile],
  );

  useEffect(() => {
    if (loading) return;
    if (skipAutosave.current) {
      skipAutosave.current = false;
      return;
    }
    if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    autosaveTimer.current = setTimeout(() => {
      handleSave(formRef.current, { silent: true });
    }, AUTOSAVE_MS);
    return () => {
      if (autosaveTimer.current) clearTimeout(autosaveTimer.current);
    };
  }, [form, loading, handleSave]);

  const handleApplyIndustryPreset = useCallback(() => {
    const pack = getWebsiteBuilderPack(industryKey);
    const defaults = buildIndustryWebsiteDefaults(pack, companyProfile || {});
    const nextForm = {
      headline: defaults.headline,
      subheadline: defaults.subheadline,
      aboutText: defaults.aboutText,
      ctaText: defaults.ctaText,
      themeColor: defaults.themeColor,
      services: defaults.services.map((s) => ({ ...s })),
      testimonials: defaults.testimonials.map((x) => ({ ...x })),
      trustBadges: [...defaults.trustBadges],
      heroPhotos: defaults.heroPhotos.map((h) => ({ ...h })),
      galleryPhotos: formRef.current?.galleryPhotos || [],
    };
    setForm((prev) => ({ ...prev, ...nextForm }));
    setIndustryMismatch(false);
    showNotice(t.presetApplied);
    handleSave({ ...formRef.current, ...nextForm });
  }, [industryKey, companyProfile, showNotice, t.presetApplied, handleSave]);

  const handleGenerateSection = useCallback(
    async (section) => {
      setRegeneratingSection(section);
      try {
        const catalogServices = (form.services || []).slice(0, 20).map((s) => ({
          name: s?.name || "",
          description: s?.description || "",
        }));
        const res = await apiFetch("/api/website-builder/generate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ services: catalogServices, section }),
        });
        const payload = await getJsonOrThrow(res, t.errorGenerate);
        const d = payload.data || {};
        setForm((prev) => ({
          ...prev,
          ...(d.headline ? { headline: d.headline } : {}),
          ...(d.subheadline ? { subheadline: d.subheadline } : {}),
          ...(d.aboutText ? { aboutText: d.aboutText } : {}),
          ...(d.ctaText ? { ctaText: d.ctaText } : {}),
          ...(d.themeColor ? { themeColor: d.themeColor } : {}),
          ...(d.services?.length ? { services: d.services } : {}),
          ...(d.testimonials?.length ? { testimonials: d.testimonials } : {}),
          ...(d.trustBadges?.length ? { trustBadges: d.trustBadges } : {}),
        }));
        setIndustryMismatch(false);
        showNotice(t.savedNotice);
      } catch (err) {
        showNotice(err.message || t.errorGenerate, true);
      } finally {
        setRegeneratingSection("");
      }
    },
    [form.services, t, showNotice],
  );

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError("");
    try {
      const catalogServices = (form.services || []).slice(0, 20).map((s) => ({
        name: s?.name || "",
        description: s?.description || "",
      }));
      const res = await apiFetch("/api/website-builder/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ services: catalogServices }),
      });
      const payload = await getJsonOrThrow(res, t.errorGenerate);
      const d = payload.data || {};
      setForm((prev) => ({
        ...prev,
        headline: d.headline || prev.headline,
        subheadline: d.subheadline || prev.subheadline,
        aboutText: d.aboutText || prev.aboutText,
        ctaText: d.ctaText || prev.ctaText,
        themeColor: d.themeColor || prev.themeColor,
        services: d.services?.length ? d.services : prev.services,
        testimonials: d.testimonials?.length ? d.testimonials : prev.testimonials,
        trustBadges: d.trustBadges?.length ? d.trustBadges : prev.trustBadges,
      }));
      setIndustryMismatch(false);
      setMobileTab("preview");
    } catch (err) {
      showNotice(err.message || t.errorGenerate, true);
    } finally {
      setGenerating(false);
    }
  }, [form.services, t, showNotice]);

  const handleGenerateHeroSlot = useCallback(
    async (index) => {
      const slots = form.heroPhotos || [];
      const slot = slots[index];
      if (!slot) return;
      const prompt = String(slot.prompt || imagePresets[index] || "").trim();
      if (!prompt) {
        showNotice(t.errorGenerateImage, true);
        return;
      }
      setGeneratingSlotId(slot.id);
      try {
        const res = await apiFetch("/api/website-builder/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, style: imageStyle }),
        });
        const payload = await getJsonOrThrow(res, t.errorGenerateImage);
        const imageDataUrl = String(payload?.data?.imageDataUrl || "");
        if (!imageDataUrl.startsWith("data:image/")) throw new Error(t.errorGenerateImage);
        setForm((prev) => {
          const next = [...(prev.heroPhotos || [])];
          next[index] = {
            ...next[index],
            src: imageDataUrl,
            alt: String(payload?.data?.alt || prompt).slice(0, 160),
            prompt,
          };
          return { ...prev, heroPhotos: next };
        });
        showNotice(t.savedNotice);
      } catch (err) {
        showNotice(err.message || t.errorGenerateImage, true);
      } finally {
        setGeneratingSlotId("");
      }
    },
    [form.heroPhotos, imagePresets, imageStyle, showNotice, t],
  );

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

  const handleGalleryUpload = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      if (event.target) event.target.value = "";
      if (!files.length) return;
      try {
        const slots = Math.max(0, MAX_GALLERY_IMAGES - form.galleryPhotos.length);
        const uploaded = [];
        for (const file of files.slice(0, slots)) {
          if (!file.type.startsWith("image/")) throw new Error("Images only.");
          if (file.size > MAX_GALLERY_IMAGE_SIZE) throw new Error("Max 3MB per image.");
          uploaded.push({
            src: await fileToDataUrl(file),
            alt: file.name.replace(/\.[^.]+$/, "").slice(0, 160),
          });
        }
        setForm((prev) => ({
          ...prev,
          galleryPhotos: [...prev.galleryPhotos, ...uploaded].slice(0, MAX_GALLERY_IMAGES),
        }));
      } catch (err) {
        showNotice(err.message || t.errorSave, true);
      }
    },
    [form.galleryPhotos.length, showNotice, t.errorSave],
  );

  const handleGenerateImage = useCallback(
    async (promptOverride = "") => {
      const prompt = String(promptOverride || imagePrompt || "").trim();
      if (!prompt) {
        showNotice(t.errorGenerateImage, true);
        return;
      }
      if (form.galleryPhotos.length >= MAX_GALLERY_IMAGES) {
        showNotice(`Max ${MAX_GALLERY_IMAGES} photos.`, true);
        return;
      }
      setGeneratingImage(true);
      try {
        const res = await apiFetch("/api/website-builder/generate-image", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ prompt, style: imageStyle }),
        });
        const payload = await getJsonOrThrow(res, t.errorGenerateImage);
        const imageDataUrl = String(payload?.data?.imageDataUrl || "");
        if (!imageDataUrl.startsWith("data:image/")) throw new Error(t.errorGenerateImage);
        setForm((prev) => ({
          ...prev,
          galleryPhotos: [
            ...prev.galleryPhotos,
            { src: imageDataUrl, alt: String(payload?.data?.alt || prompt).slice(0, 160) },
          ].slice(0, MAX_GALLERY_IMAGES),
        }));
        setImagePrompt("");
        showNotice(t.savedNotice);
      } catch (err) {
        showNotice(err.message || t.errorGenerateImage, true);
      } finally {
        setGeneratingImage(false);
      }
    },
    [form.galleryPhotos.length, imagePrompt, imageStyle, showNotice, t],
  );

  const setGalleryAlt = useCallback((index, value) => {
    setForm((prev) => {
      const next = [...prev.galleryPhotos];
      next[index] = { ...next[index], alt: value.slice(0, 160) };
      return { ...prev, galleryPhotos: next };
    });
  }, []);

  const removeGalleryPhoto = useCallback((index) => {
    setForm((prev) => ({
      ...prev,
      galleryPhotos: prev.galleryPhotos.filter((_, i) => i !== index),
    }));
  }, []);

  const siteUrl = publicUrl || (slug ? `/site/${slug}` : null);
  const requestUrl = slug ? `/site/${slug}/request` : "#preview-request-form";
  const theme = form.themeColor || "#3b82f6";
  const frameClass =
    device === "tablet"
      ? styles.previewFrameTablet
      : device === "mobile"
        ? styles.previewFrameMobile
        : "";

  if (loading) {
    return (
      <div style={{ padding: 48, textAlign: "center", color: "#94a3b8" }}>Loading…</div>
    );
  }

  return (
    <div className={styles.shell} style={{ "--wb-theme": theme }}>
      <div className={styles.topBar}>
        <div className={styles.titleBlock}>
          <div className={styles.eyebrow}>
            <Link href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>
              {t.breadcrumbHome}
            </Link>
            {" / "}
            {t.title}
          </div>
          <h1>{t.title}</h1>
          <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#94a3b8", maxWidth: 520 }}>
            {t.subtitle}
          </p>
        </div>
        <div className={styles.actions}>
          <span
            className={`${styles.badge} ${published ? styles.badgePub : styles.badgeDraft}`}
          >
            {published ? `🟢 ${t.publishedBadge}` : `⚪ ${t.draftBadge}`}
          </span>
          {slug ? (
            <Link href="/website?tab=preview" className={`${styles.btn} ${styles.btnGhost}`}>
              {t.viewPrivatePreview}
            </Link>
          ) : null}
          {siteUrl && published ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnGhost}`}
            >
              {t.viewSite} ↗
            </a>
          ) : null}
          {featureAiDescription ? (
            <button
              type="button"
              className={`${styles.btn} ${styles.btnAi}`}
              disabled={generating}
              onClick={handleGenerate}
            >
              {generating ? t.generating : t.generate}
            </button>
          ) : null}
          <button
            type="button"
            className={`${styles.btn} ${styles.btnSave}`}
            disabled={saving}
            onClick={() => handleSave(form)}
          >
            {saving ? t.saving : t.save}
          </button>
          <button
            type="button"
            className={`${styles.btn} ${published ? styles.btnUnpub : styles.btnPub}`}
            disabled={publishing}
            onClick={handlePublishToggle}
          >
            {publishing ? t.publishing : published ? t.unpublish : t.publish}
          </button>
        </div>
      </div>

      <div className={styles.industryBanner}>
        <div>
          <div className={styles.industryLabel}>
            {industryIcon} {industryLabel || t.industryPack}
          </div>
          <div className={styles.industryMeta}>
            Copy, colors, gallery prompts, and forms adapt to this trade automatically.
          </div>
        </div>
        <button
          type="button"
          className={`${styles.btn} ${styles.btnGhost}`}
          onClick={handleApplyIndustryPreset}
        >
          {t.applyPreset}
        </button>
      </div>

      <div className={styles.mobileTabs}>
        <button
          type="button"
          className={`${styles.mobileTab} ${mobileTab === "edit" ? styles.mobileTabActive : ""}`}
          onClick={() => setMobileTab("edit")}
        >
          {t.editLabel}
        </button>
        <button
          type="button"
          className={`${styles.mobileTab} ${mobileTab === "preview" ? styles.mobileTabActive : ""}`}
          onClick={() => setMobileTab("preview")}
        >
          {t.previewLabel}
        </button>
      </div>

      <div className={styles.workspace}>
        <div
          className={`${styles.editor} ${mobileTab === "preview" ? styles.editorHide : ""}`}
        >
          {notice ? <div className={styles.notice}>{notice}</div> : null}
          {error ? <div className={styles.error}>{error}</div> : null}
          {autoSaved ? <div className={styles.savePulse}>{t.savedAuto}</div> : null}

          {industryMismatch ? (
            <div className={styles.mismatchBanner}>
              {t.industryMismatch}
              <div>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnAi}`}
                  disabled={generating}
                  onClick={handleGenerate}
                >
                  {generating ? t.generating : t.generate}
                </button>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnGhost}`}
                  style={{ marginLeft: 8 }}
                  onClick={handleApplyIndustryPreset}
                >
                  {t.fixMismatch}
                </button>
              </div>
            </div>
          ) : null}

          {slug ? (
            <div className={styles.slugRow}>
              <span style={{ color: "#94a3b8", fontWeight: 600 }}>{t.slugLabel}</span>
              <span className={styles.slugUrl}>
                {published
                  ? publicUrl ||
                    `${typeof window !== "undefined" ? window.location.origin : ""}/site/${slug}`
                  : `${typeof window !== "undefined" ? window.location.origin : ""}/website`}
              </span>
            </div>
          ) : null}

          {!published ? <div className={styles.hintBox}>{t.draftPrivateHint}</div> : null}

          {featureAiDescription ? (
            <div className={styles.aiCard}>
              <div className={styles.aiCardTitle}>✨ AI Website Generator</div>
              <div className={styles.aiCardHint}>{t.generateHint}</div>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAi}`}
                disabled={generating}
                onClick={handleGenerate}
              >
                {generating ? t.generating : t.generate}
              </button>
            </div>
          ) : null}

          <CollapsibleSection
            title={t.sectionHeroImages}
            open={openSections.heroImages}
            onToggle={() => toggleSection("heroImages")}
          >
            {featureAiDescription ? (
              <HeroImageEditor
                slots={form.heroPhotos || []}
                imagePresets={imagePresets}
                imageStyle={imageStyle}
                onImageStyleChange={setImageStyle}
                onSlotsChange={(heroPhotos) => setField("heroPhotos", heroPhotos)}
                onGenerateSlot={handleGenerateHeroSlot}
                generatingSlotId={generatingSlotId}
                labels={{
                  imageStyleLabel: t.imageStyleLabel,
                  dropHint: t.dropHint,
                  promptPlaceholder: t.promptPlaceholder,
                  regenerate: t.regenerate,
                  upload: t.upload,
                  remove: t.remove,
                  usePreset: t.usePreset,
                  generating: t.generatingImage,
                }}
              />
            ) : (
              <p className={styles.hintBox}>{t.galleryHint}</p>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t.sectionHero}
            open={openSections.hero}
            onToggle={() => toggleSection("hero")}
          >
            <div className={styles.aiRow} style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAi}`}
                disabled={regeneratingSection === "hero"}
                onClick={() => handleGenerateSection("hero")}
              >
                {regeneratingSection === "hero" ? t.generating : t.regenerateHero}
              </button>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t.sectionHeadline}</label>
              <input
                className={styles.input}
                value={form.headline}
                maxLength={200}
                onChange={(e) => setField("headline", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t.sectionSub}</label>
              <input
                className={styles.input}
                value={form.subheadline}
                maxLength={300}
                onChange={(e) => setField("subheadline", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t.sectionAbout}</label>
              <textarea
                className={styles.textarea}
                rows={4}
                value={form.aboutText}
                maxLength={2000}
                onChange={(e) => setField("aboutText", e.target.value)}
              />
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t.sectionBrand}
            open={openSections.brand}
            onToggle={() => toggleSection("brand")}
          >
            <div className={styles.field}>
              <label className={styles.label}>{t.sectionCta}</label>
              <input
                className={styles.input}
                list="wb-cta-options"
                value={form.ctaText}
                maxLength={100}
                onChange={(e) => setField("ctaText", e.target.value)}
              />
              <datalist id="wb-cta-options">
                {ctaOptions.map((opt) => (
                  <option key={opt} value={opt} />
                ))}
              </datalist>
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t.sectionTheme}</label>
              <div className={styles.themeSwatches}>
                {themePresets.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    className={`${styles.swatch} ${form.themeColor === p.value ? styles.swatchSelected : ""}`}
                    style={{ background: p.value }}
                    title={p.label}
                    onClick={() => setField("themeColor", p.value)}
                  />
                ))}
                <input
                  type="color"
                  value={form.themeColor}
                  onChange={(e) => setField("themeColor", e.target.value)}
                  style={{ width: 34, height: 34, border: "none", cursor: "pointer" }}
                />
              </div>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t.sectionServices}
            open={openSections.services}
            onToggle={() => toggleSection("services")}
          >
            <div className={styles.aiRow} style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAi}`}
                disabled={regeneratingSection === "services"}
                onClick={() => handleGenerateSection("services")}
              >
                {regeneratingSection === "services" ? t.generating : t.regenerateServices}
              </button>
            </div>
            {form.services.map((service, i) => (
              <div key={i} className={styles.serviceRow}>
                <div className={styles.serviceHead}>
                  <span className={styles.serviceNum}>#{i + 1}</span>
                  <button
                    type="button"
                    className={styles.linkDanger}
                    onClick={() => removeService(i)}
                  >
                    {t.removeService}
                  </button>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t.serviceNameLabel}</label>
                  <input
                    className={styles.input}
                    value={service.name}
                    onChange={(e) => setServiceField(i, "name", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t.serviceDescLabel}</label>
                  <input
                    className={styles.input}
                    value={service.description}
                    onChange={(e) => setServiceField(i, "description", e.target.value)}
                  />
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t.servicePriceLabel}</label>
                  <input
                    className={styles.input}
                    value={service.price || ""}
                    onChange={(e) => setServiceField(i, "price", e.target.value)}
                  />
                </div>
              </div>
            ))}
            {form.services.length < 12 ? (
              <button type="button" className={styles.addBtn} onClick={addService}>
                {t.addService}
              </button>
            ) : null}
          </CollapsibleSection>

          <CollapsibleSection
            title={t.sectionGallery}
            open={openSections.gallery}
            onToggle={() => toggleSection("gallery")}
          >
            {featureAiDescription ? (
              <>
                <div className={styles.label}>{t.aiImagePresetsLabel}</div>
                <div className={styles.presetRow}>
                  {imagePresets.map((preset) => (
                    <div key={preset} className={styles.presetItem}>
                      <div className={styles.presetText}>{preset}</div>
                      <div className={styles.presetActions}>
                        <button
                          type="button"
                          className={styles.chip}
                          onClick={() => setImagePrompt(preset.slice(0, 320))}
                        >
                          {t.aiImageUseOnly}
                        </button>
                        <button
                          type="button"
                          className={styles.chipGen}
                          disabled={generatingImage}
                          onClick={() => {
                            setImagePrompt(preset.slice(0, 320));
                            handleGenerateImage(preset);
                          }}
                        >
                          {generatingImage ? t.generatingImage : t.aiImageUseAndGenerate}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t.imageStyleLabel}</label>
                  <select
                    className={styles.select}
                    value={imageStyle}
                    onChange={(e) => setImageStyle(e.target.value)}
                  >
                    {IMAGE_STYLES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className={styles.field}>
                  <label className={styles.label}>{t.aiImagePromptLabel}</label>
                  <input
                    className={styles.input}
                    value={imagePrompt}
                    maxLength={320}
                    placeholder={t.aiImagePromptPlaceholder}
                    onChange={(e) => setImagePrompt(e.target.value)}
                  />
                  <p style={{ fontSize: "0.72rem", color: "#94a3b8", marginTop: 6 }}>
                    {t.aiImageHint}
                  </p>
                </div>
                <button
                  type="button"
                  className={`${styles.btn} ${styles.btnAi}`}
                  disabled={generatingImage}
                  onClick={() => handleGenerateImage()}
                >
                  {generatingImage ? t.generatingImage : t.generateImage}
                </button>
              </>
            ) : null}
            <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: "14px 0 8px" }}>
              {t.galleryHint}
            </p>
            <label className={styles.addBtn} style={{ display: "block", cursor: "pointer" }}>
              {t.addGalleryPhotos}
              <input
                type="file"
                accept="image/*"
                multiple
                style={{ display: "none" }}
                onChange={handleGalleryUpload}
              />
            </label>
            {form.galleryPhotos.length === 0 ? (
              <p style={{ fontSize: "0.78rem", color: "#64748b" }}>{t.galleryEmpty}</p>
            ) : (
              <div className={styles.galleryGrid}>
                {form.galleryPhotos.map((photo, index) => (
                  <div key={`g-${index}`} className={styles.galleryCard}>
                    <img src={photo.src} alt="" className={styles.galleryPhoto} />
                    <div className={styles.galleryMeta}>
                      <input
                        className={styles.input}
                        value={photo.alt || ""}
                        onChange={(e) => setGalleryAlt(index, e.target.value)}
                      />
                      <button
                        type="button"
                        className={styles.linkDanger}
                        onClick={() => removeGalleryPhoto(index)}
                      >
                        {t.removeService}
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CollapsibleSection>

          <CollapsibleSection
            title={t.sectionSocial}
            open={openSections.social !== false}
            onToggle={() => toggleSection("social")}
          >
            {["facebook", "instagram", "yelp", "google"].map((key) => (
              <div key={key} className={styles.field}>
                <label className={styles.label}>
                  {key === "facebook"
                    ? t.socialFacebook
                    : key === "instagram"
                      ? t.socialInstagram
                      : key === "yelp"
                        ? t.socialYelp
                        : t.socialGoogle}
                </label>
                <input
                  className={styles.input}
                  type="url"
                  value={form.socialLinks?.[key] || ""}
                  placeholder="https://"
                  onChange={(e) =>
                    setField("socialLinks", {
                      ...form.socialLinks,
                      [key]: e.target.value,
                    })
                  }
                />
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Analytics & tracking"
            open={openSections.analytics !== false}
            onToggle={() => toggleSection("analytics")}
          >
            {[
              ["ga4MeasurementId", "Google Analytics 4 (G-XXXXXXXX)"],
              ["plausibleDomain", "Plausible domain (yourcompany.com)"],
              ["metaPixelId", "Meta Pixel ID"],
              ["gtmContainerId", "Google Tag Manager (GTM-XXXX)"],
            ].map(([key, label]) => (
              <div key={key} className={styles.field}>
                <label className={styles.label}>{label}</label>
                <input
                  className={styles.input}
                  value={form.analytics?.[key] || ""}
                  onChange={(e) =>
                    setField("analytics", {
                      ...form.analytics,
                      [key]: e.target.value,
                    })
                  }
                />
              </div>
            ))}
          </CollapsibleSection>

          <CollapsibleSection
            title="Custom domain"
            open={openSections.domain === true}
            onToggle={() => toggleSection("domain")}
          >
            <div className={styles.field}>
              <label className={styles.label}>Your domain (e.g. mycleaningcompany.com)</label>
              <input
                className={styles.input}
                value={customDomain}
                onChange={(e) => setCustomDomain(e.target.value)}
                placeholder="mycleaningcompany.com"
              />
            </div>
            {domainHint ? (
              <p className={styles.hintBox} style={{ marginBottom: 10 }}>
                DNS: {domainHint}
              </p>
            ) : null}
            <div className={styles.aiRow}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                onClick={async () => {
                  const res = await apiFetch("/api/website-builder/domain", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "register", hostname: customDomain }),
                  });
                  const json = await getJsonOrThrow(res, "Domain registration failed");
                  setDomainHint(json?.data?.dnsHint || "");
                  showNotice("Domain registered. Add the DNS TXT record, then verify.");
                }}
              >
                Register domain
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnPrimary}`}
                onClick={async () => {
                  const res = await apiFetch("/api/website-builder/domain", {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({ action: "verify", hostname: customDomain }),
                  });
                  await getJsonOrThrow(res, "Verification failed");
                  showNotice("Domain verified.");
                }}
              >
                Verify domain
              </button>
            </div>
          </CollapsibleSection>

          <CollapsibleSection
            title={t.sectionTrust}
            open={openSections.trust}
            onToggle={() => toggleSection("trust")}
          >
            <div className={styles.aiRow} style={{ marginBottom: 12 }}>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnAi}`}
                disabled={regeneratingSection === "trust"}
                onClick={() => handleGenerateSection("trust")}
              >
                {regeneratingSection === "trust" ? t.generating : t.regenerateTrust}
              </button>
            </div>
            <div className={styles.trustList}>
              {(form.trustBadges || []).map((badge) => (
                <span key={badge} className={styles.trustChip}>
                  {badge}
                </span>
              ))}
            </div>
            {(form.testimonials || []).map((item, index) => (
              <div key={index} className={styles.serviceRow}>
                <textarea
                  className={styles.textarea}
                  rows={2}
                  value={item.quote}
                  placeholder="Review quote"
                  onChange={(e) => {
                    const next = [...form.testimonials];
                    next[index] = { ...next[index], quote: e.target.value };
                    setField("testimonials", next);
                  }}
                />
                <input
                  className={styles.input}
                  style={{ marginTop: 8 }}
                  value={item.name}
                  placeholder="Name"
                  onChange={(e) => {
                    const next = [...form.testimonials];
                    next[index] = { ...next[index], name: e.target.value };
                    setField("testimonials", next);
                  }}
                />
              </div>
            ))}
          </CollapsibleSection>

          <div className={styles.saveRow}>
            <button
              type="button"
              className={`${styles.btn} ${styles.btnSave}`}
              disabled={saving}
              onClick={() => handleSave(form)}
            >
              {saving ? t.saving : t.save}
            </button>
          </div>
        </div>

        <div
          className={`${styles.previewPanel} ${mobileTab === "preview" ? styles.previewPanelShow : ""}`}
        >
          <div className={styles.previewToolbar}>
            <span style={{ fontSize: "0.78rem", fontWeight: 700, color: "#94a3b8" }}>
              {t.previewLabel}
            </span>
            <div className={styles.deviceGroup}>
              {["desktop", "tablet", "mobile"].map((d) => (
                <button
                  key={d}
                  type="button"
                  className={`${styles.deviceBtn} ${device === d ? styles.deviceBtnActive : ""}`}
                  onClick={() => setDevice(d)}
                >
                  {d === "desktop"
                    ? t.deviceDesktop
                    : d === "tablet"
                      ? t.deviceTablet
                      : t.deviceMobile}
                </button>
              ))}
            </div>
          </div>
          <div className={styles.previewScroll}>
            <div className={`${styles.previewFrame} ${frameClass}`}>
              <WebsiteBuilderPreview
                theme={theme}
                form={form}
                companyProfile={companyProfile}
                industryLabel={industryLabel}
                requestServices={requestServices}
                requestUrl={requestUrl}
                canOpenRequestPage={Boolean(slug)}
                onRequestBlocked={() =>
                  showNotice("Save your website first to enable Send Request.", true)
                }
              />
            </div>
          </div>
        </div>
      </div>
      <DeployBuildBadge className={styles.buildBadge} />
    </div>
  );
}
