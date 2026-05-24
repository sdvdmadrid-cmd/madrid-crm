"use client";

import { useEffect, useMemo, useState } from "react";
import TurnstileField from "@/components/security/TurnstileField";
import { getPublicSiteCopy } from "@/lib/public-site-copy";
import {
  LEAD_BUDGET_OPTIONS,
  LEAD_CONTACT_PREFERENCES,
  LEAD_TIMELINE_OPTIONS,
} from "@/lib/website-lead-form";

const MAX_IMAGE_SIZE = 4 * 1024 * 1024;
const STEPS = 4;

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("Failed to read file"));
    reader.readAsDataURL(file);
  });
}

function pickInitialService(options, initialService) {
  if (initialService && options.includes(initialService)) return initialService;
  return options[0] || "";
}

export default function PremiumLeadForm({
  slug,
  serviceOptions: serviceOptionsProp = [],
  initialService = "",
  locale: localeProp = "en",
  requireEmail = false,
  themeColor: themeColorProp = "#1d4ed8",
}) {
  const [configLoading, setConfigLoading] = useState(Boolean(slug));
  const [configError, setConfigError] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [serviceOptions, setServiceOptions] = useState(serviceOptionsProp);
  const [locale, setLocale] = useState(localeProp);
  const [themeColor, setThemeColor] = useState(themeColorProp);
  const [budgetOptions, setBudgetOptions] = useState(LEAD_BUDGET_OPTIONS);
  const [timelineOptions, setTimelineOptions] = useState(LEAD_TIMELINE_OPTIONS);
  const [contactPrefs, setContactPrefs] = useState(LEAD_CONTACT_PREFERENCES);

  const copy = getPublicSiteCopy(locale);
  const formCopy = copy.form;
  const stepsCopy = copy.formSteps || {};

  const [step, setStep] = useState(0);
  const [form, setForm] = useState({
    name: "",
    email: "",
    phone: "",
    addressLine1: "",
    city: "",
    state: "",
    zipCode: "",
    serviceNeeded: "",
    description: "",
    budgetRange: "",
    timeline: "",
    contactPreference: "phone",
    photoDataUrl: "",
    website: "",
    submissionId: "",
    formStartedAt: String(Date.now()),
  });
  const [errors, setErrors] = useState({});
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetKey, setTurnstileResetKey] = useState(0);
  const [leadId, setLeadId] = useState("");

  useEffect(() => {
    if (!slug) {
      setConfigLoading(false);
      setServiceOptions(serviceOptionsProp);
      return;
    }

    let cancelled = false;
    (async () => {
      setConfigLoading(true);
      setConfigError("");
      try {
        const res = await fetch(`/api/site/${encodeURIComponent(slug)}/lead-form-config`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Unable to load form");
        if (cancelled) return;
        const data = json.data || {};
        const services = Array.isArray(data.services) ? data.services : [];
        setCompanyName(data.companyName || "");
        setServiceOptions(services.length ? services : serviceOptionsProp);
        setLocale(data.locale || localeProp);
        setThemeColor(data.themeColor || themeColorProp);
        if (Array.isArray(data.budgetOptions) && data.budgetOptions.length) {
          setBudgetOptions(data.budgetOptions);
        }
        if (Array.isArray(data.timelineOptions) && data.timelineOptions.length) {
          setTimelineOptions(data.timelineOptions);
        }
        if (Array.isArray(data.contactPreferences) && data.contactPreferences.length) {
          setContactPrefs(data.contactPreferences);
        }
        setForm((prev) => ({
          ...prev,
          serviceNeeded: pickInitialService(
            services.length ? services : serviceOptionsProp,
            initialService,
          ),
          submissionId:
            prev.submissionId ||
            (typeof crypto !== "undefined" && crypto.randomUUID
              ? crypto.randomUUID()
              : String(Date.now())),
        }));
      } catch (err) {
        if (!cancelled) {
          setServiceOptions(serviceOptionsProp);
          setForm((prev) => ({
            ...prev,
            serviceNeeded: pickInitialService(serviceOptionsProp, initialService),
          }));
          if (!serviceOptionsProp.length) {
            setConfigError(err.message || "Form unavailable");
          }
        }
      } finally {
        if (!cancelled) setConfigLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [slug, serviceOptionsProp, initialService, localeProp, themeColorProp]);

  const trustPills = useMemo(
    () => [
      stepsCopy.trustLicensed || "✓ Licensed & insured",
      stepsCopy.trustFast || "⚡ Same-day response",
      stepsCopy.trustFree || "💬 Free estimates",
    ],
    [stepsCopy],
  );

  const handleChange = (e) => {
    const { name, value } = e.target;
    setForm((prev) => ({ ...prev, [name]: value }));
    setErrors((prev) => ({ ...prev, [name]: "" }));
  };

  const validateStep = (index) => {
    const next = {};
    if (index === 0) {
      if (!String(form.serviceNeeded || "").trim()) next.serviceNeeded = formCopy.selectService;
      if (!String(form.description || "").trim()) next.description = formCopy.message;
      if (!String(form.budgetRange || "").trim()) next.budgetRange = formCopy.budgetRequired;
      if (!String(form.timeline || "").trim()) next.timeline = formCopy.timelineRequired;
    }
    if (index === 1) {
      if (!String(form.addressLine1 || "").trim()) next.addressLine1 = formCopy.addressRequired;
      if (!String(form.city || "").trim()) next.city = formCopy.cityRequired;
      if (!String(form.state || "").trim()) next.state = formCopy.stateRequired;
      if (!String(form.zipCode || "").trim()) next.zipCode = formCopy.zipRequired;
    }
    if (index === 2) {
      if (!String(form.name || "").trim()) next.name = formCopy.name;
      if (!String(form.phone || "").trim()) next.phone = formCopy.phone;
      if (requireEmail && !String(form.email || "").trim()) next.email = formCopy.email;
      if (form.contactPreference === "email" && !String(form.email || "").trim()) {
        next.email = formCopy.email;
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const handlePhotoChange = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      setError(formCopy.imageOnly);
      return;
    }
    if (file.size > MAX_IMAGE_SIZE) {
      setError(formCopy.imageLarge);
      return;
    }
    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((prev) => ({ ...prev, photoDataUrl: dataUrl }));
      setError("");
    } catch {
      setError(formCopy.imageReadFailed);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!validateStep(2)) {
      setStep(2);
      return;
    }
    if (!slug) {
      setError(formCopy.saveSiteFirst);
      return;
    }
    if (!serviceOptions.length) {
      setError(formCopy.noServices);
      return;
    }

    setLoading(true);
    setError("");
    try {
      const res = await fetch(`/api/site/${encodeURIComponent(slug)}/contact`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, turnstileToken }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(json.error || formCopy.submitFailed);
      }
      setLeadId(json.leadId || "");
      setSuccess(true);
      setForm({
        name: "",
        email: "",
        phone: "",
        addressLine1: "",
        city: "",
        state: "",
        zipCode: "",
        serviceNeeded: pickInitialService(serviceOptions, initialService),
        description: "",
        budgetRange: "",
        timeline: "",
        contactPreference: "phone",
        photoDataUrl: "",
        website: "",
        submissionId:
          typeof crypto !== "undefined" && crypto.randomUUID
            ? crypto.randomUUID()
            : String(Date.now()),
        formStartedAt: String(Date.now()),
      });
      setStep(0);
      setTurnstileToken("");
      setTurnstileResetKey((k) => k + 1);
    } catch (err) {
      setError(err.message || formCopy.submitFailed);
      setTurnstileResetKey((k) => k + 1);
    } finally {
      setLoading(false);
    }
  };

  const goNext = () => {
    if (!validateStep(step)) return;
    setStep((s) => Math.min(s + 1, STEPS - 1));
  };

  const goBack = () => setStep((s) => Math.max(s - 1, 0));

  const stepTitles = [
    stepsCopy.step1Title || "What do you need?",
    stepsCopy.step2Title || "Where is the project?",
    stepsCopy.step3Title || "How can we reach you?",
    stepsCopy.step4Title || "Review & send",
  ];

  const stepSubs = [
    stepsCopy.step1Sub || "Pick your service and tell us about the job.",
    stepsCopy.step2Sub || "We use your address to schedule an on-site visit.",
    stepsCopy.step3Sub || "Your info stays private. No spam, ever.",
    stepsCopy.step4Sub || "Optional photo helps us quote accurately.",
  ];

  const reviewLines = useMemo(() => {
    const budgetLabel =
      budgetOptions.find((o) => o.id === form.budgetRange)?.label || form.budgetRange;
    const timelineLabel =
      timelineOptions.find((o) => o.id === form.timeline)?.label || form.timeline;
    const prefLabel =
      contactPrefs.find((o) => o.id === form.contactPreference)?.label ||
      form.contactPreference;
    return [
      { label: formCopy.service, value: form.serviceNeeded },
      { label: formCopy.budget, value: budgetLabel },
      { label: formCopy.timeline, value: timelineLabel },
      { label: formCopy.contactPreference, value: prefLabel },
      {
        label: formCopy.address,
        value: [form.addressLine1, form.city, form.state, form.zipCode].filter(Boolean).join(", "),
      },
      { label: formCopy.name, value: form.name },
      { label: formCopy.phone, value: form.phone },
      { label: formCopy.emailOptional, value: form.email || "—" },
    ];
  }, [form, budgetOptions, timelineOptions, contactPrefs, formCopy]);

  if (configLoading) {
    return (
      <div className="ps-lead-wrap" style={{ "--theme": themeColor }}>
        <div className="ps-lead-card">
          <p className="ps-lead-sub">{stepsCopy.loading || "Loading request form…"}</p>
        </div>
      </div>
    );
  }

  if (!serviceOptions.length) {
    return (
      <div className="ps-lead-wrap" style={{ "--theme": themeColor }}>
        <div className="ps-lead-card">
          <p className="ps-lead-title">{formCopy.noServicesTitle}</p>
          <p className="ps-lead-sub">{formCopy.noServices}</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="ps-lead-wrap" style={{ "--theme": themeColor }}>
        <div className="ps-lead-card">
          <div className="ps-success-screen">
            <div className="ps-success-icon" aria-hidden>
              ✓
            </div>
            <h3 className="ps-lead-title">{stepsCopy.successTitle || "Request received!"}</h3>
            <p className="ps-lead-sub" style={{ marginBottom: 0 }}>
              {companyName
                ? fillCompany(stepsCopy.successBody || formCopy.success, companyName)
                : formCopy.success}
            </p>
            {leadId ? (
              <p className="ps-lead-ref" style={{ marginTop: 12, fontSize: 12, opacity: 0.75 }}>
                {formCopy.reference} {leadId.slice(0, 8)}
              </p>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="ps-lead-wrap" style={{ "--theme": themeColor }}>
      <div className="ps-lead-card">
        <div className="ps-lead-trust">
          {trustPills.map((pill) => (
            <span key={pill} className="ps-lead-trust-pill">
              {pill}
            </span>
          ))}
        </div>

        <div className="ps-lead-steps" aria-hidden>
          {Array.from({ length: STEPS }).map((_, i) => (
            <div key={i} className={`ps-lead-step-dot ${i <= step ? "ps-active" : ""}`} />
          ))}
        </div>
        <p className="ps-lead-progress" aria-live="polite">
          {stepsCopy.stepOf
            ? stepsCopy.stepOf(step + 1, STEPS)
            : `Step ${step + 1} of ${STEPS}`}
        </p>

        <h3 className="ps-lead-title">{stepTitles[step]}</h3>
        <p className="ps-lead-sub">{stepSubs[step]}</p>

        {configError ? (
          <p className="ps-lead-sub" style={{ color: "#fde68a", marginBottom: 8 }}>
            {configError}
          </p>
        ) : null}

        {error ? (
          <div className="ps-lead-alert" role="alert">
            {error}
          </div>
        ) : null}

        <form onSubmit={handleSubmit} data-lead-form="website-request" noValidate>
          <input
            type="text"
            name="website"
            value={form.website}
            onChange={handleChange}
            autoComplete="off"
            tabIndex={-1}
            aria-hidden="true"
            className="ps-honeypot"
          />
          <input type="hidden" name="formStartedAt" value={form.formStartedAt} readOnly />
          <input type="hidden" name="submissionId" value={form.submissionId} readOnly />

          {step === 0 ? (
            <>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-service">
                  {formCopy.service}
                </label>
                <select
                  id="ps-service"
                  name="serviceNeeded"
                  value={form.serviceNeeded}
                  onChange={handleChange}
                  className={`ps-select ${errors.serviceNeeded ? "ps-invalid" : ""}`}
                >
                  <option value="">{formCopy.selectService}</option>
                  {serviceOptions.map((option) => (
                    <option key={option} value={option} style={{ color: "#0f172a" }}>
                      {option}
                    </option>
                  ))}
                </select>
                {errors.serviceNeeded ? (
                  <p className="ps-field-error">{errors.serviceNeeded}</p>
                ) : null}
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-desc">
                  {formCopy.message}
                </label>
                <textarea
                  id="ps-desc"
                  name="description"
                  value={form.description}
                  onChange={handleChange}
                  rows={4}
                  className={`ps-textarea ${errors.description ? "ps-invalid" : ""}`}
                  placeholder={formCopy.messagePlaceholder}
                />
                {errors.description ? <p className="ps-field-error">{errors.description}</p> : null}
              </div>
              <div className="ps-field-row">
                <div className="ps-field">
                  <label className="ps-label" htmlFor="ps-budget">
                    {formCopy.budget}
                  </label>
                  <select
                    id="ps-budget"
                    name="budgetRange"
                    value={form.budgetRange}
                    onChange={handleChange}
                    className={`ps-select ${errors.budgetRange ? "ps-invalid" : ""}`}
                  >
                    <option value="">{formCopy.selectBudget}</option>
                    {budgetOptions.map((opt) => (
                      <option key={opt.id} value={opt.id} style={{ color: "#0f172a" }}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {errors.budgetRange ? (
                    <p className="ps-field-error">{errors.budgetRange}</p>
                  ) : null}
                </div>
                <div className="ps-field">
                  <label className="ps-label" htmlFor="ps-timeline">
                    {formCopy.timeline}
                  </label>
                  <select
                    id="ps-timeline"
                    name="timeline"
                    value={form.timeline}
                    onChange={handleChange}
                    className={`ps-select ${errors.timeline ? "ps-invalid" : ""}`}
                  >
                    <option value="">{formCopy.selectTimeline}</option>
                    {timelineOptions.map((opt) => (
                      <option key={opt.id} value={opt.id} style={{ color: "#0f172a" }}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                  {errors.timeline ? (
                    <p className="ps-field-error">{errors.timeline}</p>
                  ) : null}
                </div>
              </div>
            </>
          ) : null}

          {step === 1 ? (
            <>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-line1">
                  {formCopy.street}
                </label>
                <input
                  id="ps-line1"
                  type="text"
                  name="addressLine1"
                  value={form.addressLine1}
                  onChange={handleChange}
                  className={`ps-input ${errors.addressLine1 ? "ps-invalid" : ""}`}
                  autoComplete="street-address"
                  placeholder={formCopy.streetPlaceholder}
                />
                {errors.addressLine1 ? (
                  <p className="ps-field-error">{errors.addressLine1}</p>
                ) : null}
              </div>
              <div className="ps-field-row">
                <div className="ps-field">
                  <label className="ps-label" htmlFor="ps-city">
                    {formCopy.city}
                  </label>
                  <input
                    id="ps-city"
                    type="text"
                    name="city"
                    value={form.city}
                    onChange={handleChange}
                    className={`ps-input ${errors.city ? "ps-invalid" : ""}`}
                    autoComplete="address-level2"
                  />
                  {errors.city ? <p className="ps-field-error">{errors.city}</p> : null}
                </div>
                <div className="ps-field ps-field-narrow">
                  <label className="ps-label" htmlFor="ps-state">
                    {formCopy.state}
                  </label>
                  <input
                    id="ps-state"
                    type="text"
                    name="state"
                    value={form.state}
                    onChange={handleChange}
                    className={`ps-input ${errors.state ? "ps-invalid" : ""}`}
                    autoComplete="address-level1"
                    maxLength={2}
                    placeholder="TX"
                  />
                  {errors.state ? <p className="ps-field-error">{errors.state}</p> : null}
                </div>
                <div className="ps-field ps-field-narrow">
                  <label className="ps-label" htmlFor="ps-zip">
                    {formCopy.zip}
                  </label>
                  <input
                    id="ps-zip"
                    type="text"
                    name="zipCode"
                    value={form.zipCode}
                    onChange={handleChange}
                    className={`ps-input ${errors.zipCode ? "ps-invalid" : ""}`}
                    autoComplete="postal-code"
                  />
                  {errors.zipCode ? <p className="ps-field-error">{errors.zipCode}</p> : null}
                </div>
              </div>
            </>
          ) : null}

          {step === 2 ? (
            <>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-name">
                  {formCopy.name}
                </label>
                <input
                  id="ps-name"
                  type="text"
                  name="name"
                  value={form.name}
                  onChange={handleChange}
                  className={`ps-input ${errors.name ? "ps-invalid" : ""}`}
                  autoComplete="name"
                />
                {errors.name ? <p className="ps-field-error">{errors.name}</p> : null}
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-phone">
                  {formCopy.phone}
                </label>
                <input
                  id="ps-phone"
                  type="tel"
                  name="phone"
                  value={form.phone}
                  onChange={handleChange}
                  className={`ps-input ${errors.phone ? "ps-invalid" : ""}`}
                  autoComplete="tel"
                />
                {errors.phone ? <p className="ps-field-error">{errors.phone}</p> : null}
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-email">
                  {requireEmail || form.contactPreference === "email"
                    ? formCopy.email
                    : formCopy.emailOptional}
                </label>
                <input
                  id="ps-email"
                  type="email"
                  name="email"
                  value={form.email}
                  onChange={handleChange}
                  required={requireEmail || form.contactPreference === "email"}
                  className={`ps-input ${errors.email ? "ps-invalid" : ""}`}
                  placeholder="you@email.com"
                  autoComplete="email"
                />
                {errors.email ? <p className="ps-field-error">{errors.email}</p> : null}
              </div>
              <fieldset className="ps-field">
                <legend className="ps-label">{formCopy.contactPreference}</legend>
                <div className="ps-contact-prefs">
                  {contactPrefs.map((pref) => (
                    <label key={pref.id} className="ps-contact-pref">
                      <input
                        type="radio"
                        name="contactPreference"
                        value={pref.id}
                        checked={form.contactPreference === pref.id}
                        onChange={handleChange}
                      />
                      <span>{pref.label}</span>
                    </label>
                  ))}
                </div>
              </fieldset>
            </>
          ) : null}

          {step === 3 ? (
            <>
              <div className="ps-review">
                {reviewLines.map((line) => (
                  <div key={line.label} className="ps-review-row">
                    <span className="ps-review-label">{line.label}</span>
                    <span className="ps-review-value">{line.value || "—"}</span>
                  </div>
                ))}
              </div>
              <div className="ps-field">
                <label className="ps-label" htmlFor="ps-photo">
                  {formCopy.photo}
                </label>
                <input
                  id="ps-photo"
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoChange}
                  className="ps-input"
                />
                {form.photoDataUrl ? (
                  <img src={form.photoDataUrl} alt="" className="ps-photo-preview" />
                ) : null}
              </div>
              <TurnstileField onToken={setTurnstileToken} resetKey={turnstileResetKey} />
            </>
          ) : null}

          <div className="ps-lead-actions">
            {step > 0 ? (
              <button type="button" className="ps-btn-back" onClick={goBack} disabled={loading}>
                {stepsCopy.back || "Back"}
              </button>
            ) : null}
            {step < STEPS - 1 ? (
              <button type="button" className="ps-btn-next" onClick={goNext}>
                {stepsCopy.continue || "Continue"} →
              </button>
            ) : (
              <button type="submit" className="ps-btn-next" disabled={loading}>
                {loading ? formCopy.sending : stepsCopy.submit || formCopy.send}
              </button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}

function fillCompany(template, company) {
  return String(template || "").replace(/\{\{company\}\}/g, company);
}
