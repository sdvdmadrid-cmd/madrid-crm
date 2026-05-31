"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import PremiumPageShell from "@/components/workspace/PremiumPageShell";
import ws from "@/styles/workspace-dark.module.css";
import sc from "./services-catalog.module.css";

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
  const [searchQuery, setSearchQuery] = useState("");

  const categories = useMemo(() => {
    const set = new Set();
    for (const item of services) {
      const category = String(item.category || "General").trim();
      if (category) set.add(category);
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [services]);

  const filteredServices = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return services;
    return services.filter((service) => {
      const haystack = [
        service.name,
        service.category,
        service.description,
      ]
        .map((part) => String(part || "").toLowerCase())
        .join(" ");
      return haystack.includes(q);
    });
  }, [services, searchQuery]);

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

  const headerActions = (
    <>
      <Link href="/website" className={ws.btnSecondary}>
        Website builder
      </Link>
      <button type="button" onClick={loadServices} disabled={loading} className={ws.btnSecondary}>
        Refresh
      </button>
    </>
  );

  return (
    <PremiumPageShell
      title="Service Catalog"
      subtitle="Manage reusable services and pricing for estimates and your website."
      actions={headerActions}
    >
      <div data-testid="services-catalog-shell">
      {error ? <div className={ws.noticeErrorBlock}>{error}</div> : null}

      <section className={sc.formCard} data-testid="services-catalog-form">
        <h2 className={sc.formTitle}>{selectedId ? "Edit service" : "Add service"}</h2>
        <div className={sc.formGrid}>
          <input
            className={sc.field}
            placeholder="Service name"
            value={form.name}
            onChange={(e) => setForm((s) => ({ ...s, name: e.target.value }))}
          />
          <input
            className={sc.field}
            placeholder="Category"
            value={form.category}
            onChange={(e) => setForm((s) => ({ ...s, category: e.target.value }))}
          />
          <input
            className={sc.field}
            placeholder="Min price"
            value={form.priceMin}
            onChange={(e) => setForm((s) => ({ ...s, priceMin: e.target.value }))}
          />
          <input
            className={sc.field}
            placeholder="Max price"
            value={form.priceMax}
            onChange={(e) => setForm((s) => ({ ...s, priceMax: e.target.value }))}
          />
        </div>
        <textarea
          className={`${sc.field} ${sc.textarea}`}
          placeholder="Description"
          value={form.description}
          onChange={(e) => setForm((s) => ({ ...s, description: e.target.value }))}
          rows={4}
        />
        <div className={sc.formActions}>
          <button type="button" onClick={saveService} disabled={saving} className={ws.btnPrimary}>
            {saving ? "Saving..." : selectedId ? "Update service" : "Add service"}
          </button>
          <button type="button" onClick={resetForm} className={ws.btnSecondary}>
            Clear
          </button>
        </div>
      </section>

      <section data-testid="services-catalog-list">
        <div className={sc.listToolbar}>
          <input
            type="search"
            className={sc.field}
            placeholder="Search services…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            aria-label="Search services"
            data-testid="services-catalog-search"
          />
          <p className={sc.categories}>
            Categories: {categories.length > 0 ? categories.join(", ") : "No categories yet"}
          </p>
        </div>
        {loading ? (
          <p style={{ color: "var(--fb-text-muted)" }}>Loading services...</p>
        ) : services.length === 0 ? (
          <div className="fb-empty">
            <p className="fb-empty-title">No services yet</p>
            <p className="fb-empty-desc">Add your first service above to use it in estimates.</p>
          </div>
        ) : filteredServices.length === 0 ? (
          <div className="fb-empty">
            <p className="fb-empty-title">No matches</p>
            <p className="fb-empty-desc">Try a different search term.</p>
          </div>
        ) : (
          <div className={sc.list}>
            {filteredServices.map((service) => (
              <article
                key={service.id || service._id}
                className={sc.serviceCard}
                data-testid={`service-card-${service.id || service._id}`}
              >
                <div className={sc.serviceRow}>
                  <div>
                    <div className={sc.serviceName}>{service.name}</div>
                    <div className={sc.serviceMeta}>
                      {service.category} • ${Number(service.priceMin || 0).toFixed(2)} – $
                      {Number(service.priceMax || 0).toFixed(2)}
                    </div>
                    {service.description ? (
                      <p className={sc.serviceDesc}>{service.description}</p>
                    ) : null}
                  </div>
                  <div className={sc.cardActions}>
                    <button
                      type="button"
                      onClick={() => editService(service)}
                      className={ws.btnSecondary}
                    >
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => deleteService(service.id || service._id)}
                      className={sc.btnDanger}
                    >
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
      </div>
    </PremiumPageShell>
  );
}
