"use client";
import { useCallback, useEffect, useState } from "react";
import { useTranslation } from "react-i18next";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import "@/i18n";
import ClientForm, { EMPTY_CLIENT_FORM } from "@/components/clients/ClientForm";
import ClientsList from "@/components/clients/ClientsList";

export default function ClientsPageClient() {
  const { t } = useTranslation();
  const { capabilities } = useCurrentUserAccess();
  const [clients, setClients] = useState([]);
  const [form, setForm] = useState(EMPTY_CLIENT_FORM);
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const fetchClients = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/supabase/clients");
      const data = await getJsonOrThrow(res, t("clients.errors.fetch"));
      setClients(data);
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

      const hasAddress = String(form.address || "").trim().length > 0;
      if (hasAddress && !String(form.addressPlaceId || "").trim()) {
        setError(t("clients.errors.addressSelectionRequired"));
        setSaving(false);
        return;
      }

      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId
        ? `/api/supabase/clients/${selectedId}`
        : "/api/supabase/clients";

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
    });
    setSelectedId(client.id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const deleteClient = async (id) => {
    const confirmed = window.confirm(t("clients.messages.confirmDelete"));
    if (!confirmed) return;

    try {
      setError("");
      const res = await apiFetch(`/api/supabase/clients/${id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, t("clients.errors.delete"));
      setClients((prev) => prev.filter((client) => client.id !== id));
      if (selectedId === id) resetForm();
    } catch (err) {

      setError(err.message || t("clients.errors.deleteFallback"));
    }
  };

  return (
    <main
      style={{
        padding: "24px 24px 40px",
        maxWidth: 1120,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          gap: "20px",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ fontSize: "32px", margin: 0 }}>{t("clients.title")}</h1>
          <p style={{ margin: "10px 0 0 0", color: "#555" }}>
            {t("clients.description")}
          </p>
        </div>
      </header>

      {error && (
        <div style={{ marginTop: "20px", color: "#b00020" }}>{error}</div>
      )}
      <div
        style={{
          marginTop: 24,
          display: "grid",
          gap: 16,
          gridTemplateColumns: "minmax(280px, 380px) 1fr",
          alignItems: "start",
        }}
      >
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
          onEdit={editClient}
          onDelete={deleteClient}
          canDelete={capabilities.canDeleteRecords}
        />
      </div>
    </main>
  );
}
