"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import DocumentPdfActions from "@/components/workspace/DocumentPdfActions";
import {
  escapeHtml,
  openPrintableHtmlDocument,
} from "@/lib/print-html-document";
import { filterAndRankRecords } from "@/lib/record-search";
import "@/i18n";
import ws from "@/styles/workspace-dark.module.css";
import styles from "./contracts.module.css";

function normalizeContractsPayload(raw) {
  if (Array.isArray(raw)) return raw;
  if (Array.isArray(raw?.data)) return raw.data;
  return [];
}

function formatShortId(id) {
  const text = String(id || "").trim();
  if (!text) return "";
  return text.length > 8 ? `#${text.slice(0, 8)}` : `#${text}`;
}

export default function ContractsPage() {
  const { t } = useTranslation();
  const router = useRouter();
  const searchParams = useSearchParams();
  const filterClientId = String(searchParams.get("clientId") || "").trim();

  const [contracts, setContracts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [listSearch, setListSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  const fetchContracts = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/contracts");
      const raw = await getJsonOrThrow(res, t("contracts.errors.load"));
      setContracts(normalizeContractsPayload(raw));
    } catch (err) {
      setContracts([]);
      setError(err?.message || t("contracts.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchContracts();
  }, [fetchContracts]);

  const visibleContracts = useMemo(() => {
    let list = contracts;
    if (filterClientId) {
      list = list.filter(
        (row) => String(row.clientId || "") === filterClientId,
      );
    }
    if (statusFilter !== "all") {
      list = list.filter(
        (row) =>
          String(row.status || "").toLowerCase() ===
          statusFilter.toLowerCase(),
      );
    }
    if (listSearch.trim()) {
      list = filterAndRankRecords(list, listSearch, (row) => [
        row.clientName,
        row.jobTitle,
        row.status,
        row.contractCategory,
        row.contractOption,
        row.amount,
        row.id,
      ]);
    }
    return list;
  }, [contracts, filterClientId, listSearch, statusFilter]);

  const statusOptions = useMemo(() => {
    const set = new Set(contracts.map((c) => String(c.status || "Draft").trim()));
    return ["all", ...Array.from(set).sort()];
  }, [contracts]);

  return (
    <main className={`${ws.page} ${styles.page}`}>
      <header
        className={ws.topBar}
        style={{ borderRadius: 18, marginBottom: 20, border: "1px solid rgba(148,163,184,0.16)" }}
      >
        <div>
          <h1 className={ws.title}>{t("contracts.title")}</h1>
          <p className={ws.subtitle}>{t("contracts.description")}</p>
          <div className={styles.heroActions}>
            <Link href="/estimates" className={ws.btnPrimary}>
              {t("contracts.actions.fromEstimate")}
            </Link>
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={() => fetchContracts()}
            >
              {t("contracts.actions.refresh")}
            </button>
          </div>
        </div>
      </header>

      {error ? <div className={ws.noticeError}>{error}</div> : null}
      {loading ? <p className={ws.subtitle}>{t("contracts.loading")}</p> : null}

      <section>
        <h2 className={ws.title} style={{ fontSize: "1.25rem" }}>
          {t("contracts.listTitle")}
        </h2>
        <p className={ws.subtitle} style={{ marginBottom: 14 }}>
          {t("contracts.listHint")}
        </p>

        <div className={styles.filterBar}>
          <input
            type="search"
            value={listSearch}
            onChange={(event) => setListSearch(event.target.value)}
            placeholder={t("contracts.searchPlaceholder")}
            aria-label={t("contracts.searchLabel")}
            className={styles.listSearch}
          />
          <select
            className={styles.statusFilter}
            aria-label={t("contracts.statusFilterLabel")}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value)}
          >
            {statusOptions.map((value) => (
              <option key={value} value={value}>
                {value === "all"
                  ? t("contracts.statusFilterAll")
                  : value}
              </option>
            ))}
          </select>
          {filterClientId ? (
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={() => router.push("/contracts")}
            >
              {t("contracts.clearClientFilter")}
            </button>
          ) : null}
        </div>

        {filterClientId ? (
          <p className={ws.subtitle} style={{ marginBottom: 12 }}>
            {t("contracts.filteredByClient")}
          </p>
        ) : null}

        {!loading ? (
          <p className={styles.shownCount}>
            {t("contracts.shownCount", { count: visibleContracts.length })}
          </p>
        ) : null}

        <div className={styles.listGrid}>
          {visibleContracts.length === 0 && !loading ? (
            <p className={ws.subtitle}>{t("contracts.empty")}</p>
          ) : null}
          {visibleContracts.map((contract) => {
            const id = contract._id || contract.id;
            const title =
              contract.jobTitle ||
              contract.contractCategory ||
              t("contracts.untitled");
            return (
              <article
                key={id}
                data-testid="contract-card"
                className={styles.contractCard}
              >
                <div className={styles.contractCardHeader}>
                  <div>
                    <h3 className={styles.contractTitle}>{title}</h3>
                    <p className={styles.contractMeta}>
                      {contract.clientName || t("contracts.noClient")} ·{" "}
                      {contract.status || "Draft"} · $
                      {contract.amount || "0"}
                    </p>
                    <p className={styles.contractMeta}>
                      {contract.contractCategory
                        ? `${contract.contractCategory}${contract.contractOption ? ` — ${contract.contractOption}` : ""}`
                        : null}
                      {contract.contractLanguage
                        ? ` · ${String(contract.contractLanguage).toUpperCase()}`
                        : null}
                      {id ? ` · ${formatShortId(id)}` : null}
                    </p>
                  </div>
                  <div className={styles.actions}>
                    <DocumentPdfActions
                      pdfUrl={`/api/contracts/${id}/pdf`}
                      printLabel={t("contracts.buttons.print")}
                      downloadLabel={t("contracts.buttons.downloadPdf")}
                    />
                    <button
                      type="button"
                      className={ws.btnSecondary}
                      onClick={() => {
                        const docTitle = `${t("contracts.printTitle")} — ${contract.clientName || ""}`;
                        openPrintableHtmlDocument({
                          title: docTitle,
                          bodyHtml: `<h1>${escapeHtml(docTitle)}</h1><pre>${escapeHtml(contract.body || "")}</pre>`,
                        });
                      }}
                    >
                      {t("contracts.buttons.printBrowser")}
                    </button>
                    <Link
                      href="/estimates"
                      className={ws.btnSecondary}
                      style={{ textDecoration: "none", textAlign: "center" }}
                    >
                      {t("contracts.buttons.openEstimates")}
                    </Link>
                  </div>
                </div>
                {contract.body ? (
                  <details className={styles.bodyDetails}>
                    <summary className={styles.bodySummary}>
                      {t("contracts.previewToggle")}
                    </summary>
                    <div className={styles.bodyPreview}>{contract.body}</div>
                  </details>
                ) : null}
              </article>
            );
          })}
        </div>
      </section>
    </main>
  );
}
