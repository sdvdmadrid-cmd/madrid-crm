"use client";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import DocumentPdfActions from "@/components/workspace/DocumentPdfActions";
import {
  escapeHtml,
  openPrintableHtmlDocument,
} from "@/lib/print-html-document";
import { filterAndRankRecords } from "@/lib/record-search";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import {
  getJobFileValidationError,
  JOB_FILE_MAX_BYTES,
} from "@/lib/job-files";
import {
  computeEstimateFinancials,
  US_STATE_OPTIONS,
} from "@/lib/estimate-pricing";
import "@/i18n";
import ws from "@/styles/workspace-dark.module.css";
import jobStyles from "./jobs.module.css";

const initialJob = {
  title: "",
  clientName: "",
  service: "",
  status: "Pending",
  price: "",
  dueDate: "",
  taxState: "TX",
  downPaymentPercent: "0",
  scopeDetails: "",
  squareMeters: "",
  complexity: "standard",
  materialsIncluded: true,
  travelMinutes: "",
  urgency: "flexible",
  estimateSnapshot: null,
};

const INITIAL_FILE_STATE = {
  initialized: false,
  loading: false,
  uploading: false,
  deleting: false,
  error: "",
  success: "",
  items: [],
  page: 1,
  pages: 1,
  hasMore: false,
};

function formatFileSize(size) {
  const bytes = Number(size || 0);
  if (bytes <= 0) return "0 B";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ConfirmationModal({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel,
  danger = false,
  loading = false,
  children = null,
  onCancel,
  onConfirm,
}) {
  if (!open) return null;
  return (
    <div className={jobStyles.modalOverlay}>
      <div className={jobStyles.modalPanel}>
        <h3 className={jobStyles.modalTitle}>{title}</h3>
        <p className={jobStyles.modalMessage}>{message}</p>
        {children}
        <div className={jobStyles.modalActions}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            className={jobStyles.modalBtnCancel}
          >
            {cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            className={`${jobStyles.modalBtnConfirm} ${danger ? jobStyles.modalBtnDanger : ""}`}
          >
            {loading ? "Working..." : confirmLabel || "Confirm"}
          </button>
        </div>
      </div>
    </div>
  );
}

function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 113 3L7 19l-4 1 1-4 12.5-12.5z" />
    </svg>
  );
}

function IconTrash() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

