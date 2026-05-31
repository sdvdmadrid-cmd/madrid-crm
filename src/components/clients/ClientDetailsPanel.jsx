"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import panel from "./client-details-panel.module.css";
import DocumentPdfActions from "@/components/workspace/DocumentPdfActions";
import {
  escapeHtml,
  openPrintableHtmlDocument,
} from "@/lib/print-html-document";

function formatDate(value) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString();
}

function clientActivityLinks(clientId) {
  const id = encodeURIComponent(clientId);
  return {
    newEstimate: `/estimates/new?clientId=${id}`,
    estimates: `/estimates?clientId=${id}`,
    newInvoice: `/invoices?clientId=${id}`,
    invoices: `/invoices?clientId=${id}`,
    newJob: `/jobs?action=new&clientId=${id}`,
    jobs: `/jobs?clientId=${id}`,
  };
}

function InfoField({ label, value, href }) {
  const text = value || "—";
  return (
    <div>
      <span className={panel.infoLabel}>{label}</span>
      <div className={panel.infoValue}>
        {href && text !== "—" ? (
          <a href={href}>{text}</a>
        ) : (
          text
        )}
      </div>
    </div>
  );
}

function ActivitySection({
  t,
  title,
  count,
  emptyLabel,
  createHref,
  createLabel,
  showCreate = true,
  viewAllHref,
  viewAllLabel,
  items,
  renderItem,
}) {
  return (
    <section className={panel.section}>
      <div className={panel.sectionHead}>
        <h3 className={panel.sectionTitle}>
          {title}
          <span className={panel.countBadge}>{count}</span>
        </h3>
        <div className={panel.sectionActions}>
          {showCreate && createHref ? (
            <Link href={createHref} className={`${panel.btn} ${panel.btnPrimary}`}>
              {createLabel}
            </Link>
          ) : null}
          {viewAllHref && count > 0 ? (
            <Link href={viewAllHref} className={panel.btn}>
              {viewAllLabel}
            </Link>
          ) : null}
        </div>
      </div>

      {items?.length ? (
        <ul className={panel.itemList}>
          {items.slice(0, 5).map((item) => (
            <li key={item.id} className={panel.itemCard}>
              {renderItem(item)}
            </li>
          ))}
        </ul>
      ) : (
        <p className={panel.empty}>{emptyLabel}</p>
      )}

      {items?.length > 5 && viewAllHref ? (
        <Link href={viewAllHref} className={panel.itemLink} style={{ marginTop: 12 }}>
          {t("clients.details.showMore", { count: items.length })}
        </Link>
      ) : null}
    </section>
  );
}

