"use client";

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
                  className="cf-btn"
                  onClick={() => onEdit(client)}
                >
                  {t("clients.buttons.edit")}
                </button>
                {canDelete
                  ? <button
                      type="button"
                      className="cf-btn"
                      onClick={() => onDelete(client.id)}
                      style={{ borderColor: "#fecaca", color: "#b91c1c" }}
                    >
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
