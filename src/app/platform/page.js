"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useStoredUiLanguage } from "@/lib/ui-language";

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function dateLabel(value) {
  if (!value) return "N/A";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "N/A";
  return date.toLocaleString();
}

const UI_I18N = {
  en: {
    title: "Platform Dashboard",
    description: "Global view of companies and FieldBase usage.",
    loading: "Loading data...",
    searchPlaceholder: "Search tenant, users or contractors",
    companiesTitle: "Companies",
    actions: "Actions",
    copied: "Copied",
    copyTenant: "Copy tenant",
    empty: "No companies match your search.",
    errors: {
      fetch: "Unable to load platform dashboard",
      fallback: "Unable to load platform dashboard",
    },
    cards: {
      totalTenants: "Companies (tenants)",
      totalUsers: "Total users",
      totalAdmins: "Admins",
      totalContractors: "Contractors",
      active30d: "Active companies 30d",
      clients: "Clients",
      jobs: "Jobs",
      invoices: "Invoices",
      contracts: "Contracts",
      totalRevenue: "Total revenue",
      paidRevenue: "Collected revenue",
      balanceDue: "Outstanding",
    },
    columns: {
      tenantId: "Tenant",
      users: "Users",
      admins: "Admins",
      contractors: "Contractors",
      viewers: "Viewers",
      clients: "Clients",
      jobs: "Jobs",
      invoices: "Invoices",
      totalRevenue: "Revenue",
      paidRevenue: "Paid",
      balanceDue: "Balance",
      lastActivityAt: "Last activity",
    },
  },
  es: {
    title: "Panel de plataforma",
    description: "Vista global de empresas y uso de FieldBase.",
    loading: "Cargando datos...",
    searchPlaceholder: "Buscar tenant, users o contractors",
    companiesTitle: "Empresas",
    actions: "Acciones",
    copied: "Copiado",
    copyTenant: "Copiar tenant",
    empty: "No hay empresas que coincidan con tu busqueda.",
    errors: {
      fetch: "No se pudo cargar el dashboard de plataforma",
      fallback: "No se pudo cargar el dashboard de plataforma",
    },
    cards: {
      totalTenants: "Empresas (tenants)",
      totalUsers: "Usuarios totales",
      totalAdmins: "Admins",
      totalContractors: "Contractors",
      active30d: "Empresas activas 30d",
      clients: "Clientes",
      jobs: "Trabajos",
      invoices: "Facturas",
      contracts: "Contratos",
      totalRevenue: "Ingresos totales",
      paidRevenue: "Ingresos cobrados",
      balanceDue: "Por cobrar",
    },
    columns: {
      tenantId: "Tenant",
      users: "Users",
      admins: "Admins",
      contractors: "Contractors",
      viewers: "Viewers",
      clients: "Clientes",
      jobs: "Trabajos",
      invoices: "Facturas",
      totalRevenue: "Ingresos",
      paidRevenue: "Cobrado",
      balanceDue: "Saldo",
      lastActivityAt: "Ultima actividad",
    },
  },
  pl: {
    title: "Panel platformy",
    description: "Globalny widok firm i wykorzystania FieldBase.",
    loading: "Ladowanie danych...",
    searchPlaceholder: "Szukaj tenant, users lub contractors",
    companiesTitle: "Firmy",
    actions: "Akcje",
    copied: "Skopiowano",
    copyTenant: "Kopiuj tenant",
    empty: "Brak firm pasujacych do wyszukiwania.",
    errors: {
      fetch: "Nie udalo sie zaladowac panelu platformy",
      fallback: "Nie udalo sie zaladowac panelu platformy",
    },
    cards: {
      totalTenants: "Firmy (tenants)",
      totalUsers: "Wszyscy uzytkownicy",
      totalAdmins: "Admini",
      totalContractors: "Contractors",
      active30d: "Aktywne firmy 30d",
      clients: "Klienci",
      jobs: "Zlecenia",
      invoices: "Faktury",
      contracts: "Umowy",
      totalRevenue: "Laczny przychod",
      paidRevenue: "Zebrany przychod",
      balanceDue: "Do zaplaty",
    },
    columns: {
      tenantId: "Tenant",
      users: "Users",
      admins: "Admins",
      contractors: "Contractors",
      viewers: "Viewers",
      clients: "Klienci",
      jobs: "Zlecenia",
      invoices: "Faktury",
      totalRevenue: "Przychod",
      paidRevenue: "Oplacone",
      balanceDue: "Saldo",
      lastActivityAt: "Ostatnia aktywnosc",
    },
  },
};