export default function ClientDetailsPanel({
  t,
  open,
  loading,
  error,
  details,
  warnings = [],
  onClose,
  onEdit,
  onDelete,
  canDelete,
}) {
  useEffect(() => {
    if (!open || typeof document === "undefined") return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  const client = details?.client || null;
  const clientId = client?.id || "";
  const links = clientId ? clientActivityLinks(clientId) : null;

  const serviceAddress = client
    ? [client.address, client.city, client.state, client.zip]
        .filter(Boolean)
        .join(", ")
    : "";

  const printClientRecord = () => {
    if (!client) return;
    const estimateCount = details?.estimates?.length ?? 0;
    const invoiceCount = details?.invoices?.length ?? 0;
    const jobCount = details?.jobs?.length ?? 0;
    const bodyHtml = `
      <h1>${escapeHtml(client.name || t("clients.details.loadingName"))}</h1>
      <p class="meta">${escapeHtml(t("clients.details.title"))}</p>
      <table><tbody>
        <tr><th>${escapeHtml(t("clients.form.email", { defaultValue: "Email" }))}</th><td>${escapeHtml(client.email || "—")}</td></tr>
        <tr><th>${escapeHtml(t("clients.form.phone", { defaultValue: "Phone" }))}</th><td>${escapeHtml(client.phone || "—")}</td></tr>
        <tr><th>${escapeHtml(t("clients.form.address", { defaultValue: "Address" }))}</th><td>${escapeHtml(serviceAddress || "—")}</td></tr>
        <tr><th>${escapeHtml(t("clients.details.estimates", { defaultValue: "Estimates" }))}</th><td>${estimateCount}</td></tr>
        <tr><th>${escapeHtml(t("clients.details.invoices", { defaultValue: "Invoices" }))}</th><td>${invoiceCount}</td></tr>
        <tr><th>${escapeHtml(t("clients.details.jobs", { defaultValue: "Jobs" }))}</th><td>${jobCount}</td></tr>
      </tbody></table>`;
    openPrintableHtmlDocument({
      title: client.name || "Client",
      bodyHtml,
    });
  };

  const dialog = (
    <div
      className={panel.overlay}
      role="dialog"
      aria-modal="true"
      aria-labelledby="client-details-heading"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <section
        id="client-details-panel"
        className={panel.panel}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={panel.header}>
          <div className={panel.headerRow}>
            <div>
              <h2 id="client-details-heading" className={panel.title}>
                {client?.name || t("clients.details.loadingName")}
              </h2>
              {client?.company ? (
                <p className={panel.subtitle}>{client.company}</p>
              ) : (
                <p className={panel.subtitle}>{t("clients.details.title")}</p>
              )}
            </div>
            <div className={panel.closeWrap}>
              <button type="button" className={panel.btn} onClick={onClose}>
                {t("clients.details.close")}
              </button>
            </div>
          </div>

          {client && links ? (
            <>
              <p className={panel.quickLabel}>{t("clients.details.quickActions")}</p>
              <div className={panel.quickGrid}>
                <Link href={links.newEstimate} className={`${panel.btn} ${panel.btnPrimary}`}>
                  {t("clients.details.newEstimate")}
                </Link>
                <Link href={links.newJob} className={panel.btn} title={t("dashboardControl.actions.manualJobHint")}>
                  {t("clients.details.manualJob", { defaultValue: "Manual job" })}
                </Link>
                <Link href={links.newInvoice} className={panel.btn}>
                  {t("clients.details.newInvoice")}
                </Link>
                {clientId ? (
                  <DocumentPdfActions
                    pdfUrl={`/api/clients/${clientId}/pdf`}
                    printLabel={t("clients.details.printRecord", {
                      defaultValue: "Print record",
                    })}
                    downloadLabel={t("clients.details.downloadPdf", {
                      defaultValue: "Download PDF",
                    })}
                  />
                ) : null}
                <button type="button" className={panel.btn} onClick={printClientRecord}>
                  {t("clients.details.printBrowser", {
                    defaultValue: "Print (browser)",
                  })}
                </button>
                <button
                  type="button"
                  className={panel.btn}
                  onClick={() => onEdit(client)}
                >
                  {t("clients.buttons.edit")}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    className={`${panel.btn} ${panel.btnDanger}`}
                    onClick={() => onDelete(client.id)}
                  >
                    {t("clients.buttons.delete")}
                  </button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>

        <div className={panel.body}>
          {loading ? (
            <p className={panel.loading}>{t("clients.details.loading")}</p>
          ) : null}

          {error ? <div className={panel.noticeError}>{error}</div> : null}

          {warnings?.length ? (
            <div className={panel.noticeWarn}>
              {warnings.map((warning) => (
                <p key={warning} style={{ margin: "4px 0" }}>
                  {warning}
                </p>
              ))}
            </div>
          ) : null}

          {!loading && !error && client ? (
            <>
              <div className={panel.infoGrid}>
                <InfoField
                  label={t("clients.placeholders.email")}
                  value={client.email}
                  href={client.email ? `mailto:${client.email}` : undefined}
                />
                <InfoField
                  label={t("clients.placeholders.phone")}
                  value={client.phone}
                  href={client.phone ? `tel:${client.phone}` : undefined}
                />
                <InfoField
                  label={t("clients.labels.serviceAddress")}
                  value={serviceAddress}
                />
                <InfoField label={t("clients.labels.notes")} value={client.notes} />
                <InfoField
                  label={t("clients.labels.createdAt")}
                  value={formatDate(client.createdAt || client.created_at)}
                />
              </div>

              <ActivitySection
                t={t}
                title={t("clients.details.estimates")}
                count={details.estimates?.length || 0}
                emptyLabel={t("clients.details.noEstimates")}
                createHref={links?.newEstimate}
                createLabel={t("clients.details.createEstimate")}
                viewAllHref={links?.estimates}
                viewAllLabel={t("clients.details.viewAllEstimates")}
                items={details.estimates}
                renderItem={(row) => (
                  <>
                    <p className={panel.itemTitle}>
                      {row.name || row.estimateNumber || "—"}
                    </p>
                    <p className={panel.itemMeta}>
                      {row.estimateNumber ? `#${row.estimateNumber} · ` : ""}
                      {formatDate(row.updatedAt)}
                    </p>
                    <Link
                      href={`/estimates/new?edit=${encodeURIComponent(row.id)}&clientId=${encodeURIComponent(clientId)}`}
                      className={panel.itemLink}
                    >
                      {t("clients.details.viewEstimate")}
                    </Link>
                  </>
                )}
              />

              <ActivitySection
                t={t}
                title={t("clients.details.invoices")}
                count={details.invoices?.length || 0}
                emptyLabel={t("clients.details.noInvoices")}
                showCreate={false}
                viewAllHref={links?.invoices}
                viewAllLabel={t("clients.details.viewAllInvoices")}
                items={details.invoices}
                renderItem={(row) => (
                  <>
                    <p className={panel.itemTitle}>
                      {row.invoiceTitle || row.invoiceNumber || "—"}
                    </p>
                    <p className={panel.itemMeta}>
                      {row.invoiceNumber ? `#${row.invoiceNumber} · ` : ""}
                      {row.status || "—"}
                      {row.amount ? ` · $${row.amount}` : ""}
                    </p>
                    <Link
                      href={`/invoices?clientId=${encodeURIComponent(clientId)}`}
                      className={panel.itemLink}
                    >
                      {t("clients.details.openInvoices")}
                    </Link>
                  </>
                )}
              />

              <ActivitySection
                t={t}
                title={t("clients.details.jobs")}
                count={details.jobs?.length || 0}
                emptyLabel={t("clients.details.noJobs")}
                showCreate={false}
                viewAllHref={links?.jobs}
                viewAllLabel={t("clients.details.viewAllJobs")}
                items={details.jobs}
                renderItem={(row) => (
                  <>
                    <p className={panel.itemTitle}>{row.title || row.service || "—"}</p>
                    <p className={panel.itemMeta}>
                      {row.status || "—"} · {formatDate(row.updatedAt)}
                    </p>
                    <Link
                      href={`/jobs?id=${encodeURIComponent(row.id)}`}
                      className={panel.itemLink}
                    >
                      {t("clients.details.viewJob")}
                    </Link>
                  </>
                )}
              />

              <ActivitySection
                t={t}
                title={t("clients.details.visits")}
                count={details.visits?.length || 0}
                emptyLabel={t("clients.details.noVisits")}
                createHref={null}
                createLabel=""
                viewAllHref={null}
                viewAllLabel=""
                items={details.visits}
                renderItem={(row) => (
                  <>
                    <p className={panel.itemTitle}>{row.title || "—"}</p>
                    <p className={panel.itemMeta}>
                      {row.status || "—"} · {formatDate(row.startAt)}
                    </p>
                  </>
                )}
              />

              <ActivitySection
                t={t}
                title={t("clients.details.properties")}
                count={details.properties?.length || 0}
                emptyLabel={t("clients.details.noProperties")}
                createHref={null}
                createLabel=""
                viewAllHref={null}
                viewAllLabel=""
                items={details.properties}
                renderItem={(row) => (
                  <>
                    <p className={panel.itemTitle}>
                      {row.label || t("clients.details.property")}
                      {row.isPrimary ? ` (${t("clients.details.primaryProperty")})` : ""}
                    </p>
                    <p className={panel.itemMeta}>
                      {[row.address, row.city, row.state, row.zip]
                        .filter(Boolean)
                        .join(", ") || "—"}
                    </p>
                  </>
                )}
              />

              <ActivitySection
                t={t}
                title={t("clients.details.noteHistory")}
                count={details.notes?.length || 0}
                emptyLabel={t("clients.details.noNoteHistory")}
                createHref={null}
                createLabel=""
                viewAllHref={null}
                viewAllLabel=""
                items={details.notes}
                renderItem={(row) => (
                  <>
                    <p className={panel.itemTitle} style={{ whiteSpace: "pre-wrap" }}>
                      {row.body || "—"}
                    </p>
                    <p className={panel.itemMeta}>
                      {row.source || "—"} · {formatDate(row.createdAt)}
                    </p>
                  </>
                )}
              />
            </>
          ) : null}
        </div>
      </section>
    </div>
  );

  if (typeof document === "undefined") return dialog;
  return createPortal(dialog, document.body);
}
