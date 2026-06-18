"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { resolveWebsiteRequestServices } from "@/lib/website-lead-form";
import {
  applyWebsiteRenderRepairs,
  validateWebsiteRenderPayload,
} from "@/lib/website-builder-render-validation";
import BuilderWorkflowStepper from "@/components/website-builder/BuilderWorkflowStepper";
import PlatformZoneBanner from "@/components/workspace/PlatformZoneBanner";
import { WebsiteBuilderEditProvider } from "@/components/website-builder/WebsiteBuilderEditContext";
import WebsiteBuilderSetupPanel from "@/components/website-builder/WebsiteBuilderSetupPanel";
import WebsiteBuilderLaunch from "@/components/website-builder/WebsiteBuilderLaunch";
import Link from "next/link";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  buildIndustryWebsiteDefaults,
  getWebsiteBuilderPack,
  sanitizeIndustryWebsiteContent,
} from "@/lib/website-builder-industry";
import {
  buildPublicWebsitePath,
} from "@/lib/public-website-routing";
import { analyzeWebsiteCompleteness } from "@/lib/website-builder-generation";
import {
  enhanceWebsiteCopyParallel,
  findWebsiteImageEnhancementPlan,
  isValidWebsiteImageSrc,
  mergeFullSiteIntoDraft,
  mergeWebsiteCopySection,
  requestWebsiteImagesBatch,
  resolveWebsiteImageSrc,
  WEBSITE_COPY_ENHANCE_TIMEOUT_MS,
  WEBSITE_FULL_GENERATE_TIMEOUT_MS,
  WEBSITE_GALLERY_BATCH_DEFAULT,
  WEBSITE_HERO_IMAGE_TIMEOUT_MS,
} from "@/lib/website-builder-client-generation";
import {
  createSaveQueue,
  mergeFormAfterSave,
} from "@/lib/website-builder-save-client";
import {
  MAX_FEATURED_GALLERY,
  MAX_UPLOAD_BATCH,
  buildFeaturedGallery,
  normalizeGalleryPhotos,
  normalizePortfolio,
} from "@/lib/website-gallery";
import { compressImageFile, fileToDataUrl } from "@/lib/website-image-compress";
import WebsiteBuilderPortfolio from "./WebsiteBuilderPortfolio";
import WebsiteMobileUploads from "./WebsiteMobileUploads";
import { useWebsiteBuilderAi } from "@/contexts/WebsiteBuilderAiContext";
import HeroImageEditor from "./HeroImageEditor";
import { resolveCompanyLogoUrl } from "@/lib/resolve-company-logo-url";
import {
  getCompanyDisplayName,
  shouldLockWebsiteIndustry,
} from "@/lib/website-builder-company";
import { purifyWebsiteForm, sanitizeWebsiteTestimonials } from "@/lib/website-content-purity";
import WebsiteBuilderFloatingBar from "./WebsiteBuilderFloatingBar";
import WebsiteBuilderPreview, { SECTION_REGEN_MAP } from "./WebsiteBuilderPreview";
import { WEBSITE_BUILDER_UI } from "./website-builder-ui";
import styles from "./website-builder.module.css";

const MAX_GALLERY_IMAGE_SIZE = 8 * 1024 * 1024;
const IMAGE_STYLES = [
  { id: "realistic", label: "Realistic" },
  { id: "bright", label: "Bright & clean" },
  { id: "dramatic", label: "Dramatic lighting" },
];

const DEFAULT_OPEN = {
  hero: true,
  heroImages: false,
  brand: false,
  services: false,
  gallery: false,
  trust: false,
  social: false,
  analytics: false,
  domain: false,
};

const SECTION_FILTERS = {
  all: null,
  content: ["hero", "brand", "services"],
  images: ["heroImages", "gallery"],
  trust: ["trust"],
  advanced: ["social", "analytics", "domain", "seo"],
};

