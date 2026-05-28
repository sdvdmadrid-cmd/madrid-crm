"use client";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import "@/i18n";
import ClientForm, { EMPTY_CLIENT_FORM } from "@/components/clients/ClientForm";
import ClientCsvActionsMenu from "@/components/clients/ClientCsvActionsMenu";
import ClientDetailsPanel from "@/components/clients/ClientDetailsPanel";
import ClientCsvImportWizard from "@/components/clients/ClientCsvImportWizard";
import ClientSearchAutocomplete from "@/components/clients/ClientSearchAutocomplete";
import ClientsList from "@/components/clients/ClientsList";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import ws from "@/styles/workspace-dark.module.css";

export default function ClientsPageClient() {
  const { t } = useTranslation();
  const router = useRouter();
  const { capabilities } = useCurrentUserAccess();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(EMPTY_CLIENT_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [importOpen, setImportOpen] = useState(false);
  const [details, setDetails] = useState(null);
  const [detailsLoading, setDetailsLoading] = useState(false);

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/clients");
      const data = await getJsonOrThrow(res, t("clients.errors.fetch"));
      const rows = Array.isArray(data) ? data : [];
      setClients(rows);
      setDetails((prev) => {
        if (!prev?.client?.id) return prev;
        const updated = rows.find((c) => c.id === prev.client.id);
        if (!updated) return prev;
        return { ...prev, client: updated };
      });
    } catch (err) {

      setError(err.message || t("clients.errors.load"));
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    fetchClients();
  }, [fetchClients]);

  const resetForm = () => {
    setForm(EMPTY_CLIENT_FORM);
    setSelectedId("");
  };

  const loadClientDetails = useCallback(
    async (clientId) => {
      if (!clientId) return;
      setDetailsLoading(true);
      try {
        const res = await apiFetch(`/api/clients/${clientId}/details`, {
          cache: "no-store",
        });
        const json = await getJsonOrThrow(res, t("clients.errors.details"));
        setDetails(json.data || null);
      } catch (err) {
        setError(err.message || t("clients.errors.details"));
      } finally {
        setDetailsLoading(false);
      }
    },
    [t],
  );

  const saveClient = async () => {
    const name = String(form.name || "").trim();
    if (!name) {
      setError(t("clients.errors.nameRequired"));
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

      resetForm();
    } catch (err) {

      setError(err.message || t("clients.errors.saveFallback"));
    } finally {
      setSaving(false);
    }
  };

  const editClient = (client) => {
    setForm({
      id: client.id,
      name: client.name || "",
      company: client.company || client.companyName || "",
      email: client.email || "",
      phone: client.phone || "",
      address: client.address || "",
      city: client.city || "",
      state: client.state || "",
      zip: client.zip || "",
      latitude:
        typeof client.latitude === "number" ? client.latitude : null,
      longitude:
        typeof client.longitude === "number" ? client.longitude : null,
      // Existing records may predate place_id tracking.
      // Keep them editable unless the address field is changed.
      addressPlaceId: client.address ? "persisted" : "",
      notes: client.notes || "",
      billingAddress: client.billing_address || "",
      billingCity: client.billing_city || "",
      billingState: client.billing_state || "",
      billingZip: client.billing_zip || "",
      billingSameAsService: client.billing_same_as_service !== false,
    });
    setSelectedId(client.id);
    setDetails((prev) => (prev ? { ...prev, client } : prev));
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const selectClient = (client) => {
    editClient(client);
    loadClientDetails(client.id);
    requestAnimationFrame(() => {
      document
        .getElementById(`client-card-${client.id}`)
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });
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
        resetForm();
        setDetails(null);
      }
    } catch (err) {

      setError(err.message || t("clients.errors.deleteFallback"));
    }
  };

  return (
    <PremiumPageShell
      title={t("clients.title")}
      subtitle={t("clients.description")}
      actions={
        <ClientCsvActionsMenu onImport={() => setImportOpen(true)} />
      }
    >
      <ClientCsvImportWizard
        open={importOpen}
        onClose={() => setImportOpen(false)}
        onComplete={fetchClients}
      />
      {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

      <section style={{ marginTop: 20, maxWidth: 720 }}>
        <ClientSearchAutocomplete onSelect={selectClient} />
      </section>

      {selectedId ? (
        <ClientDetailsPanel
          t={t}
          loading={detailsLoading}
          details={details}
          onNewEstimate={() => router.push(`/estimates/new?clientId=${encodeURIComponent(selectedId)}`)}
          onViewEstimates={() => router.push(`/estimates?clientId=${encodeURIComponent(selectedId)}`)}
          onCreateInvoice={() => router.push(`/invoices?clientId=${encodeURIComponent(selectedId)}&create=1`)}
          onViewInvoices={() => router.push(`/invoices?clientId=${encodeURIComponent(selectedId)}`)}
          onEdit={() => {
            const client = clients.find((c) => c.id === selectedId);
            if (client) editClient(client);
          }}
          onDelete={() => deleteClient(selectedId)}
        />
      ) : null}

      <div className={`${ws.gridSidebar} cf-clients-layout`} style={{ marginTop: 24 }}>
        <ClientForm
          t={t}
          form={form}
          isEditing={Boolean(selectedId)}
          saving={saving}
          onChange={setForm}
          onSubmit={saveClient}
          onCancel={resetForm}
        />

        <ClientsList
          t={t}
          clients={clients}
          loading={loading}
          highlightedId={selectedId}
          onSelect={selectClient}
          onEdit={editClient}
          onDelete={deleteClient}
          canDelete={capabilities.canDeleteRecords}
        />
      </div>
    </PremiumPageShell>
  );
}
