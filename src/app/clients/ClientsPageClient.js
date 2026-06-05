"use client";
import { useCallback, useEffect, useMemo, useState } from "react";
import { validateContactFields } from "@/lib/field-validation";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import { splitStreetFromLocality } from "@/lib/client-display";
import {
  CLIENTS_UI_PAGE_SIZE,
  getClientsListMeta,
  normalizeClientsListPayload,
} from "@/lib/clients-list-response";
import "@/i18n";
import ClientForm, { EMPTY_CLIENT_FORM } from "@/components/clients/ClientForm";
import ClientFormModal from "@/components/clients/ClientFormModal";
import ClientCsvActionsMenu from "@/components/clients/ClientCsvActionsMenu";
import ClientCsvImportWizard from "@/components/clients/ClientCsvImportWizard";
import ClientDetailsPanel from "@/components/clients/ClientDetailsPanel";
import ClientsList from "@/components/clients/ClientsList";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import pageStyles from "@/components/clients/clients-page.module.css";
import ws from "@/styles/workspace-dark.module.css";

export default function ClientsPageClient() {
  const searchParams = useSearchParams();
  const { t } = useTranslation();
  const { capabilities } = useCurrentUserAccess();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(EMPTY_CLIENT_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [highlightedClientId, setHighlightedClientId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [detailsLoading, setDetailsLoading] = useState(false);
  const [detailsError, setDetailsError] = useState("");
  const [clientDetails, setClientDetails] = useState(null);
  const [detailsWarnings, setDetailsWarnings] = useState([]);
  const [clientSearch, setClientSearch] = useState("");
  const [listPage, setListPage] = useState(1);
  const [listTotal, setListTotal] = useState(0);
  const [loadingMore, setLoadingMore] = useState(false);

  const displayedClients = useMemo(() => {
    if (!clientSearch.trim()) return clients;
    return filterAndRankRecords(clients, clientSearch, (client) => [
      client.name,
      client.company,
      client.companyName,
      client.email,
      client.phone,
      client.address,
      client.city,
      client.state,
      client.zip,
      client.notes,
    ]);
  }, [clients, clientSearch]);

  const fetchClients = useCallback(async ({ page = 1, append = false } = {}) => {
    if (append) {
      setLoadingMore(true);
    } else {
      setLoading(true);
    }
    setError("");
    try {
      const res = await apiFetch(
        `/api/clients?limit=${CLIENTS_UI_PAGE_SIZE}&page=${page}`,
      );
      const payload = await getJsonOrThrow(res, t("clients.errors.fetch"));
      const batch = normalizeClientsListPayload(payload);
      const meta = getClientsListMeta(payload, batch.length);
      setListPage(meta.page);
      setListTotal(meta.total);
      setClients((prev) => (append ? [...prev, ...batch] : batch));
    } catch (err) {
      setError(err.message || t("clients.errors.load"));
      if (!append) setClients([]);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  }, [t]);

  const loadMoreClients = useCallback(() => {
    if (loading || loadingMore || clients.length >= listTotal) return;
    fetchClients({ page: listPage + 1, append: true });
  }, [clients.length, fetchClients, listPage, listTotal, loading, loadingMore]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const closeForm = () => {
    setForm(EMPTY_CLIENT_FORM);
    setSelectedId("");
    setFormOpen(false);
    setError("");
  };

  const openNewClient = () => {
    setForm(EMPTY_CLIENT_FORM);
    setSelectedId("");
    setError("");
    setFormOpen(true);
  };

  useEffect(() => {
    if (searchParams.get("action") === "new") {
      openNewClient();
    }
  }, [searchParams]);

  const saveClient = async () => {
    const name = String(form.name || "").trim();
    if (!name) {
      setError(t("clients.errors.nameRequired"));
      return;
    }

    const contactErrors = validateContactFields({
      email: form.email,
      phone: form.phone,
    });
    if (contactErrors.email || contactErrors.phone) {
      setError(contactErrors.email || contactErrors.phone);
      return;
    }

    try {
      setSaving(true);
      setError("");

      const payload = {
        name,
        company: form.company,
        phone: form.phone,
        email: form.email,
        address: form.address,
        city: form.city,
        state: form.state,
        zip: form.zip,
        latitude: form.latitude,
        longitude: form.longitude,
        notes: form.notes,
      };

      Object.assign(payload, {
        billing_address: form.billingSameAsService !== false ? "" : (form.billingAddress || ""),
        billing_city: form.billingSameAsService !== false ? "" : (form.billingCity || ""),
        billing_state: form.billingSameAsService !== false ? "" : (form.billingState || ""),
        billing_zip: form.billingSameAsService !== false ? "" : (form.billingZip || ""),
        billing_same_as_service: form.billingSameAsService !== false,
      });

      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId
        ? `/api/clients/${selectedId}`
        : "/api/clients";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      const result = await getJsonOrThrow(res, t("clients.errors.save"));

      if (selectedId) {
        setClients((prev) =>
          prev.map((client) =>
            client.id === selectedId ? result.data : client,
          ),
        );
      } else {
        setClients((prev) => [result.data, ...prev]);
      }

      closeForm();
    } catch (err) {
      setError(err.message || t("clients.errors.saveFallback"));
    } finally {
      setSaving(false);
    }
  };

  const editClient = (client) => {
    const split = splitStreetFromLocality(
      client.address,
      client.city,
      client.state,
      client.zip || client.zipCode,
    );

    setForm({
      id: client.id,
      name: client.name || "",
      company: client.company || client.companyName || "",
      email: client.email || "",
      phone: client.phone || "",
      address: split.street,
      city: split.city || "",
      state: split.state || "",
      zip: split.zip || "",
      latitude:
        typeof client.latitude === "number" ? client.latitude : null,
      longitude:
        typeof client.longitude === "number" ? client.longitude : null,
      addressPlaceId: client.address ? "persisted" : "",
      notes: client.notes || "",
      billingAddress: client.billing_address || "",
      billingCity: client.billing_city || "",
      billingState: client.billing_state || "",
      billingZip: client.billing_zip || "",
      billingSameAsService: client.billing_same_as_service !== false,
    });
    setHighlightedClientId(client.id);
    setSelectedId(client.id);
    setError("");
    setFormOpen(true);
  };

  const loadClientDetails = useCallback(
    async (clientId) => {
      if (!clientId) return;
      setDetailsLoading(true);
      setDetailsError("");
      try {
        const res = await apiFetch(`/api/clients/${clientId}/details`);
        const payload = await getJsonOrThrow(res, t("clients.details.errors.load"));
        setClientDetails(payload.data || null);
        setDetailsWarnings(Array.isArray(payload.warnings) ? payload.warnings : []);
      } catch (err) {
        setClientDetails(null);
        setDetailsWarnings([]);
        setDetailsError(err.message || t("clients.details.errors.loadFallback"));
      } finally {
        setDetailsLoading(false);
      }
    },
    [t],
  );

  const openClientDetails = (client) => {
    if (!client?.id) return;
    setHighlightedClientId(client.id);
    setDetailsOpen(true);
    setError("");
    loadClientDetails(client.id);
  };

  const removeDuplicateClients = async () => {
    setError("");
    try {
      const previewRes = await apiFetch("/api/clients/dedupe", {
        cache: "no-store",
      });
      const previewJson = await getJsonOrThrow(
        previewRes,
        t("clients.dedupe.errors.preview"),
      );
      const preview = previewJson.data || {};
      const toRemove = preview.duplicatesToRemove || 0;

      if (!toRemove) {
        window.alert(t("clients.dedupe.noneFound"));
        return;
      }

      const confirmed = window.confirm(
        t("clients.dedupe.confirm", {
          count: toRemove,
          groups: preview.duplicateGroups || 0,
        }),
      );
      if (!confirmed) return;

      const res = await apiFetch("/api/clients/dedupe", { method: "POST" });
      const json = await getJsonOrThrow(res, t("clients.dedupe.errors.failed"));
      const result = json.data || {};

      await fetchClients();
      closeForm();
      setDetailsOpen(false);
      setHighlightedClientId("");

      if (result.errors?.length) {
        setError(
          t("clients.dedupe.partial", {
            removed: result.duplicatesRemoved || 0,
            failed: result.errors.length,
          }),
        );
      } else {
        window.alert(
          t("clients.dedupe.done", {
            removed: result.duplicatesRemoved || 0,
            groups: result.groupsProcessed || 0,
          }),
        );
      }
    } catch (err) {
      setError(err.message || t("clients.dedupe.errors.failed"));
    }
  };

  const deleteClient = async (id) => {
    const confirmed = window.confirm(t("clients.messages.confirmDelete"));
    if (!confirmed) return;

    try {
      setError("");
      const res = await apiFetch(`/api/clients/${id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, t("clients.errors.delete"));
      setClients((prev) => prev.filter((client) => client.id !== id));
      if (selectedId === id) {
        closeForm();
        setDetailsOpen(false);
        setClientDetails(null);
      }
    } catch (err) {
      setError(err.message || t("clients.errors.deleteFallback"));
    }
  };

  const formTitle = selectedId
    ? t("clients.formTitleEdit")
    : t("clients.formTitleNew");

  return (
    <PremiumPageShell
      title={t("clients.title")}
      subtitle={t("clients.description")}
      actions={
        <>
          <button
            type="button"
            className={ws.btnPrimary}
            onClick={openNewClient}
            data-testid="clients-new-button"
          >
            + {t("clients.buttons.newClient")}
          </button>
          <ClientCsvActionsMenu
            onImport={() => setImportOpen(true)}
            onRemoveDuplicates={removeDuplicateClients}
            canRemoveDuplicates={capabilities.canDeleteRecords}
          />
        </>
      }
    >
      <ClientCsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={fetchClients}
      />
      {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

      <section className={pageStyles.listSection}>
        <div className={pageStyles.toolbar}>
          <input
            type="search"
            className={pageStyles.searchInput}
            value={clientSearch}
            onChange={(event) => setClientSearch(event.target.value)}
            placeholder={t("clients.searchPlaceholder")}
            aria-label={t("clients.searchAria")}
            data-testid="clients-search"
          />
          <span className={pageStyles.resultMeta}>
            {t("clients.resultsCount", { count: displayedClients.length })}
            {listTotal > clients.length
              ? ` · ${clients.length}/${listTotal}`
              : null}
          </span>
          {listTotal > clients.length ? (
            <button
              type="button"
              className={ws.btnSecondary}
              onClick={loadMoreClients}
              disabled={loadingMore}
              data-testid="clients-load-more"
            >
              {loadingMore
                ? t("clients.loading")
                : t("clients.loadMore", { defaultValue: "Load more" })}
            </button>
          ) : null}
        </div>

        <ClientsList
          t={t}
          clients={displayedClients}
          loading={loading}
          highlightedId={highlightedClientId || selectedId}
          isSearchActive={Boolean(clientSearch.trim())}
          onSelect={openClientDetails}
          onEdit={editClient}
          onDelete={deleteClient}
          canDelete={capabilities.canDeleteRecords}
        />
      </section>

      <ClientFormModal
        open={formOpen}
        title={formTitle}
        onClose={closeForm}
      >
        <ClientForm
          t={t}
          form={form}
          isEditing={Boolean(selectedId)}
          saving={saving}
          embedded
          onChange={setForm}
          onSubmit={saveClient}
          onCancel={closeForm}
        />
      </ClientFormModal>

      <ClientDetailsPanel
        t={t}
        open={detailsOpen}
        loading={detailsLoading}
        error={detailsError}
        details={clientDetails}
        warnings={detailsWarnings}
        onClose={() => {
          setDetailsOpen(false);
          setDetailsError("");
          setHighlightedClientId("");
        }}
        onEdit={(client) => {
          editClient(client);
          setDetailsOpen(false);
        }}
        onDelete={deleteClient}
        canDelete={capabilities.canDeleteRecords}
      />
    </PremiumPageShell>
  );
}