const AUTOSAVE_MS = 2200;

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
  const wbAi = useWebsiteBuilderAi();
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [genProgress, setGenProgress] = useState("");
  const [editorMode, setEditorMode] = useState("launch");
  const [builderStep, setBuilderStep] = useState(1);
  const isEditingRef = useRef(false);
  const [activeSection, setActiveSection] = useState("all");
  const [completenessScore, setCompletenessScore] = useState(0);
  const [showAdvancedPanel, setShowAdvancedPanel] = useState(true);
  const [selectedPreviewSection, setSelectedPreviewSection] = useState(null);
  const [aiConfigOk, setAiConfigOk] = useState(true);
  const [siteMeta, setSiteMeta] = useState({
    seoTitle: "",
    seoDescription: "",
    footerTagline: "",
    serviceAreas: [],
    portfolio: normalizePortfolio(null),
  });
  const [featureAiDescription, setFeatureAiDescription] = useState(true);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [generatingSlotId, setGeneratingSlotId] = useState("");
  const [regeneratingSection, setRegeneratingSection] = useState("");
  const [industryMismatch, setIndustryMismatch] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const autosaveTimer = useRef(null);
  const formRef = useRef(null);
  const skipAutosave = useRef(true);
  const saveQueueRef = useRef(null);
  if (!saveQueueRef.current) saveQueueRef.current = createSaveQueue();
  const generationAbortRef = useRef(null);
  const galleryUploadInputRef = useRef(null);
  const galleryPanelRef = useRef(null);
  const generatingLockRef = useRef(false);
  const prefetchedDraftRef = useRef(null);
  const prefetchAbortRef = useRef(null);
  const PREFETCH_DRAFT_TTL_MS = 120_000;
  const imageEnhanceAbortRef = useRef(null);
  const [imageEnhancing, setImageEnhancing] = useState(false);
  const [copyEnhancing, setCopyEnhancing] = useState(false);
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
  const [slugDraft, setSlugDraft] = useState("");
  const [websitePath, setWebsitePath] = useState("");
  const [publicUrl, setPublicUrl] = useState("");
  const [published, setPublished] = useState(false);
  const [hasUnpublishedChanges, setHasUnpublishedChanges] = useState(false);
  const [lastPublishedAt, setLastPublishedAt] = useState(null);
  const [companyProfile, setCompanyProfile] = useState(null);
  const [companyLocked, setCompanyLocked] = useState(false);
  const [industryKey, setIndustryKey] = useState("general");
  const [profileIndustry, setProfileIndustry] = useState("general");
  const [industryKeyOverride, setIndustryKeyOverride] = useState(null);
  const [industryPackOptions, setIndustryPackOptions] = useState([]);
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

  const applyApiPayload = useCallback((data, meta = null) => {
    const nextSlug = data.slug || "";
    setSlug(nextSlug);
    setSlugDraft(nextSlug);
    setWebsitePath(data.websitePath || buildPublicWebsitePath(nextSlug));
    setPublicUrl(data.publicUrl || "");
    setPublished(data.published === true);
    if (meta) {
      setHasUnpublishedChanges(Boolean(meta.hasUnpublishedChanges));
      setLastPublishedAt(meta.lastPublishedAt || null);
    }
    setCompanyProfile(data.companyProfile || null);
    setCompanyLocked(
      data.companyLocked === true || shouldLockWebsiteIndustry(data.companyProfile),
    );
    setIndustryKey(data.industry || "general");
    setProfileIndustry(data.profileIndustry || data.industry || "general");
    setIndustryKeyOverride(data.industryKeyOverride || null);
    setIndustryPackOptions(
      Array.isArray(data.industryPackOptions) ? data.industryPackOptions : [],
    );
    setIndustryLabel(data.industryLabel || "");
    setIndustryIcon(data.industryIcon || "🏗️");
    setThemePresets(Array.isArray(data.themePresets) ? data.themePresets : []);
    setImagePresets(Array.isArray(data.imagePresets) ? data.imagePresets : []);
    setRequestServices(
      Array.isArray(data.requestServices) ? data.requestServices : [],
    );
    setCtaOptions(Array.isArray(data.ctaOptions) ? data.ctaOptions : []);
    const sm = data.siteMeta || {};
    const rawForm = {
      headline: data.headline || "",
      subheadline: data.subheadline || "",
      aboutText: data.aboutText || "",
      ctaText: data.ctaText || "",
      themeColor: data.themeColor || "#16a34a",
      galleryPhotos: normalizeGalleryPhotos(data.galleryPhotos),
      heroPhotos: Array.isArray(data.heroPhotos) ? data.heroPhotos : [],
      services: Array.isArray(data.services) ? data.services : [],
      testimonials: sanitizeWebsiteTestimonials(data.testimonials),
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
    };
    const purified = purifyWebsiteForm(
      rawForm,
      data.companyProfile,
      data.industry || "general",
    );
    setIndustryMismatch(data.industryMismatch === true);
    setSiteMeta({
      seoTitle: sm.seoTitle || "",
      seoDescription: sm.seoDescription || "",
      footerTagline: sm.footerTagline || "",
      serviceAreas: Array.isArray(sm.serviceAreas) ? sm.serviceAreas : [],
      portfolio: normalizePortfolio(sm.portfolio),
    });
    const completeness = analyzeWebsiteCompleteness(
      {
        headline: purified.headline,
        subheadline: purified.subheadline,
        aboutText: purified.aboutText,
        ctaText: purified.ctaText,
        services: purified.services,
        heroPhotos: purified.heroPhotos,
        galleryPhotos: purified.galleryPhotos,
        testimonials: purified.testimonials,
        trustBadges: purified.trustBadges,
      },
      sm,
    );
    setCompletenessScore(completeness.score);
    const hasContent =
      completeness.score >= 40 ||
      Boolean(String(purified.headline || "").trim()) ||
      (Array.isArray(purified.services) && purified.services.length > 0);
    setEditorMode(hasContent ? "edit" : "launch");
    setBuilderStep(hasContent ? 3 : 1);
    skipAutosave.current = true;
    formRef.current = purified;
    setForm(purified);
  }, []);

  useEffect(() => {
    formRef.current = form;
  }, [form]);

  const liveRequestServices = useMemo(
    () =>
      resolveWebsiteRequestServices({
        services: form.services,
        requestServices,
        industryKey,
        industry: industryKey,
        businessType: companyProfile?.business_type || companyProfile?.businessType || "",
      }),
    [form.services, requestServices, industryKey, companyProfile],
  );

  const previewForm = useMemo(() => {
    const validation = validateWebsiteRenderPayload(form, siteMeta);
    return applyWebsiteRenderRepairs(form, validation);
  }, [form, siteMeta]);

  useEffect(() => {
    if (!hasUnpublishedChanges) return undefined;
    const handler = (event) => {
      event.preventDefault();
      event.returnValue = t.leaveUnpublishedWarning;
      return t.leaveUnpublishedWarning;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [hasUnpublishedChanges, t.leaveUnpublishedWarning]);

  useEffect(() => {
    apiFetch("/api/website-builder/setup-status", { suppressUnauthorizedEvent: true })
      .then((res) => (res.ok ? res.json() : null))
      .then((payload) => {
        if (payload?.data) {
          setAiConfigOk(payload.data.ready === true);
        }
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    apiFetch("/api/website-builder")
      .then((res) => getJsonOrThrow(res, "Load failed"))
      .then(({ data, meta }) => applyApiPayload(data, meta))
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

  useEffect(() => {
    if (loading || builderStep !== 1 || completenessScore >= 40) return undefined;

    prefetchAbortRef.current?.abort();
    const abort = new AbortController();
    prefetchAbortRef.current = abort;

    const catalogServices = (formRef.current?.services || form.services || [])
      .slice(0, 20)
      .map((s) => ({
        name: s?.name || "",
        description: s?.description || "",
      }));

    apiFetch("/api/website-builder/generate-full", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        services: catalogServices,
        currentForm: formRef.current || form,
        enhanceCopy: false,
      }),
      timeoutMs: WEBSITE_FULL_GENERATE_TIMEOUT_MS,
      signal: abort.signal,
    })
      .then((res) => getJsonOrThrow(res, t.errorGenerate))
      .then((payload) => {
        if (abort.signal.aborted) return;
        prefetchedDraftRef.current = {
          data: payload.data || {},
          fetchedAt: Date.now(),
        };
      })
      .catch(() => {});

    return () => {
      abort.abort();
    };
  }, [loading, builderStep, completenessScore, form.services, t.errorGenerate]);

  const handleSave = useCallback(
    async (data, options = {}) => {
      const { silent = false, mergeMedia = true } = options;
      return saveQueueRef.current.run(async (saveId) => {
        setSaving(true);
        if (!silent) setError("");
        const clientSnapshot = purifyWebsiteForm(
          {
            ...(formRef.current || form),
            ...data,
            testimonials: sanitizeWebsiteTestimonials(
              data.testimonials ?? formRef.current?.testimonials,
            ),
            galleryPhotos: normalizeGalleryPhotos(
              data.galleryPhotos ?? formRef.current?.galleryPhotos,
            ),
          },
          companyProfile || {},
          industryKey,
        );
        try {
          const pack = getWebsiteBuilderPack(industryKey);
          const meta = data.siteMeta ?? siteMeta;
          const sanitized = sanitizeIndustryWebsiteContent(
            clientSnapshot,
            pack,
            companyProfile || {},
          );
          const res = await apiFetch("/api/website-builder", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              ...clientSnapshot,
              ...sanitized,
              testimonials: [],
              heroPhotos: clientSnapshot.heroPhotos,
              galleryPhotos: clientSnapshot.galleryPhotos,
              siteMeta: meta,
            }),
          });
          const payload = await res.json().catch(() => null);
          if (!res.ok) {
            throw new Error(payload?.error || payload?.message || `HTTP ${res.status}`);
          }

          if (payload?.data && saveQueueRef.current.isLatest(saveId)) {
            const serverGallery = normalizeGalleryPhotos(payload.data.galleryPhotos);
            const clientGallery = normalizeGalleryPhotos(clientSnapshot.galleryPhotos);
            if (
              mergeMedia &&
              clientGallery.length > serverGallery.length
            ) {
              showNotice(t.galleryPersistWarning, true);
            }

            if (mergeMedia) {
              const mergedForm = mergeFormAfterSave({
                serverData: payload.data,
                clientForm: clientSnapshot,
                mode: "save",
              });
              const mergedMeta = {
                ...meta,
                ...(payload.data.siteMeta || {}),
                portfolio: normalizePortfolio(
                  meta.portfolio ?? payload.data.siteMeta?.portfolio,
                ),
              };
              skipAutosave.current = true;
              formRef.current = { ...clientSnapshot, ...mergedForm };
              setForm((prev) => ({ ...prev, ...mergedForm }));
              setSiteMeta(mergedMeta);
              setSlug(payload.data.slug || slug);
              setSlugDraft(payload.data.slug || slug);
              setPublished(payload.data.published === true);
              if (payload.meta) {
                setHasUnpublishedChanges(
                  Boolean(payload.meta.hasUnpublishedChanges),
                );
                setLastPublishedAt(payload.meta.lastPublishedAt || null);
              }
              setIndustryMismatch(payload.data.industryMismatch === true);
            } else {
              applyApiPayload(payload.data, payload.meta);
            }
          }

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
      });
    },
    [t, showNotice, applyApiPayload, industryKey, companyProfile, siteMeta, slug],
  );

  const handlePreviewSectionSelect = useCallback((sectionId) => {
    setSelectedPreviewSection(sectionId);
    if (sectionId === "gallery") {
      setShowAdvancedPanel(true);
      setActiveSection("images");
      setOpenSections((prev) => ({ ...prev, gallery: true }));
      window.setTimeout(() => {
        galleryPanelRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }, 120);
    }
  }, []);

  const triggerGalleryUpload = useCallback(() => {
    setShowAdvancedPanel(true);
    setActiveSection("images");
    setOpenSections((prev) => ({ ...prev, gallery: true }));
    window.setTimeout(() => {
      galleryUploadInputRef.current?.click();
    }, 80);
  }, []);

  const sectionVisible = useCallback(
    (sectionKey) => {
      const allowed = SECTION_FILTERS[activeSection];
      if (!allowed) return true;
      return allowed.includes(sectionKey);
    },
    [activeSection],
  );

  useEffect(() => {
    if (loading) return;
    if (generating || imageEnhancing || generatingLockRef.current) return;
    if (isEditingRef.current) return;
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
  }, [form, loading, generating, imageEnhancing, handleSave]);

  const handleApplyIndustryPreset = useCallback(async () => {
    const pack = getWebsiteBuilderPack(industryKey);
    const defaults = buildIndustryWebsiteDefaults(pack, companyProfile || {});
    const existingServices = (formRef.current || form).services || [];
    const nextForm = {
      ...(formRef.current || form),
      headline: defaults.headline,
      subheadline: defaults.subheadline,
      aboutText: defaults.aboutText,
      ctaText: defaults.ctaText,
      themeColor: defaults.themeColor,
      services:
        existingServices.length > 0
          ? existingServices.map((s) => ({ ...s }))
          : defaults.services.map((s) => ({ ...s })),
      testimonials: [],
      trustBadges: [...defaults.trustBadges],
      heroPhotos: defaults.heroPhotos.map((h) => ({ ...h })),
      galleryPhotos: formRef.current?.galleryPhotos || [],
    };
    skipAutosave.current = true;
    formRef.current = nextForm;
    setForm(nextForm);
    setIndustryMismatch(false);
    await handleSave(nextForm);
    showNotice(t.presetApplied);
  }, [form, industryKey, companyProfile, showNotice, t.presetApplied, handleSave]);

  const handleSlugUpdate = useCallback(async () => {
    const next = String(slugDraft || "").trim().toLowerCase();
    if (!next || next === slug) return;
    setSaving(true);
    try {
      const res = await apiFetch("/api/website-builder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ slug: next }),
      });
      const payload = await res.json().catch(() => null);
      if (!res.ok) {
        throw new Error(payload?.error || t.errorSave);
      }
      if (payload?.data) applyApiPayload(payload.data, payload.meta);
      showNotice(t.savedNotice);
    } catch (err) {
      const msg = String(err?.message || "");
      if (msg.toLowerCase().includes("taken")) {
        showNotice(t.slugTaken, true);
      } else if (msg.toLowerCase().includes("reserved")) {
        showNotice(t.slugInvalid, true);
      } else {
        showNotice(msg || t.errorSave, true);
      }
    } finally {
      setSaving(false);
    }
  }, [slug, slugDraft, applyApiPayload, showNotice, t]);

  const handleIndustryOverrideChange = useCallback(
    async (event) => {
      const value = String(event.target.value || "").trim();
      const overrideKey = value === "" ? null : value;
      setSaving(true);
      try {
        const res = await apiFetch("/api/website-builder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            industryKeyOverride: overrideKey,
          }),
        });
        const payload = await getJsonOrThrow(res, t.errorSave);
        if (payload?.data) applyApiPayload(payload.data, payload.meta);
      } catch (err) {
        showNotice(err.message || t.errorSave, true);
      } finally {
        setSaving(false);
      }
    },
    [applyApiPayload, showNotice, t.errorSave],
  );

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
        testimonials: sanitizeWebsiteTestimonials(d.testimonials),
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

  const handleCancelGeneration = useCallback(() => {
    generationAbortRef.current?.abort();
    imageEnhanceAbortRef.current?.abort();
    generationAbortRef.current = null;
    imageEnhanceAbortRef.current = null;
    generatingLockRef.current = false;
    setGenerating(false);
    setImageEnhancing(false);
    setGenProgress("");
    setGeneratingSlotId("");
    showNotice(t.generateCancelled);
  }, [t, showNotice]);

  const runBackgroundImageEnhancement = useCallback(
    async (imagePresetsList, signal) => {
      if (!aiConfigOk || signal?.aborted) return;

      const current = formRef.current;
      if (!current) return;

      const plan = findWebsiteImageEnhancementPlan(
        current.heroPhotos || [],
        current.galleryPhotos || [],
        imagePresetsList,
      );
      if (plan.length === 0) return;

      imageEnhanceAbortRef.current?.abort();
      const enhanceAbort = new AbortController();
      imageEnhanceAbortRef.current = enhanceAbort;
      if (signal) {
        if (signal.aborted) {
          enhanceAbort.abort();
        } else {
          signal.addEventListener("abort", () => enhanceAbort.abort(), { once: true });
        }
      }
      const combinedSignal = enhanceAbort.signal;

      setImageEnhancing(true);
      setGenProgress(
        plan.length > 1
          ? t.genStepGallery?.replace("{n}", "1").replace("{total}", String(plan.length)) ||
              t.genStepHero
          : t.genStepHero || t.generatingImage,
      );

      try {
        const images = await requestWebsiteImagesBatch({
          apiFetch,
          getJsonOrThrow,
          prompts: plan.map((slot) => slot.prompt),
          style: imageStyle,
          mediaKind: "gallery",
          draft: true,
          timeoutMs: WEBSITE_HERO_IMAGE_TIMEOUT_MS,
          signal: combinedSignal,
          errorMessage: t.errorGenerateImage,
        });

        if (combinedSignal.aborted || images.length === 0) return;

        const working = formRef.current || current;
        const updatedHero = [...(working.heroPhotos || [])];
        const updatedGallery = [...(working.galleryPhotos || [])];

        images.forEach((row) => {
          const planIndex = Number(row?.promptIndex);
          const entry = Number.isFinite(planIndex) ? plan[planIndex] : null;
          if (!entry) return;
          const imageSrc = resolveWebsiteImageSrc(row);
          if (!isValidWebsiteImageSrc(imageSrc)) return;

          if (entry.kind === "gallery") {
            updatedGallery[entry.index] = {
              ...updatedGallery[entry.index],
              id: updatedGallery[entry.index]?.id || `ai-gallery-${entry.index}`,
              src: imageSrc,
              thumbnail: imageSrc,
              alt: String(row?.alt || entry.prompt).slice(0, 160),
              prompt: entry.prompt,
              persisted: /^https?:\/\//i.test(imageSrc),
            };
            return;
          }

          updatedHero[entry.index] = {
            ...updatedHero[entry.index],
            src: imageSrc,
            alt: String(row?.alt || entry.prompt).slice(0, 160),
            prompt: entry.prompt,
          };
        });

        const withImages = {
          ...working,
          heroPhotos: updatedHero,
          galleryPhotos: normalizeGalleryPhotos(updatedGallery),
        };
        skipAutosave.current = true;
        formRef.current = withImages;
        setForm(withImages);
        void handleSave({ ...withImages, siteMeta }, { silent: true });
      } catch (err) {
        if (err?.name !== "AbortError") {
          /* optional — site already usable with stock images */
        }
      } finally {
        setGeneratingSlotId("");
        setImageEnhancing(false);
        if (!signal?.aborted) {
          setGenProgress("");
        }
      }
    },
    [aiConfigOk, imageStyle, siteMeta, t, handleSave],
  );

  const handleGenerateFullSite = useCallback(async () => {
    if (generatingLockRef.current) return;

    imageEnhanceAbortRef.current?.abort();
    const abort = new AbortController();
    generationAbortRef.current = abort;
    generatingLockRef.current = true;
    skipAutosave.current = true;

    setGenerating(true);
    setGenProgress(t.genStepInstant || t.genStepCopy);
    setError("");

    const catalogServices = (form.services || []).slice(0, 20).map((s) => ({
      name: s?.name || "",
      description: s?.description || "",
    }));
    const currentForm = formRef.current || form;

    try {
      let d = null;
      const prefetched = prefetchedDraftRef.current;
      if (
        prefetched?.data &&
        Date.now() - Number(prefetched.fetchedAt || 0) < PREFETCH_DRAFT_TTL_MS
      ) {
        d = prefetched.data;
        prefetchedDraftRef.current = null;
      } else {
        const res = await apiFetch("/api/website-builder/generate-full", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            services: catalogServices,
            currentForm,
            enhanceCopy: false,
          }),
          timeoutMs: WEBSITE_FULL_GENERATE_TIMEOUT_MS,
          signal: abort.signal,
        });
        const payload = await getJsonOrThrow(res, t.errorGenerate);
        d = payload.data || {};
      }

      const { nextForm, nextSiteMeta } = mergeFullSiteIntoDraft({
        form: currentForm,
        siteMeta,
        data: d,
      });

      formRef.current = nextForm;
      setForm(nextForm);
      setSiteMeta(nextSiteMeta);

      const completeness = analyzeWebsiteCompleteness(nextForm, nextSiteMeta);
      setCompletenessScore(completeness.score);
      setEditorMode("edit");
      setBuilderStep(3);
      setShowAdvancedPanel(true);
      setSelectedPreviewSection(null);
      setMobileTab("preview");

      showNotice(t.generateInstantDone);
      void handleSave({ ...nextForm, siteMeta: nextSiteMeta }, { silent: true });

      setGenerating(false);
      setGenProgress("");
      generatingLockRef.current = false;
      generationAbortRef.current = null;
      skipAutosave.current = false;

      const postInstantTasks = [];

      if (featureAiDescription && aiConfigOk && !abort.signal.aborted) {
        postInstantTasks.push(
          (async () => {
            setCopyEnhancing(true);
            setGenProgress(t.genStepCopyEnhance || t.genStepCopy);
            try {
              let workingForm = formRef.current || nextForm;
              let workingMeta = nextSiteMeta;

              await enhanceWebsiteCopyParallel({
                apiFetch,
                getJsonOrThrow,
                catalogServices,
                signal: abort.signal,
                timeoutMs: WEBSITE_COPY_ENHANCE_TIMEOUT_MS,
                onSectionComplete: async (_section, sectionData) => {
                  const merged = mergeWebsiteCopySection(
                    workingForm,
                    workingMeta,
                    sectionData,
                  );
                  workingForm = merged.nextForm;
                  workingMeta = {
                    ...merged.nextSiteMeta,
                    generationSource: "ai",
                  };
                  skipAutosave.current = true;
                  formRef.current = workingForm;
                  setForm(workingForm);
                  setSiteMeta(workingMeta);
                  setCompletenessScore(
                    analyzeWebsiteCompleteness(workingForm, workingMeta).score,
                  );
                },
              });

              void handleSave({ ...workingForm, siteMeta: workingMeta }, { silent: true });
              showNotice(t.generateFullDone);
            } catch (copyErr) {
              if (copyErr?.name !== "AbortError") {
                console.warn(
                  "[website-builder] copy enhance skipped:",
                  copyErr?.message || copyErr,
                );
              }
            } finally {
              setCopyEnhancing(false);
              if (!abort.signal.aborted) {
                setGenProgress("");
              }
              skipAutosave.current = false;
            }
          })(),
        );
      }

      if (aiConfigOk && !abort.signal.aborted) {
        postInstantTasks.push(
          runBackgroundImageEnhancement(imagePresets, abort.signal),
        );
      }

      if (postInstantTasks.length > 0) {
        await Promise.allSettled(postInstantTasks);
      }
    } catch (err) {
      if (err?.name === "AbortError") {
        showNotice(t.generateCancelled);
      } else {
        showNotice(err.message || t.errorGenerate, true);
      }
    } finally {
      generatingLockRef.current = false;
      generationAbortRef.current = null;
      setGenerating(false);
      setGenProgress("");
      skipAutosave.current = false;
    }
  }, [
    featureAiDescription,
    form,
    siteMeta,
    aiConfigOk,
    imagePresets,
    runBackgroundImageEnhancement,
    t,
    showNotice,
    handleSave,
  ]);

  const generateHeroImageForAgent = useCallback(
    async ({ slotIndex = 0, prompt = "" } = {}) => {
      const index = Math.max(0, Math.min(3, Number(slotIndex) || 0));
      const slots = formRef.current?.heroPhotos || form.heroPhotos || [];
      const resolvedPrompt = String(
        prompt || slots[index]?.prompt || imagePresets[index] || "",
      ).trim();
      if (!resolvedPrompt) throw new Error("No image prompt available");

      const res = await requestWebsiteImagesBatch({
        apiFetch,
        getJsonOrThrow,
        prompts: [resolvedPrompt],
        style: imageStyle,
        mediaKind: "hero",
        draft: true,
        timeoutMs: WEBSITE_HERO_IMAGE_TIMEOUT_MS,
        errorMessage: t.errorGenerateImage,
      });
      const row = res[0];
      const imageSrc = resolveWebsiteImageSrc(row);
      if (!imageSrc.startsWith("data:image/") && !/^https?:\/\//i.test(imageSrc)) {
        throw new Error(t.errorGenerateImage);
      }

      const nextForm = { ...(formRef.current || form) };
      const heroPhotos = [...(nextForm.heroPhotos || slots)];
      while (heroPhotos.length <= index) {
        heroPhotos.push({ id: `hero-${heroPhotos.length}`, src: "", alt: "", prompt: "" });
      }
      heroPhotos[index] = {
        ...heroPhotos[index],
        src: imageSrc,
        alt: String(row?.alt || resolvedPrompt).slice(0, 160),
        prompt: resolvedPrompt,
      };
      nextForm.heroPhotos = heroPhotos;
      skipAutosave.current = true;
      formRef.current = nextForm;
      setForm(nextForm);
      await handleSave(nextForm, { silent: true });
      return true;
    },
    [form, imagePresets, imageStyle, t, handleSave],
  );

  const generateHeroImagesBatchForAgent = useCallback(
    async (requests = []) => {
      const list = Array.isArray(requests) ? requests : [];
      if (list.length === 0) return 0;

      const current = formRef.current || form;
      const slots = current.heroPhotos || [];
      const plan = list
        .map((req) => {
          const index = Math.max(0, Math.min(3, Number(req?.slotIndex) || 0));
          const prompt = String(
            req?.prompt || slots[index]?.prompt || imagePresets[index] || "",
          ).trim();
          return { index, prompt };
        })
        .filter((entry) => entry.prompt);

      if (plan.length === 0) throw new Error("No image prompts available");

      const images = await requestWebsiteImagesBatch({
        apiFetch,
        getJsonOrThrow,
        prompts: plan.map((entry) => entry.prompt),
        style: imageStyle,
        mediaKind: "hero",
        draft: true,
        timeoutMs: WEBSITE_HERO_IMAGE_TIMEOUT_MS,
        errorMessage: t.errorGenerateImage,
      });

      if (images.length === 0) return 0;

      const nextForm = { ...current };
      const heroPhotos = [...(nextForm.heroPhotos || slots)];
      images.forEach((row) => {
        const planIndex = Number(row?.promptIndex);
        const entry = Number.isFinite(planIndex) ? plan[planIndex] : null;
        if (!entry) return;
        const imageSrc = resolveWebsiteImageSrc(row);
        if (!isValidWebsiteImageSrc(imageSrc)) return;
        while (heroPhotos.length <= entry.index) {
          heroPhotos.push({
            id: `hero-${heroPhotos.length}`,
            src: "",
            alt: "",
            prompt: "",
          });
        }
        heroPhotos[entry.index] = {
          ...heroPhotos[entry.index],
          src: imageSrc,
          alt: String(row?.alt || entry.prompt).slice(0, 160),
          prompt: entry.prompt,
        };
      });
      nextForm.heroPhotos = heroPhotos;
      skipAutosave.current = true;
      formRef.current = nextForm;
      setForm(nextForm);
      await handleSave(nextForm, { silent: true });
      return images.length;
    },
    [form, imagePresets, imageStyle, t, handleSave],
  );

  const generateGalleryImagesForAgent = useCallback(
    async ({ count = 1, prompt = "" } = {}) => {
      const total = Math.min(10, Math.max(1, Number(count) || 1));
      const basePrompt = String(prompt || imagePrompt || "").trim();
      if (!basePrompt) throw new Error("No gallery prompt provided");

      const current = formRef.current || form;
      const remainingSlots = MAX_FEATURED_GALLERY - (current.galleryPhotos || []).length;
      if (remainingSlots <= 0) return 0;

      const batchCount = Math.min(total, remainingSlots);
      const images = await requestWebsiteImagesBatch({
        apiFetch,
        getJsonOrThrow,
        prompts: Array.from({ length: batchCount }, () => basePrompt),
        style: imageStyle,
        mediaKind: "gallery",
        draft: true,
        timeoutMs: WEBSITE_HERO_IMAGE_TIMEOUT_MS,
        errorMessage: t.errorGenerateImage,
      });

      const newPhotos = images
        .map((row, i) => {
          const imageSrc = resolveWebsiteImageSrc(row);
          if (!isValidWebsiteImageSrc(imageSrc)) return null;
          return {
            id: `ai-${Date.now()}-${i}`,
            src: imageSrc,
            thumbnail: imageSrc,
            alt: String(row?.alt || basePrompt).slice(0, 160),
            persisted: /^https?:\/\//i.test(imageSrc),
          };
        })
        .filter(Boolean);

      if (newPhotos.length === 0) return 0;

      const nextForm = {
        ...current,
        galleryPhotos: normalizeGalleryPhotos([
          ...(current.galleryPhotos || []),
          ...newPhotos,
        ]).slice(0, MAX_FEATURED_GALLERY),
      };
      skipAutosave.current = true;
      formRef.current = nextForm;
      setForm(nextForm);
      await handleSave(nextForm, { silent: true });
      return newPhotos.length;
    },
    [form, imagePrompt, imageStyle, t, handleSave],
  );

  const removeGalleryImageForAgent = useCallback(({ index, altMatch } = {}) => {
    setForm((prev) => {
      const photos = [...(prev.galleryPhotos || [])];
      let idx = typeof index === "number" ? index : -1;
      if (idx < 0 && altMatch) {
        const needle = String(altMatch).toLowerCase();
        idx = photos.findIndex((p) =>
          String(p?.alt || p?.caption || "").toLowerCase().includes(needle),
        );
      }
      if (idx < 0 || idx >= photos.length) return prev;
      const next = {
        ...prev,
        galleryPhotos: photos.filter((_, i) => i !== idx),
      };
      formRef.current = next;
      return next;
    });
  }, []);

  const removeHeroImageForAgent = useCallback(({ slotIndex = 0 } = {}) => {
    const index = Math.max(0, Math.min(3, Number(slotIndex) || 0));
    setForm((prev) => {
      const heroPhotos = [...(prev.heroPhotos || [])];
      if (!heroPhotos[index]) return prev;
      heroPhotos[index] = { ...heroPhotos[index], src: "", alt: heroPhotos[index].alt || "" };
      const next = { ...prev, heroPhotos };
      formRef.current = next;
      return next;
    });
  }, []);

  useEffect(() => {
    if (!wbAi?.registerBuilder) return undefined;
    wbAi.registerBuilder({
      getSnapshot: () => ({
        form: formRef.current || form,
        siteMeta,
        published,
        websitePath: websitePath || (slug ? buildPublicWebsitePath(slug) : ""),
        industry: industryKey,
        industryLabel,
      }),
      applyPatches: (patches) => {
        if (!patches || typeof patches !== "object") return;
        const {
          siteMeta: siteMetaPatch,
          removeServicePricing,
          services: servicesPatch,
          ...formPatch
        } = patches;

        setForm((prev) => {
          let next = { ...prev, ...formPatch };
          if (Array.isArray(servicesPatch)) {
            next.services = servicesPatch;
          }
          if (removeServicePricing) {
            next.services = (next.services || []).map((s) => ({
              name: String(s?.name || "").trim(),
              description: String(s?.description || "").trim(),
            }));
          }
          formRef.current = next;
          return next;
        });

        if (siteMetaPatch && typeof siteMetaPatch === "object") {
          setSiteMeta((prev) => {
            const merged = { ...prev, ...siteMetaPatch };
            return merged;
          });
        }

        showNotice(t.aiPatchesApplied);
      },
      runGenerateFull: () => handleGenerateFullSite(),
      generateHeroImage: generateHeroImageForAgent,
      generateHeroImagesBatch: generateHeroImagesBatchForAgent,
      generateGalleryImages: generateGalleryImagesForAgent,
      removeGalleryImage: removeGalleryImageForAgent,
      removeHeroImage: removeHeroImageForAgent,
    });
    return () => wbAi.unregisterBuilder();
  }, [
    wbAi,
    form,
    siteMeta,
    published,
    websitePath,
    slug,
    industryKey,
    industryLabel,
    handleGenerateFullSite,
    generateHeroImageForAgent,
    generateHeroImagesBatchForAgent,
    generateGalleryImagesForAgent,
    removeGalleryImageForAgent,
    removeHeroImageForAgent,
    showNotice,
    t.aiPatchesApplied,
  ]);

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
        const images = await requestWebsiteImagesBatch({
          apiFetch,
          getJsonOrThrow,
          prompts: [prompt],
          style: imageStyle,
          mediaKind: "hero",
          draft: true,
          timeoutMs: WEBSITE_HERO_IMAGE_TIMEOUT_MS,
          errorMessage: t.errorGenerateImage,
        });
        const row = images[0];
        const imageSrc = resolveWebsiteImageSrc(row);
        if (!imageSrc.startsWith("data:image/") && !/^https?:\/\//i.test(imageSrc)) {
          throw new Error(t.errorGenerateImage);
        }
        const nextForm = {
          ...(formRef.current || form),
          heroPhotos: [...(formRef.current?.heroPhotos || form.heroPhotos || [])],
        };
        nextForm.heroPhotos[index] = {
          ...nextForm.heroPhotos[index],
          src: imageSrc,
          alt: String(row?.alt || prompt).slice(0, 160),
          prompt,
        };
        skipAutosave.current = true;
        formRef.current = nextForm;
        setForm(nextForm);
        await handleSave(nextForm, { silent: true });
        showNotice(t.savedNotice);
      } catch (err) {
        showNotice(err.message || t.errorGenerateImage, true);
      } finally {
        setGeneratingSlotId("");
      }
    },
    [form, imagePresets, imageStyle, showNotice, t, handleSave],
  );

  const handlePublishToggle = useCallback(async () => {
    setPublishing(true);
    const goPublish = !published || hasUnpublishedChanges;
    try {
      const endpoint = goPublish
        ? "/api/website-builder/publish"
        : "/api/website-builder/unpublish";
      const res = await apiFetch(endpoint, { method: "POST" });
      const payload = await getJsonOrThrow(res, t.errorSave);
      setPublished(payload?.data?.published === true);
      setHasUnpublishedChanges(false);
      setLastPublishedAt(payload?.data?.lastPublishedAt || null);
      showNotice(
        goPublish && payload?.data?.published === true
          ? `${t.publishedBadge} — ${t.publishLeadsHint}`
          : goPublish
            ? t.publishedBadge
            : t.draftBadge,
      );
    } catch (err) {
      showNotice(err.message || t.errorSave, true);
    } finally {
      setPublishing(false);
    }
  }, [published, hasUnpublishedChanges, t, showNotice]);

  const handleDiscardDraft = useCallback(async () => {
    if (typeof window !== "undefined") {
      const ok = window.confirm(t.discardDraftConfirm);
      if (!ok) return;
    }
    try {
      const res = await apiFetch("/api/website-builder/discard-draft", {
        method: "POST",
      });
      await getJsonOrThrow(res, t.errorSave);
      // Reload the draft view from the server (now restored to live).
      const reload = await apiFetch("/api/website-builder", { cache: "no-store" });
      const payload = await getJsonOrThrow(reload, t.errorLoad);
      applyApiPayload(payload.data, payload.meta);
      setHasUnpublishedChanges(false);
      showNotice(t.discardedDraft);
    } catch (err) {
      showNotice(err.message || t.errorSave, true);
    }
  }, [applyApiPayload, t, showNotice]);

  const setField = useCallback((key, value) => {
    setForm((prev) => {
      const next = { ...prev, [key]: value };
      formRef.current = next;
      return next;
    });
  }, []);

  const handlePreviewFieldChange = useCallback((field, value) => {
    setField(field, value);
  }, [setField]);

  const handleServiceFieldChange = useCallback((index, key, value) => {
    setForm((prev) => {
      const services = [...(prev.services || [])];
      services[index] = { ...services[index], [key]: value };
      const next = { ...prev, services };
      formRef.current = next;
      return next;
    });
  }, []);

  const handleRegeneratePreviewSection = useCallback(() => {
    const apiSection = SECTION_REGEN_MAP[selectedPreviewSection] || "hero";
    handleGenerateSection(apiSection);
  }, [selectedPreviewSection, handleGenerateSection]);

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

  const handlePortfolioChange = useCallback(
    (portfolio) => {
      const normalized = normalizePortfolio(portfolio);
      const featured = buildFeaturedGallery(normalized);
      skipAutosave.current = true;
      setSiteMeta((prev) => {
        const nextMeta = { ...prev, portfolio: normalized };
        const nextForm = { ...(formRef.current || form), galleryPhotos: featured };
        formRef.current = nextForm;
        setForm(nextForm);
        void handleSave({ ...nextForm, siteMeta: nextMeta }, { silent: true });
        return nextMeta;
      });
    },
    [form, handleSave],
  );

  const handleGalleryUpload = useCallback(
    async (event) => {
      const files = Array.from(event.target.files || []);
      if (event.target) event.target.value = "";
      if (!files.length) return;

      const slots = Math.max(0, MAX_FEATURED_GALLERY - form.galleryPhotos.length);
      const batch = files.slice(0, slots);
      if (!batch.length) return;

      try {
        const items = [];
        for (let i = 0; i < batch.length; i += 1) {
          const file = batch[i];
          if (!file.type.startsWith("image/")) throw new Error("Images only.");
          if (file.size > MAX_GALLERY_IMAGE_SIZE) throw new Error("Image too large (max 8MB).");
          const compressed = await compressImageFile(file).catch(() => file);
          items.push({
            id: `up-${Date.now()}-${i}`,
            dataUrl: await fileToDataUrl(compressed),
            alt: file.name.replace(/\.[^.]+$/, "").slice(0, 160),
          });
        }

        const uploaded = [];
        for (let offset = 0; offset < items.length; offset += MAX_UPLOAD_BATCH) {
          const chunk = items.slice(offset, offset + MAX_UPLOAD_BATCH);
          const res = await apiFetch("/api/website-builder/gallery/upload", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ items: chunk }),
            timeoutMs: 120_000,
          });
          const payload = await getJsonOrThrow(res, t.portfolioUploadFailed);
          if (payload?.data?.photos?.length) uploaded.push(...payload.data.photos);
        }

        if (!uploaded.length) throw new Error(t.portfolioUploadFailed);

        const nextForm = {
          ...(formRef.current || form),
          galleryPhotos: normalizeGalleryPhotos([
            ...(formRef.current?.galleryPhotos || form.galleryPhotos),
            ...uploaded,
          ]).slice(0, MAX_FEATURED_GALLERY),
        };
        skipAutosave.current = true;
        formRef.current = nextForm;
        setForm(nextForm);
        await handleSave(nextForm, { silent: true });
        showNotice(t.savedNotice);
      } catch (err) {
        showNotice(err.message || t.errorSave, true);
      }
    },
    [form, showNotice, t, handleSave],
  );

  const handleGenerateImage = useCallback(
    async (promptOverride = "") => {
      const prompt = String(promptOverride || imagePrompt || "").trim();
      if (!prompt) {
        showNotice(t.errorGenerateImage, true);
        return;
      }
      const current = formRef.current || form;
      const remainingSlots = MAX_FEATURED_GALLERY - (current.galleryPhotos || []).length;
      if (remainingSlots <= 0) {
        showNotice(`Max ${MAX_FEATURED_GALLERY} featured photos.`, true);
        return;
      }
      const batchCount = Math.min(WEBSITE_GALLERY_BATCH_DEFAULT, remainingSlots);

      setGeneratingImage(true);
      try {
        const images = await requestWebsiteImagesBatch({
          apiFetch,
          getJsonOrThrow,
          prompts: Array.from({ length: batchCount }, (_, i) =>
            batchCount > 1 ? `${prompt}, variation ${i + 1}` : prompt,
          ),
          style: imageStyle,
          mediaKind: "gallery",
          draft: true,
          timeoutMs: WEBSITE_HERO_IMAGE_TIMEOUT_MS,
          errorMessage: t.errorGenerateImage,
        });

        const newPhotos = images
          .map((row, i) => {
            const imageSrc = resolveWebsiteImageSrc(row);
            if (!isValidWebsiteImageSrc(imageSrc)) return null;
            return {
              id: `ai-${Date.now()}-${i}`,
              src: imageSrc,
              thumbnail: imageSrc,
              alt: String(row?.alt || prompt).slice(0, 160),
              persisted: /^https?:\/\//i.test(imageSrc),
            };
          })
          .filter(Boolean);

        if (newPhotos.length === 0) {
          throw new Error(t.errorGenerateImage);
        }

        const nextForm = {
          ...current,
          galleryPhotos: normalizeGalleryPhotos([
            ...(current.galleryPhotos || []),
            ...newPhotos,
          ]).slice(0, MAX_FEATURED_GALLERY),
        };
        skipAutosave.current = true;
        formRef.current = nextForm;
        setForm(nextForm);
        setImagePrompt("");
        await handleSave(nextForm, { silent: true });
        showNotice(t.savedNotice);
      } catch (err) {
        showNotice(err.message || t.errorGenerateImage, true);
      } finally {
        setGeneratingImage(false);
      }
    },
    [form, imagePrompt, imageStyle, showNotice, t, handleSave],
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

  const sitePath = websitePath || (slug ? buildPublicWebsitePath(slug) : "");
  const siteUrl =
    publicUrl ||
    (typeof window !== "undefined" && sitePath
      ? `${window.location.origin}${sitePath}`
      : sitePath || null);
  const theme = form.themeColor || "#3b82f6";
  const siteLocale =
    companyProfile?.documentLanguage === "es" ? "es" : "en";
  const siteHasDraft =
    editorMode === "edit" || completenessScore >= 40 || Boolean(String(form.headline || "").trim());

  const handleOpenWorkspaceAgent = useCallback(() => {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("fieldbase:open-workspace-agent"));
    }
  }, []);

  const handleWorkflowStep = useCallback((stepId) => {
    setBuilderStep(stepId);
    if (stepId <= 1) {
      setEditorMode("launch");
      setShowAdvancedPanel(true);
      setActiveSection("all");
      setMobileTab("edit");
      return;
    }
    if (stepId === 2) {
      setEditorMode("launch");
      setShowAdvancedPanel(false);
      setMobileTab("preview");
      return;
    }
    if (stepId === 3) {
      setEditorMode("edit");
      setShowAdvancedPanel(true);
      setMobileTab("preview");
      return;
    }
    if (stepId === 4) {
      setEditorMode("edit");
      setShowAdvancedPanel(false);
      setMobileTab("preview");
      return;
    }
    if (stepId === 5) {
      setEditorMode("edit");
      setShowAdvancedPanel(true);
      setActiveSection("advanced");
      setMobileTab("edit");
    }
  }, []);

  const handleOpenQuoteForm = useCallback(() => {
    if (!slug) {
      showNotice("Save your website once to enable the customer quote form.", true);
      return;
    }
    window.dispatchEvent(new CustomEvent("fieldbase:open-lead-form", { detail: {} }));
  }, [slug, showNotice]);

  const handleRegenerateWithConfirm = useCallback(() => {
    if (!window.confirm(t.regenerateConfirm)) return;
    handleGenerateFullSite();
  }, [t.regenerateConfirm, handleGenerateFullSite]);

  const handleLaunchGenerate = useCallback(() => {
    if (siteHasDraft) {
      handleRegenerateWithConfirm();
      return;
    }
    void handleGenerateFullSite();
  }, [siteHasDraft, handleRegenerateWithConfirm, handleGenerateFullSite]);

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

  const stepSubtitle =
    builderStep === 1
      ? t.stepSetupSub
      : builderStep === 2
        ? t.stepGenerateSub
        : builderStep === 3
          ? t.stepCustomizeSub
          : builderStep === 4
            ? t.stepPreviewSub
            : t.stepPublishSub;

  const logoUrl = resolveCompanyLogoUrl(companyProfile);
  const companyName = getCompanyDisplayName(companyProfile);
  const companyLockedEffective =
    companyLocked || shouldLockWebsiteIndustry(companyProfile);

  return (
    <WebsiteBuilderEditProvider editingRef={isEditingRef}>
    <div className={styles.shell} style={{ "--wb-theme": theme }} data-testid="website-builder-shell">
      <div className={styles.shellChrome}>
      <div className={styles.shellBannerWrap}>
        <PlatformZoneBanner zone="private" />
      </div>
      <div className={`${styles.topBar} ${styles.topBarCompact}`}>
        <div className={styles.titleBlock}>
          <div className={styles.eyebrow}>
            <Link href="/dashboard" style={{ color: "inherit", textDecoration: "none" }}>
              {t.breadcrumbHome}
            </Link>
            {" / "}
            {t.title}
          </div>
          {companyName ? (
            <div className={styles.workspaceBrandRow}>
              {logoUrl ? (
                <img src={logoUrl} alt="" className={styles.workspaceBrandLogo} />
              ) : (
                <div className={styles.workspaceBrandLogoFallback}>
                  {companyName.charAt(0)}
                </div>
              )}
              <div>
                <p className={styles.workspaceBrandEyebrow}>{t.editingCompanyWebsite}</p>
                <h1 className={styles.workspaceBrandTitle}>{companyName}</h1>
              </div>
            </div>
          ) : (
            <h1>{t.title}</h1>
          )}
          <p style={{ margin: "6px 0 0", fontSize: "0.82rem", color: "#94a3b8", maxWidth: 520 }}>
            {stepSubtitle}
          </p>
        </div>
        <div className={styles.actions}>
          {(() => {
            const dirty = hasUnpublishedChanges;
            const liveAndSynced = published && !dirty;
            const badgeLabel = liveAndSynced
              ? `🟢 ${t.publishStateLive}`
              : dirty
                ? `🟡 ${t.publishStateDirty}`
                : `⚪ ${t.publishStateNever}`;
            const badgeClass = liveAndSynced
              ? styles.badgePub
              : dirty
                ? `${styles.badgeDraft} ${styles.badgeDirty || ""}`
                : styles.badgeDraft;
            return (
              <span
                className={`${styles.badge} ${badgeClass}`}
                title={dirty ? t.publishDirtyHint : undefined}
              >
                {badgeLabel}
              </span>
            );
          })()}
          {hasUnpublishedChanges ? (
            <>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnSave}`}
                disabled={publishing || saving}
                onClick={handlePublishToggle}
              >
                {publishing ? t.publishing : t.publishChangesCta}
              </button>
              <button
                type="button"
                className={`${styles.btn} ${styles.btnGhost}`}
                disabled={publishing || saving}
                onClick={handleDiscardDraft}
              >
                {t.discardDraft}
              </button>
            </>
          ) : null}
          {autoSaved || saving ? (
            <span className={styles.saveStatus}>
              {saving ? t.savingAuto : t.savedAuto}
            </span>
          ) : null}
          {siteUrl && published ? (
            <a
              href={siteUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`${styles.btn} ${styles.btnGhost}`}
              data-testid="website-view-live"
            >
              {t.viewSite} ↗
            </a>
          ) : null}
          {published ? (
            <Link
              href="/lead-inbox"
              className={`${styles.btn} ${styles.btnGhost}`}
              data-testid="website-view-leads"
              style={{ textDecoration: "none" }}
            >
              {t.viewLeads}
            </Link>
          ) : null}
          {builderStep === 5 ? (
            <button
              type="button"
              className={`${styles.btn} ${
                published && !hasUnpublishedChanges
                  ? styles.btnDanger
                  : styles.btnSave
              }`}
              disabled={publishing || saving}
              onClick={handlePublishToggle}
            >
              {publishing
                ? t.publishing
                : published && !hasUnpublishedChanges
                  ? t.unpublish
                  : !published
                    ? t.publishLive
                    : t.publishChangesCta}
            </button>
          ) : null}
        </div>
      </div>

      <BuilderWorkflowStepper activeStep={builderStep} onStepClick={handleWorkflowStep} />
      </div>

      <div className={styles.workspaceVisual}>
        <div className={styles.visualStage} aria-label="Website preview">
          {(notice || error || autoSaved || copyEnhancing) && (
            <div className={styles.visualToast}>
              {notice ? <div className={styles.notice}>{notice}</div> : null}
              {copyEnhancing ? (
                <div className={styles.notice} data-testid="website-copy-enhancing">
                  {t.copyEnhancingHint || t.genStepCopyEnhance}
                </div>
              ) : null}
              {error ? <div className={styles.error}>{error}</div> : null}
              {autoSaved ? <div className={styles.savePulse}>{t.savedAuto}</div> : null}
            </div>
          )}
          {hasUnpublishedChanges ? (
            <div
              className={styles.hintBox}
              style={{
                margin: "8px 16px 0",
                borderColor: "rgba(245,158,11,0.55)",
                background: "rgba(245,158,11,0.12)",
                color: "#fbbf24",
              }}
              role="status"
            >
              {t.publishDirtyHint}
            </div>
          ) : null}
          {builderStep === 3 ? (
            <p
              style={{
                margin: "8px 16px 0",
                fontSize: "0.78rem",
                color: "#64748b",
                textAlign: "center",
              }}
            >
              {t.visualEditHint}
            </p>
          ) : null}
          {builderStep === 2 ? (
            <div className={styles.launchOverlayWrap} data-testid="website-builder-launch">
              <WebsiteBuilderLaunch
                t={t}
                companyProfile={companyProfile}
                themeColor={theme}
                generating={generating}
                genProgress={genProgress}
                completenessScore={completenessScore}
                hasExistingDraft={siteHasDraft}
                onGenerate={handleLaunchGenerate}
                onOpenAssistant={handleOpenWorkspaceAgent}
                onCancel={generating ? handleCancelGeneration : undefined}
              />
            </div>
          ) : null}
          <div className={styles.previewScrollFull}>
            <div className={`${styles.previewFrame} ${frameClass}`}>
              <WebsiteBuilderPreview
                theme={theme}
                form={previewForm}
                companyProfile={companyProfile}
                industryLabel={industryLabel}
                industryKey={industryKey}
                requestServices={liveRequestServices}
                slug={slug}
                locale={siteLocale}
                onQuoteClick={handleOpenQuoteForm}
                editable={builderStep === 3}
                selectedSection={selectedPreviewSection}
                onSelectSection={handlePreviewSectionSelect}
                onGalleryUploadClick={triggerGalleryUpload}
                onFieldChange={handlePreviewFieldChange}
                onServiceChange={handleServiceFieldChange}
                reviewsEmptyTitle={t.reviewsEmptyTitle}
                reviewsEmptyBody={t.reviewsEmptyBody}
                portfolio={siteMeta.portfolio}
              />
            </div>
          </div>
          <WebsiteBuilderFloatingBar
            t={t}
            builderStep={builderStep}
            device={device}
            onDeviceChange={setDevice}
            onOpenSettings={() => setShowAdvancedPanel(true)}
            onPublish={handlePublishToggle}
            publishing={publishing}
            published={published}
            saving={saving}
            themePresets={themePresets}
            themeColor={form.themeColor}
            onThemeChange={(c) => setField("themeColor", c)}
          />
        </div>

        {showAdvancedPanel && builderStep !== 4 ? (
          <aside className={styles.advancedDrawer}>
            {builderStep === 1 ? (
              <div className={styles.editorPanelBody}>
                <WebsiteBuilderSetupPanel
                  t={t}
                  companyProfile={companyProfile}
                  serviceCount={(form.services || []).length}
                  galleryCount={(form.galleryPhotos || []).length}
                  logoUrl={logoUrl}
                  onContinue={() => handleWorkflowStep(2)}
                  onCompanyProfileChange={(nextProfile) =>
                    setCompanyProfile(nextProfile)
                  }
                />
              </div>
            ) : (
              <>
                <div className={styles.editorPanelHeader}>
                  <p className={styles.editorPanelTitle}>{t.editLabel}</p>
                  <div className={styles.editorAiRow}>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      disabled={generating || saving}
                      onClick={handleRegenerateWithConfirm}
                    >
                      {t.regenerateCopy}
                    </button>
                    <button
                      type="button"
                      className={`${styles.btn} ${styles.btnGhost}`}
                      disabled={generating || saving}
                      onClick={handleOpenWorkspaceAgent}
                    >
                      {t.launchOpenAi}
                    </button>
                  </div>
                  <div className={styles.sectionNav}>
                    {[
                      ["all", t.sectionNavAll],
                      ["content", t.sectionNavContent],
                      ["images", t.sectionNavImages],
                      ["trust", t.sectionNavTrust],
                      ["advanced", t.sectionNavAdvanced],
                    ].map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        className={`${styles.sectionNavBtn} ${
                          activeSection === key ? styles.sectionNavBtnActive : ""
                        }`}
                        onClick={() => setActiveSection(key)}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
                <div className={styles.editorPanelBody}>
          {slug ? (
            <div className={styles.slugRow}>
              <div>
                <span style={{ color: "#94a3b8", fontWeight: 600 }}>{t.slugLabel}</span>
                <span className={styles.slugUrl}>
                  {typeof window !== "undefined"
                    ? `${window.location.origin}${sitePath}`
                    : sitePath}
                </span>
              </div>
              <div className={styles.slugEditRow}>
                <label className={styles.slugEditLabel} htmlFor="wb-slug-input">
                  {t.slugEditLabel}
                </label>
                <div className={styles.slugEditControls}>
                  <span className={styles.slugPrefix}>/sites/</span>
                  <input
                    id="wb-slug-input"
                    className={styles.slugInput}
                    value={slugDraft}
                    onChange={(e) => setSlugDraft(e.target.value)}
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button
                    type="button"
                    className={`${styles.btn} ${styles.btnGhost}`}
                    disabled={saving || slugDraft === slug}
                    onClick={handleSlugUpdate}
                  >
                    {t.slugSave}
                  </button>
                </div>
                <p className={styles.slugEditHint}>{t.slugEditHint}</p>
              </div>
              <div style={{ marginTop: 6, fontSize: "0.8rem", color: "#64748b" }}>
                {published ? t.publicSiteLive : t.publicSiteDraft}
                {" · "}
                {t.editorPathHint}
              </div>
            </div>
          ) : null}

          {!published && editorMode === "edit" ? (
            <div className={styles.hintBox}>{t.draftPrivateHint}</div>
          ) : null}

          {sectionVisible("heroImages") ? (
          <CollapsibleSection
            title={t.sectionHeroImages}
            open={openSections.heroImages}
            onToggle={() => toggleSection("heroImages")}
          >
            <HeroImageEditor
              slots={form.heroPhotos || []}
              imagePresets={imagePresets}
              imageStyle={imageStyle}
              onImageStyleChange={setImageStyle}
              onSlotsChange={(heroPhotos) => setField("heroPhotos", heroPhotos)}
              onGenerateSlot={handleGenerateHeroSlot}
              generatingSlotId={generatingSlotId}
              showGenerateActions={false}
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
          </CollapsibleSection>
          ) : null}

          {sectionVisible("hero") ? (
          <CollapsibleSection
            title={t.sectionHero}
            open={openSections.hero}
            onToggle={() => toggleSection("hero")}
          >
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
              <textarea
                className={`${styles.textarea} ${styles.textareaMedium}`}
                rows={3}
                value={form.subheadline}
                maxLength={300}
                onChange={(e) => setField("subheadline", e.target.value)}
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>{t.sectionAbout}</label>
              <textarea
                className={`${styles.textarea} ${styles.textareaTall}`}
                rows={8}
                value={form.aboutText}
                maxLength={2000}
                onChange={(e) => setField("aboutText", e.target.value)}
              />
            </div>
          </CollapsibleSection>
          ) : null}

          {sectionVisible("brand") ? (
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
          ) : null}

          {sectionVisible("services") ? (
          <CollapsibleSection
            title={t.sectionServices}
            open={openSections.services}
            onToggle={() => toggleSection("services")}
          >
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
                  <textarea
                    className={`${styles.textarea} ${styles.textareaMedium}`}
                    rows={3}
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
          ) : null}

          {sectionVisible("gallery") ? (
          <div ref={galleryPanelRef}>
          <CollapsibleSection
            title={t.sectionGallery}
            open={openSections.gallery}
            onToggle={() => toggleSection("gallery")}
          >
            <WebsiteBuilderPortfolio
              t={t}
              portfolio={siteMeta.portfolio}
              onPortfolioChange={handlePortfolioChange}
              onSyncFeaturedGallery={(featured) => {
                setForm((prev) => {
                  const next = { ...prev, galleryPhotos: featured };
                  formRef.current = next;
                  return next;
                });
              }}
              disabled={generating || saving}
            />
            <p style={{ fontSize: "0.78rem", color: "#94a3b8", margin: "14px 0 8px" }}>
              {t.galleryHint}
            </p>
            <label className={styles.addBtn} style={{ display: "block", cursor: "pointer" }}>
              {t.addGalleryPhotos}
              <input
                ref={galleryUploadInputRef}
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
                  <div key={photo.id || `g-${index}`} className={styles.galleryCard}>
                    <img
                      src={photo.thumbnail || photo.src}
                      alt=""
                      className={styles.galleryPhoto}
                      loading="lazy"
                      decoding="async"
                    />
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

            <WebsiteMobileUploads />
          </CollapsibleSection>
          </div>
          ) : null}

          {sectionVisible("social") ? (
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
          ) : null}

          {sectionVisible("analytics") ? (
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
          ) : null}

          {sectionVisible("seo") ? (
          <CollapsibleSection
            title="SEO & metadata"
            open={openSections.seo !== false}
            onToggle={() => toggleSection("seo")}
          >
            <div className={styles.field}>
              <label className={styles.label}>SEO title</label>
              <input
                className={styles.input}
                value={siteMeta.seoTitle || ""}
                maxLength={120}
                onChange={(e) =>
                  setSiteMeta((prev) => ({ ...prev, seoTitle: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>SEO description</label>
              <textarea
                className={`${styles.textarea} ${styles.textareaMedium}`}
                rows={4}
                value={siteMeta.seoDescription || ""}
                maxLength={320}
                onChange={(e) =>
                  setSiteMeta((prev) => ({ ...prev, seoDescription: e.target.value }))
                }
              />
            </div>
            <div className={styles.field}>
              <label className={styles.label}>Footer tagline</label>
              <textarea
                className={`${styles.textarea} ${styles.textareaMedium}`}
                rows={2}
                value={siteMeta.footerTagline || ""}
                maxLength={200}
                onChange={(e) =>
                  setSiteMeta((prev) => ({ ...prev, footerTagline: e.target.value }))
                }
              />
            </div>
          </CollapsibleSection>
          ) : null}

          {sectionVisible("domain") ? (
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
          ) : null}

          {sectionVisible("trust") ? (
          <CollapsibleSection
            title={t.sectionTrust}
            open={openSections.trust}
            onToggle={() => toggleSection("trust")}
          >
            <div className={styles.trustList}>
              {(form.trustBadges || []).map((badge) => (
                <span key={badge} className={styles.trustChip}>
                  {badge}
                </span>
              ))}
            </div>
            <p className={styles.hintBox}>{t.trustBadgesHint}</p>
            <div className={styles.reviewsEmptyState} style={{ marginTop: 12 }}>
              <p className={styles.reviewsEmptyTitle}>{t.reviewsEmptyTitle}</p>
              <p className={styles.reviewsEmptyBody}>{t.reviewsEmptyBody}</p>
            </div>
          </CollapsibleSection>
          ) : null}

                </div>
              </>
            )}
          </aside>
        ) : null}
      </div>
    </div>
    </WebsiteBuilderEditProvider>
  );
}
