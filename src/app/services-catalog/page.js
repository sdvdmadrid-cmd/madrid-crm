"use client";

import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";

const EMPTY_FORM = {
  name: "",
  category: "General",
  description: "",
  priceMin: "",
  priceMax: "",
};

export default function ServicesCatalogPage() {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedId, setSelectedId] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);
  const [error, setError] = useState("");

  const categories = useMemo(() => {
    const set = new Set();
    for (const item of services) {
      const category = String(item.category || "General").trim();
      if (category) set.add(category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services]);

  async function loadServices() {
    setLoading(true);
    setError("");
    try {
      const res = await apiFetch("/api/services-catalog");
      const payload = await getJsonOrThrow(res, "Unable to load services");
      setServices(Array.isArray(payload?.data) ? payload.data : []);
    } catch (err) {
      setError(err.message || "Unable to load services");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadServices();
  }, []);

  function resetForm() {
    setSelectedId("");
    setForm(EMPTY_FORM);
  }

  function editService(service) {
    setSelectedId(service.id || service._id || "");
    setForm({
      name: service.name || "",
      category: service.category || "General",
      description: service.description || "",
      priceMin: String(service.priceMin ?? ""),
      priceMax: String(service.priceMax ?? ""),
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  async function saveService() {
    setSaving(true);
    setError("");
    try {
      const method = selectedId ? "PATCH" : "POST";
      const url = selectedId
        ? `/api/services-catalog/${selectedId}`
        : "/api/services-catalog";

      const body = {
        name: form.name,
        category: form.category,
        description: form.description,
        priceMin: Number(form.priceMin || 0),
        priceMax: Number(form.priceMax || 0),
      };

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });

      await getJsonOrThrow(res, "Unable to save service");
      resetForm();
      await loadServices();
    } catch (err) {
      setError(err.message || "Unable to save service");
    } finally {
      setSaving(false);
    }
  }

  async function deleteService(id) {
    if (!id) return;
    if (!window.confirm("Delete this service?")) return;
    setError("");
    try {
      const res = await apiFetch(`/api/services-catalog/${id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, "Unable to delete service");
      if (selectedId === id) resetForm();
      await loadServices();
    } catch (err) {
      setError(err.message || "Unable to delete service");
    }
  }

  return (
    <main
      style={{
        padding: 24,
        maxWidth: 1100,
        margin: "0 auto",
        fontFamily: "Arial, sans-serif",
      }}
    >
      <header style={{ marginBottom: 20 }}>
        <h1 style={{ margin: 0, fontSize: 32, color: "#0f172a" }}>Service Catalog</h1>
        <p style={{ margin: "8px 0 0 0", color: "#64748b" }}>
          Manage reusable services and pricing for your business.
        </p>
      </header>

      {error ? (
        <div
          style={{
            marginBottom: 16,
            background: "#fee2e2",
            color: "#991b1b",
            border: "1px solid #fecaca",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 14,
          }}
        >
          {error}
        </div>
      ) : null}

      <section
        style={{
          border: "1px solid #e2e8f0",
          borderRadius: 14,
          background: "#fff",
          padding: 18,
          marginBottom: 20,
        }}
      >
        <h2 style={{ marginTop: 0, fontSize: 18 }}>
          {selectedId ? "Edit service" : "Add service"}
        </h2>
        <div style={{ display: "grid", gap: 10, gridTemplateColumns: "1fr 1fr" }}>
          <input
            placeholder="Service name"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
          />
          <input
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
          />
          <input
            placeholder="Min price"
            value={form.priceMin}
            onChange={(e) => setForm((s) => ({ ...s, priceMin: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
          />
          <input
            placeholder="Max price"
            value={form.priceMax}
            onChange={(e) => setForm((s) => ({ ...s, priceMax: e.target.value }))}
            style={{ padding: 10, borderRadius: 8, border: "1px solid #cbd5e1" }}
          />
        </div>
        <textarea
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
          rows={4}
          style={{
            marginTop: 10,
            width: "100%",
            padding: 10,
            borderRadius: 8,
            border: "1px solid #cbd5e1",
          }}
        />
        <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
          <button
            type="button"
            onClick={saveService}
            disabled={saving}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "none",
              background: "#2563eb",
              color: "#fff",
              cursor: "pointer",
            }}
          >
            {saving ? "Saving..." : selectedId ? "Update service" : "Add service"}
          </button>
          <button
            type="button"
            onClick={resetForm}
            style={{
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #cbd5e1",
              background: "#fff",
              cursor: "pointer",
            }}
          >
            Clear
          </button>
        </div>
      </section>

      <section>
        <div style={{ marginBottom: 10, color: "#475569", fontSize: 14 }}>
          Categories: {categories.length > 0 ? categories.join(", ") : "No categories yet"}
        </div>
        {loading ? (
          <p style={{ color: "#64748b" }}>Loading services...</p>
        ) : services.length === 0 ? (
          <p style={{ color: "#64748b" }}>No services yet.</p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {services.map((service) => (
              <div
                key={service.id || service._id}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 12,
                  background: "#fff",
                  padding: 14,
                }}
              >
                <div style={{ display: "flex", justifyContent: "space-between", gap: 12 }}>
                  <div>
                    <div style={{ fontWeight: 700, color: "#0f172a" }}>{service.name}</div>
                    <div style={{ fontSize: 13, color: "#64748b", marginTop: 2 }}>
                      {service.category} • ${Number(service.priceMin || 0).toFixed(2)} - ${Number(service.priceMax || 0).toFixed(2)}
                    </div>
                    {service.description ? (
                      <div style={{ marginTop: 8, color: "#334155", fontSize: 14 }}>
                        {service.description}
                      </div>
                    ) : null}
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button
                      type="button"
                      onClick={() => editService(service)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #cbd5e1",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteService(service.id || service._id)}
                      style={{
                        padding: "8px 10px",
                        borderRadius: 8,
                        border: "1px solid #fecaca",
                        color: "#b91c1c",
                        background: "#fff",
                        cursor: "pointer",
                      }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
