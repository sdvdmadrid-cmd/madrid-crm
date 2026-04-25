"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  DEFAULT_CATEGORY_SERVICES,
  SERVICE_CATEGORY_META,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/services-catalog-data";
import { useStoredUiLanguage } from "@/lib/ui-language";

const UI_I18N = {
  en: {
    title: "Services Catalog",
    description: "Control your service library from one clean command center.",
    breadcrumbs: {
      home: "Home",
      catalog: "Services Catalog",
    },
    statsCategories: "Categories",
    statsTemplates: "Templates",
    statsHeavy: "Heavy-use groups",
    searchPlaceholder: "Search categories...",
    filterAll: "All",
    filterPopular: "Most used",
    filterLean: "Lean",
    viewComfortable: "Comfort",
    viewCompact: "Compact",
    actionNewTemplate: "New template",
    actionEstimateBuilder: "Open estimate builder",
    sectionTitle: "Category Workspace",
    sectionHint: "Open a category to edit prices, descriptions, add-ons, and notes.",
    templateCount: "templates",
    emptyState: "No categories match your search.",
    open: "Open",
  },
  es: {
    title: "Catalogo de Servicios",
    description: "Controla tu biblioteca de servicios desde un solo centro de mando.",
    breadcrumbs: {
      home: "Inicio",
      catalog: "Catalogo de Servicios",
    },
    statsCategories: "Categorias",
    statsTemplates: "Plantillas",
    statsHeavy: "Grupos de alto uso",
    searchPlaceholder: "Buscar categorias...",
    filterAll: "Todas",
    filterPopular: "Mas usadas",
    filterLean: "Ligeras",
    viewComfortable: "Confort",
    viewCompact: "Compacta",
    actionNewTemplate: "Nueva plantilla",
    actionEstimateBuilder: "Abrir estimate builder",
    sectionTitle: "Espacio de Categorias",
    sectionHint: "Abre una categoria para editar precios, descripciones, add-ons y notas.",
    templateCount: "plantillas",
    emptyState: "No hay categorias que coincidan con tu busqueda.",
    open: "Abrir",
  },
  pl: {
    title: "Katalog Uslug",
    description: "Zarzadzaj cala biblioteka uslug z jednego nowoczesnego panelu.",
    breadcrumbs: {
      home: "Start",
      catalog: "Katalog Uslug",
    },
    statsCategories: "Kategorie",
    statsTemplates: "Szablony",
    statsHeavy: "Grupy wysokiego uzycia",
    searchPlaceholder: "Szukaj kategorii...",
    filterAll: "Wszystkie",
    filterPopular: "Najczesciej uzywane",
    filterLean: "Lekkie",
    viewComfortable: "Wygodny",
    viewCompact: "Kompakt",
    actionNewTemplate: "Nowy szablon",
    actionEstimateBuilder: "Otworz estimate builder",
    sectionTitle: "Panel Kategorii",
    sectionHint: "Otworz kategorie, aby edytowac ceny, opisy, dodatki i notatki.",
    templateCount: "szablonow",
    emptyState: "Brak kategorii pasujacych do wyszukiwania.",
    open: "Otworz",
  },
};

const CATEGORY_ACCENTS = {
  landscaping: {
    icon: "linear-gradient(145deg, #2d8b57, #185d3a)",
    progress: "linear-gradient(90deg, #42c07d, #1e8850)",
  },
  hardscaping: {
    icon: "linear-gradient(145deg, #5f6f8a, #3d4a62)",
    progress: "linear-gradient(90deg, #8b9ab2, #5f6f8a)",
  },
  "interior-maintenance": {
    icon: "linear-gradient(145deg, #2d7fa1, #1d5d78)",
    progress: "linear-gradient(90deg, #4aa8cc, #2d7fa1)",
  },
  "exterior-maintenance": {
    icon: "linear-gradient(145deg, #5469c7, #3147a4)",
    progress: "linear-gradient(90deg, #7e94eb, #5469c7)",
  },
  "seasonal-specialty": {
    icon: "linear-gradient(145deg, #9862cc, #6f3da4)",
    progress: "linear-gradient(90deg, #be8cef, #9862cc)",
  },
  "concrete-paving": {
    icon: "linear-gradient(145deg, #8b6b53, #604936)",
    progress: "linear-gradient(90deg, #bf9a7d, #8b6b53)",
  },
};

