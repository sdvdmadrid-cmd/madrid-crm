"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import {
  CLIENT_IMPORT_FIELDS,
  DEFAULT_DUPLICATE_MODE,
} from "@/lib/import-engine/client-fields";
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  parseCsvText,
} from "@/lib/import-engine/csv-parse";
import {
  formatPreviewLocality,
  formatPreviewStreet,
} from "@/lib/import-engine/import-preview-format";
import {
  detectImportFormat,
  suggestColumnMapping,
} from "@/lib/import-engine/providers";
import ws from "@/styles/workspace-dark.module.css";
import imp from "./client-import.module.css";

const STEPS = ["upload", "map", "preview", "import", "done"];
const BATCH_SIZE = 100;
const DUPLICATE_MODE = DEFAULT_DUPLICATE_MODE;

function chunkArray(items, size) {
  const chunks = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

function statusBadgeClass(status) {
  if (status === "ready") return `${imp.badge} ${imp.badgeReady}`;
  if (status === "invalid") return `${imp.badge} ${imp.badgeInvalid}`;
  return `${imp.badge} ${imp.badgeDup}`;
}

function PreviewTextCell({ value, maxLen = 80, nowrap = false }) {
  const text = String(value ?? "").trim();
  if (!text) return <>—</>;
  const truncated = text.length > maxLen;
  const shown = truncated ? `${text.slice(0, maxLen)}…` : text;
  return (
    <span
      className={nowrap ? imp.previewCellNowrap : imp.previewCell}
      title={truncated ? text : undefined}
    >
      {shown}
    </span>
  );
}

function NoDuplicatePolicy({ t }) {
  return (
    <div className={imp.policyCard}>
      <span className={imp.policyIcon} aria-hidden>
        ✓
      </span>
      <div>
        <p className={imp.policyTitle}>{t("clients.import.noDuplicatesTitle")}</p>
        <p className={imp.policyText}>{t("clients.import.noDuplicatesBody")}</p>
      </div>
    </div>
  );
}

export default function ClientCsvImportWizard({ open, onClose, onComplete }) {
  const { t } = useTranslation();
  const [step, setStep] = useState("upload");
  const [headers, setHeaders] = useState([]);
  const [records, setRecords] = useState([]);
  const [parseMeta, setParseMeta] = useState({ truncated: false, totalParsed: 0 });
  const [mapping, setMapping] = useState({});
  const [previewRows, setPreviewRows] = useState([]);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [importProgress, setImportProgress] = useState(0);
  const [finalSummary, setFinalSummary] = useState(null);
  const [errorRows, setErrorRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setStep("upload");
    setHeaders([]);
    setRecords([]);
    setParseMeta({ truncated: false, totalParsed: 0 });
    setMapping({});
    setPreviewRows([]);
    setPreviewSummary(null);
    setImportProgress(0);
    setFinalSummary(null);
    setErrorRows([]);
    setBusy(false);
    setError("");
  }, []);

  const handleClose = () => {
    reset();
    onClose();
  };

  const handleRestart = () => {
    reset();
  };

  const handleFile = async (event) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    setError("");
    if (file.size > MAX_CSV_BYTES) {
      setError(
        t("clients.import.errors.fileTooLarge", {
          maxMb: Math.round(MAX_CSV_BYTES / (1024 * 1024)),
        }),
      );
      return;
    }

    try {
      const text = await file.text();
      const parsed = parseCsvText(text, { maxRows: MAX_CSV_ROWS });
      if (!parsed.headers.length) {
        setError(t("clients.import.errors.emptyFile"));
        return;
      }
      if (!parsed.rows.length) {
        setError(t("clients.import.errors.noDataRows"));
        return;
      }

      setHeaders(parsed.headers);
      setRecords(parsed.rows);
      setParseMeta({
        truncated: parsed.truncated,
        totalParsed: parsed.totalParsed,
      });
      setMapping(
        suggestColumnMapping(parsed.headers, detectImportFormat(parsed.headers)),
      );
      setPreviewRows([]);
      setPreviewSummary(null);
      setStep("map");
    } catch {
      setError(t("clients.import.errors.parseFailed"));
    }
  };

  const nameMapped =
    Boolean(String(mapping.name || "").trim()) ||
    Boolean(String(mapping.firstName || "").trim()) ||
    Boolean(String(mapping.lastName || "").trim());

  const runPreview = useCallback(async () => {
    if (!nameMapped) {
      setError(t("clients.import.errors.nameColumnRequired"));
      return;
    }

    setBusy(true);
    setError("");
    try {
      const res = await apiFetch("/api/clients/import/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ records, mapping, duplicateMode: DUPLICATE_MODE }),
      });
      const json = await getJsonOrThrow(res, t("clients.import.errors.previewFailed"));
      setPreviewRows(json.data?.preview || []);
      setPreviewSummary(json.data?.summary || null);
      setStep("preview");
    } catch (err) {
      setError(err.message || t("clients.import.errors.previewFailed"));
    } finally {
      setBusy(false);
    }
  }, [nameMapped, records, mapping, t]);

  const runImport = async () => {
    const actionable =
      (previewSummary?.willCreate || 0) + (previewSummary?.willUpdate || 0);
    if (!actionable) {
      setError(t("clients.import.errors.nothingToSave"));
      return;
    }

    setBusy(true);
    setError("");
    setStep("import");
    setImportProgress(0);
    setErrorRows([]);

    const batches = chunkArray(records, BATCH_SIZE);
    const totals = {
      created: 0,
      updated: 0,
      skipped: 0,
      failed: 0,
    };
    const allErrors = [];
    let seenKeys = { emails: [], phones: [], names: [] };

    try {
      for (let batchIndex = 0; batchIndex < batches.length; batchIndex += 1) {
        const batch = batches[batchIndex];
        const startRowIndex = batchIndex * BATCH_SIZE;

        const res = await apiFetch("/api/clients/import/commit", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            records: batch,
            mapping,
            duplicateMode: DUPLICATE_MODE,
            startRowIndex,
            totalRows: records.length,
            seenKeys,
          }),
        });

        const json = await getJsonOrThrow(res, t("clients.import.errors.importFailed"));
        const data = json.data || {};

        totals.created += data.created || 0;
        totals.updated += data.updated || 0;
        totals.skipped += data.skipped || 0;
        totals.failed += data.failed || 0;

        if (Array.isArray(data.errors)) {
          allErrors.push(...data.errors);
        }
        if (data.seenKeys) {
          seenKeys = data.seenKeys;
        }

        setImportProgress(
          Math.round(((batchIndex + 1) / batches.length) * 100),
        );
      }

      setFinalSummary(totals);
      setErrorRows(allErrors.slice(0, 50));
      setStep("done");
      onComplete?.();
    } catch (err) {
      setError(err.message || t("clients.import.errors.importFailed"));
      setStep("preview");
    } finally {
      setBusy(false);
    }
  };

  const stepIndex = STEPS.indexOf(step);
  const isWideStep = step === "map" || step === "preview" || step === "done";

  const canSave = useMemo(() => {
    if (!previewSummary) return false;
    return (
      (previewSummary.willCreate || 0) + (previewSummary.willUpdate || 0) > 0
    );
  }, [previewSummary]);

  const { skippedErrors, failedErrors } = useMemo(() => {
    const skipped = [];
    const failed = [];
    for (const err of errorRows) {
      if (String(err.message || "").startsWith("Skipped:")) {
        skipped.push(err);
      } else {
        failed.push(err);
      }
    }
    return { skippedErrors: skipped, failedErrors: failed };
  }, [errorRows]);

  const isStepReachable = useCallback(
    (key) => {
      if (busy && step === "import") return false;
      if (key === "import") return step === "import";
      if (key === "done") return Boolean(finalSummary);
      if (key === "preview") return records.length > 0 && nameMapped;
      if (key === "map") return records.length > 0;
      if (key === "upload") return true;
      return false;
    },
    [busy, step, finalSummary, records.length, nameMapped],
  );

  const goToStep = useCallback(
    async (key) => {
      if (!isStepReachable(key) || busy) return;

      if (key === "preview") {
        if (!previewSummary) {
          await runPreview();
          return;
        }
        setStep("preview");
        setError("");
        return;
      }

      if (key === step) return;
      setError("");
      setStep(key);
    },
    [isStepReachable, busy, previewSummary, step, runPreview],
  );

  const previewStatusLabel = useMemo(
    () => ({
      ready: t("clients.import.status.ready"),
      invalid: t("clients.import.status.invalid"),
      duplicate_file: t("clients.import.status.duplicateFile"),
      duplicate_existing: t("clients.import.status.duplicateExisting"),
    }),
    [t],
  );

  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;

    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = prevOverflow;
    };
  }, [open]);

  if (!open) return null;

  const dialog = (
    <div
      className={`${imp.overlay} ${isWideStep ? imp.overlayTall : ""}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="csv-import-title"
    >
      <div
        className={`${imp.panel} ${imp.panelFlex} ${imp.panelEnter} ${
          isWideStep ? imp.panelWide : ""
        }`}
      >
        <div className={imp.header}>
          <div className={imp.headerTop}>
            <div>
              <h2 id="csv-import-title" className={imp.headerTitle}>
                {t("clients.import.title")}
              </h2>
              <p className={imp.hint}>{t("clients.import.subtitle")}</p>
            </div>
            <button
              type="button"
              className={imp.closeBtn}
              onClick={handleClose}
              disabled={busy && step === "import"}
              aria-label={t("clients.import.close")}
            >
              ×
            </button>
          </div>

          <nav className={imp.steps} aria-label={t("clients.import.stepsLabel")}>
            {STEPS.map((key, index) => {
              let cls = imp.stepBtn;
              if (index === stepIndex) cls = `${imp.stepBtn} ${imp.stepActive}`;
              else if (index < stepIndex) cls = `${imp.stepBtn} ${imp.stepDone}`;
              const reachable = isStepReachable(key);
              if (!reachable) cls = `${cls} ${imp.stepDisabled}`;

              return (
                <button
                  key={key}
                  type="button"
                  className={cls}
                  disabled={!reachable || busy}
                  aria-current={index === stepIndex ? "step" : undefined}
                  onClick={() => goToStep(key)}
                >
                  {t(`clients.import.steps.${key}`)}
                </button>
              );
            })}
          </nav>

          {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}
        </div>

        <div className={imp.body}>
          {step === "upload" ? (
            <>
              <p className={imp.hint}>{t("clients.import.providerLabel")}</p>
              <div style={{ marginTop: 16 }}>
                <label className={ws.btnPrimary} style={{ cursor: "pointer" }}>
                  {t("clients.import.chooseFile")}
                  <input
                    type="file"
                    accept=".csv,text/csv"
                    style={{ display: "none" }}
                    onChange={handleFile}
                  />
                </label>
              </div>
              <p className={imp.hint}>{t("clients.import.uploadHint")}</p>
            </>
          ) : null}

          {step === "map" ? (
            <>
              <NoDuplicatePolicy t={t} />
              <p className={imp.hint}>
                {t("clients.import.mapHint", { count: records.length })}
                {parseMeta.truncated
                  ? ` ${t("clients.import.rowsTruncated", {
                      shown: records.length,
                      total: parseMeta.totalParsed,
                    })}`
                  : ""}
              </p>

              {mapping.address && /billing/i.test(String(mapping.address)) ? (
                <div className={imp.previewWarn}>
                  {t("clients.import.mapBillingStreetWarning")}
                </div>
              ) : null}

              <div className={imp.grid2}>
                {CLIENT_IMPORT_FIELDS.map((field) => (
                  <div key={field.key}>
                    <label
                      className={imp.hint}
                      htmlFor={`map-${field.key}`}
                      style={{ display: "block", marginBottom: 6 }}
                    >
                      {field.label}
                      {field.required ? " *" : ""}
                    </label>
                    <select
                      id={`map-${field.key}`}
                      className={imp.selectInput}
                      value={mapping[field.key] || ""}
                      onChange={(e) =>
                        setMapping((prev) => ({
                          ...prev,
                          [field.key]: e.target.value,
                        }))
                      }
                    >
                      <option value="">{t("clients.import.unmapped")}</option>
                      {headers.map((header) => (
                        <option key={header} value={header}>
                          {header}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
              </div>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <NoDuplicatePolicy t={t} />

              {previewSummary ? (
                <div className={imp.summaryGrid}>
                  <div className={imp.summaryCard}>
                    <div className={imp.summaryValue}>{previewSummary.total}</div>
                    <div className={imp.summaryLabel}>
                      {t("clients.import.summary.total")}
                    </div>
                  </div>
                  <div className={imp.summaryCard}>
                    <div className={imp.summaryValue}>
                      {previewSummary.willCreate}
                    </div>
                    <div className={imp.summaryLabel}>
                      {t("clients.import.summary.create")}
                    </div>
                  </div>
                  <div className={imp.summaryCard}>
                    <div className={imp.summaryValue}>
                      {previewSummary.willUpdate}
                    </div>
                    <div className={imp.summaryLabel}>
                      {t("clients.import.summary.update")}
                    </div>
                  </div>
                  <div className={imp.summaryCard}>
                    <div className={imp.summaryValue}>
                      {previewSummary.willSkip}
                    </div>
                    <div className={imp.summaryLabel}>
                      {t("clients.import.summary.skip")}
                    </div>
                  </div>
                  <div className={imp.summaryCard}>
                    <div className={imp.summaryValue}>
                      {previewSummary.invalid}
                    </div>
                    <div className={imp.summaryLabel}>
                      {t("clients.import.summary.invalid")}
                    </div>
                  </div>
                </div>
              ) : null}

              {previewSummary?.truncated ? (
                <p className={imp.hint}>{t("clients.import.previewTruncated")}</p>
              ) : null}

              <p className={imp.hint}>{t("clients.import.previewTableHint")}</p>

              <div className={imp.tableWrap}>
                <table className={imp.table}>
                  <thead>
                    <tr>
                      <th className={imp.colNum}>#</th>
                      <th className={imp.colStatus}>
                        {t("clients.import.columns.status")}
                      </th>
                      <th className={imp.colName}>
                        {t("clients.placeholders.name")}
                      </th>
                      <th className={imp.colEmail}>
                        {t("clients.placeholders.email")}
                      </th>
                      <th className={imp.colPhone}>
                        {t("clients.placeholders.phone")}
                      </th>
                      <th className={imp.colStreet}>
                        {t("clients.import.columns.street")}
                      </th>
                      <th className={imp.colLocality}>
                        {t("clients.import.columns.locality")}
                      </th>
                      <th className={imp.colNotes}>
                        {t("clients.placeholders.notes")}
                      </th>
                      <th className={imp.colDetails}>
                        {t("clients.import.columns.details")}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {previewRows.slice(0, 100).map((row) => (
                      <tr key={row.rowIndex}>
                        <td className={imp.colNum}>{row.rowIndex + 1}</td>
                        <td className={imp.colStatus}>
                          <span className={statusBadgeClass(row.status)}>
                            {previewStatusLabel[row.status] || row.status}
                          </span>
                        </td>
                        <td className={imp.colName}>
                          <PreviewTextCell value={row.payload?.name} maxLen={48} />
                        </td>
                        <td className={imp.colEmail}>
                          <PreviewTextCell value={row.payload?.email} maxLen={40} />
                        </td>
                        <td className={imp.colPhone}>
                          <PreviewTextCell
                            value={row.payload?.phone}
                            maxLen={28}
                            nowrap
                          />
                        </td>
                        <td className={imp.colStreet}>
                          <PreviewTextCell
                            value={formatPreviewStreet(row.payload)}
                            maxLen={80}
                          />
                        </td>
                        <td className={imp.colLocality}>
                          <PreviewTextCell
                            value={formatPreviewLocality(row.payload)}
                            maxLen={56}
                          />
                        </td>
                        <td className={imp.colNotes}>
                          <PreviewTextCell value={row.payload?.notes} maxLen={72} />
                        </td>
                        <td className={imp.colDetails}>
                          {row.errors?.length ? (
                            <PreviewTextCell
                              value={row.errors.join("; ")}
                              maxLen={120}
                            />
                          ) : row.existingClientName ? (
                            t("clients.import.existingMatch", {
                              name: row.existingClientName,
                            })
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : null}

          {step === "import" ? (
            <>
              <p className={imp.hint}>{t("clients.import.savingClients")}</p>
              <div className={imp.progressBar}>
                <div
                  className={imp.progressFill}
                  style={{ width: `${importProgress}%` }}
                />
              </div>
              <p className={imp.hint}>{importProgress}%</p>
            </>
          ) : null}

          {step === "done" && finalSummary ? (
            <>
              <div className={imp.doneBanner}>
                <p className={imp.doneTitle}>{t("clients.import.doneTitle")}</p>
                <p className={imp.doneHint}>{t("clients.import.doneHint")}</p>
              </div>

              <div className={imp.summaryGrid}>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{finalSummary.created}</div>
                  <div className={imp.summaryLabel}>
                    {t("clients.import.summary.created")}
                  </div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{finalSummary.updated}</div>
                  <div className={imp.summaryLabel}>
                    {t("clients.import.summary.updated")}
                  </div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{finalSummary.skipped}</div>
                  <div className={imp.summaryLabel}>
                    {t("clients.import.summary.skipped")}
                  </div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{finalSummary.failed}</div>
                  <div className={imp.summaryLabel}>
                    {t("clients.import.summary.failed")}
                  </div>
                </div>
              </div>
              {failedErrors.length > 0 ? (
                <>
                  <p className={imp.errorSectionTitle}>
                    {t("clients.import.errorReportFailed", {
                      count: failedErrors.length,
                    })}
                  </p>
                  <div className={imp.tableWrap}>
                    <table className={imp.table}>
                      <thead>
                        <tr>
                          <th className={imp.colNum}>#</th>
                          <th>{t("clients.import.columns.details")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {failedErrors.map((err) => (
                          <tr key={`fail-${err.rowIndex}-${err.message}`}>
                            <td className={imp.colNum}>
                              {(err.rowIndex ?? 0) + 1}
                            </td>
                            <td className={imp.errorCellFail}>
                              {err.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}

              {skippedErrors.length > 0 ? (
                <>
                  <p className={imp.errorSectionTitle}>
                    {t("clients.import.errorReportSkipped", {
                      count: skippedErrors.length,
                    })}
                  </p>
                  <div className={imp.tableWrap}>
                    <table className={imp.table}>
                      <thead>
                        <tr>
                          <th className={imp.colNum}>#</th>
                          <th>{t("clients.import.columns.details")}</th>
                        </tr>
                      </thead>
                      <tbody>
                        {skippedErrors.map((err) => (
                          <tr key={`skip-${err.rowIndex}-${err.message}`}>
                            <td className={imp.colNum}>
                              {(err.rowIndex ?? 0) + 1}
                            </td>
                            <td className={imp.errorCellSkip}>
                              {err.message}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              ) : null}
            </>
          ) : null}
        </div>

        <div className={imp.footer}>
          {step === "done" ? (
            <>
              <button
                type="button"
                className={ws.btnSecondary}
                onClick={handleRestart}
              >
                {t("clients.import.uploadAnother")}
              </button>
              <button
                type="button"
                className={`${ws.btnPrimary} ${imp.footerPrimary}`}
                onClick={handleClose}
              >
                {t("clients.import.close")}
              </button>
            </>
          ) : (
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={handleClose}
              disabled={busy && step === "import"}
            >
              {t("clients.buttons.clear")}
            </button>
          )}

          {step === "upload" && records.length > 0 ? (
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={() => goToStep("map")}
            >
              {t("clients.import.continueMapping")}
            </button>
          ) : null}

          {step === "map" ? (
            <>
              <button
                type="button"
                className={ws.btnSecondary}
                onClick={() => goToStep("upload")}
                disabled={busy}
              >
                {t("clients.import.back")}
              </button>
              <button
                type="button"
                className={`${ws.btnPrimary} ${imp.footerPrimary}`}
                disabled={busy || !nameMapped}
                onClick={() => runPreview()}
              >
                {busy ? t("clients.buttons.saving") : t("clients.import.preview")}
              </button>
            </>
          ) : null}

          {step === "preview" ? (
            <>
              <button
                type="button"
                className={ws.btnSecondary}
                onClick={() => goToStep("map")}
                disabled={busy}
              >
                {t("clients.import.back")}
              </button>
              <button
                type="button"
                className={`${ws.btnPrimary} ${imp.footerPrimary}`}
                disabled={busy || !canSave}
                onClick={() => runImport()}
              >
                {busy
                  ? t("clients.buttons.saving")
                  : t("clients.buttons.save")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
