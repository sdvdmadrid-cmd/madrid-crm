"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { getUsStateLabel, getUsStateTaxRate } from "@/lib/estimate-pricing";
import { supabase } from "@/lib/supabase";

const currencyFormatter = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const DEFAULT_ITEM = {
  description: "",
  quantity: "1",
  unitPrice: "0",
};

function createItem() {
  return {
    id: globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random()}`,
    ...DEFAULT_ITEM,
  };
}

function createEstimateNumber() {
  const now = new Date();
  const stamp = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}`;
  const suffix = Math.floor(100 + Math.random() * 900);
  return `EST-${stamp}-${suffix}`;
}

function createEmptyEstimate() {
  return {
    clientId: "",
    jobId: "",
    estimateNumber: createEstimateNumber(),
    status: "draft",
    currency: "USD",
    notes: "",
    items: [createItem()],
    applyTax: true,
    taxRatePct: "0",
  };
}

function parseAmount(value) {
  const raw = String(value ?? "").trim();
  if (!raw) return Number.NaN;
  const num = Number(raw);
  return Number.isFinite(num) ? num : Number.NaN;
}

function toMoney(value) {
  const num = Number(value || 0);
  if (!Number.isFinite(num)) return 0;
  return Math.round(num * 100) / 100;
}

function formatMoney(value) {
  return currencyFormatter.format(toMoney(value));
}

function getRowMetrics(item) {
  const quantity = parseAmount(item.quantity);
  const unitPrice = parseAmount(item.unitPrice);
  const rowTotal =
    Number.isFinite(quantity) && quantity >= 1 && Number.isFinite(unitPrice) && unitPrice >= 0
      ? toMoney(quantity * unitPrice)
      : 0;

  return { quantity, unitPrice, rowTotal };
}

function getRowErrors(item) {
  const { quantity, unitPrice } = getRowMetrics(item);

  return {
    quantity: Number.isFinite(quantity) && quantity >= 1 ? "" : "Enter a quantity of 1 or more",
    unitPrice: Number.isFinite(unitPrice) && unitPrice >= 0 ? "" : "Enter a unit price of $0.00 or more",
  };
}

