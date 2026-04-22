"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
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

  const fetchJobs = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/jobs");
      const data = await getJsonOrThrow(res, t("jobs.errors.fetch"));
      setJobs(data);
    } catch (err) {
      console.error(err);
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
      console.error(err);
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

  const deleteJob = async (id) => {
    try {
      const res = await apiFetch(`/api/jobs/${id}`, { method: "DELETE" });
      await getJsonOrThrow(res, t("jobs.errors.delete"));
      setJobs(jobs.filter((job) => job._id !== id));
      if (selectedId === id) resetForm();
    } catch (err) {
      console.error(err);
      setError(err.message || t("jobs.errors.deleteFallback"));
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
                return (
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
                        {job.clientName} Â· {job.service}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.status")}:{" "}
                        {t(`jobs.statusOptions.${job.status}`) || job.status} Â·{" "}
                        {t("jobs.labels.price")}: ${job.price}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.tax")}: {financials.taxState} (
                        {financials.taxRate.toFixed(3)}%) Â·{" "}
                        {t("jobs.labels.taxAmount")}: $
                        {financials.taxAmount.toFixed(2)}
                      </p>
                      <p style={{ margin: "8px 0 0 0", color: "#777" }}>
                        {t("jobs.labels.estimateTotal")}: $
                        {financials.total.toFixed(2)} Â·
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
                            {job.estimateSnapshot.recommendedPrice} Â·{" "}
                            {job.estimateSnapshot.estimatedHours} h Â·{" "}
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
                        onClick={() => editJob(job)}
                        style={{
                          padding: "10px 16px",
                          borderRadius: "8px",
                          border: "none",
                          background: "#0b69ff",
                          color: "white",
                          cursor: "pointer",
                        }}
                      >
                        {t("jobs.buttons.edit")}
                      </button>
                      {capabilities.canDeleteRecords
                        ? <button
                            type="button"
                            onClick={() => deleteJob(job._id)}
                            style={{
                              padding: "10px 16px",
                              borderRadius: "8px",
                              border: "none",
                              background: "#d32f2f",
                              color: "white",
                              cursor: "pointer",
                            }}
                          >
                            {t("jobs.buttons.delete")}
                          </button>
                        : null}
                    </div>
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
    </main>
  );
}