export default function JobsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { capabilities } = useCurrentUserAccess();
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(initialJob);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateResult, setEstimateResult] = useState(null);
  const [proposalDraft, setProposalDraft] = useState("");
  const [proposalLoading, setProposalLoading] = useState(false);
  const [proposalContext, setProposalContext] = useState("");
  const [jobFiles, setJobFiles] = useState({});
  const [openFilesPanel, setOpenFilesPanel] = useState({});
  const [deleteFileModal, setDeleteFileModal] = useState({
    open: false,
    jobId: "",
    fileId: "",
    fileName: "",
  });
  const [deleteJobModal, setDeleteJobModal] = useState({
    open: false,
    jobId: "",
    title: "",
    confirmText: "",
    loading: false,
  });
  const photoInputRefs = useRef({});
  const docInputRefs = useRef({});

  const getJobFilesState = useCallback(
    (jobId) => jobFiles[jobId] || INITIAL_FILE_STATE,
    [jobFiles],
  );

  const setJobFilesState = useCallback((jobId, updates) => {
    setJobFiles((current) => ({
      ...current,
      [jobId]: {
        ...(current[jobId] || INITIAL_FILE_STATE),
        ...updates,
      },
    }));
  }, []);

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/jobs");
      const data = await getJsonOrThrow(res, t("jobs.errors.fetch"));
      setJobs(data);
    } catch (err) {

      setError(err.message || t("jobs.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchJobs();
  }, [fetchJobs]);

  const resetForm = () => {
    setForm(initialJob);
    setSelectedId(null);
    setEstimateResult(null);
  };

  useEffect(() => {
    const action = searchParams.get("action");
    if (action === "new") {
      resetForm();
      if (typeof window !== "undefined") {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    }
  }, [searchParams]);

  useEffect(() => {
    const clientId = String(searchParams.get("clientId") || "").trim();
    if (!clientId) return;

    (async () => {
      try {
        const res = await apiFetch(`/api/clients/${clientId}`);
        const client = await getJsonOrThrow(res, t("jobs.errors.fetch"));
        if (!client?.name) return;
        setForm((prev) => ({
          ...prev,
          clientName: client.name || prev.clientName,
        }));
        if (searchParams.get("action") === "new" && typeof window !== "undefined") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        }
      } catch {
        // Optional prefill
      }
    })();
  }, [searchParams, t]);

  const loadJobFiles = useCallback(
    async (jobId, page = 1, append = false) => {
      setJobFilesState(jobId, { loading: true, error: "" });
      try {
        const res = await apiFetch(
          `/api/jobs/${jobId}/files?page=${page}&limit=12`,
        );
        const payload = await getJsonOrThrow(
          res,
          "Unable to load job files.",
        );
        const nextItems = payload?.data || [];
        setJobFiles((current) => {
          const currentState = current[jobId] || INITIAL_FILE_STATE;
          return {
            ...current,
            [jobId]: {
              ...currentState,
              initialized: true,
              loading: false,
              error: "",
              page: Number(payload?.page || page),
              pages: Number(payload?.pages || 1),
              hasMore: Number(payload?.page || page) < Number(payload?.pages || 1),
              items: append
                ? [...currentState.items, ...nextItems]
                : nextItems,
            },
          };
        });
      } catch (err) {
        setJobFilesState(jobId, {
          loading: false,
          error: err.message || "Unable to load job files.",
          success: "",
        });
      }
    },
    [setJobFilesState],
  );

  const toggleFilesPanel = useCallback(
    (jobId) => {
      setOpenFilesPanel((current) => {
        const nextOpen = !current[jobId];
        if (nextOpen) {
          const currentState = getJobFilesState(jobId);
          if (!currentState.initialized && !currentState.loading) {
            loadJobFiles(jobId);
          }
        }
        return { ...current, [jobId]: nextOpen };
      });
    },
    [getJobFilesState, loadJobFiles],
  );

  const uploadJobFiles = useCallback(
    async (job, fileType, fileList) => {
      const files = Array.from(fileList || []);
      if (files.length === 0) return;

      const invalid = files
        .map((file) => getJobFileValidationError(fileType, file))
        .find(Boolean);
      if (invalid) {
        setJobFilesState(job._id, { error: invalid });
        return;
      }

      setJobFilesState(job._id, { uploading: true, error: "", success: "" });
      try {
        for (const file of files) {
          const formData = new FormData();
          formData.append("file", file);
          formData.append("fileType", fileType);
          const res = await apiFetch(`/api/jobs/${job._id}/files`, {
            method: "POST",
            body: formData,
          });
          await getJsonOrThrow(res, "Unable to upload file.");
        }
        await loadJobFiles(job._id, 1, false);
      } catch (err) {
        setJobFilesState(job._id, {
          uploading: false,
          error: err.message || "Unable to upload file.",
          success: "",
        });
        return;
      }

      setJobFilesState(job._id, {
        uploading: false,
        success: files.length === 1 ? "File uploaded." : `${files.length} files uploaded.`,
      });
    },
    [loadJobFiles, setJobFilesState],
  );

  const requestFileDelete = useCallback((jobId, file) => {
    setDeleteFileModal({
      open: true,
      jobId,
      fileId: file.id,
      fileName: file.name,
    });
  }, []);

  const confirmDeleteFile = useCallback(async () => {
    const { jobId, fileId } = deleteFileModal;
    if (!jobId || !fileId) return;

    setJobFilesState(jobId, { deleting: true, error: "", success: "" });
    try {
      const res = await apiFetch(`/api/jobs/${jobId}/files/${fileId}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, "Unable to delete file.");
      setDeleteFileModal({ open: false, jobId: "", fileId: "", fileName: "" });
      await loadJobFiles(jobId, 1, false);
    } catch (err) {
      setJobFilesState(jobId, {
        deleting: false,
        error: err.message || "Unable to delete file.",
        success: "",
      });
      return;
    }
    setJobFilesState(jobId, { deleting: false, success: "File deleted." });
  }, [deleteFileModal, loadJobFiles, setJobFilesState]);

  const printJobSummary = (job) => {
    const financials = computeEstimateFinancials({
      baseAmount: job.price,
      taxState: job.taxState,
      downPaymentPercent: job.downPaymentPercent,
    });
    const bodyHtml = `
      <h1>${escapeHtml(t("jobs.print.title", { defaultValue: "Work order" }))}</h1>
      <p class="meta">${escapeHtml(job.title || "")}</p>
      <table><tbody>
        <tr><th>${escapeHtml(t("jobs.labels.client", { defaultValue: "Client" }))}</th><td>${escapeHtml(job.clientName || "")}</td></tr>
        <tr><th>${escapeHtml(t("jobs.labels.service", { defaultValue: "Service" }))}</th><td>${escapeHtml(job.service || "")}</td></tr>
        <tr><th>${escapeHtml(t("jobs.labels.status", { defaultValue: "Status" }))}</th><td>${escapeHtml(job.status || "")}</td></tr>
        <tr><th>${escapeHtml(t("jobs.labels.date", { defaultValue: "Due date" }))}</th><td>${escapeHtml(job.dueDate || t("jobs.labels.noDate"))}</td></tr>
        <tr><th>${escapeHtml(t("jobs.labels.price", { defaultValue: "Price" }))}</th><td>$${Number(job.price || 0).toFixed(2)}</td></tr>
        <tr><th>${escapeHtml(t("jobs.labels.estimateTotal", { defaultValue: "Total" }))}</th><td>$${financials.total.toFixed(2)}</td></tr>
      </tbody></table>
      ${job.scopeDetails ? `<h2 style="font-size:16px;margin-top:20px;">${escapeHtml(t("jobs.print.scope", { defaultValue: "Scope" }))}</h2><pre>${escapeHtml(job.scopeDetails)}</pre>` : ""}`;
    openPrintableHtmlDocument({
      title: job.title || t("jobs.print.title", { defaultValue: "Work order" }),
      bodyHtml,
    });
  };

  const saveJob = async () => {
    try {
      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId ? `/api/jobs/${selectedId}` : "/api/jobs";
      const payload = {
        ...form,
        estimateSnapshot: estimateResult
          ? {
              recommendedPrice: estimateResult.recommendedPrice,
              lowPrice: estimateResult.lowPrice,
              highPrice: estimateResult.highPrice,
              estimatedHours: estimateResult.estimatedHours,
              confidence: estimateResult.confidence,
              serviceType: estimateResult.serviceType,
              generatedAt: estimateResult.generatedAt,
            }
          : form.estimateSnapshot || null,
      };
      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await getJsonOrThrow(res, t("jobs.errors.save"));
      if (selectedId) {
        setJobs(
          jobs.map((job) => (job._id === selectedId ? result.data : job)),
        );
      } else {
        setJobs([result.data, ...jobs]);
      }
      resetForm();
    } catch (err) {

      setError(err.message || t("jobs.errors.saveFallback"));
    }
  };

  const editJob = (job) => {
    setForm({
      title: job.title || "",
      clientName: job.clientName || "",
      service: job.service || "",
      status: job.status || "Pending",
      price: job.price || "",
      dueDate: job.dueDate || "",
      taxState: job.taxState || "TX",
      downPaymentPercent: job.downPaymentPercent || "0",
      scopeDetails: job.scopeDetails || "",
      squareMeters: job.squareMeters || "",
      complexity: job.complexity || "standard",
      materialsIncluded:
        typeof job.materialsIncluded === "boolean"
          ? job.materialsIncluded
          : true,
      travelMinutes: job.travelMinutes || "",
      urgency: job.urgency || "flexible",
      estimateSnapshot: job.estimateSnapshot || null,
    });
    setEstimateResult(job.estimateSnapshot || null);
    setSelectedId(job._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const generateEstimate = async () => {
    setEstimating(true);
    setError("");
    try {
      const res = await apiFetch("/api/ai/estimate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: form.title,
          clientName: form.clientName,
          service: form.service,
          dueDate: form.dueDate,
          scopeDetails: form.scopeDetails,
          squareMeters: form.squareMeters,
          complexity: form.complexity,
          materialsIncluded: form.materialsIncluded,
          travelMinutes: form.travelMinutes,
          urgency: form.urgency,
        }),
      });
      const result = await getJsonOrThrow(res, t("jobs.errors.estimate"));
      setEstimateResult(result.data);
    } catch (err) {
      setError(err.message || t("jobs.errors.estimateFallback"));
    } finally {
      setEstimating(false);
    }
  };

  const useRecommendedPrice = () => {
    if (!estimateResult?.recommendedPrice) return;
    setForm({
      ...form,
      price: String(estimateResult.recommendedPrice),
    });
  };

  const generateProposalDraft = async () => {
    setProposalLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/ai/proposal", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projectType: form.service,
          scope: form.scopeDetails || form.title,
          timeline: form.dueDate,
          budget: form.price,
          context: proposalContext,
        }),
      });
      const payload = await getJsonOrThrow(res, "Unable to generate proposal.");
      const nextProposal = String(payload?.data?.proposal || "").trim();
      if (nextProposal) {
        setProposalDraft(nextProposal);
      }
    } catch (err) {
      setError(err.message || "Unable to generate proposal.");
    } finally {
      setProposalLoading(false);
    }
  };

  const requestJobDelete = useCallback((job) => {
    setDeleteJobModal({
      open: true,
      jobId: job._id,
      title: job.title || "Untitled job",
      confirmText: "",
      loading: false,
    });
  }, []);

  const confirmDeleteJob = async () => {
    const { jobId, confirmText } = deleteJobModal;
    if (!jobId) return;

    if (String(confirmText).trim() !== "DELETE") {
      setError('Type "DELETE" to confirm job deletion.');
      return;
    }

    setDeleteJobModal((current) => ({ ...current, loading: true }));
    try {
      const res = await apiFetch(`/api/jobs/${jobId}`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ confirmText: "DELETE" }),
      });
      await getJsonOrThrow(res, t("jobs.errors.delete"));
      setJobs((current) => current.filter((job) => job._id !== jobId));
      setJobFiles((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      setOpenFilesPanel((current) => {
        const next = { ...current };
        delete next[jobId];
        return next;
      });
      if (selectedId === jobId) resetForm();
      setDeleteJobModal({
        open: false,
        jobId: "",
        title: "",
        confirmText: "",
        loading: false,
      });
    } catch (err) {
      setError(err.message || t("jobs.errors.deleteFallback"));
      setDeleteJobModal((current) => ({ ...current, loading: false }));
    }
  };

  const [listSearch, setListSearch] = useState("");
  const filterClientId = String(searchParams.get("clientId") || "").trim();
  const visibleJobs = useMemo(() => {
    let list = jobs;
    if (filterClientId) {
      list = list.filter(
        (job) => String(job.clientId || "") === filterClientId,
      );
    }
    if (listSearch.trim()) {
      list = filterAndRankRecords(list, listSearch, (job) => [
        job.title,
        job.clientName,
        job.service,
        job.status,
        job.scopeDetails,
      ]);
    }
    return list;
  }, [jobs, filterClientId, listSearch]);

  return (
    <main className={`${ws.page} ${jobStyles.jobsPage}`}>
      <header className={ws.topBar} style={{ borderRadius: 18, marginBottom: 20, border: "1px solid rgba(148,163,184,0.16)" }}>
        <div>
          <h1 className={ws.title}>{t("jobs.title")}</h1>
          <p className={ws.subtitle}>{t("jobs.description")}</p>
        </div>
      </header>

      {error ? <div className={ws.noticeError}>{error}</div> : null}
      {loading ? <p className={ws.subtitle}>{t("jobs.loading")}</p> : null}

      <section>
        <h2>{selectedId ? t("jobs.formTitleEdit") : t("jobs.formTitleNew")}</h2>
        <div className={jobStyles.formGrid}>
          <input
            className={jobStyles.formInput}
            placeholder={t("jobs.placeholders.title")}
            aria-label={t("jobs.placeholders.title")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />
          <input
            className={jobStyles.formInput}
            placeholder={t("jobs.placeholders.client")}
            aria-label={t("jobs.placeholders.client")}
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
          />
          <input
            className={jobStyles.formInput}
            placeholder={t("jobs.placeholders.service")}
            aria-label={t("jobs.placeholders.service")}
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
          />
          <textarea
            className={`${jobStyles.formInput} ${jobStyles.formTextarea}`}
            placeholder={t("jobs.placeholders.scopeDetails")}
            aria-label={t("jobs.placeholders.scopeDetails")}
            value={form.scopeDetails}
            onChange={(e) => setForm({ ...form, scopeDetails: e.target.value })}
          />
          <div className={jobStyles.formGridSplit}>
            <input
              className={jobStyles.formInput}
              placeholder={t("jobs.placeholders.squareMeters")}
              aria-label={t("jobs.placeholders.squareMeters")}
              value={form.squareMeters}
              onChange={(e) =>
                setForm({ ...form, squareMeters: e.target.value })
              }
            />
            <input
              className={jobStyles.formInput}
              placeholder={t("jobs.placeholders.travelMinutes")}
              aria-label={t("jobs.placeholders.travelMinutes")}
              value={form.travelMinutes}
              onChange={(e) =>
                setForm({ ...form, travelMinutes: e.target.value })
              }
            />
            <select
              className={jobStyles.formSelect}
              aria-label={t("jobs.labels.complexity", { defaultValue: "Complexity" })}
              value={form.complexity}
              onChange={(e) => setForm({ ...form, complexity: e.target.value })}
            >
              <option value="low">{t("jobs.complexity.low")}</option>
              <option value="standard">{t("jobs.complexity.standard")}</option>
              <option value="high">{t("jobs.complexity.high")}</option>
            </select>
            <select
              className={jobStyles.formSelect}
              aria-label={t("jobs.labels.urgency", { defaultValue: "Urgency" })}
              value={form.urgency}
              onChange={(e) => setForm({ ...form, urgency: e.target.value })}
            >
              <option value="flexible">{t("jobs.urgency.flexible")}</option>
              <option value="week">{t("jobs.urgency.week")}</option>
              <option value="urgent">{t("jobs.urgency.urgent")}</option>
            </select>
          </div>
          <label className={jobStyles.checkboxLabel}>
            <input
              type="checkbox"
              checked={form.materialsIncluded}
              onChange={(e) =>
                setForm({ ...form, materialsIncluded: e.target.checked })
              }
            />
            {t("jobs.materialsIncluded")}
          </label>
          <select
            className={jobStyles.formSelect}
            aria-label={t("jobs.labels.status")}
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
          >
            <option>Pending</option>
            <option>In progress</option>
            <option>Completed</option>
          </select>
          <input
            className={jobStyles.formInput}
            placeholder={t("jobs.placeholders.price")}
            aria-label={t("jobs.placeholders.price")}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
          />
          <select
            className={jobStyles.formSelect}
            aria-label={t("jobs.labels.tax")}
            value={form.taxState}
            onChange={(e) => setForm({ ...form, taxState: e.target.value })}
          >
            {US_STATE_OPTIONS.map((state) => (
              <option key={state.code} value={state.code}>
                {state.code} - {state.name}
              </option>
            ))}
          </select>
          <input
            className={jobStyles.formInput}
            placeholder={t("jobs.placeholders.downPayment")}
            aria-label={t("jobs.placeholders.downPayment")}
            value={form.downPaymentPercent}
            onChange={(e) =>
              setForm({ ...form, downPaymentPercent: e.target.value })
            }
          />
          <input
            type="date"
            className={jobStyles.formInput}
            aria-label={t("jobs.labels.date")}
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
          />
          <div className={jobStyles.estimatorPanel}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                gap: "12px",
                flexWrap: "wrap",
              }}
            >
              <div>
                <strong>{t("jobs.estimator.title")}</strong>
                <p>{t("jobs.estimator.description")}</p>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={generateEstimate}
                  disabled={estimating}
                  className={jobStyles.btnEstimate}
                >
                  {estimating
                    ? t("jobs.estimator.calculating")
                    : t("jobs.estimator.calculate")}
                </button>
                <button
                  type="button"
                  onClick={useRecommendedPrice}
                  disabled={!estimateResult?.recommendedPrice}
                  className={jobStyles.btnEstimateOutline}
                >
                  {t("jobs.estimator.useRecommended")}
                </button>
              </div>
            </div>
            {estimateResult
              ? <div className={jobStyles.statGrid}>
                  <div className={jobStyles.statRow}>
                    <div className={jobStyles.statCard}>
                      <div className={jobStyles.statLabel}>
                        {t("jobs.estimator.recommendedPrice")}
                      </div>
                      <div className={jobStyles.statValue}>
                        ${estimateResult.recommendedPrice}
                      </div>
                    </div>
                    <div className={jobStyles.statCard}>
                      <div className={jobStyles.statLabel}>
                        {t("jobs.estimator.range")}
                      </div>
                      <div className={jobStyles.statValueSm}>
                        ${estimateResult.lowPrice} - ${estimateResult.highPrice}
                      </div>
                    </div>
                    <div className={jobStyles.statCard}>
                      <div className={jobStyles.statLabel}>
                        {t("jobs.estimator.hours")}
                      </div>
                      <div className={jobStyles.statValueSm}>
                        {estimateResult.estimatedHours} h
                      </div>
                    </div>
                    <div className={jobStyles.statCard}>
                      <div className={jobStyles.statLabel}>
                        {t("jobs.estimator.confidence")}
                      </div>
                      <div className={jobStyles.statValueSm}>
                        {estimateResult.confidence}%
                      </div>
                    </div>
                  </div>
                  <div className={jobStyles.statRow}>
                    <div className={jobStyles.statCard}>
                      <strong>{t("jobs.estimator.breakdown")}</strong>
                      <div
                        style={{
                          marginTop: "8px",
                          display: "grid",
                          gap: "6px",
                          color: "var(--fb-text-muted)",
                        }}
                      >
                        {estimateResult.lineItems?.map((item) => (
                          <div
                            key={item.label}
                            style={{
                              display: "flex",
                              justifyContent: "space-between",
                              gap: "8px",
                            }}
                          >
                            <span>{item.label}</span>
                            <strong>${item.amount}</strong>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className={jobStyles.statCard}>
                      <strong>{t("jobs.estimator.assumptions")}</strong>
                      <div
                        style={{
                          marginTop: "8px",
                          display: "grid",
                          gap: "6px",
                          color: "var(--fb-text-muted)",
                        }}
                      >
                        {estimateResult.assumptions?.map((item) => (
                          <div key={item}>{item}</div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              : null}
          </div>
          <div className={jobStyles.proposalBox}>
            <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
              <div>
                <strong>Proposal Generator</strong>
                <p style={{ margin: "6px 0 0 0", color: "var(--fb-text-muted)" }}>
                  Generate a client-ready proposal using the current job scope.
                </p>
              </div>
              <button
                type="button"
                onClick={generateProposalDraft}
                disabled={proposalLoading}
                className={jobStyles.aiBtn}
              >
                {proposalLoading ? "Generating..." : "Generate Proposal (AI)"}
              </button>
            </div>
            <textarea
              value={proposalContext}
              onChange={(e) => setProposalContext(e.target.value)}
              placeholder="Optional context for AI (materials, warranty terms, exclusions, payment rules)..."
              className={`${jobStyles.textAreaDark} ${jobStyles.textAreaContext}`}
            />
            {proposalDraft ? (
              <textarea
                value={proposalDraft}
                onChange={(e) => setProposalDraft(e.target.value)}
                placeholder="Generated proposal will appear here"
                className={`${jobStyles.textAreaDark} ${jobStyles.textAreaProposal}`}
              />
            ) : null}
          </div>
          <div className={jobStyles.actionRow}>
            <button type="button" onClick={saveJob} className={jobStyles.saveBtn}>
              {selectedId ? t("jobs.buttons.update") : t("jobs.buttons.save")}
            </button>
            <button type="button" onClick={resetForm} className={jobStyles.clearBtn}>
              {t("jobs.buttons.clear")}
            </button>
          </div>
        </div>
      </section>

      <section>
        <h2>{t("jobs.listTitle")}</h2>
        <div className={jobStyles.filterBar}>
          <input
            type="search"
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
            placeholder={t("jobs.searchPlaceholder", {
              defaultValue: "Search jobs by title, client, service, or status…",
            })}
            aria-label={t("jobs.searchLabel", { defaultValue: "Search jobs" })}
            className={jobStyles.listSearch}
            style={{ flex: "1 1 220px", maxWidth: 480 }}
          />
          {filterClientId ? (
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={() => router.push("/jobs")}
            >
              {t("jobs.clearClientFilter", { defaultValue: "Clear client filter" })}
            </button>
          ) : null}
        </div>
        {filterClientId ? (
          <p className={ws.subtitle} style={{ marginBottom: 12 }}>
            {t("jobs.filteredByClient", {
              defaultValue: "Showing jobs for the selected client only.",
            })}
          </p>
        ) : null}
        <div className={jobStyles.jobList}>
          {visibleJobs.length === 0 && !loading ? (
            <p className={ws.subtitle}>
              {t("jobs.noSearchResults", {
                defaultValue: "No jobs match your search.",
              })}
            </p>
          ) : null}
          {visibleJobs.map((job) => (
            <div key={job._id} className={jobStyles.jobCard}>
              {(() => {
                const financials = computeEstimateFinancials({
                  baseAmount: job.price,
                  taxState: job.taxState,
                  downPaymentPercent: job.downPaymentPercent,
                });
                const filesState = getJobFilesState(job._id);
                const filesOpen = openFilesPanel[job._id] === true;
                const photoItems = filesState.items.filter((item) => item.fileType === "photo");
                const documentItems = filesState.items.filter((item) => item.fileType === "document");
                return (
                  <div data-testid="job-card" style={{ display: "grid", gap: 14 }}>
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                      <h3 className={jobStyles.jobCardTitle}>{job.title}</h3>
                      <p className={jobStyles.jobCardMeta}>
                        {job.clientName} | {job.service}
                      </p>
                      <p className={jobStyles.jobCardMeta}>
                        {t("jobs.labels.status")}:{" "}
                        {t(`jobs.statusOptions.${job.status}`) || job.status} |{" "}
                        {t("jobs.labels.price")}: ${job.price}
                      </p>
                      <p className={jobStyles.jobCardMeta}>
                        {t("jobs.labels.tax")}: {financials.taxState} (
                        {financials.taxRate.toFixed(3)}%) |{" "}
                        {t("jobs.labels.taxAmount")}: $
                        {financials.taxAmount.toFixed(2)}
                      </p>
                      <p className={jobStyles.jobCardMeta}>
                        {t("jobs.labels.estimateTotal")}: $
                        {financials.total.toFixed(2)} |
                        {t("jobs.labels.downPayment")}:{" "}
                        {financials.downPaymentPercent.toFixed(2)}% ($
                        {financials.downPaymentAmount.toFixed(2)})
                      </p>
                      <p className={jobStyles.jobCardMeta}>
                        {t("jobs.labels.balanceAfterDownPayment")}: $
                        {financials.balanceAfterDownPayment.toFixed(2)}
                      </p>
                      <p className={jobStyles.jobCardMeta}>
                        {t("jobs.labels.date")}:{" "}
                        {job.dueDate || t("jobs.labels.noDate")}
                      </p>
                      {job.estimateSnapshot
                        ? <p className={jobStyles.jobCardMetaAccent}>
                            {t("jobs.labels.ai")}: $
                            {job.estimateSnapshot.recommendedPrice} |{" "}
                            {job.estimateSnapshot.estimatedHours} h |{" "}
                            {job.estimateSnapshot.confidence}%{" "}
                            {t("jobs.labels.confidence")}
                          </p>
                        : null}
                      </div>
                      <div
                        style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}
                      >
                        <button
                          type="button"
                          onClick={() => toggleFilesPanel(job._id)}
                          className={jobStyles.iconBtn}
                        >
                          {filesOpen ? "Hide files" : "Manage files"}
                        </button>
                        <DocumentPdfActions
                          pdfUrl={`/api/jobs/${job._id}/pdf`}
                          printLabel={t("jobs.buttons.print", {
                            defaultValue: "Print work order",
                          })}
                          downloadLabel={t("jobs.buttons.downloadPdf", {
                            defaultValue: "Download PDF",
                          })}
                        />
                        <button
                          type="button"
                          onClick={() => printJobSummary(job)}
                          className={jobStyles.iconBtn}
                        >
                          {t("jobs.buttons.printBrowser", {
                            defaultValue: "Print (browser)",
                          })}
                        </button>
                        <button
                          type="button"
                          onClick={() => editJob(job)}
                          className={jobStyles.iconBtn}
                        >
                          <IconPencil />
                          {t("jobs.buttons.edit")}
                        </button>
                        {capabilities.canDeleteRecords
                          ? <button
                              type="button"
                              onClick={() => requestJobDelete(job)}
                              className={ws.btnDanger}
                            >
                              <IconTrash />
                              {t("jobs.buttons.delete")}
                            </button>
                          : null}
                      </div>
                    </div>

                    {filesOpen
                      ? <div data-testid="job-files-panel" className={jobStyles.filesPanel}>
                          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                            <input
                              ref={(el) => {
                                photoInputRefs.current[job._id] = el;
                              }}
                              type="file"
                              accept="image/jpeg,image/png"
                              multiple
                              style={{ display: "none" }}
                              onChange={(event) =>
                                uploadJobFiles(job, "photo", event.target.files)
                              }
                            />
                            <input
                              ref={(el) => {
                                docInputRefs.current[job._id] = el;
                              }}
                              type="file"
                              accept="application/pdf"
                              multiple
                              style={{ display: "none" }}
                              onChange={(event) =>
                                uploadJobFiles(job, "document", event.target.files)
                              }
                            />
                            <button
                              type="button"
                              onClick={() => {
                                const input = photoInputRefs.current[job._id];
                                if (input) {
                                  input.value = "";
                                  input.click();
                                }
                              }}
                              className={jobStyles.iconBtn}
                              style={{ height: 34 }}
                            >
                              Upload Photos
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                const input = docInputRefs.current[job._id];
                                if (input) {
                                  input.value = "";
                                  input.click();
                                }
                              }}
                              className={jobStyles.iconBtn}
                              style={{ height: 34 }}
                            >
                              Upload Documents
                            </button>
                            <div style={{ color: "#64748b", fontSize: 12, paddingTop: 8 }}>
                              Max {Math.round(JOB_FILE_MAX_BYTES / (1024 * 1024))}MB. Photos: JPG/PNG. Documents: PDF.
                            </div>
                          </div>

                          {filesState.loading && (
                            <div style={{ color: "#334155" }}>Loading files...</div>
                          )}
                          {filesState.uploading && (
                            <div style={{ color: "#0f766e" }}>Uploading file...</div>
                          )}
                          {filesState.error && (
                            <div style={{ color: "#b91c1c" }}>{filesState.error}</div>
                          )}
                          {filesState.success && (
                            <div style={{ color: "#6ee7b7" }}>{filesState.success}</div>
                          )}

                          <div style={{ display: "grid", gap: 12 }}>
                            <div>
                              <div className={jobStyles.filesPanelHeading}>
                                Photos ({photoItems.length})
                              </div>
                              {photoItems.length === 0
                                ? <div className={jobStyles.filesPanelMuted}>No photos yet.</div>
                                : <div
                                    style={{
                                      display: "grid",
                                      gridTemplateColumns: "repeat(auto-fill, minmax(130px, 1fr))",
                                      gap: 10,
                                    }}
                                  >
                                    {photoItems.map((file) => (
                                      <div
                                        key={file.id}
                                        style={{
                                          border: "1px solid rgba(148,163,184,0.22)",
                                          borderRadius: 10,
                                          overflow: "hidden",
                                          background: "rgba(30,41,59,0.65)",
                                        }}
                                      >
                                        {file.signedUrl
                                          ? <img
                                              src={file.signedUrl}
                                              alt={file.name}
                                              loading="lazy"
                                              style={{
                                                width: "100%",
                                                height: 110,
                                                objectFit: "cover",
                                                display: "block",
                                              }}
                                            />
                                          : <div
                                              style={{
                                                height: 110,
                                                display: "grid",
                                                placeItems: "center",
                                                color: "#94a3b8",
                                              }}
                                            >
                                              Preview unavailable
                                            </div>}
                                        <div style={{ padding: 8, display: "grid", gap: 6 }}>
                                          <div className={jobStyles.fileThumbName}>
                                            {file.name}
                                          </div>
                                          <button
                                            type="button"
                                            className={jobStyles.btnFileDanger}
                                            onClick={() => requestFileDelete(job._id, file)}
                                            disabled={filesState.deleting}
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>}
                            </div>

                            <div>
                              <div className={jobStyles.filesPanelHeading}>
                                Documents ({documentItems.length})
                              </div>
                              {documentItems.length === 0
                                ? <div className={jobStyles.filesPanelMuted}>No documents yet.</div>
                                : <div style={{ display: "grid", gap: 8 }}>
                                    {documentItems.map((file) => (
                                      <div key={file.id} className={jobStyles.fileDocRow}>
                                        <div style={{ display: "grid", gap: 3 }}>
                                          <strong className={jobStyles.fileDocName}>{file.name}</strong>
                                          <span className={jobStyles.fileDocMeta}>
                                            {formatFileSize(file.size)}
                                          </span>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          {file.signedUrl && (
                                            <a
                                              href={file.signedUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              className={jobStyles.btnFileLink}
                                            >
                                              Download
                                            </a>
                                          )}
                                          <button
                                            type="button"
                                            className={jobStyles.btnFileDanger}
                                            onClick={() => requestFileDelete(job._id, file)}
                                            disabled={filesState.deleting}
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>}
                            </div>
                          </div>

                          {filesState.hasMore && (
                            <button
                              type="button"
                              className={jobStyles.iconBtn}
                              onClick={() =>
                                loadJobFiles(job._id, filesState.page + 1, true)
                              }
                              disabled={filesState.loading}
                            >
                              {filesState.loading ? "Loading..." : "Load more"}
                            </button>
                          )}
                        </div>
                      : null}
                  </div>
                );
              })()}
            </div>
          ))}
          {jobs.length === 0 && !loading && (
            <p style={{ color: "#777" }}>{t("jobs.empty")}</p>
          )}
        </div>
      </section>

      <ConfirmationModal
        open={deleteFileModal.open}
        title="Delete this item?"
        message="This action cannot be undone. This will permanently delete the selected item."
        cancelLabel="Cancel"
        confirmLabel="Delete"
        danger
        loading={getJobFilesState(deleteFileModal.jobId).deleting}
        onCancel={() =>
          setDeleteFileModal({ open: false, jobId: "", fileId: "", fileName: "" })
        }
        onConfirm={confirmDeleteFile}
      />

      <ConfirmationModal
        open={deleteJobModal.open}
        title="Delete this item?"
        message="This action cannot be undone. This will permanently delete the selected item."
        cancelLabel="Cancel"
        confirmLabel="Delete"
        danger
        loading={deleteJobModal.loading}
        onCancel={() =>
          setDeleteJobModal({
            open: false,
            jobId: "",
            title: "",
            confirmText: "",
            loading: false,
          })
        }
        onConfirm={confirmDeleteJob}
      >
        <div style={{ display: "grid", gap: 8 }}>
          <div style={{ color: "#334155", fontSize: 13 }}>
            To delete <strong>{deleteJobModal.title || "this job"}</strong>, type <strong>DELETE</strong>.
          </div>
          <input
            value={deleteJobModal.confirmText}
            onChange={(event) =>
              setDeleteJobModal((current) => ({
                ...current,
                confirmText: event.target.value,
              }))
            }
            placeholder="Type DELETE to confirm"
            style={{
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              padding: "10px 12px",
            }}
          />
        </div>
      </ConfirmationModal>
    </main>
  );
}
