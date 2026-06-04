"use client";

import { memo } from "react";
import { useRouter } from "next/navigation";
import { formatClientCardLines } from "@/lib/client-display";
import ClientCardActions from "./ClientCardActions";
import list from "./clients-list.module.css";

function formatCreatedAt(value) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString();
}

function ContactLine({ value }) {
  if (!value) return null;
  return <p className={list.metaLine}>{value}</p>;
}

function ClientsList({
  t,
  clients,
  loading,
  highlightedId = "",
  isSearchActive = false,
  onSelect,
  onEdit,
  onDelete,
  canDelete,
}) {
  const router = useRouter();

  const goEstimate = (client) => {
    if (!client?.id) return;
    const params = new URLSearchParams({ clientId: client.id });
    router.push(`/estimates/new?${params.toString()}`);
  };

  return (
    <section className="cf-card" style={{ padding: 22 }}>
      {loading ? <p className="cf-muted">{t("clients.loading")}</p> : null}

      {!loading && clients.length === 0 ? (
        <div className="fb-empty" style={{ marginTop: 16 }}>
          <p className="fb-empty-title">
            {isSearchActive ? t("clients.searchEmpty") : t("clients.empty")}
          </p>
          {!isSearchActive ? (
            <p className="fb-empty-desc">{t("clients.emptyHint")}</p>
          ) : null}
        </div>
      ) : null}

      <div className={list.grid}>
        {clients.map((client) => {
          const isHighlighted = highlightedId && client.id === highlightedId;
          const lines = formatClientCardLines(client);
          const created = formatCreatedAt(
            client.createdAt || client.created_at,
          );

          return (
            <article
              key={client.id}
              id={`client-card-${client.id}`}
              className={`cf-panel cf-client-card ${list.card}`}
              role={onSelect ? "button" : undefined}
              tabIndex={onSelect ? 0 : undefined}
              onClick={onSelect ? () => onSelect(client) : undefined}
              onKeyDown={
                onSelect
                  ? (event) => {
                      if (event.key === "Enter" || event.key === " ") {
                        event.preventDefault();
                        onSelect(client);
                      }
                    }
                  : undefined
              }
              data-highlighted={isHighlighted ? "true" : undefined}
            >
              <div className={list.cardRow}>
                <div className={list.cardBody}>
                  <h3 className={list.name}>{lines.name || "—"}</h3>
                  {lines.company ? (
                    <p className={list.company}>{lines.company}</p>
                  ) : null}

                  <div className={list.contactBlock}>
                    <ContactLine value={lines.phone} />
                    <ContactLine value={lines.email} />
                    {lines.street ? (
                      <p className={list.street}>{lines.street}</p>
                    ) : null}
                    {lines.locality ? (
                      <p className={list.locality}>{lines.locality}</p>
                    ) : null}
                    {lines.missingStreet ? (
                      <p className={list.missingHint}>
                        {t("clients.list.missingStreet")}
                      </p>
                    ) : null}
                  </div>

                  {lines.notes ? (
                    <p className={list.notes}>{lines.notes}</p>
                  ) : null}

                  {created ? (
                    <p className={list.created}>
                      {t("clients.labels.createdAt")}: {created}
                    </p>
                  ) : null}
                </div>

                <div className={list.actions}>
                  <ClientCardActions
                    client={client}
                    canDelete={canDelete}
                    onView={onSelect}
                    onEdit={onEdit}
                    onDelete={onDelete}
                    onEstimate={goEstimate}
                  />
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}

export default memo(ClientsList);
