"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { getUsStateLabel, getUsStateTaxRate } from "@/lib/estimate-pricing";
import { supabase } from "@/lib/supabase";
import styles from "./NewEstimateForm.module.css";

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
          router.push("/login?next=/estimate-builder");
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
      setFormError("Select a client before creating the estimate.");
      return;
    }

    if (!hasMeaningfulItems) {
      setFormError("Add at least one line item before creating the estimate.");
      return;
    }

    if (hasInvalidRows) {
      setFormError("Fix the highlighted line items before creating the estimate.");
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

      setSuccess(`Estimate ${data?.estimate_number || "created"} is ready.`);
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
      setFormError(error.message || "Unable to create the estimate.");
    } finally {
      setSaving(false);
    }
  };

  if (authState === "redirecting") {
    return null;
  }

  if (authState === "checking" || loadingData) {
    return (
      <div className={styles.shell}>
        <div className={styles.loadingCard}>Loading estimate form...</div>
      </div>
    );
  }

  return (
    <form className={styles.shell} onSubmit={submit}>
      <header className={styles.header}>
        <div>
          <h1 className={styles.title}>New Estimate</h1>
          <p className={styles.subtitle}>
            Build a clean estimate linked to a client and optional job.
          </p>
        </div>
      </header>

      {formError ? <div className={styles.errorBanner}>{formError}</div> : null}
      {success ? <div className={styles.successBanner}>{success}</div> : null}

      <section className={styles.card}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Estimate setup</p>
            <h2 className={styles.sectionTitle}>Client and pricing</h2>
          </div>
        </div>

        <div className={styles.infoGrid}>
          <label className={styles.field}>
            <span className={styles.label}>Client</span>
            <select
              className={`cf-input ${styles.inputField}`}
              value={form.clientId}
              onChange={(event) => updateForm({ clientId: event.target.value })}
            >
              <option value="">Select a client</option>
              {clients.map((client) => (
                <option key={client._id || client.id} value={client._id || client.id}>
                  {client.name}
                </option>
              ))}
            </select>
            {submitAttempted && !form.clientId ? (
              <span className={styles.inlineError}>Select a client</span>
            ) : null}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Job</span>
            <select
              className={`cf-input ${styles.inputField}`}
              value={form.jobId}
              onChange={(event) => handleJobChange(event.target.value)}
            >
              <option value="">Optional job link</option>
              {availableJobs.map((job) => (
                <option key={job.id} value={job.id}>
                  {job.title} {job.clientName ? `- ${job.clientName}` : ""}
                </option>
              ))}
            </select>
            {availableJobs.length === 0 ? (
              <span className={styles.helperText}>No jobs available yet.</span>
            ) : null}
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Estimate number</span>
            <input
              className={`cf-input ${styles.inputField}`}
              value={form.estimateNumber}
              onChange={(event) => updateForm({ estimateNumber: event.target.value })}
              placeholder="Auto-generated"
            />
          </label>

          <label className={styles.field}>
            <span className={styles.label}>Tax %</span>
            <div className={styles.taxFieldStack}>
              <label className={styles.taxToggle}>
                <input
                  checked={form.applyTax}
                  onChange={(event) => handleTaxToggle(event.target.checked)}
                  type="checkbox"
                />
                <span>Apply automatic state tax</span>
              </label>
              <input
                className={`cf-input ${styles.inputField}`}
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                disabled={!form.applyTax}
                value={form.taxRatePct}
                onChange={(event) => updateForm({ taxRatePct: event.target.value })}
              />
            </div>
            <span className={styles.helperText}>
              {form.applyTax
                ? `Using ${getUsStateLabel(activeTaxState)} tax rate (${automaticTaxRate}%).`
                : `Automatic tax is off for ${getUsStateLabel(activeTaxState)}.`}
            </span>
          </label>
        </div>
      </section>

      <section className={`${styles.card} ${styles.itemsCard}`}>
        <div className={styles.sectionHeader}>
          <div>
            <p className={styles.eyebrow}>Scope</p>
            <h2 className={styles.sectionTitle}>Line Items</h2>
          </div>
          <button className={`cf-button ${styles.addItemButton}`} onClick={addItem} type="button">
            Add item
          </button>
        </div>

        <div className={styles.tableScroller}>
          <div className={styles.tableHeader}>
            <span>Description</span>
            <span>Quantity</span>
            <span>Unit price</span>
            <span className={styles.rightHeader}>Total</span>
            <span className={styles.rightHeader}>Action</span>
          </div>

          <div className={styles.tableBody}>
            {form.items.map((item, index) => {
              const metrics = getRowMetrics(item);
              const errors = rowErrors[index];

              return (
                <div key={item.id} className={styles.itemRow}>
                  <label className={styles.cellField}>
                    <span className={styles.mobileLabel}>Description</span>
                    <input
                      className={`cf-input ${styles.inputField}`}
                      value={item.description}
                      onChange={(event) => updateItem(item.id, { description: event.target.value })}
                      placeholder="Service description"
                    />
                  </label>

                  <label className={styles.cellField}>
                    <span className={styles.mobileLabel}>Quantity</span>
                    <input
                      className={`cf-input ${styles.inputField}`}
                      type="number"
                      min="1"
                      step="0.01"
                      inputMode="decimal"
                      value={item.quantity}
                      onChange={(event) => updateItem(item.id, { quantity: event.target.value })}
                    />
                    {errors.quantity ? <span className={styles.inlineError}>{errors.quantity}</span> : null}
                  </label>

                  <label className={styles.cellField}>
                    <span className={styles.mobileLabel}>Unit price</span>
                    <input
                      className={`cf-input ${styles.inputField}`}
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      value={item.unitPrice}
                      onChange={(event) => updateItem(item.id, { unitPrice: event.target.value })}
                    />
                    {errors.unitPrice ? <span className={styles.inlineError}>{errors.unitPrice}</span> : null}
                  </label>

                  <div className={`${styles.moneyCell} ${styles.rowTotalCell}`}>
                    <span className={styles.mobileLabel}>Total</span>
                    <strong>{formatMoney(metrics.rowTotal)}</strong>
                  </div>

                  <div className={styles.actionCell}>
                    <button
                      className={`cf-button-secondary ${styles.removeButton}`}
                      onClick={() => removeItem(item.id)}
                      type="button"
                    >
                      Remove
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {submitAttempted && (!hasMeaningfulItems || hasInvalidRows) ? (
          <div className={styles.inlineError}>Review your line items before continuing.</div>
        ) : null}
      </section>

      <section className={`${styles.card} ${styles.summaryCard}`}>
        <div className={styles.summaryLayout}>
          <div className={styles.summaryStack}>
            <label className={styles.field}>
              <span className={styles.label}>Notes</span>
              <textarea
                className={`cf-input ${styles.descriptionInput}`}
                value={form.notes}
                onChange={(event) => updateForm({ notes: event.target.value })}
                placeholder="Optional scope details, exclusions, or next steps"
              />
            </label>
          </div>

          <div className={styles.actionsPanel}>
            <div className={styles.summaryRow}>
              <span>Subtotal</span>
              <strong className={styles.moneyValue}>{formatMoney(subtotal)}</strong>
            </div>
            <div className={styles.summaryRow}>
              <span>Tax</span>
              <strong className={styles.moneyValue}>{formatMoney(taxAmount)}</strong>
            </div>
            <div className={styles.totalRow}>
              <span>TOTAL</span>
              <strong className={styles.totalValue}>{formatMoney(total)}</strong>
            </div>
            <button className={`cf-button ${styles.primaryAction}`} disabled={saving} type="submit">
              {saving ? "Creating estimate..." : "Create estimate"}
            </button>
            <p className={styles.actionHint}>
              Signed in as {userContext.name || userContext.email || "current user"}.
            </p>
          </div>
        </div>
      </section>
    </form>
  );
}