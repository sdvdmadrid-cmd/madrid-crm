"use client";

import { useCallback, useMemo, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { CLIENT_IMPORT_FIELDS } from "@/lib/import-engine/client-fields";
import {
  MAX_CSV_BYTES,
  MAX_CSV_ROWS,
  parseCsvText,
} from "@/lib/import-engine/csv-parse";
import {
  getProviderById,
  IMPORT_PROVIDERS,
  suggestColumnMapping,
} from "@/lib/import-engine/providers";
import ws from "@/styles/workspace-dark.module.css";
import imp from "./client-import.module.css";

const STEPS = ["upload", "map", "preview", "import", "done"];
const BATCH_SIZE = 100;

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

export default function ClientCsvImportWizard({ open, onClose, onComplete }) {
  const { t } = useTranslation();
  const [step, setStep] = useState("upload");
  const [providerId, setProviderId] = useState("jobber");
  const [headers, setHeaders] = useState([]);
  const [records, setRecords] = useState([]);
  const [parseMeta, setParseMeta] = useState({ truncated: false, totalParsed: 0 });
  const [mapping, setMapping] = useState({});
  const [duplicateMode, setDuplicateMode] = useState("skip");
  const [previewRows, setPreviewRows] = useState([]);
  const [previewSummary, setPreviewSummary] = useState(null);
  const [importProgress, setImportProgress] = useState(0);
  const [finalSummary, setFinalSummary] = useState(null);
  const [errorRows, setErrorRows] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const reset = useCallback(() => {
    setStep("upload");
    setProviderId("jobber");
    setHeaders([]);
    setRecords([]);
    setParseMeta({ truncated: false, totalParsed: 0 });
    setMapping({});
    setDuplicateMode("skip");
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
      setMapping(suggestColumnMapping(parsed.headers, providerId));
      setStep("map");
    } catch {
      setError(t("clients.import.errors.parseFailed"));
    }
  };

  const onProviderChange = (nextId) => {
    setProviderId(nextId);
    if (headers.length) {
      setMapping(suggestColumnMapping(headers, nextId));
    }
  };

  const nameMapped =
    Boolean(String(mapping.name || "").trim()) ||
    Boolean(String(mapping.firstName || "").trim()) ||
    Boolean(String(mapping.lastName || "").trim());

  const runPreview = async () => {
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
        body: JSON.stringify({ records, mapping, duplicateMode }),
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
  };

  const runImport = async () => {
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
    let seenKeys = { emails: [], phones: [] };

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
            duplicateMode,
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
  const provider = getProviderById(providerId);

  const previewStatusLabel = useMemo(
    () => ({
      ready: t("clients.import.status.ready"),
      invalid: t("clients.import.status.invalid"),
      duplicate_file: t("clients.import.status.duplicateFile"),
      duplicate_existing: t("clients.import.status.duplicateExisting"),
    }),
    [t],
  );

  if (!open) return null;

  return (
    <div className={imp.overlay} role="dialog" aria-modal="true">
      <div className={imp.panel}>
        <h2 style={{ margin: 0, color: "#f8fafc" }}>{t("clients.import.title")}</h2>
        <p className={imp.hint}>{t("clients.import.subtitle")}</p>

        <div className={imp.steps}>
          {STEPS.map((key, index) => {
            let cls = imp.step;
            if (index === stepIndex) cls = `${imp.step} ${imp.stepActive}`;
            else if (index < stepIndex) cls = `${imp.step} ${imp.stepDone}`;
            return (
              <span key={key} className={cls}>
                {t(`clients.import.steps.${key}`)}
              </span>
            );
          })}
        </div>

        {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

        {step === "upload" ? (
          <>
            <label className={imp.hint} htmlFor="import-provider" style={{ display: "block", marginBottom: 6 }}>
              {t("clients.import.providerLabel")}
            </label>
            <select
              id="import-provider"
              className={ws.input}
              value={providerId}
              onChange={(e) => onProviderChange(e.target.value)}
            >
              {IMPORT_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            <p className={imp.hint}>{provider.description}</p>

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
            <p className={imp.hint}>
              {t("clients.import.mapHint", { count: records.length })}
              {parseMeta.truncated
                ? ` ${t("clients.import.rowsTruncated", {
                    shown: records.length,
                    total: parseMeta.totalParsed,
                  })}`
                : ""}
            </p>
            <div className={imp.grid2}>
              {CLIENT_IMPORT_FIELDS.map((field) => (
                <div key={field.key}>
                  <label className={imp.hint} htmlFor={`map-${field.key}`} style={{ display: "block", marginBottom: 6 }}>
                    {field.label}
                    {field.required ? " *" : ""}
                  </label>
                  <select
                    id={`map-${field.key}`}
                    className={ws.input}
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
            <div className={imp.grid2} style={{ marginBottom: 12 }}>
              <div>
                <label className={imp.hint} htmlFor="duplicate-mode" style={{ display: "block", marginBottom: 6 }}>
                  {t("clients.import.duplicateModeLabel")}
                </label>
                <select
                  id="duplicate-mode"
                  className={ws.input}
                  value={duplicateMode}
                  onChange={(e) => setDuplicateMode(e.target.value)}
                >
                  <option value="skip">{t("clients.import.duplicateSkip")}</option>
                  <option value="update">{t("clients.import.duplicateUpdate")}</option>
                  <option value="create">{t("clients.import.duplicateCreate")}</option>
                </select>
              </div>
            </div>

            {previewSummary ? (
              <div className={imp.summaryGrid}>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{previewSummary.total}</div>
                  <div className={imp.summaryLabel}>{t("clients.import.summary.total")}</div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{previewSummary.willCreate}</div>
                  <div className={imp.summaryLabel}>{t("clients.import.summary.create")}</div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{previewSummary.willUpdate}</div>
                  <div className={imp.summaryLabel}>{t("clients.import.summary.update")}</div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{previewSummary.willSkip}</div>
                  <div className={imp.summaryLabel}>{t("clients.import.summary.skip")}</div>
                </div>
                <div className={imp.summaryCard}>
                  <div className={imp.summaryValue}>{previewSummary.invalid}</div>
                  <div className={imp.summaryLabel}>{t("clients.import.summary.invalid")}</div>
                </div>
              </div>
            ) : null}

            {previewSummary?.truncated ? (
              <p className={imp.hint}>{t("clients.import.previewTruncated")}</p>
            ) : null}

            <div className={imp.tableWrap}>
              <table className={imp.table}>
                <thead>
                  <tr>
                    <th>#</th>
                    <th>{t("clients.import.columns.status")}</th>
                    <th>{t("clients.placeholders.name")}</th>
                    <th>{t("clients.placeholders.email")}</th>
                    <th>{t("clients.placeholders.phone")}</th>
                    <th>{t("clients.import.columns.details")}</th>
                  </tr>
                </thead>
                <tbody>
                  {previewRows.slice(0, 100).map((row) => (
                    <tr key={row.rowIndex}>
                      <td>{row.rowIndex + 1}</td>
                      <td>
                        <span className={statusBadgeClass(row.status)}>
                          {previewStatusLabel[row.status] || row.status}
                        </span>
                      </td>
                      <td>{row.payload?.name || "—"}</td>
                      <td>{row.payload?.email || "—"}</td>
                      <td>{row.payload?.phone || "—"}</td>
                      <td>
                        {row.errors?.length
                          ? row.errors.join("; ")
                          : row.existingClientName
                            ? t("clients.import.existingMatch", {
                                name: row.existingClientName,
                              })
                            : "—"}
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
            <p className={imp.hint}>{t("clients.import.importing")}</p>
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
            <div className={imp.summaryGrid}>
              <div className={imp.summaryCard}>
                <div className={imp.summaryValue}>{finalSummary.created}</div>
                <div className={imp.summaryLabel}>{t("clients.import.summary.created")}</div>
              </div>
              <div className={imp.summaryCard}>
                <div className={imp.summaryValue}>{finalSummary.updated}</div>
                <div className={imp.summaryLabel}>{t("clients.import.summary.updated")}</div>
              </div>
              <div className={imp.summaryCard}>
                <div className={imp.summaryValue}>{finalSummary.skipped}</div>
                <div className={imp.summaryLabel}>{t("clients.import.summary.skipped")}</div>
              </div>
              <div className={imp.summaryCard}>
                <div className={imp.summaryValue}>{finalSummary.failed}</div>
                <div className={imp.summaryLabel}>{t("clients.import.summary.failed")}</div>
              </div>
            </div>
            {errorRows.length > 0 ? (
              <div className={imp.tableWrap}>
                <p className={imp.hint}>{t("clients.import.errorReport")}</p>
                <table className={imp.table}>
                  <thead>
                    <tr>
                      <th>#</th>
                      <th>{t("clients.import.columns.details")}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {errorRows.map((err) => (
                      <tr key={`${err.rowIndex}-${err.message}`}>
                        <td>{(err.rowIndex ?? 0) + 1}</td>
                        <td>{err.message}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : null}
          </>
        ) : null}

        <div className={imp.footer}>
          <button type="button" className={ws.btnSecondary} onClick={handleClose}>
            {step === "done" ? t("clients.import.close") : t("clients.buttons.clear")}
          </button>

          {step === "map" ? (
            <>
              <button
                type="button"
                className={ws.btnSecondary}
                onClick={() => setStep("upload")}
              >
                {t("clients.import.back")}
              </button>
              <button
                type="button"
                className={ws.btnPrimary}
                disabled={busy || !nameMapped}
                onClick={runPreview}
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
                onClick={() => setStep("map")}
                disabled={busy}
              >
                {t("clients.import.back")}
              </button>
              <button
                type="button"
                className={ws.btnPrimary}
                disabled={busy}
                onClick={runImport}
              >
                {busy ? t("clients.import.importing") : t("clients.import.startImport")}
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
