"use client";

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

function formatCreatedAt(value) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString();
}

export default function ClientsList({
  t,
  clients,
  loading,
  onEdit,
  onDelete,
  canDelete,
}) {
  return (
    <section className="cf-card" style={{ padding: 20 }}>
      <h2 style={{ marginTop: 0, fontSize: 20 }}>{t("clients.listTitle")}</h2>

      {loading
        ? <p style={{ color: "#64748b" }}>{t("clients.loading")}</p>
        : null}

      {!loading && clients.length === 0
        ? <p style={{ color: "#64748b" }}>{t("clients.empty")}</p>
        : null}

      <div style={{ display: "grid", gap: 12 }}>
        {clients.map((client) => (
          <article key={client.id} className="cf-panel" style={{ padding: 14 }}>
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3 style={{ margin: 0, fontSize: 16 }}>
                  {client.name || "-"}
                </h3>
                <p
                  style={{ margin: "6px 0 0", color: "#475569", fontSize: 14 }}
                >
                  {client.company || "-"}
                </p>
                <p
                  style={{ margin: "6px 0 0", color: "#475569", fontSize: 14 }}
                >
                  {client.phone || "-"}
                </p>
                <p
                  style={{ margin: "6px 0 0", color: "#475569", fontSize: 14 }}
                >
                  {client.email || "-"}
                </p>
                <p
                  style={{ margin: "6px 0 0", color: "#475569", fontSize: 14 }}
                >
                  {client.address || "-"}
                </p>
                {client.notes
                  ? <p
                      style={{
                        margin: "6px 0 0",
                        color: "#64748b",
                        fontSize: 13,
                      }}
                    >
                      {client.notes}
                    </p>
                  : null}
                <p
                  style={{ margin: "6px 0 0", color: "#64748b", fontSize: 12 }}
                >
                  {t("clients.labels.createdAt")}:{" "}
                  {formatCreatedAt(client.created_at)}
                </p>
              </div>

              <div
                style={{ display: "flex", gap: 8, alignItems: "flex-start" }}
              >
                <button
                  type="button"
                  onClick={() => onEdit(client)}
                  style={actionIconButtonStyle}
                >
                  <IconPencil />
                  {t("clients.buttons.edit")}
                </button>
                {canDelete
                  ? <button
                      type="button"
                      onClick={() => onDelete(client.id)}
                      style={{
                        ...actionIconButtonStyle,
                        borderColor: "#fecaca",
                        color: "#b91c1c",
                      }}
                    >
                      <IconTrash />
                      {t("clients.buttons.delete")}
                    </button>
                  : null}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
