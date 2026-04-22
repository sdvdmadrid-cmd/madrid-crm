"use client";

import { useRouter } from "next/navigation";
import {
  SERVICE_CATEGORY_META,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/services-catalog-data";
import { useStoredUiLanguage } from "@/lib/ui-language";

const UI_I18N = {
  en: {
    title: "Services Catalog",
    description:
      "A dense working list for contractors managing many categories and service templates quickly.",
    sectionTitle: "Categories",
    sectionHint: "Open any category to edit prices, descriptions, add-ons, and notes.",
    open: "Open",
  },
  es: {
    title: "Catalogo de Servicios",
    description:
      "Una lista de trabajo compacta para contratistas que administran muchas categorias y plantillas de servicio rapidamente.",
    sectionTitle: "Categorias",
    sectionHint: "Abre cualquier categoria para editar precios, descripciones, add-ons y notas.",
    open: "Abrir",
  },
  pl: {
    title: "Katalog Uslug",
    description:
      "Zwarta lista robocza dla wykonawcow zarzadzajacych wieloma kategoriami i szablonami uslug.",
    sectionTitle: "Kategorie",
    sectionHint: "Otworz dowolna kategorie, aby edytowac ceny, opisy, dodatki i notatki.",
    open: "Otworz",
  },
};

export default function ServicesCatalogPage() {
  const router = useRouter();
  const [uiLanguage] = useStoredUiLanguage();
  const uiText = UI_I18N[uiLanguage] || UI_I18N.en;

  return (
    <main
      style={{
        padding: "18px 20px 24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 920,
        margin: "0 auto",
      }}
    >
      <header style={{ marginBottom: 14 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 28,
            lineHeight: 1.1,
            color: "#111827",
          }}
        >
          {uiText.title}
        </h1>
        <p
          style={{
            margin: "8px 0 0",
            color: "#6b7280",
            lineHeight: 1.45,
            fontSize: 14,
            maxWidth: 720,
          }}
        >
          {uiText.description}
        </p>
      </header>

      <section
        style={{
          border: "1px solid #e5e7eb",
          borderRadius: 14,
          background: "#fbfcfd",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "baseline",
            padding: "12px 14px",
            borderBottom: "1px solid #eef2f7",
            background: "#f7f9fb",
            flexWrap: "wrap",
          }}
        >
          <div
            style={{
              fontSize: 12,
              fontWeight: 700,
              color: "#475569",
              textTransform: "uppercase",
              letterSpacing: "0.08em",
            }}
          >
            {uiText.sectionTitle}
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
            {uiText.sectionHint}
          </div>
        </div>

        <div style={{ maxHeight: "calc(100vh - 220px)", overflowY: "auto" }}>
          {SERVICE_CATEGORY_ORDER.map((slug, index) => {
            const category = SERVICE_CATEGORY_META[slug];
            return (
              <button
                key={slug}
                type="button"
                onClick={() => {
                  router.push(`/services-catalog/${slug}`);
                }}
                style={{
                  width: "100%",
                  display: "grid",
                  gridTemplateColumns: "42px minmax(0, 1fr) auto",
                  gap: 12,
                  alignItems: "center",
                  padding: "12px 14px",
                  border: "none",
                  borderBottom:
                    index < SERVICE_CATEGORY_ORDER.length - 1
                      ? "1px solid #eef2f7"
                      : "none",
                  background: "white",
                  cursor: "pointer",
                  textAlign: "left",
                }}
              >
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 10,
                    background: "#e8eef5",
                    color: "#1f2937",
                    display: "grid",
                    placeItems: "center",
                    fontSize: 12,
                    fontWeight: 700,
                    letterSpacing: "0.06em",
                  }}
                >
                  {category.icon}
                </div>
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 14,
                      fontWeight: 700,
                      color: "#111827",
                      marginBottom: 2,
                    }}
                  >
                    {category.title}
                  </div>
                  <div
                    style={{
                      fontSize: 12,
                      color: "#6b7280",
                      lineHeight: 1.35,
                    }}
                  >
                    {category.description}
                  </div>
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    color: "#64748b",
                    fontSize: 12,
                    whiteSpace: "nowrap",
                  }}
                >
                  <span>{uiText.open}</span>
                  <span style={{ fontSize: 16, lineHeight: 1 }}>›</span>
                </div>
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}