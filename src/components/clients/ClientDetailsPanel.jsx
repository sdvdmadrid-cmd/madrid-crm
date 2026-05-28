"use client";

import ws from "@/styles/workspace-dark.module.css";

function fmtDate(value) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "—";
  return d.toLocaleDateString();
}

function fmtMoney(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
  }).format(n);
}

function DetailRow({ label, value }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ color: "#94a3b8", fontSize: 12 }}>{label}</div>
      <div style={{ color: "#f8fafc", fontSize: 14, wordBreak: "break-word" }}>
        {value || "—"}
      </div>
    </div>
  );
}

export default function ClientDetailsPanel({
  t,
  loading,
  details,
  onNewEstimate,
  onViewEstimates,
  onCreateInvoice,
  onViewInvoices,
  onEdit,
  onDelete,
}) {
  if (!details) return null;

  const client = details.client || {};
  const billingAddress = [
    client.billing_address,
    [client.billing_city, client.billing_state, client.billing_zip]
      .filter(Boolean)
      .join(" "),
  ]
    .filter(Boolean)
    .join(", ");

  return (
    <section className="cf-card" style={{ padding: 20, marginTop: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h2 style={{ margin: 0, fontSize: "1.1rem", fontWeight: 800 }}>
            {t("clients.actions.viewFullDetails")}
          </h2>
          <p className="cf-muted" style={{ margin: "6px 0 0" }}>
            {client.name || "—"}
          </p>
        </div>
        {loading ? <span className="cf-muted">{t("clients.loading")}</span> : null}
      </div>

      <div className={ws.grid2} style={{ marginTop: 14 }}>
        <DetailRow label={t("clients.placeholders.name")} value={client.name} />
        <DetailRow label={t("clients.labels.company")} value={client.company} />
        <DetailRow label={t("clients.placeholders.phone")} value={client.phone} />
        <DetailRow label={t("clients.placeholders.email")} value={client.email} />
        <DetailRow label={t("clients.labels.serviceAddress")} value={client.address} />
        <DetailRow label={t("clients.labels.billingAddress")} value={billingAddress} />
        <DetailRow label={t("clients.labels.notes")} value={client.notes} />
        <DetailRow label={t("clients.labels.createdAt")} value={fmtDate(client.createdAt)} />
      </div>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
        <button type="button" className={ws.btnPrimary} onClick={onNewEstimate}>
          {t("clients.actions.newEstimate")}
        </button>
        <button type="button" className={ws.btnSecondary} onClick={onViewEstimates}>
          {t("clients.actions.viewEstimates")}
        </button>
        <button type="button" className={ws.btnPrimary} onClick={onCreateInvoice}>
          {t("clients.actions.createInvoice")}
        </button>
        <button type="button" className={ws.btnSecondary} onClick={onViewInvoices}>
          {t("clients.actions.viewInvoices")}
        </button>
        <button type="button" className={ws.btnSecondary} onClick={onEdit}>
          {t("clients.buttons.edit")}
        </button>
        <button type="button" className={ws.btnDanger} onClick={onDelete}>
          {t("clients.buttons.delete")}
        </button>
      </div>

      <div className={ws.grid2} style={{ marginTop: 18 }}>
        <div className="cf-panel" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t("clients.actions.viewEstimates")}</h3>
          <p className="cf-muted" style={{ marginTop: 0 }}>
            {t("clients.labels.total")}: {details.estimateSummary?.total || 0}
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {(details.estimates || []).slice(0, 6).map((row) => (
              <div key={row.id} className="cf-muted" style={{ fontSize: 13 }}>
                {(row.estimate_number || row.quote_number || row.id || "").trim()} ·{" "}
                {row.status || "—"} · {fmtDate(row.updated_at || row.created_at)}
              </div>
            ))}
          </div>
        </div>

        <div className="cf-panel" style={{ padding: 14 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>{t("clients.actions.viewInvoices")}</h3>
          <p className="cf-muted" style={{ marginTop: 0 }}>
            {t("clients.labels.total")}: {details.invoiceSummary?.total || 0}
          </p>
          <div style={{ display: "grid", gap: 8 }}>
            {(details.invoices || []).slice(0, 6).map((row) => (
              <div key={row.id} className="cf-muted" style={{ fontSize: 13 }}>
                {(row.invoice_number || row.id || "").trim()} · {row.status || "—"} ·{" "}
                {fmtMoney(row.amount)}
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