export default function PlatformPage() {
  const [uiLanguage] = useStoredUiLanguage();
  const uiText = UI_I18N[uiLanguage] || UI_I18N.en;
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [summary, setSummary] = useState(null);
  const [tenants, setTenants] = useState([]);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("users");
  const [sortDirection, setSortDirection] = useState("desc");
  const [copiedTenant, setCopiedTenant] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      setError("");
      try {
        const res = await apiFetch("/api/platform/overview", {
          cache: "no-store",
        });
        const payload = await getJsonOrThrow(res, uiText.errors.fetch);
        setSummary(payload.summary || null);
        setTenants(Array.isArray(payload.tenants) ? payload.tenants : []);
      } catch (err) {
        setError(err.message || uiText.errors.fallback);
      } finally {
        setLoading(false);
      }
    })();
  }, [uiText.errors.fetch, uiText.errors.fallback]);

  const cards = summary
    ? [
        { title: uiText.cards.totalTenants, value: summary.totalTenants },
        { title: uiText.cards.totalUsers, value: summary.totalUsers },
        { title: uiText.cards.totalAdmins, value: summary.totalAdmins },
        {
          title: uiText.cards.totalContractors,
          value: summary.totalContractors,
        },
        { title: uiText.cards.active30d, value: summary.activeTenants30d },
        { title: uiText.cards.clients, value: summary.totalClients },
        { title: uiText.cards.jobs, value: summary.totalJobs },
        { title: uiText.cards.invoices, value: summary.totalInvoices },
        { title: uiText.cards.contracts, value: summary.totalContracts },
        {
          title: uiText.cards.totalRevenue,
          value: money(summary.totalRevenue),
        },
        { title: uiText.cards.paidRevenue, value: money(summary.paidRevenue) },
        { title: uiText.cards.balanceDue, value: money(summary.balanceDue) },
      ]
    : [];

  const columns = useMemo(
    () => [
      { key: "tenantId", label: uiText.columns.tenantId, type: "text" },
      { key: "users", label: uiText.columns.users, type: "number" },
      { key: "admins", label: uiText.columns.admins, type: "number" },
      {
        key: "contractors",
        label: uiText.columns.contractors,
        type: "number",
      },
      { key: "viewers", label: uiText.columns.viewers, type: "number" },
      { key: "clients", label: uiText.columns.clients, type: "number" },
      { key: "jobs", label: uiText.columns.jobs, type: "number" },
      { key: "invoices", label: uiText.columns.invoices, type: "number" },
      {
        key: "totalRevenue",
        label: uiText.columns.totalRevenue,
        type: "number",
      },
      {
        key: "paidRevenue",
        label: uiText.columns.paidRevenue,
        type: "number",
      },
      {
        key: "balanceDue",
        label: uiText.columns.balanceDue,
        type: "number",
      },
      {
        key: "lastActivityAt",
        label: uiText.columns.lastActivityAt,
        type: "date",
      },
    ],
    [uiText.columns],
  );

  const visibleTenants = useMemo(() => {
    const term = search.trim().toLowerCase();
    const filtered = term
      ? tenants.filter((tenant) => {
          const tenantId = String(tenant.tenantId || "").toLowerCase();
          const users = String(tenant.users || "");
          const contractors = String(tenant.contractors || "");
          return (
            tenantId.includes(term) ||
            users.includes(term) ||
            contractors.includes(term)
          );
        })
      : tenants;

    return [...filtered].sort((a, b) => {
      const column = columns.find((item) => item.key === sortBy);
      const direction = sortDirection === "asc" ? 1 : -1;

      if (!column || column.type === "text") {
        return (
          String(a[sortBy] || "").localeCompare(String(b[sortBy] || "")) *
          direction
        );
      }

      if (column.type === "date") {
        const left = new Date(a[sortBy] || 0).getTime();
        const right = new Date(b[sortBy] || 0).getTime();
        return (left - right) * direction;
      }

      return (Number(a[sortBy] || 0) - Number(b[sortBy] || 0)) * direction;
    });
  }, [columns, search, sortBy, sortDirection, tenants]);

  const onSort = (key) => {
    if (sortBy === key) {
      setSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }

    setSortBy(key);
    setSortDirection(key === "tenantId" ? "asc" : "desc");
  };

  const copyTenantId = async (tenantId) => {
    try {
      await navigator.clipboard.writeText(String(tenantId || ""));
      setCopiedTenant(String(tenantId || ""));
      setTimeout(() => {
        setCopiedTenant("");
      }, 1200);
    } catch {
      setCopiedTenant("");
    }
  };

  return (
    <main
      style={{
        padding: "24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
      <header
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 12,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 30 }}>{uiText.title}</h1>
          <p style={{ margin: "8px 0 0 0", color: "#555" }}>
            {uiText.description}
          </p>
        </div>
        <Link
          href="/platform/feedback"
          style={{
            borderRadius: 999,
            border: "1px solid rgba(15,23,42,0.14)",
            background: "#fff",
            color: "#0f172a",
            padding: "8px 12px",
            fontWeight: 700,
            textDecoration: "none",
          }}
        >
          Feedback Inbox
        </Link>
      </header>

      {error
        ? <div style={{ marginTop: 16, color: "#b00020" }}>{error}</div>
        : null}
      {loading
        ? <div style={{ marginTop: 16, color: "#333" }}>{uiText.loading}</div>
        : null}

      {!loading && !error
        ? <>
            <section
              style={{
                marginTop: 24,
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 12,
              }}
            >
              {cards.map((card) => (
                <article
                  key={card.title}
                  style={{
                    border: "1px solid #d8dde9",
                    borderRadius: 12,
                    background: "#fff",
                    padding: 14,
                  }}
                >
                  <p style={{ margin: 0, fontSize: 13, color: "#6c7280" }}>
                    {card.title}
                  </p>
                  <p
                    style={{
                      margin: "8px 0 0 0",
                      fontSize: 24,
                      fontWeight: 700,
                    }}
                  >
                    {card.value}
                  </p>
                </article>
              ))}
            </section>

            <section style={{ marginTop: 28 }}>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  gap: 12,
                  flexWrap: "wrap",
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 22 }}>
                  {uiText.companiesTitle}
                </h2>
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder={uiText.searchPlaceholder}
                  style={{
                    width: "100%",
                    maxWidth: 340,
                    padding: "10px 12px",
                    borderRadius: 8,
                    border: "1px solid #cfd5e1",
                    fontSize: 14,
                  }}
                />
              </div>
              <div style={{ overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ background: "#f4f7fb" }}>
                      {columns.map((column) => (
                        <th
                          key={column.key}
                          style={{
                            textAlign: "left",
                            padding: "10px 8px",
                            borderBottom: "1px solid #d8dde9",
                            fontSize: 13,
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => onSort(column.key)}
                            style={{
                              border: "none",
                              background: "transparent",
                              padding: 0,
                              cursor: "pointer",
                              fontWeight: 700,
                              color: "#2f3542",
                            }}
                          >
                            {column.label}
                            {sortBy === column.key
                              ? sortDirection === "asc"
                                ? " ↑"
                                : " ↓"
                              : ""}
                          </button>
                        </th>
                      ))}
                      <th
                        style={{
                          textAlign: "left",
                          padding: "10px 8px",
                          borderBottom: "1px solid #d8dde9",
                          fontSize: 13,
                        }}
                      >
                        {uiText.actions}
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleTenants.map((tenant) => (
                      <tr key={tenant.tenantId}>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.tenantId}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.users}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.admins}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.contractors}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.viewers}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.clients}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.jobs}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {tenant.invoices}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {money(tenant.totalRevenue)}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {money(tenant.paidRevenue)}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {money(tenant.balanceDue)}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          {dateLabel(tenant.lastActivityAt)}
                        </td>
                        <td
                          style={{
                            padding: "10px 8px",
                            borderBottom: "1px solid #edf0f5",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => copyTenantId(tenant.tenantId)}
                            style={{
                              border: "1px solid #cfd5e1",
                              borderRadius: 6,
                              background: "#fff",
                              padding: "6px 10px",
                              cursor: "pointer",
                            }}
                          >
                            {copiedTenant === tenant.tenantId
                              ? uiText.copied
                              : uiText.copyTenant}
                          </button>
                        </td>
                      </tr>
                    ))}
                    {visibleTenants.length === 0
                      ? <tr>
                          <td
                            colSpan={13}
                            style={{
                              padding: "16px 8px",
                              color: "#6c7280",
                              borderBottom: "1px solid #edf0f5",
                            }}
                          >
                            {uiText.empty}
                          </td>
                        </tr>
                      : null}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        : null}
    </main>
  );
}
