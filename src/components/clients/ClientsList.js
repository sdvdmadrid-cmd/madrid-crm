"use client";

function IconPencil() {
  return (
    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 20h9" />
      <path d="M16.5 3.5a2.12 2.12 0 113 3 3L7 19l-4 1 1-4 12.5-12.5z" />
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
  highlightedId = "",
  onSelect,
  onEdit,
  onDelete,
  canDelete,
}) {
  return (
    <section className="cf-card" style={{ padding: 22 }}>
      <h2 style={{ marginTop: 0, fontSize: "1.15rem", fontWeight: 800 }}>{t("clients.listTitle")}</h2>

      {loading ? <p className="cf-muted">{t("clients.loading")}</p> : null}

      {!loading && clients.length === 0 ? (
        <div className="fb-empty" style={{ marginTop: 16 }}>
          <p className="fb-empty-title">{t("clients.empty")}</p>
          <p className="fb-empty-desc">{t("clients.description")}</p>
        </div>
      ) : null}

      <div style={{ display: "grid", gap: 12, marginTop: loading ? 12 : 0 }}>
        {clients.map((client) => {
          const isHighlighted = highlightedId && client.id === highlightedId;
          return (
          <article
            key={client.id}
            id={`client-card-${client.id}`}
            className="cf-panel cf-client-card"
            role="button"
            tabIndex={0}
            aria-label={t("clients.actions.viewFullDetails")}
            onClick={() => onSelect?.(client)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(client);
              }
            }}
            style={{
              padding: 16,
              cursor: "pointer",
              ...(isHighlighted
                ? {
                    borderColor: "rgba(56, 189, 248, 0.45)",
                    boxShadow: "0 0 0 1px rgba(14, 165, 233, 0.25)",
                  }
                : {}),
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 12,
                flexWrap: "wrap",
              }}
            >
              <div>
                <h3>{client.name || "-"}</h3>
                <p className="cf-muted" style={{ margin: "6px 0 0" }}>
                  {client.company || "-"}
                </p>
                <p className="cf-muted" style={{ margin: "4px 0 0" }}>
                  {client.phone || "-"}
                </p>
                <p className="cf-muted" style={{ margin: "4px 0 0" }}>
                  {client.email || "-"}
                </p>
                <p className="cf-muted" style={{ margin: "4px 0 0" }}>
                  {client.address || "-"}
                </p>
                {client.notes ? (
                  <p className="cf-muted" style={{ margin: "8px 0 0", fontSize: 13 }}>
                    {client.notes}
                  </p>
                ) : null}
                <p className="cf-muted" style={{ margin: "8px 0 0", fontSize: 12, opacity: 0.85 }}>
                  {t("clients.labels.createdAt")}: {formatCreatedAt(client.createdAt || client.created_at)}
                </p>
              </div>

              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    onEdit(client);
                  }}
                  className="cf-action-btn"
                >
                  <IconPencil />
                  {t("clients.buttons.edit")}
                </button>
                {canDelete ? (
                  <button
                    type="button"
                    onClick={(event) => {
                      event.stopPropagation();
                      onDelete(client.id);
                    }}
                    className="cf-action-btn cf-action-btn--danger"
                  >
                    <IconTrash />
                    {t("clients.buttons.delete")}
                  </button>
                ) : null}
              </div>
            </div>
          </article>
          );
        })}
      </div>
    </section>
  );
}