const CATALOG_PREFS_KEY = "services-catalog:prefs:v1";
const CATALOG_RECENTS_KEY = "services-catalog:recents:v1";

export default function ServicesCatalogPage() {
  const router = useRouter();
  const [uiLanguage] = useStoredUiLanguage();
  const [query, setQuery] = useState("");
  const [activeFilter, setActiveFilter] = useState("all");
  const [viewMode, setViewMode] = useState("comfortable");
  const [hoveredSlug, setHoveredSlug] = useState("");
  const [recentSlugs, setRecentSlugs] = useState([]);
  const [prefsHydrated, setPrefsHydrated] = useState(false);
  const uiText = UI_I18N[uiLanguage] || UI_I18N.en;

  const pushWithTransition = useCallback(
    (href) => {
      const navigate = () => {
        router.push(href);
      };

      if (
        typeof document !== "undefined" &&
        typeof document.startViewTransition === "function"
      ) {
        document.startViewTransition(navigate);
        return;
      }

      navigate();
    },
    [router],
  );

  const categories = useMemo(() => {
    return SERVICE_CATEGORY_ORDER.map((slug) => {
      const category = SERVICE_CATEGORY_META[slug];
      const templateCount = DEFAULT_CATEGORY_SERVICES[slug]?.length || 0;
      return {
        slug,
        ...category,
        templateCount,
      };
    });
  }, []);

  const totalTemplates = useMemo(() => {
    return categories.reduce((sum, category) => sum + category.templateCount, 0);
  }, [categories]);

  const heavyUseCount = useMemo(() => {
    return categories.filter((category) => category.templateCount >= 6).length;
  }, [categories]);

  const filteredCategories = useMemo(() => {
    const search = query.trim().toLowerCase();

    return categories.filter((category) => {
      if (activeFilter === "popular" && category.templateCount < 6) {
        return false;
      }

      if (activeFilter === "lean" && category.templateCount > 4) {
        return false;
      }

      if (!search) {
        return true;
      }

      return (
        category.title.toLowerCase().includes(search) ||
        category.description.toLowerCase().includes(search)
      );
    });
  }, [activeFilter, categories, query]);

  const filterOptions = [
    { id: "all", label: uiText.filterAll },
    { id: "popular", label: uiText.filterPopular },
    { id: "lean", label: uiText.filterLean },
  ];

  useEffect(() => {
    if (typeof window === "undefined") return;

    try {
      const rawPrefs = window.localStorage.getItem(CATALOG_PREFS_KEY);
      if (rawPrefs) {
        const parsed = JSON.parse(rawPrefs);
        if (parsed?.viewMode === "comfortable" || parsed?.viewMode === "compact") {
          setViewMode(parsed.viewMode);
        }
        if (parsed?.activeFilter === "all" || parsed?.activeFilter === "popular" || parsed?.activeFilter === "lean") {
          setActiveFilter(parsed.activeFilter);
        }
      }

      const rawRecents = window.localStorage.getItem(CATALOG_RECENTS_KEY);
      if (rawRecents) {
        const parsedRecents = JSON.parse(rawRecents);
        if (Array.isArray(parsedRecents)) {
          setRecentSlugs(parsedRecents.filter((slug) => SERVICE_CATEGORY_ORDER.includes(slug)).slice(0, 4));
        }
      }
    } catch {
      // Ignore localStorage parsing issues and continue with defaults.
    } finally {
      setPrefsHydrated(true);
    }
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || !prefsHydrated) return;
    window.localStorage.setItem(
      CATALOG_PREFS_KEY,
      JSON.stringify({ viewMode, activeFilter }),
    );
  }, [activeFilter, prefsHydrated, viewMode]);

  useEffect(() => {
    if (typeof window === "undefined" || !prefsHydrated) return;
    window.localStorage.setItem(CATALOG_RECENTS_KEY, JSON.stringify(recentSlugs));
  }, [prefsHydrated, recentSlugs]);

  const recentCategories = useMemo(() => {
    if (!recentSlugs.length) return [];
    const bySlug = new Map(categories.map((category) => [category.slug, category]));
    return recentSlugs.map((slug) => bySlug.get(slug)).filter(Boolean);
  }, [categories, recentSlugs]);

  const openCategory = (slug, options = {}) => {
    const { createNew = false } = options;
    setRecentSlugs((current) => [slug, ...current.filter((item) => item !== slug)].slice(0, 4));
    pushWithTransition(
      createNew ? `/services-catalog/${slug}?new=1` : `/services-catalog/${slug}`,
    );
  };

  return (
    <main className="catalog-page">
      <nav className="breadcrumbs" aria-label="Breadcrumb">
        <button
          type="button"
          className="crumb-link"
          onClick={() => {
            pushWithTransition("/");
          }}
        >
          {uiText.breadcrumbs.home}
        </button>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{uiText.breadcrumbs.catalog}</span>
      </nav>

      <section className="hero-shell">
        <div className="hero-orb hero-orb-a" />
        <div className="hero-orb hero-orb-b" />

        <header className="hero-header">
          <h1>{uiText.title}</h1>
          <p>{uiText.description}</p>
        </header>

        <div className="hero-stats">
          <article className="stat-card">
            <p>{uiText.statsCategories}</p>
            <strong>{categories.length}</strong>
          </article>
          <article className="stat-card">
            <p>{uiText.statsTemplates}</p>
            <strong>{totalTemplates}</strong>
          </article>
          <article className="stat-card">
            <p>{uiText.statsHeavy}</p>
            <strong>{heavyUseCount}</strong>
          </article>
        </div>

        <div className="toolbar">
          <input
            type="text"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={uiText.searchPlaceholder}
            className="search-box"
          />

          <div className="toolbar-controls">
            <div className="filter-strip">
              {filterOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setActiveFilter(option.id)}
                  className={`filter-pill ${activeFilter === option.id ? "is-active" : ""}`}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <div className="view-toggle" role="tablist" aria-label="View mode">
              <button
                type="button"
                onClick={() => setViewMode("comfortable")}
                className={`view-pill ${viewMode === "comfortable" ? "is-active" : ""}`}
              >
                {uiText.viewComfortable}
              </button>
              <button
                type="button"
                onClick={() => setViewMode("compact")}
                className={`view-pill ${viewMode === "compact" ? "is-active" : ""}`}
              >
                {uiText.viewCompact}
              </button>
            </div>
          </div>
        </div>

        <div className="hero-actions">
          <button
            type="button"
            className="action-btn action-btn-primary"
            onClick={() => {
              const target = filteredCategories[0]?.slug || categories[0]?.slug;
              if (target) {
                openCategory(target, { createNew: true });
              }
            }}
          >
            {uiText.actionNewTemplate}
          </button>
          <button
            type="button"
            className="action-btn action-btn-secondary"
            onClick={() => {
              pushWithTransition("/estimate-builder");
            }}
          >
            {uiText.actionEstimateBuilder}
          </button>
        </div>

        {recentCategories.length > 0 && (
          <div className="recent-strip" aria-label="Recent categories">
            {recentCategories.map((category) => (
              <button
                key={`recent-${category.slug}`}
                type="button"
                className="recent-pill"
                onClick={() => openCategory(category.slug)}
              >
                <span>{category.icon}</span>
                <span>{category.title}</span>
              </button>
            ))}
          </div>
        )}
      </section>

      <section className="category-shell">
        <div className="category-shell-header">
          <div>{uiText.sectionTitle}</div>
          <div>{uiText.sectionHint}</div>
        </div>

        <div className="category-list">
          {filteredCategories.length === 0 ? (
            <div className="empty-state">{uiText.emptyState}</div>
          ) : (
            filteredCategories.map((category, index) => {
              const density = Math.max(0.08, Math.min(1, category.templateCount / 10));
              const isHovered = hoveredSlug === category.slug;

              return (
                <button
                  key={category.slug}
                  type="button"
                  onMouseEnter={() => setHoveredSlug(category.slug)}
                  onMouseLeave={() => setHoveredSlug("")}
                  onClick={() => {
                    openCategory(category.slug);
                  }}
                  className={`category-card ${viewMode === "compact" ? "is-compact" : ""}`}
                  style={{
                    animationDelay: `${index * 45}ms`,
                    transform: isHovered ? "translateY(-2px)" : "translateY(0)",
                    borderColor: isHovered ? "#97b4ff" : "#dce5f4",
                    boxShadow: isHovered
                      ? "0 18px 34px rgba(12, 35, 82, 0.14)"
                      : "0 8px 20px rgba(12, 35, 82, 0.08)",
                  }}
                >
                  <div
                    className="category-icon"
                    style={{
                      background:
                        CATEGORY_ACCENTS[category.slug]?.icon ||
                        "linear-gradient(145deg, #2e5cc4, #264793)",
                    }}
                  >
                    {category.icon}
                  </div>

                  <div className="category-content">
                    <div className="category-title-row">
                      <h3>{category.title}</h3>
                      <span className="template-chip">
                        {category.templateCount} {uiText.templateCount}
                      </span>
                    </div>
                    <p>{category.description}</p>
                    <div className="density-track">
                      <span
                        style={{
                          width: `${Math.round(density * 100)}%`,
                          background:
                            CATEGORY_ACCENTS[category.slug]?.progress ||
                            "linear-gradient(90deg, #4d86ff, #2bb0a5)",
                        }}
                      />
                    </div>
                  </div>

                  <div className="open-pill">
                    <span>{uiText.open}</span>
                    <span>{">"}</span>
                  </div>
                </button>
              );
            })
          )}
        </div>
      </section>

      <style jsx>{`
        .catalog-page {
          --bg: #f3f6fb;
          --ink: #132238;
          --muted: #4f6688;
          --line: #d4dfef;
          min-height: 100%;
          max-width: 980px;
          margin: 0 auto;
          padding: 20px;
          font-family: "Segoe UI", "Avenir Next", "Helvetica Neue", sans-serif;
          color: var(--ink);
          background:
            radial-gradient(circle at 16% 0%, rgba(115, 153, 255, 0.18), transparent 40%),
            radial-gradient(circle at 84% 14%, rgba(17, 94, 89, 0.13), transparent 44%),
            var(--bg);
          animation: page-enter 220ms ease;
        }

        .breadcrumbs {
          display: flex;
          align-items: center;
          gap: 7px;
          margin-bottom: 10px;
          flex-wrap: wrap;
          font-size: 12px;
        }

        .crumb-link {
          border: 0;
          background: transparent;
          color: #2563eb;
          cursor: pointer;
          padding: 0;
          font-size: 12px;
          font-weight: 600;
        }

        .crumb-link:hover {
          text-decoration: underline;
        }

        .crumb-sep {
          color: #94a3b8;
        }

        .crumb-current {
          color: #334155;
          font-weight: 700;
        }

        .hero-shell {
          position: relative;
          overflow: hidden;
          border: 1px solid #cfdbef;
          border-radius: 22px;
          padding: 24px;
          background: linear-gradient(145deg, #ffffff 0%, #edf4ff 100%);
          box-shadow: 0 16px 34px rgba(20, 39, 88, 0.09);
        }

        .hero-orb {
          position: absolute;
          pointer-events: none;
          filter: blur(1px);
        }

        .hero-orb-a {
          top: -62px;
          right: -28px;
          width: 190px;
          height: 190px;
          border-radius: 999px;
          background: radial-gradient(circle at 40% 40%, rgba(120, 143, 255, 0.33), rgba(120, 143, 255, 0));
        }

        .hero-orb-b {
          bottom: -76px;
          left: -42px;
          width: 210px;
          height: 210px;
          border-radius: 999px;
          background: radial-gradient(circle at 60% 50%, rgba(62, 177, 161, 0.22), rgba(62, 177, 161, 0));
        }

        .hero-header {
          position: relative;
          z-index: 1;
        }

        .hero-header h1 {
          margin: 0;
          font-size: clamp(1.7rem, 2.8vw, 2.25rem);
          line-height: 1.08;
          letter-spacing: -0.02em;
        }

        .hero-header p {
          margin: 9px 0 0;
          color: var(--muted);
          font-size: 0.96rem;
          max-width: 640px;
        }

        .hero-stats {
          margin-top: 18px;
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
          position: relative;
          z-index: 1;
        }

        .stat-card {
          border: 1px solid #d4deef;
          border-radius: 14px;
          background: rgba(255, 255, 255, 0.75);
          backdrop-filter: blur(3px);
          padding: 12px 14px;
        }

        .stat-card p {
          margin: 0;
          color: #53719d;
          font-size: 0.73rem;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          font-weight: 700;
        }

        .stat-card strong {
          display: inline-block;
          margin-top: 5px;
          font-size: 1.35rem;
          line-height: 1;
        }

        .toolbar {
          margin-top: 16px;
          display: grid;
          grid-template-columns: minmax(0, 1fr) minmax(280px, auto);
          gap: 10px;
          align-items: center;
          position: relative;
          z-index: 1;
        }

        .toolbar-controls {
          display: flex;
          align-items: center;
          justify-content: flex-end;
          gap: 8px;
          flex-wrap: wrap;
        }

        .search-box {
          width: 100%;
          border: 1px solid #c9d6ee;
          border-radius: 999px;
          padding: 10px 14px;
          font-size: 0.92rem;
          color: #183053;
          background: rgba(255, 255, 255, 0.84);
          outline: none;
          transition: border-color 0.18s ease, box-shadow 0.18s ease;
        }

        .search-box:focus {
          border-color: #85a4ea;
          box-shadow: 0 0 0 4px rgba(88, 130, 230, 0.17);
        }

        .filter-strip {
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          justify-content: flex-start;
        }

        .filter-pill {
          border: 1px solid #bfd0eb;
          border-radius: 999px;
          background: #f4f8ff;
          color: #36507a;
          font-size: 0.79rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          padding: 8px 12px;
          cursor: pointer;
          transition: all 0.18s ease;
        }

        .filter-pill.is-active {
          background: #2f5ec8;
          border-color: #2f5ec8;
          color: #ffffff;
        }

        .view-toggle {
          display: inline-flex;
          border: 1px solid #bfd0eb;
          border-radius: 999px;
          overflow: hidden;
          background: #f4f8ff;
        }

        .view-pill {
          border: 0;
          background: transparent;
          color: #36507a;
          font-size: 0.76rem;
          font-weight: 700;
          padding: 8px 11px;
          cursor: pointer;
          transition: background 0.18s ease, color 0.18s ease;
        }

        .view-pill.is-active {
          background: #1f4fb7;
          color: #ffffff;
        }

        .hero-actions {
          margin-top: 12px;
          position: relative;
          z-index: 1;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
        }

        .recent-strip {
          margin-top: 10px;
          display: flex;
          gap: 8px;
          flex-wrap: wrap;
          position: relative;
          z-index: 1;
        }

        .recent-pill {
          border: 1px solid #c8d7ee;
          border-radius: 999px;
          padding: 7px 10px;
          background: rgba(248, 251, 255, 0.92);
          color: #2f4d78;
          font-size: 0.73rem;
          font-weight: 700;
          display: inline-flex;
          align-items: center;
          gap: 6px;
          cursor: pointer;
        }

        .action-btn {
          border: 1px solid transparent;
          border-radius: 999px;
          padding: 9px 14px;
          font-size: 0.8rem;
          font-weight: 700;
          letter-spacing: 0.01em;
          cursor: pointer;
          transition: transform 0.18s ease, box-shadow 0.18s ease, background 0.18s ease;
        }

        .action-btn:hover {
          transform: translateY(-1px);
        }

        .action-btn-primary {
          color: #ffffff;
          background: linear-gradient(135deg, #2c63da, #224aa8);
          box-shadow: 0 8px 20px rgba(24, 66, 158, 0.24);
        }

        .action-btn-secondary {
          color: #21426f;
          background: #edf4ff;
          border-color: #bfd0eb;
        }

        .category-shell {
          margin-top: 16px;
          border: 1px solid #cfdbef;
          border-radius: 18px;
          background: linear-gradient(180deg, rgba(254, 255, 255, 0.96), rgba(244, 249, 255, 0.96));
          box-shadow: 0 12px 28px rgba(20, 39, 88, 0.08);
          overflow: hidden;
        }

        .category-shell-header {
          display: flex;
          gap: 12px;
          justify-content: space-between;
          align-items: baseline;
          padding: 14px 16px;
          border-bottom: 1px solid #d8e2f1;
          background: rgba(255, 255, 255, 0.7);
          flex-wrap: wrap;
        }

        .category-shell-header div:first-child {
          font-size: 0.74rem;
          text-transform: uppercase;
          letter-spacing: 0.1em;
          color: #3c5880;
          font-weight: 700;
        }

        .category-shell-header div:last-child {
          font-size: 0.78rem;
          color: #5a7092;
        }

        .category-list {
          max-height: calc(100vh - 340px);
          overflow-y: auto;
          padding: 12px;
          display: grid;
          gap: 10px;
        }

        .category-card {
          width: 100%;
          border: 1px solid var(--line);
          border-radius: 16px;
          background: linear-gradient(170deg, #ffffff, #f4f8ff);
          cursor: pointer;
          text-align: left;
          display: grid;
          grid-template-columns: 46px minmax(0, 1fr) auto;
          gap: 12px;
          align-items: center;
          padding: 12px;
          transition: transform 0.2s ease, box-shadow 0.2s ease, border-color 0.2s ease;
          animation: card-enter 0.3s ease both;
        }

        .category-card.is-compact {
          padding: 9px 10px;
          gap: 10px;
        }

        .category-card.is-compact .category-content {
          gap: 4px;
        }

        .category-card.is-compact .category-content p {
          display: -webkit-box;
          -webkit-line-clamp: 1;
          -webkit-box-orient: vertical;
          overflow: hidden;
        }

        .category-card.is-compact .density-track {
          height: 5px;
        }

        .category-icon {
          width: 40px;
          height: 40px;
          border-radius: 12px;
          background: linear-gradient(145deg, #2e5cc4, #264793);
          color: white;
          display: grid;
          place-items: center;
          font-size: 0.76rem;
          font-weight: 700;
          letter-spacing: 0.08em;
        }

        .category-content {
          min-width: 0;
          display: grid;
          gap: 6px;
        }

        .category-title-row {
          display: flex;
          justify-content: space-between;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .category-title-row h3 {
          margin: 0;
          font-size: 1.01rem;
          color: #102340;
        }

        .template-chip {
          border: 1px solid #c7d5ec;
          border-radius: 999px;
          background: #eef4ff;
          padding: 3px 9px;
          font-size: 0.72rem;
          color: #3e5f90;
          font-weight: 700;
          white-space: nowrap;
        }

        .category-content p {
          margin: 0;
          color: #5c7292;
          font-size: 0.84rem;
          line-height: 1.3;
        }

        .density-track {
          height: 7px;
          border-radius: 999px;
          background: #dde7f6;
          overflow: hidden;
        }

        .density-track span {
          display: block;
          height: 100%;
          border-radius: inherit;
          background: linear-gradient(90deg, #4d86ff, #2bb0a5);
        }

        .open-pill {
          display: inline-flex;
          align-items: center;
          gap: 6px;
          border: 1px solid #c8d7ee;
          border-radius: 999px;
          padding: 8px 11px;
          color: #385884;
          background: #f3f7ff;
          font-size: 0.79rem;
          font-weight: 700;
          white-space: nowrap;
        }

        .empty-state {
          border: 1px dashed #c9d8ee;
          border-radius: 14px;
          text-align: center;
          padding: 18px;
          color: #587194;
          background: #f8fbff;
          font-size: 0.9rem;
        }

        @keyframes card-enter {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @keyframes page-enter {
          from {
            opacity: 0;
            transform: translateY(8px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }

        @media (max-width: 860px) {
          .toolbar {
            grid-template-columns: 1fr;
          }

          .toolbar-controls {
            justify-content: flex-start;
          }

          .filter-strip {
            justify-content: flex-start;
          }

          .category-list {
            max-height: none;
          }
        }

        @media (max-width: 700px) {
          .catalog-page {
            padding: 14px;
          }

          .breadcrumbs {
            margin-bottom: 8px;
          }

          .hero-shell {
            border-radius: 18px;
            padding: 16px;
          }

          .hero-stats {
            grid-template-columns: 1fr;
          }

          .hero-actions {
            flex-direction: column;
          }

          .recent-strip {
            flex-direction: column;
          }

          .action-btn {
            width: 100%;
            text-align: center;
          }

          .category-card {
            grid-template-columns: 38px minmax(0, 1fr);
            gap: 10px;
          }

          .open-pill {
            grid-column: 2;
            justify-self: start;
          }
        }
      `}</style>
    </main>
  );
}