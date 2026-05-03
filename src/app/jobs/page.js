"use client";
import { useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
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

const actionIconButtonStyle = {
  display: "inline-flex",
  alignItems: "center",
  gap: 6,
  height: 30,
  padding: "0 10px",
  borderRadius: 999,
  border: "1px solid #d1d5db",
  background: "#fff",
  color: "#334155",
  fontSize: 12,
  fontWeight: 600,
  cursor: "pointer",
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
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(15,23,42,0.45)",
        zIndex: 1200,
        display: "grid",
        placeItems: "center",
        padding: 18,
      }}
    >
      <div
        style={{
          width: "min(560px, 100%)",
          borderRadius: 16,
          background: "#fff",
          border: "1px solid rgba(15,23,42,0.10)",
          padding: 20,
          display: "grid",
          gap: 14,
        }}
      >
        <h3 style={{ margin: 0, fontSize: 22, color: "#0f172a" }}>{title}</h3>
        <p style={{ margin: 0, color: "#334155", lineHeight: 1.5 }}>{message}</p>
        {children}
        <div style={{ display: "flex", justifyContent: "flex-end", gap: 10 }}>
          <button
            type="button"
            onClick={onCancel}
            disabled={loading}
            style={{
              borderRadius: 10,
              border: "1px solid #cbd5e1",
              background: "#fff",
              color: "#0f172a",
              fontWeight: 600,
              padding: "10px 14px",
              cursor: "pointer",
            }}
          >
            {cancelLabel || "Cancel"}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={loading}
            style={{
              borderRadius: 10,
              border: "1px solid transparent",
              background: danger ? "#dc2626" : "#0f766e",
              color: "#fff",
              fontWeight: 700,
              padding: "10px 14px",
              cursor: "pointer",
            }}
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
  const { capabilities } = useCurrentUserAccess();
  const [jobs, setJobs] = useState([]);
  const [form, setForm] = useState(initialJob);
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [estimating, setEstimating] = useState(false);
  const [estimateResult, setEstimateResult] = useState(null);
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

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1000,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "32px", margin: 0 }}>{t("jobs.title")}</h1>
          <p style={{ margin: "10px 0 0 0", color: "#555" }}>
            {t("jobs.description")}
          </p>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: "20px", color: "#b00020" }}>{error}</div>
      )}
      {loading && (
        <div style={{ marginTop: "20px", color: "#333" }}>
          {t("jobs.loading")}
        </div>
      )}

      <section
        style={{
          marginTop: "24px",
          padding: "20px",
          border: "1px solid #ddd",
          borderRadius: "16px",
          background: "#fff",
        }}
      >
        <h2 style={{ marginTop: 0 }}>
          {selectedId ? t("jobs.formTitleEdit") : t("jobs.formTitleNew")}
        </h2>
        <div style={{ display: "grid", gap: "12px" }}>
          <input
            placeholder={t("jobs.placeholders.title")}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <input
            placeholder={t("jobs.placeholders.client")}
            value={form.clientName}
            onChange={(e) => setForm({ ...form, clientName: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <input
            placeholder={t("jobs.placeholders.service")}
            value={form.service}
            onChange={(e) => setForm({ ...form, service: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <textarea
            placeholder={t("jobs.placeholders.scopeDetails")}
            value={form.scopeDetails}
            onChange={(e) => setForm({ ...form, scopeDetails: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
              minHeight: "90px",
            }}
          />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
              gap: "12px",
            }}
          >
            <input
              placeholder={t("jobs.placeholders.squareMeters")}
              value={form.squareMeters}
              onChange={(e) =>
                setForm({ ...form, squareMeters: e.target.value })
              }
              style={{
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            />
            <input
              placeholder={t("jobs.placeholders.travelMinutes")}
              value={form.travelMinutes}
              onChange={(e) =>
                setForm({ ...form, travelMinutes: e.target.value })
              }
              style={{
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            />
            <select
              value={form.complexity}
              onChange={(e) => setForm({ ...form, complexity: e.target.value })}
              style={{
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            >
              <option value="low">{t("jobs.complexity.low")}</option>
              <option value="standard">{t("jobs.complexity.standard")}</option>
              <option value="high">{t("jobs.complexity.high")}</option>
            </select>
            <select
              value={form.urgency}
              onChange={(e) => setForm({ ...form, urgency: e.target.value })}
              style={{
                padding: "12px",
                borderRadius: "10px",
                border: "1px solid #ccc",
              }}
            >
              <option value="flexible">{t("jobs.urgency.flexible")}</option>
              <option value="week">{t("jobs.urgency.week")}</option>
              <option value="urgent">{t("jobs.urgency.urgent")}</option>
            </select>
          </div>
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "10px",
              color: "#333",
            }}
          >
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
            value={form.status}
            onChange={(e) => setForm({ ...form, status: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          >
            <option>Pending</option>
            <option>In progress</option>
            <option>Completed</option>
          </select>
          <input
            placeholder={t("jobs.placeholders.price")}
            value={form.price}
            onChange={(e) => setForm({ ...form, price: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <select
            value={form.taxState}
            onChange={(e) => setForm({ ...form, taxState: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          >
            {US_STATE_OPTIONS.map((state) => (
              <option key={state.code} value={state.code}>
                {state.code} - {state.name}
              </option>
            ))}
          </select>
          <input
            placeholder={t("jobs.placeholders.downPayment")}
            value={form.downPaymentPercent}
            onChange={(e) =>
              setForm({ ...form, downPaymentPercent: e.target.value })
            }
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <input
            type="date"
            value={form.dueDate}
            onChange={(e) => setForm({ ...form, dueDate: e.target.value })}
            style={{
              padding: "12px",
              borderRadius: "10px",
              border: "1px solid #ccc",
            }}
          />
          <div
            style={{
              padding: "16px",
              borderRadius: "12px",
              background: "#f4f8f4",
              border: "1px solid #d6e5d6",
            }}
          >
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
                <p style={{ margin: "6px 0 0 0", color: "#58705d" }}>
                  {t("jobs.estimator.description")}
                </p>
              </div>
              <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                <button
                  type="button"
                  onClick={generateEstimate}
                  disabled={estimating}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#1d6f42",
                    color: "white",
                    cursor: "pointer",
                  }}
                >
                  {estimating
                    ? t("jobs.estimator.calculating")
                    : t("jobs.estimator.calculate")}
                </button>
                <button
                  type="button"
                  onClick={useRecommendedPrice}
                  disabled={!estimateResult?.recommendedPrice}
                  style={{
                    padding: "10px 16px",
                    borderRadius: "8px",
                    border: "1px solid #1d6f42",
                    background: "white",
                    color: "#1d6f42",
                    cursor: "pointer",
                  }}
                >
                  {t("jobs.estimator.useRecommended")}
                </button>
              </div>
            </div>
            {estimateResult
              ? <div
                  style={{ marginTop: "16px", display: "grid", gap: "12px" }}
                >
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(150px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff",
                      }}
                    >
                      <div style={{ color: "#62706a", fontSize: "12px" }}>
                        {t("jobs.estimator.recommendedPrice")}
                      </div>
                      <div style={{ fontSize: "26px", fontWeight: 700 }}>
                        ${estimateResult.recommendedPrice}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff",
                      }}
                    >
                      <div style={{ color: "#62706a", fontSize: "12px" }}>
                        {t("jobs.estimator.range")}
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 700 }}>
                        ${estimateResult.lowPrice} - ${estimateResult.highPrice}
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff",
                      }}
                    >
                      <div style={{ color: "#62706a", fontSize: "12px" }}>
                        {t("jobs.estimator.hours")}
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 700 }}>
                        {estimateResult.estimatedHours} h
                      </div>
                    </div>
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff",
                      }}
                    >
                      <div style={{ color: "#62706a", fontSize: "12px" }}>
                        {t("jobs.estimator.confidence")}
                      </div>
                      <div style={{ fontSize: "18px", fontWeight: 700 }}>
                        {estimateResult.confidence}%
                      </div>
                    </div>
                  </div>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fit, minmax(220px, 1fr))",
                      gap: "12px",
                    }}
                  >
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff",
                      }}
                    >
                      <strong>{t("jobs.estimator.breakdown")}</strong>
                      <div
                        style={{
                          marginTop: "8px",
                          display: "grid",
                          gap: "6px",
                          color: "#444",
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
                    <div
                      style={{
                        padding: "12px",
                        borderRadius: "10px",
                        background: "#fff",
                      }}
                    >
                      <strong>{t("jobs.estimator.assumptions")}</strong>
                      <div
                        style={{
                          marginTop: "8px",
                          display: "grid",
                          gap: "6px",
                          color: "#444",
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
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <button
              type="button"
              onClick={saveJob}
              style={{
                padding: "12px 20px",
                borderRadius: "10px",
                border: "none",
                background: "black",
                color: "white",
                cursor: "pointer",
              }}
            >
              {selectedId ? t("jobs.buttons.update") : t("jobs.buttons.save")}
            </button>
            <button
              type="button"
              onClick={resetForm}
              style={{
                padding: "12px 20px",
                borderRadius: "10px",
                border: "1px solid #ccc",
                background: "white",
                cursor: "pointer",
              }}
            >
              {t("jobs.buttons.clear")}
            </button>
          </div>
        </div>
      </section>

      <section style={{ marginTop: "24px" }}>
        <h2>{t("jobs.listTitle")}</h2>
        <div style={{ display: "grid", gap: "14px" }}>
          {jobs.map((job) => (
            <div
              key={job._id}
              style={{
                padding: "18px",
                border: "1px solid #ddd",
                borderRadius: "14px",
                background: "#fff",
              }}
            >
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
                      <h3 style={{ margin: 0 }}>{job.title}</h3>
                      <p style={{ margin: "8px 0 0 0", color: "#555" }}>
                        {job.clientName} | {job.service}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.status")}:{" "}
                        {t(`jobs.statusOptions.${job.status}`) || job.status} |{" "}
                        {t("jobs.labels.price")}: ${job.price}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.tax")}: {financials.taxState} (
                        {financials.taxRate.toFixed(3)}%) |{" "}
                        {t("jobs.labels.taxAmount")}: $
                        {financials.taxAmount.toFixed(2)}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.estimateTotal")}: $
                        {financials.total.toFixed(2)} |
                        {t("jobs.labels.downPayment")}:{" "}
                        {financials.downPaymentPercent.toFixed(2)}% ($
                        {financials.downPaymentAmount.toFixed(2)})
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.balanceAfterDownPayment")}: $
                        {financials.balanceAfterDownPayment.toFixed(2)}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.date")}:{" "}
                        {job.dueDate || t("jobs.labels.noDate")}
                      </p>
                      {job.estimateSnapshot
                        ? <p style={{ margin: "8px 0 0 0", color: "#1d6f42" }}>
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
                          style={actionIconButtonStyle}
                        >
                          {filesOpen ? "Hide files" : "Manage files"}
                        </button>
                        <button
                          type="button"
                          onClick={() => editJob(job)}
                          style={actionIconButtonStyle}
                        >
                          <IconPencil />
                          {t("jobs.buttons.edit")}
                        </button>
                        {capabilities.canDeleteRecords
                          ? <button
                              type="button"
                              onClick={() => requestJobDelete(job)}
                              style={{
                                ...actionIconButtonStyle,
                                border: "1px solid #fecaca",
                                color: "#b91c1c",
                              }}
                            >
                              <IconTrash />
                              {t("jobs.buttons.delete")}
                            </button>
                          : null}
                      </div>
                    </div>

                    {filesOpen
                      ? <div
                          data-testid="job-files-panel"
                          style={{
                            borderRadius: 12,
                            border: "1px solid #e2e8f0",
                            background: "#f8fafc",
                            padding: 14,
                            display: "grid",
                            gap: 12,
                          }}
                        >
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
                              style={{
                                ...actionIconButtonStyle,
                                height: 34,
                                background: "#fff",
                              }}
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
                              style={{
                                ...actionIconButtonStyle,
                                height: 34,
                                background: "#fff",
                              }}
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
                            <div style={{ color: "#047857" }}>{filesState.success}</div>
                          )}

                          <div style={{ display: "grid", gap: 12 }}>
                            <div>
                              <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                                Photos ({photoItems.length})
                              </div>
                              {photoItems.length === 0
                                ? <div style={{ color: "#64748b" }}>No photos yet.</div>
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
                                          border: "1px solid #dbe2ea",
                                          borderRadius: 10,
                                          overflow: "hidden",
                                          background: "#fff",
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
                                          <div
                                            style={{
                                              fontSize: 12,
                                              color: "#334155",
                                              whiteSpace: "nowrap",
                                              overflow: "hidden",
                                              textOverflow: "ellipsis",
                                            }}
                                          >
                                            {file.name}
                                          </div>
                                          <button
                                            type="button"
                                            onClick={() => requestFileDelete(job._id, file)}
                                            disabled={filesState.deleting}
                                            style={{
                                              borderRadius: 8,
                                              border: "1px solid #fecaca",
                                              background: "#fff1f2",
                                              color: "#b91c1c",
                                              fontSize: 12,
                                              fontWeight: 700,
                                              padding: "6px 8px",
                                              cursor: "pointer",
                                            }}
                                          >
                                            Delete
                                          </button>
                                        </div>
                                      </div>
                                    ))}
                                  </div>}
                            </div>

                            <div>
                              <div style={{ fontWeight: 700, color: "#0f172a", marginBottom: 8 }}>
                                Documents ({documentItems.length})
                              </div>
                              {documentItems.length === 0
                                ? <div style={{ color: "#64748b" }}>No documents yet.</div>
                                : <div style={{ display: "grid", gap: 8 }}>
                                    {documentItems.map((file) => (
                                      <div
                                        key={file.id}
                                        style={{
                                          background: "#fff",
                                          borderRadius: 10,
                                          border: "1px solid #dbe2ea",
                                          padding: 10,
                                          display: "flex",
                                          justifyContent: "space-between",
                                          alignItems: "center",
                                          gap: 10,
                                          flexWrap: "wrap",
                                        }}
                                      >
                                        <div style={{ display: "grid", gap: 3 }}>
                                          <strong style={{ color: "#0f172a" }}>{file.name}</strong>
                                          <span style={{ color: "#64748b", fontSize: 12 }}>
                                            {formatFileSize(file.size)}
                                          </span>
                                        </div>
                                        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                                          {file.signedUrl && (
                                            <a
                                              href={file.signedUrl}
                                              target="_blank"
                                              rel="noreferrer"
                                              style={{
                                                borderRadius: 8,
                                                border: "1px solid #cbd5e1",
                                                background: "#fff",
                                                color: "#0f172a",
                                                fontSize: 12,
                                                fontWeight: 700,
                                                padding: "7px 10px",
                                                textDecoration: "none",
                                              }}
                                            >
                                              Download
                                            </a>
                                          )}
                                          <button
                                            type="button"
                                            onClick={() => requestFileDelete(job._id, file)}
                                            disabled={filesState.deleting}
                                            style={{
                                              borderRadius: 8,
                                              border: "1px solid #fecaca",
                                              background: "#fff1f2",
                                              color: "#b91c1c",
                                              fontSize: 12,
                                              fontWeight: 700,
                                              padding: "7px 10px",
                                              cursor: "pointer",
                                            }}
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
                              onClick={() =>
                                loadJobFiles(job._id, filesState.page + 1, true)
                              }
                              disabled={filesState.loading}
                              style={{
                                width: "fit-content",
                                borderRadius: 8,
                                border: "1px solid #cbd5e1",
                                background: "#fff",
                                color: "#0f172a",
                                fontSize: 12,
                                fontWeight: 700,
                                padding: "8px 10px",
                                cursor: "pointer",
                              }}
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