export default function NewEstimateForm({ onCreated }) {
  const router = useRouter();
  const { t } = useTranslation();
  const [authState, setAuthState] = useState("checking");
  const [loadingData, setLoadingData] = useState(true);
  const [saving, setSaving] = useState(false);
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const [formError, setFormError] = useState("");
  const [success, setSuccess] = useState("");
  const [clients, setClients] = useState([]);
  const [allJobs, setAllJobs] = useState([]);
  const [companyTaxState] = useState("TX");
  const [userContext, setUserContext] = useState({
    userId: "",
    tenantId: "",
    email: "",
    name: "",
  });
  const [form, setForm] = useState(createEmptyEstimate);

  const selectedJob = useMemo(
    () => allJobs.find((job) => job.id === form.jobId) || null,
    [allJobs, form.jobId],
  );

  const availableJobs = useMemo(() => {
    if (!form.clientId) return allJobs;
    const filtered = allJobs.filter((job) => job.clientId === form.clientId);
    return filtered.length > 0 ? filtered : allJobs;
  }, [allJobs, form.clientId]);

  const activeTaxState = useMemo(
    () => selectedJob?.taxState || companyTaxState || "TX",
    [companyTaxState, selectedJob],
  );

  const automaticTaxRate = useMemo(
    () => String(getUsStateTaxRate(activeTaxState) || 0),
    [activeTaxState],
  );

  const rowErrors = useMemo(
    () => form.items.map((item) => getRowErrors(item)),
    [form.items],
  );

  const hasMeaningfulItems = useMemo(
    () => form.items.some((item) => String(item.description || "").trim()),
    [form.items],
  );

  const hasInvalidRows = useMemo(
    () => rowErrors.some((item) => item.quantity || item.unitPrice),
    [rowErrors],
  );

  const subtotal = useMemo(() => {
    return toMoney(
      form.items.reduce((sum, item) => sum + getRowMetrics(item).rowTotal, 0),
    );
  }, [form.items]);

  const taxRate = form.applyTax ? Number(form.taxRatePct || 0) : 0;
  const taxAmount = toMoney(subtotal * (Number.isFinite(taxRate) ? taxRate / 100 : 0));
  const total = toMoney(subtotal + taxAmount);

  useEffect(() => {
    let cancelled = false;

    const loadInitial = async () => {
      setLoadingData(true);
      setFormError("");

      try {
        const meRes = await apiFetch("/api/auth/me", {
          cache: "no-store",
          suppressUnauthorizedEvent: true,
        });

        if (meRes.status === 401) {
          setAuthState("redirecting");
          router.push("/login?next=/estimates");
          return;
        }

        const mePayload = await getJsonOrThrow(meRes, "Unable to load your account.");

        if (cancelled) return;

        setUserContext({
          userId: mePayload?.data?.userId || "",
          tenantId: mePayload?.data?.tenantId || "",
          email: mePayload?.data?.email || "",
          name: mePayload?.data?.name || "",
        });

        const [clientsRes, jobsRes] = await Promise.all([
          apiFetch("/api/clients", { cache: "no-store", suppressUnauthorizedEvent: true }),
          apiFetch("/api/jobs", { cache: "no-store", suppressUnauthorizedEvent: true }),
        ]);

        const clientsPayload = await getJsonOrThrow(clientsRes, "Unable to load clients.");
        const jobsPayload = await getJsonOrThrow(jobsRes, "Unable to load jobs.");

        if (cancelled) return;

        setClients(Array.isArray(clientsPayload) ? clientsPayload : clientsPayload?.data || []);
        setAllJobs(Array.isArray(jobsPayload) ? jobsPayload : jobsPayload?.data || []);
        setAuthState("ready");
      } catch (error) {
        if (cancelled) return;
        setAuthState("ready");
        setFormError(error.message || "We couldn't load the estimate builder.");
      } finally {
        if (!cancelled) {
          setLoadingData(false);
        }
      }
    };

    loadInitial();

    return () => {
      cancelled = true;
    };
  }, [router]);

  useEffect(() => {
    if (!form.applyTax) return;
    setForm((prev) => ({ ...prev, taxRatePct: automaticTaxRate }));
  }, [automaticTaxRate, form.applyTax]);

  const updateForm = (patch) => {
    setForm((prev) => ({ ...prev, ...patch }));
  };

  const updateItem = (id, patch) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.map((item) => (item.id === id ? { ...item, ...patch } : item)),
    }));
  };

  const addItem = () => {
    setForm((prev) => ({
      ...prev,
      items: [...prev.items, createItem()],
    }));
  };

  const removeItem = (id) => {
    setForm((prev) => ({
      ...prev,
      items: prev.items.length === 1 ? [createItem()] : prev.items.filter((item) => item.id !== id),
    }));
  };

  const handleJobChange = (jobId) => {
    const nextJob = allJobs.find((job) => job.id === jobId) || null;
    setForm((prev) => ({
      ...prev,
      jobId,
      clientId: nextJob?.clientId || prev.clientId,
    }));
  };

  const handleTaxToggle = (enabled) => {
    setForm((prev) => ({
      ...prev,
      applyTax: enabled,
      taxRatePct: enabled ? automaticTaxRate : "0",
    }));
  };

  const submit = async (event) => {
    event.preventDefault();
    setSubmitAttempted(true);
    setFormError("");
    setSuccess("");

    if (!form.clientId) {
      setFormError(t("estimateForm.errors.selectClientFull"));
      return;
    }

    if (!hasMeaningfulItems) {
      setFormError(t("estimateForm.errors.addLineItem"));
      return;
    }

    if (hasInvalidRows) {
      setFormError(t("estimateForm.errors.invalidLineItems"));
      return;
    }

    try {
      setSaving(true);

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser();

      if (userError) {
        console.error("[NewEstimateForm] Failed to load current Supabase user", userError);
        throw new Error(userError.message);
      }

      if (!user?.id) {
        throw new Error("Unable to resolve the current user.");
      }

      const selectedClient =
        clients.find((client) => (client._id || client.id) === form.clientId) || null;

      const cleanedItems = form.items
        .filter((item) => String(item.description || "").trim())
        .map((item) => {
          const metrics = getRowMetrics(item);
          return {
            description: String(item.description || "").trim(),
            quantity: metrics.quantity,
            unitPrice: metrics.unitPrice,
            total: metrics.rowTotal,
          };
        });

      const payload = {
        tenant_id: user.id,
        user_id: user.id,
        client_id: form.clientId,
        client_name: selectedClient?.name || "",
        job_id: form.jobId || null,
        estimate_number: form.estimateNumber.trim() || createEstimateNumber(),
        status: form.status,
        currency: form.currency,
        items: cleanedItems,
        subtotal,
        tax: taxAmount,
        total,
        notes: form.notes.trim() || null,
      };

      const { data, error } = await supabase
        .from("estimates")
        .insert(payload)
        .select("id, estimate_number, total")
        .single();

      if (error) {
        console.error("[NewEstimateForm] Supabase estimate insert error", error);
        throw new Error(error.message);
      }

      setSuccess(t("estimateForm.success.estimateReady", { number: data?.estimate_number || "" }));
      setSubmitAttempted(false);
      setForm((prev) => ({
        ...createEmptyEstimate(),
        applyTax: prev.applyTax,
        taxRatePct: prev.applyTax ? automaticTaxRate : "0",
      }));

      if (typeof onCreated === "function") {
        onCreated(data);
      }
    } catch (error) {
      console.error("[NewEstimateForm] submit error", error);
      setFormError(error.message || t("estimateForm.errors.createEstimate"));
    } finally {
      setSaving(false);
    }
  };

  if (authState === "redirecting") {
    return null;
  }

  if (authState === "checking" || loadingData) {
    return (
      <div className="min-h-screen bg-[#f5f5f7] flex items-center justify-center">
        <div className="bg-white rounded-2xl shadow-sm px-10 py-8 text-[#1d1d1f] text-sm font-medium">
          {t("estimateForm.loading")}
        </div>
      </div>
    );
  }

  return (
    <form className="min-h-screen bg-[#f5f5f7] pb-16" onSubmit={submit}>

      {/* ── Top header ─────────────────────────────────────────── */}
      <div className="bg-white/80 backdrop-blur-md border-b border-gray-200/60 sticky top-0 z-20">
        <div className="max-w-5xl mx-auto px-6 py-4 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-[1.35rem] font-semibold tracking-tight text-[#1d1d1f] leading-tight">
              {t("estimateForm.pageTitle")}
            </h1>
            <p className="text-sm text-gray-500 mt-0.5">
              {t("estimateForm.headerSubtitle")}
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              type="submit"
              name="action"
              value="draft"
              onClick={() => updateForm({ status: "draft" })}
              disabled={saving}
              className="px-4 py-2 rounded-xl text-sm font-medium text-[#007aff] border border-[#007aff]/30 bg-[#007aff]/5 hover:bg-[#007aff]/10 transition-colors disabled:opacity-50"
            >
              {t("estimateForm.buttons.saveDraft")}
            </button>
            <button
              type="submit"
              disabled={saving}
              onClick={() => updateForm({ status: "sent" })}
              className="px-5 py-2 rounded-xl text-sm font-semibold text-white bg-[#007aff] hover:bg-[#0066dd] transition-colors shadow-sm disabled:opacity-50"
            >
              {saving ? t("estimateForm.buttons.saving") : t("estimateForm.buttons.sendEstimate")}
            </button>
          </div>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-6 pt-8 space-y-5">

        {/* ── Banners ──────────────────────────────────────────── */}
        {formError && (
          <div className="bg-red-50 border border-red-200 text-red-700 text-sm rounded-2xl px-5 py-4">
            {formError}
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 text-sm rounded-2xl px-5 py-4">
            {success}
          </div>
        )}

        {/* ── Card 1: Client & Job ─────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-gray-400 mb-1">
              {t("estimateForm.steps.step1")}
            </p>
            <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">{t("estimateForm.steps.clientJobTitle")}</h2>
          </div>

          <div className="px-6 pb-6 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-5">

            {/* Client */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[0.82rem] font-semibold text-[#1d1d1f]">{t("estimateForm.fields.client")}</label>
                <a
                  href="/clients"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.75rem] font-semibold text-[#007aff] hover:underline"
                >
                  {t("estimateForm.links.newClient")}
                </a>
              </div>
              <select
                value={form.clientId}
                onChange={(e) => updateForm({ clientId: e.target.value })}
                className="w-full rounded-xl border border-gray-200 bg-[#f9f9f9] px-3.5 py-2.5 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
              >
                <option value="">{t("estimateForm.placeholders.client")}</option>
                {clients.map((c) => (
                  <option key={c._id || c.id} value={c._id || c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              {submitAttempted && !form.clientId && (
                <span className="text-[0.75rem] text-red-500">{t("estimateForm.errors.selectClient")}</span>
              )}
            </div>

            {/* Job */}
            <div className="flex flex-col gap-1.5">
              <div className="flex items-center justify-between">
                <label className="text-[0.82rem] font-semibold text-[#1d1d1f]">
                  {t("estimateForm.fields.job")}{" "}
                  <span className="text-gray-400 font-normal">{t("estimateForm.fields.jobOptional")}</span>
                </label>
                <a
                  href="/jobs"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[0.75rem] font-semibold text-[#007aff] hover:underline"
                >
                  {t("estimateForm.links.newJob")}
                </a>
              </div>
              <select
                value={form.jobId}
                onChange={(e) => handleJobChange(e.target.value)}
                className="w-full rounded-xl border border-gray-200 bg-[#f9f9f9] px-3.5 py-2.5 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
              >
                <option value="">{t("estimateForm.placeholders.job")}</option>
                {availableJobs.map((job) => (
                  <option key={job.id} value={job.id}>
                    {job.title} {job.clientName ? `- ${job.clientName}` : ""}
                  </option>
                ))}
              </select>
              {availableJobs.length === 0 && (
                <span className="text-[0.75rem] text-gray-400">{t("estimateForm.hints.noJobs")}</span>
              )}
            </div>

            {/* Estimate number */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.82rem] font-semibold text-[#1d1d1f]">{t("estimateForm.fields.estimateNumber")}</label>
              <input
                value={form.estimateNumber}
                onChange={(e) => updateForm({ estimateNumber: e.target.value })}
                placeholder={t("estimateForm.placeholders.estimateNumber")}
                className="w-full rounded-xl border border-gray-200 bg-[#f9f9f9] px-3.5 py-2.5 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
              />
            </div>

          </div>
        </div>

        {/* ── Card 2: Line Items ───────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 pt-6 pb-2 flex items-center justify-between">
            <div>
              <p className="text-[0.7rem] font-bold uppercase tracking-widest text-gray-400 mb-1">
                {t("estimateForm.steps.step2")}
              </p>
              <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">{t("estimateForm.fields.lineItems")}</h2>
            </div>
            <button
              type="button"
              onClick={addItem}
              className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-[#007aff] border border-[#007aff]/25 bg-[#007aff]/5 hover:bg-[#007aff]/10 transition-colors"
            >
              <span className="text-base leading-none">+</span> {t("estimateForm.buttons.addItem").replace(/^\+\s*/, "")}
            </button>
          </div>

          {/* Table header */}
          <div className="px-6 mt-3">
            <div className="hidden sm:grid grid-cols-[1fr_100px_120px_100px_80px] gap-3 px-3 py-2 text-[0.72rem] font-bold uppercase tracking-wider text-gray-400">
              <span>{t("estimateForm.fields.description")}</span>
              <span>{t("estimateForm.fields.qty")}</span>
              <span>{t("estimateForm.fields.unitPrice")}</span>
              <span className="text-right">{t("estimateForm.summary.total")}</span>
              <span />
            </div>
            <div className="divide-y divide-gray-100">
              {form.items.map((item, index) => {
                const metrics = getRowMetrics(item);
                const errors = rowErrors[index];
                return (
                  <div
                    key={item.id}
                    className="grid grid-cols-1 sm:grid-cols-[1fr_100px_120px_100px_80px] gap-3 py-3 px-3 items-start"
                  >
                    {/* Description */}
                    <div>
                      <span className="sm:hidden block text-[0.72rem] font-bold uppercase tracking-wide text-gray-400 mb-1">{t("estimateForm.fields.description")}</span>
                      <input
                        value={item.description}
                        onChange={(e) => updateItem(item.id, { description: e.target.value })}
                        placeholder={t("estimateForm.placeholders.lineItemDescription")}
                        className="w-full rounded-lg border border-gray-200 bg-[#f9f9f9] px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
                      />
                    </div>
                    {/* Quantity */}
                    <div>
                      <span className="sm:hidden block text-[0.72rem] font-bold uppercase tracking-wide text-gray-400 mb-1">{t("estimateForm.fields.qty")}</span>
                      <input
                        type="number"
                        min="1"
                        step="0.01"
                        inputMode="decimal"
                        value={item.quantity}
                        onChange={(e) => updateItem(item.id, { quantity: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-[#f9f9f9] px-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
                      />
                      {errors.quantity && (
                        <span className="block mt-1 text-[0.72rem] text-red-500">{errors.quantity}</span>
                      )}
                    </div>
                    {/* Unit Price */}
                    <div>
                      <span className="sm:hidden block text-[0.72rem] font-bold uppercase tracking-wide text-gray-400 mb-1">{t("estimateForm.fields.unitPrice")}</span>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">$</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          inputMode="decimal"
                          value={item.unitPrice}
                          onChange={(e) => updateItem(item.id, { unitPrice: e.target.value })}
                          className="w-full rounded-lg border border-gray-200 bg-[#f9f9f9] pl-6 pr-3 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
                        />
                      </div>
                      {errors.unitPrice && (
                        <span className="block mt-1 text-[0.72rem] text-red-500">{errors.unitPrice}</span>
                      )}
                    </div>
                    {/* Row Total */}
                    <div className="flex items-center justify-end sm:justify-end h-full pt-1">
                      <span className="text-sm font-semibold text-[#1d1d1f]">
                        {formatMoney(metrics.rowTotal)}
                      </span>
                    </div>
                    {/* Remove */}
                    <div className="flex items-center sm:justify-center h-full pt-1">
                      <button
                        type="button"
                        onClick={() => removeItem(item.id)}
                        className="text-gray-400 hover:text-red-500 transition-colors text-[0.78rem] font-medium"
                      >
                        {t("estimateForm.buttons.remove")}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {submitAttempted && (!hasMeaningfulItems || hasInvalidRows) && (
            <div className="mx-6 mb-4 bg-red-50 border border-red-200 text-red-600 text-sm rounded-xl px-4 py-3">
              {t("estimateForm.errors.reviewLineItems")}
            </div>
          )}

          {/* Mobile add button */}
          <div className="px-6 pb-5 pt-2 sm:hidden">
            <button
              type="button"
              onClick={addItem}
              className="w-full py-2.5 rounded-xl text-sm font-semibold text-[#007aff] border border-[#007aff]/25 bg-[#007aff]/5 hover:bg-[#007aff]/10 transition-colors"
            >
              {t("estimateForm.buttons.addItem")}
            </button>
          </div>
        </div>

        {/* ── Card 3: Summary ─────────────────────────────────── */}
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
          <div className="px-6 pt-6 pb-2">
            <p className="text-[0.7rem] font-bold uppercase tracking-widest text-gray-400 mb-1">
              {t("estimateForm.steps.step3")}
            </p>
            <h2 className="text-[1rem] font-semibold text-[#1d1d1f]">{t("estimateForm.steps.pricingNotesTitle")}</h2>
          </div>

          <div className="px-6 pb-6 pt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">

            {/* Notes */}
            <div className="flex flex-col gap-1.5">
              <label className="text-[0.82rem] font-semibold text-[#1d1d1f]">{t("estimateForm.fields.notes")}</label>
              <textarea
                rows={5}
                value={form.notes}
                onChange={(e) => updateForm({ notes: e.target.value })}
                placeholder={t("estimateForm.placeholders.notes")}
                className="w-full rounded-xl border border-gray-200 bg-[#f9f9f9] px-3.5 py-2.5 text-sm text-[#1d1d1f] resize-none focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
              />
            </div>

            {/* Totals */}
            <div className="flex flex-col gap-4">
              {/* Tax toggle */}
              <div className="bg-[#f9f9f9] rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm font-semibold text-[#1d1d1f]">{t("estimateForm.fields.stateTax")}</span>
                  {/* iOS toggle */}
                  <button
                    type="button"
                    onClick={() => handleTaxToggle(!form.applyTax)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${
                      form.applyTax ? "bg-[#007aff]" : "bg-gray-300"
                    }`}
                    aria-pressed={form.applyTax}
                  >
                    <span
                      className={`inline-block h-5 w-5 transform rounded-full bg-white shadow-md transition-transform ${
                        form.applyTax ? "translate-x-5" : "translate-x-0.5"
                      }`}
                    />
                  </button>
                </div>
                {form.applyTax && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[0.78rem] text-gray-500">
                      {t("estimateForm.hints.taxRateLabel")} {getUsStateLabel(activeTaxState)}
                    </label>
                    <div className="relative">
                      <input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        value={form.taxRatePct}
                        onChange={(e) => updateForm({ taxRatePct: e.target.value })}
                        className="w-full rounded-lg border border-gray-200 bg-white pl-3 pr-8 py-2 text-sm text-[#1d1d1f] focus:outline-none focus:ring-2 focus:ring-[#007aff]/40 focus:border-[#007aff] transition"
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm text-gray-400">%</span>
                    </div>
                  </div>
                )}
              </div>

              {/* Summary rows */}
              <div className="space-y-2">
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{t("estimateForm.summary.subtotal")}</span>
                  <span className="font-medium text-[#1d1d1f]">{formatMoney(subtotal)}</span>
                </div>
                <div className="flex items-center justify-between text-sm text-gray-600">
                  <span>{t("estimateForm.summary.tax")} ({form.applyTax ? `${form.taxRatePct}%` : "0%"})</span>
                  <span className="font-medium text-[#1d1d1f]">{formatMoney(taxAmount)}</span>
                </div>
                <div className="h-px bg-gray-100 my-1" />
                <div className="flex items-center justify-between">
                  <span className="text-base font-bold text-[#1d1d1f]">{t("estimateForm.summary.total")}</span>
                  <span className="text-2xl font-bold tracking-tight text-[#007aff]">
                    {formatMoney(total)}
                  </span>
                </div>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={saving}
                className="w-full mt-1 py-3 rounded-2xl text-sm font-semibold text-white bg-[#007aff] hover:bg-[#0066dd] transition-colors shadow-sm disabled:opacity-50"
              >
                {saving ? t("estimateForm.buttons.creating") : t("estimateForm.buttons.create")}
              </button>
              <p className="text-center text-[0.75rem] text-gray-400">
                {t("estimateForm.hints.signedInAs")} {userContext.name || userContext.email || ""}
              </p>
            </div>
          </div>
        </div>

      </div>
    </form>
  );
}