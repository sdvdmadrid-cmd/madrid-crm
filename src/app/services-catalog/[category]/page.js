"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { assertSafeText, sanitizeSearchInput } from "@/lib/input-sanitizer";
import {
  DEFAULT_CATEGORY_SERVICES,
  SERVICE_CATEGORY_META,
  SERVICE_CATEGORY_ORDER,
} from "@/lib/services-catalog-data";
import { useStoredUiLanguage } from "@/lib/ui-language";

const VALID_CATEGORIES = new Set(SERVICE_CATEGORY_ORDER);

const UI_I18N = {
  en: {
    back: "Back to Services Catalog",
    breadcrumbs: {
      home: "Home",
      catalog: "Services Catalog",
    },
    categories: "Categories",
    services: "Services",
    searchPlaceholder: "Find a service fast...",
    noResults: "No services match your filter.",
    saving: "Saving...",
    deleting: "Deleting...",
    synced: "Saved",
    unsaved: "Unsaved",
    fields: {
      price: "Price",
      description: "Description",
      addOns: "Optional add-ons",
      notes: "Notes",
    },
    placeholders: {
      price: "0.00",
      description: "Short service description",
      addOns: "Extras, upgrades, or bundles",
      notes: "Internal notes",
    },
    buttons: {
      save: "Save",
      reset: "Reset",
      delete: "Delete",
      favorite: "Favorite",
      unfavorite: "Unfavorite",
      moveUp: "Move up",
      moveDown: "Move down",
      expand: "Open",
      collapse: "Close",
    },
    badges: {
      template: "Template",
      saved: "Saved",
      custom: "Custom",
    },
    header: {
      allSaved: "All saved",
      unsavedCount: "unsaved",
      addCustomService: "Add custom service",
      editingOnlyPrefix: "Editing only",
      editingOnlySuffix: "Use the button above to create your own service.",
      duplicateTemplates: "Duplicate templates",
      exportCategory: "Export category",
      duplicateReadySuffix: "template copies ready to edit",
      exportReady: "Category export downloaded",
    },
    priceUnset: "Set price",
    invalidCategory: "Invalid category.",
    newServicePrefix: "New service",
    errors: {
      fetch: "Unable to load services",
      load: "Error loading services",
      save: "Unable to save service",
      saveFallback: "Error saving service",
      delete: "Unable to delete service",
      deleteFallback: "Error deleting service",
      invalidInput: "Invalid or unsafe input detected",
    },
  },
  es: {
    back: "Volver al Catalogo de Servicios",
    breadcrumbs: {
      home: "Inicio",
      catalog: "Catalogo de Servicios",
    },
    categories: "Categorias",
    services: "Servicios",
    searchPlaceholder: "Encuentra un servicio rapido...",
    noResults: "No hay servicios que coincidan con el filtro.",
    saving: "Guardando...",
    deleting: "Eliminando...",
    synced: "Guardado",
    unsaved: "Sin guardar",
    fields: {
      price: "Precio",
      description: "Descripcion",
      addOns: "Add-ons opcionales",
      notes: "Notas",
    },
    placeholders: {
      price: "0.00",
      description: "Descripcion corta del servicio",
      addOns: "Extras, mejoras o bundles",
      notes: "Notas internas",
    },
    buttons: {
      save: "Guardar",
      reset: "Restablecer",
      delete: "Eliminar",
      favorite: "Favorito",
      unfavorite: "Quitar favorito",
      moveUp: "Mover arriba",
      moveDown: "Mover abajo",
      expand: "Abrir",
      collapse: "Cerrar",
    },
    badges: {
      template: "Plantilla",
      saved: "Guardado",
      custom: "Personalizado",
    },
    header: {
      allSaved: "Todo guardado",
      unsavedCount: "sin guardar",
      addCustomService: "Agregar servicio personalizado",
      editingOnlyPrefix: "Editando solo",
      editingOnlySuffix: "Usa el boton de arriba para crear tu propio servicio.",
      duplicateTemplates: "Duplicar plantillas",
      exportCategory: "Exportar categoria",
      duplicateReadySuffix: "copias de plantilla listas para editar",
      exportReady: "Exportacion de categoria descargada",
    },
    priceUnset: "Definir precio",
    invalidCategory: "Categoria invalida.",
    newServicePrefix: "Nuevo servicio",
    errors: {
      fetch: "No se pudieron cargar los servicios",
      load: "Error al cargar servicios",
      save: "No se pudo guardar el servicio",
      saveFallback: "Error al guardar servicio",
      delete: "No se pudo eliminar el servicio",
      deleteFallback: "Error al eliminar servicio",
      invalidInput: "Se detecto una entrada invalida o insegura",
    },
  },
  pl: {
    back: "Powrot do Katalogu Uslug",
    breadcrumbs: {
      home: "Start",
      catalog: "Katalog Uslug",
    },
    categories: "Kategorie",
    services: "Uslugi",
    searchPlaceholder: "Znajdz usluge szybko...",
    noResults: "Brak uslug pasujacych do filtra.",
    saving: "Zapisywanie...",
    deleting: "Usuwanie...",
    synced: "Zapisane",
    unsaved: "Niezapisane",
    fields: {
      price: "Cena",
      description: "Opis",
      addOns: "Opcjonalne dodatki",
      notes: "Notatki",
    },
    placeholders: {
      price: "0.00",
      description: "Krotki opis uslugi",
      addOns: "Dodatki, rozszerzenia lub pakiety",
      notes: "Notatki wewnetrzne",
    },
    buttons: {
      save: "Zapisz",
      reset: "Resetuj",
      delete: "Usun",
      favorite: "Ulubione",
      unfavorite: "Usun z ulubionych",
      moveUp: "Przesun wyzej",
      moveDown: "Przesun nizej",
      expand: "Otworz",
      collapse: "Zamknij",
    },
    badges: {
      template: "Szablon",
      saved: "Zapisane",
      custom: "Wlasne",
    },
    header: {
      allSaved: "Wszystko zapisane",
      unsavedCount: "niezapisane",
      addCustomService: "Dodaj usluge niestandardowa",
      editingOnlyPrefix: "Edytujesz tylko",
      editingOnlySuffix: "Uzyj przycisku powyzej, aby utworzyc wlasna usluge.",
      duplicateTemplates: "Duplikuj szablony",
      exportCategory: "Eksportuj kategorie",
      duplicateReadySuffix: "kopii szablonow gotowych do edycji",
      exportReady: "Eksport kategorii zostal pobrany",
    },
    priceUnset: "Ustaw cene",
    invalidCategory: "Nieprawidlowa kategoria.",
    newServicePrefix: "Nowa usluga",
    errors: {
      fetch: "Nie udalo sie zaladowac uslug",
      load: "Blad podczas ladowania uslug",
      save: "Nie udalo sie zapisac uslugi",
      saveFallback: "Blad podczas zapisu uslugi",
      delete: "Nie udalo sie usunac uslugi",
      deleteFallback: "Blad podczas usuwania uslugi",
      invalidInput: "Wykryto nieprawidlowe lub niebezpieczne dane",
    },
  },
};

function normalizeService(service) {
  const priceMin = Number(service.priceMin ?? service.price_min ?? 0) || 0;
  const priceMax =
    Number(service.priceMax ?? service.price_max ?? priceMin) || priceMin;
  const price = priceMax || priceMin;

  return {
    _id: service._id || service.id || null,
    id: service.id || service._id || null,
    name: String(service.name || "").trim(),
    description: String(service.description || "").trim(),
    price,
    priceMin,
    priceMax,
    addOns: String(
      service.addOns || service.materials || service.materials_used || "",
    ).trim(),
    notes: String(
      service.notes || service.laborNotes || service.labor_notes || "",
    ).trim(),
    unit: String(service.unit || "service").trim() || "service",
    state: String(service.state || "ALL").trim() || "ALL",
    pricingType:
      String(service.pricingType || service.pricing_type || "per_unit").trim() ||
      "per_unit",
    materialCost: Number(service.materialCost ?? service.material_cost ?? 0) || 0,
    laborCost: Number(service.laborCost ?? service.labor_cost ?? 0) || 0,
    overheadPercentage:
      Number(service.overheadPercentage ?? service.overhead_percentage ?? 10) ||
      10,
    profitPercentage:
      Number(service.profitPercentage ?? service.profit_percentage ?? 20) || 20,
  };
}

function makeServiceKey(service) {
  return `name:${String(service?.name || "")
    .trim()
    .toLowerCase()}`;
}

function buildDraft(service) {
  return {
    name: service?.name || "",
    price: service?.price ? String(service.price) : "",
    description: service?.description || "",
    addOns: service?.addOns || "",
    notes: service?.notes || "",
    unit: service?.unit || "service",
    state: service?.state || "ALL",
    pricingType: service?.pricingType || "per_unit",
    materialCost: service?.materialCost || 0,
    laborCost: service?.laborCost || 0,
    overheadPercentage: service?.overheadPercentage || 10,
    profitPercentage: service?.profitPercentage || 20,
  };
}

function formatPrice(value) {
  const amount = Number(value || 0);
  if (!amount) return "";
  return `$${amount.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

function isDraftDirty(service, draft) {
  if (!service || !draft) return false;
  return (
    draft.price !== (service.price ? String(service.price) : "") ||
    draft.description !== (service.description || "") ||
    draft.addOns !== (service.addOns || "") ||
    draft.notes !== (service.notes || "")
  );
}

export default function CategoryServicesPage() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const [uiLanguage] = useStoredUiLanguage();
  const uiText = UI_I18N[uiLanguage] || UI_I18N.en;
  const category = String(params?.category || "").trim();
  const categoryMeta = SERVICE_CATEGORY_META[category];
  const isValidCategory = VALID_CATEGORIES.has(category);
  const [viewportWidth, setViewportWidth] = useState(1280);
  const [savedServices, setSavedServices] = useState([]);
  const [search, setSearch] = useState("");
  const [expandedKey, setExpandedKey] = useState("");
  const [draftByKey, setDraftByKey] = useState({});
  const [savingKey, setSavingKey] = useState("");
  const [deletingKey, setDeletingKey] = useState("");
  const [favorites, setFavorites] = useState([]);
  const [manualOrder, setManualOrder] = useState([]);
  const [error, setError] = useState("");
  const [statusMessage, setStatusMessage] = useState("");
  const prefsHydratedRef = useRef(false);
  const saveTimeoutRef = useRef(null);
  const quickCreateHandledRef = useRef(false);

  const pushWithTransition = useCallback(
    (href, mode = "push") => {
      const navigate = () => {
        if (mode === "replace") {
          router.replace(href);
          return;
        }
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

  useEffect(() => {
    const syncViewport = () => setViewportWidth(window.innerWidth || 1280);
    syncViewport();
    window.addEventListener("resize", syncViewport);
    return () => window.removeEventListener("resize", syncViewport);
  }, []);

  const isNarrow = viewportWidth < 1080;
  const isMobile = viewportWidth < 760;

  const fetchPreferences = useCallback(async () => {
    if (!isValidCategory) return;
    try {
      const res = await apiFetch(
        `/api/services-catalog/preferences?category=${encodeURIComponent(category)}`,
      );
      const payload = await getJsonOrThrow(res, uiText.errors.load);
      setFavorites(Array.isArray(payload?.data?.favorites) ? payload.data.favorites : []);
      setManualOrder(
        Array.isArray(payload?.data?.manualOrder) ? payload.data.manualOrder : [],
      );
      prefsHydratedRef.current = true;
    } catch (err) {
      setError(err.message || uiText.errors.load);
      prefsHydratedRef.current = true;
    }
  }, [category, isValidCategory, uiText.errors.load]);

  const fetchServices = useCallback(async () => {
    if (!isValidCategory) return;
    try {
      const res = await apiFetch(
        `/api/services-catalog?category=${encodeURIComponent(category)}`,
      );
      const data = await getJsonOrThrow(res, uiText.errors.fetch);
      setSavedServices(
        Array.isArray(data)
          ? data.map(normalizeService).filter((service) => service.name)
          : [],
      );
    } catch (err) {
      setError(err.message || uiText.errors.load);
    }
  }, [category, isValidCategory, uiText.errors.fetch, uiText.errors.load]);

  useEffect(() => {
    fetchServices();
    fetchPreferences();
  }, [fetchPreferences, fetchServices]);

  useEffect(() => {
    if (!prefsHydratedRef.current || !isValidCategory) return;
    const timeoutId = window.setTimeout(async () => {
      try {
        const response = await apiFetch("/api/services-catalog/preferences", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ category, favorites, manualOrder }),
        });
        await getJsonOrThrow(response, uiText.errors.saveFallback);
      } catch {
        // Best effort only; UI stays responsive even if preferences sync fails.
      }
    }, 180);

    return () => window.clearTimeout(timeoutId);
  }, [category, favorites, isValidCategory, manualOrder, uiText.errors.saveFallback]);

  const templateServices = DEFAULT_CATEGORY_SERVICES[category] || [];

  const allServices = useMemo(() => {
    const byName = new Map(
      savedServices.map((service) => [service.name.toLowerCase(), service]),
    );

    const defaults = templateServices.map((template) => {
      const saved = byName.get(template.name.toLowerCase());
      return {
        ...(saved || template),
        name: template.name,
        description: saved?.description || template.description,
        price: saved?.price || "",
        addOns: saved?.addOns || template.addOns,
        notes: saved?.notes || template.notes,
        isTemplateOnly: !saved,
        isCustom: false,
      };
    });

    const extras = savedServices
      .filter(
        (service) =>
          !templateServices.some(
            (template) => template.name.toLowerCase() === service.name.toLowerCase(),
          ),
      )
      .map((service) => ({
        ...service,
        isTemplateOnly: false,
        isCustom: true,
      }));

    return [...defaults, ...extras];
  }, [savedServices, templateServices]);

  const createCustomService = useCallback(() => {
    const stamp = Date.now().toString().slice(-5);
    const baseName = `${uiText.newServicePrefix} ${stamp}`;
    const existingNames = new Set(
      allServices.map((service) => String(service.name || "").toLowerCase()),
    );

    let nextName = baseName;
    let attempt = 1;
    while (existingNames.has(nextName.toLowerCase())) {
      attempt += 1;
      nextName = `${baseName} ${attempt}`;
    }

    const quickService = {
      _id: null,
      id: null,
      name: nextName,
      description: "",
      price: "",
      priceMin: 0,
      priceMax: 0,
      addOns: "",
      notes: "",
      unit: "service",
      state: "ALL",
      pricingType: "per_unit",
      materialCost: 0,
      laborCost: 0,
      overheadPercentage: 10,
      profitPercentage: 20,
      isTemplateOnly: false,
      isCustom: true,
    };

    setSavedServices((current) => [quickService, ...current]);
    setDraftByKey((current) => ({
      ...current,
      [makeServiceKey(quickService)]: buildDraft(quickService),
    }));
    setExpandedKey(makeServiceKey(quickService));
    return quickService;
  }, [allServices, uiText.newServicePrefix]);

  useEffect(() => {
    if (!isValidCategory) return;
    if (searchParams?.get("new") !== "1") return;
    if (quickCreateHandledRef.current) return;

    quickCreateHandledRef.current = true;
    createCustomService();

    pushWithTransition(`/services-catalog/${category}`, "replace");
  }, [
    category,
    createCustomService,
    isValidCategory,
    pushWithTransition,
    searchParams,
  ]);

  useEffect(() => {
    if (!statusMessage) return;
    const timeoutId = window.setTimeout(() => {
      setStatusMessage("");
    }, 2200);
    return () => window.clearTimeout(timeoutId);
  }, [statusMessage]);

  useEffect(() => {
    if (!allServices.length) return;
    const allKeys = allServices.map((service) => makeServiceKey(service));
    setManualOrder((current) => {
      const known = current.filter((key) => allKeys.includes(key));
      const missing = allKeys.filter((key) => !known.includes(key));
      const next = [...known, ...missing];
      return current.length === next.length && current.every((key, index) => key === next[index])
        ? current
        : next;
    });
    setFavorites((current) => current.filter((key) => allKeys.includes(key)));
  }, [allServices]);

  const orderedServices = useMemo(() => {
    const orderIndex = new Map(manualOrder.map((key, index) => [key, index]));
    const favoriteSet = new Set(favorites);

    return [...allServices].sort((left, right) => {
      const leftKey = makeServiceKey(left);
      const rightKey = makeServiceKey(right);
      const leftFav = favoriteSet.has(leftKey) ? 1 : 0;
      const rightFav = favoriteSet.has(rightKey) ? 1 : 0;
      if (leftFav !== rightFav) return rightFav - leftFav;

      const leftOrder = orderIndex.get(leftKey) ?? Number.MAX_SAFE_INTEGER;
      const rightOrder = orderIndex.get(rightKey) ?? Number.MAX_SAFE_INTEGER;
      if (leftOrder !== rightOrder) return leftOrder - rightOrder;

      return left.name.localeCompare(right.name);
    });
  }, [allServices, favorites, manualOrder]);

  const visibleServices = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return orderedServices;
    return orderedServices.filter(
      (service) =>
        service.name.toLowerCase().includes(query) ||
        service.description.toLowerCase().includes(query),
    );
  }, [orderedServices, search]);

  useEffect(() => {
    if (!visibleServices.length) {
      setExpandedKey("");
      return;
    }
    if (!expandedKey) {
      setExpandedKey(makeServiceKey(visibleServices[0]));
      return;
    }
    const exists = visibleServices.some(
      (service) => makeServiceKey(service) === expandedKey,
    );
    if (!exists) {
      setExpandedKey(makeServiceKey(visibleServices[0]));
    }
  }, [expandedKey, visibleServices]);

  const setDraftField = useCallback((service, field, value) => {
    const key = makeServiceKey(service);
    setDraftByKey((current) => ({
      ...current,
      [key]: {
        ...(current[key] || buildDraft(service)),
        [field]: value,
      },
    }));
  }, []);

  const getDraft = useCallback(
    (service) => draftByKey[makeServiceKey(service)] || buildDraft(service),
    [draftByKey],
  );

  const toggleFavorite = useCallback((service) => {
    const key = makeServiceKey(service);
    setFavorites((current) =>
      current.includes(key)
        ? current.filter((item) => item !== key)
        : [key, ...current],
    );
  }, []);

  const moveService = useCallback(
    (service, direction) => {
      const key = makeServiceKey(service);
      setManualOrder((current) => {
        const base = current.length
          ? [...current]
          : orderedServices.map((item) => makeServiceKey(item));
        const index = base.indexOf(key);
        if (index < 0) return base;
        const swapWith = direction === "up" ? index - 1 : index + 1;
        if (swapWith < 0 || swapWith >= base.length) return base;
        const next = [...base];
        [next[index], next[swapWith]] = [next[swapWith], next[index]];
        return next;
      });
    },
    [orderedServices],
  );

  const resetDraft = useCallback((service) => {
    const key = makeServiceKey(service);
    setDraftByKey((current) => ({
      ...current,
      [key]: buildDraft(service),
    }));
  }, []);

  const saveService = useCallback(async (service) => {
    const key = makeServiceKey(service);
    const draft = getDraft(service);
    setSavingKey(key);
    setError("");

    const numericPrice = Number(draft.price || 0) || 0;
    const optimisticService = {
      ...service,
      name: draft.name,
      description: draft.description,
      price: numericPrice,
      priceMin: numericPrice,
      priceMax: numericPrice,
      addOns: draft.addOns,
      notes: draft.notes,
      unit: draft.unit,
      state: draft.state,
      pricingType: draft.pricingType,
      materialCost: draft.materialCost,
      laborCost: draft.laborCost,
      overheadPercentage: draft.overheadPercentage,
      profitPercentage: draft.profitPercentage,
      isTemplateOnly: false,
    };

    setSavedServices((current) => {
      const existingIndex = current.findIndex(
        (item) => makeServiceKey(item) === key || item._id === service._id,
      );
      if (existingIndex >= 0) {
        const next = [...current];
        next[existingIndex] = optimisticService;
        return next;
      }
      return [...current, optimisticService];
    });

    try {
      assertSafeText("name", draft.name, 120);
      assertSafeText("description", draft.description, 600);
      assertSafeText("addOns", draft.addOns, 1200);
      assertSafeText("notes", draft.notes, 1200);

      const payload = {
        name: draft.name,
        description: draft.description,
        category,
        unit: draft.unit || "service",
        priceMin: numericPrice,
        priceMax: numericPrice,
        materials: draft.addOns,
        laborNotes: draft.notes,
        state: draft.state || "ALL",
        pricingType: draft.pricingType || "per_unit",
        materialCost: draft.materialCost || 0,
        laborCost: draft.laborCost || 0,
        overheadPercentage: draft.overheadPercentage || 10,
        profitPercentage: draft.profitPercentage || 20,
      };

      const method = service._id ? "PATCH" : "POST";
      const url = service._id
        ? `/api/services-catalog/${service._id}`
        : "/api/services-catalog";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await getJsonOrThrow(res, uiText.errors.save);
      const persisted = normalizeService(result.data);
      setSavedServices((current) => {
        const existingIndex = current.findIndex(
          (item) => makeServiceKey(item) === key || item._id === service._id,
        );
        if (existingIndex >= 0) {
          const next = [...current];
          next[existingIndex] = persisted;
          return next;
        }
        return [...current, persisted];
      });
      setDraftByKey((current) => ({
        ...current,
        [makeServiceKey(persisted)]: buildDraft(persisted),
      }));
      setExpandedKey(makeServiceKey(persisted));
    } catch (err) {
      const maybeUnsafe = String(err?.message || "").includes("Unsafe");
      setError(
        maybeUnsafe
          ? uiText.errors.invalidInput
          : err.message || uiText.errors.saveFallback,
      );
      await fetchServices();
    } finally {
      setSavingKey("");
    }
  }, [category, fetchServices, getDraft, uiText.errors.invalidInput, uiText.errors.save, uiText.errors.saveFallback]);

  const maybeAutosaveService = useCallback(
    (service) => {
      if (!service) return;
      const key = makeServiceKey(service);
      const draft = getDraft(service);
      const isDirty =
        draft.price !== (service.price ? String(service.price) : "") ||
        draft.description !== (service.description || "") ||
        draft.addOns !== (service.addOns || "") ||
        draft.notes !== (service.notes || "");

      if (!isDirty || savingKey === key || deletingKey === key) {
        return;
      }

      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }

      saveTimeoutRef.current = window.setTimeout(() => {
        saveService(service);
      }, 260);
    },
    [deletingKey, getDraft, saveService, savingKey],
  );

  useEffect(() => {
    if (!expandedKey) return;
    const service = visibleServices.find(
      (item) => makeServiceKey(item) === expandedKey,
    );
    if (!service) return;
    maybeAutosaveService(service);

    return () => {
      if (saveTimeoutRef.current) {
        window.clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [draftByKey, expandedKey, maybeAutosaveService, visibleServices]);

  useEffect(() => {
    const onKeyDown = (event) => {
      const activeElement = event.target;
      const isTypingField =
        activeElement instanceof HTMLInputElement ||
        activeElement instanceof HTMLTextAreaElement;

      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        const service = visibleServices.find(
          (item) => makeServiceKey(item) === expandedKey,
        );
        if (service) {
          saveService(service);
        }
        return;
      }

      if (isTypingField) {
        if (event.key === "Escape") {
          const service = visibleServices.find(
            (item) => makeServiceKey(item) === expandedKey,
          );
          if (service) {
            resetDraft(service);
          }
        }
        return;
      }

      if (!visibleServices.length) return;

      const currentIndex = visibleServices.findIndex(
        (item) => makeServiceKey(item) === expandedKey,
      );
      const safeIndex = currentIndex >= 0 ? currentIndex : 0;
      const currentService = visibleServices[safeIndex];

      if (event.shiftKey && event.key === "ArrowUp") {
        event.preventDefault();
        moveService(currentService, "up");
        return;
      }

      if (event.shiftKey && event.key === "ArrowDown") {
        event.preventDefault();
        moveService(currentService, "down");
        return;
      }

      if (event.key === "ArrowUp") {
        event.preventDefault();
        const nextIndex = Math.max(0, safeIndex - 1);
        setExpandedKey(makeServiceKey(visibleServices[nextIndex]));
        return;
      }

      if (event.key === "ArrowDown") {
        event.preventDefault();
        const nextIndex = Math.min(visibleServices.length - 1, safeIndex + 1);
        setExpandedKey(makeServiceKey(visibleServices[nextIndex]));
        return;
      }

      if (event.key === "Enter") {
        event.preventDefault();
        setExpandedKey((current) =>
          current === makeServiceKey(currentService)
            ? ""
            : makeServiceKey(currentService),
        );
        return;
      }

      if (event.key.toLowerCase() === "f") {
        event.preventDefault();
        toggleFavorite(currentService);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [expandedKey, moveService, resetDraft, saveService, toggleFavorite, visibleServices]);

  const deleteService = async (service) => {
    if (!service._id) return;
    const key = makeServiceKey(service);
    setDeletingKey(key);
    setError("");
    const previousServices = savedServices;
    setSavedServices((current) =>
      current.filter((item) => makeServiceKey(item) !== key),
    );
    try {
      const res = await apiFetch(`/api/services-catalog/${service._id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, uiText.errors.delete);
    } catch (err) {
      setSavedServices(previousServices);
      setError(err.message || uiText.errors.deleteFallback);
    } finally {
      setDeletingKey("");
    }
  };

  const duplicateCategoryTemplates = useCallback(() => {
    const templates = DEFAULT_CATEGORY_SERVICES[category] || [];
    if (!templates.length) return;

    const existingNames = new Set(
      allServices.map((service) => String(service.name || "").toLowerCase()),
    );

    const copies = templates.map((template, index) => {
      let attempt = 1;
      let nextName = `${template.name} Copy`;
      while (existingNames.has(nextName.toLowerCase())) {
        attempt += 1;
        nextName = `${template.name} Copy ${attempt}`;
      }
      existingNames.add(nextName.toLowerCase());

      return {
        _id: null,
        id: null,
        name: nextName,
        description: template.description || "",
        price: "",
        priceMin: 0,
        priceMax: 0,
        addOns: template.addOns || "",
        notes: template.notes || "",
        unit: template.unit || "service",
        state: "ALL",
        pricingType: "per_unit",
        materialCost: 0,
        laborCost: 0,
        overheadPercentage: 10,
        profitPercentage: 20,
        isTemplateOnly: false,
        isCustom: true,
        __index: index,
      };
    });

    setSavedServices((current) => [
      ...copies.map(({ __index, ...service }) => service),
      ...current,
    ]);

    setDraftByKey((current) => {
      const next = { ...current };
      copies.forEach(({ __index, ...service }) => {
        next[makeServiceKey(service)] = buildDraft(service);
      });
      return next;
    });

    if (copies[0]) {
      const { __index, ...firstCopy } = copies[0];
      setExpandedKey(makeServiceKey(firstCopy));
    }

    setStatusMessage(`${copies.length} ${uiText.header.duplicateReadySuffix}`);
  }, [allServices, category, uiText.header.duplicateReadySuffix]);

  const exportCategoryData = useCallback(() => {
    const timestamp = new Date().toISOString();
    const payload = {
      category,
      title: categoryMeta?.title || category,
      exportedAt: timestamp,
      services: allServices.map((service) => {
        const draft = getDraft(service);
        const dirty = isDraftDirty(service, draft);
        return {
          name: draft.name,
          description: dirty ? draft.description : service.description,
          addOns: dirty ? draft.addOns : service.addOns,
          notes: dirty ? draft.notes : service.notes,
          price: dirty ? Number(draft.price || 0) || 0 : Number(service.price || 0) || 0,
          unit: service.unit || "service",
          state: service.state || "ALL",
          type: service.isCustom ? "custom" : service.isTemplateOnly ? "template" : "saved",
        };
      }),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = window.URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${category}-catalog-export.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.URL.revokeObjectURL(url);
    setStatusMessage(uiText.header.exportReady);
  }, [allServices, category, categoryMeta?.title, getDraft, uiText.header.exportReady]);

  if (!isValidCategory) {
    return (
      <main
        style={{
          padding: 24,
          fontFamily: "Arial, sans-serif",
          maxWidth: 860,
          margin: "0 auto",
        }}
      >
        <div style={{ color: "#b91c1c", marginBottom: 12 }}>
          {uiText.invalidCategory}
        </div>
        <button
          type="button"
          onClick={() => {
            router.push("/services-catalog");
          }}
          style={{
            padding: "8px 12px",
            borderRadius: 8,
            border: "1px solid #d1d5db",
            background: "white",
            cursor: "pointer",
          }}
        >
          {uiText.back}
        </button>
      </main>
    );
  }

  const favoriteSet = new Set(favorites);
  const unsavedCount = allServices.reduce((count, service) => {
    return isDraftDirty(service, getDraft(service)) ? count + 1 : count;
  }, 0);

  return (
    <main
      className="category-page"
      style={{
        padding: isMobile ? "14px" : "18px 20px 24px",
        fontFamily: "Arial, sans-serif",
        maxWidth: 1280,
        margin: "0 auto",
      }}
    >
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
        <button
          type="button"
          className="crumb-link"
          onClick={() => {
            pushWithTransition("/services-catalog");
          }}
        >
          {uiText.breadcrumbs.catalog}
        </button>
        <span className="crumb-sep">/</span>
        <span className="crumb-current">{categoryMeta.title}</span>
      </nav>

      <button
        type="button"
        onClick={() => {
          pushWithTransition("/services-catalog");
        }}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          border: "none",
          background: "none",
          color: "#64748b",
          cursor: "pointer",
          padding: 0,
          marginBottom: 12,
          fontSize: 13,
          fontWeight: 600,
        }}
      >
        <span style={{ fontSize: 16, lineHeight: 1 }}>‹</span>
        {uiText.back}
      </button>

      <div className="category-header" style={{ marginBottom: 14 }}>
        <div>
          <h1
            style={{
              margin: 0,
              fontSize: isMobile ? 24 : 28,
              lineHeight: 1.1,
              color: "#111827",
            }}
          >
            {categoryMeta.title}
          </h1>
          <p
            style={{
              margin: "6px 0 0",
              fontSize: 13,
              color: "#6b7280",
              lineHeight: 1.4,
              maxWidth: 780,
            }}
          >
            {categoryMeta.description}
          </p>
        </div>

        <div className="category-actions">
          <span className={`unsaved-pill ${unsavedCount > 0 ? "is-dirty" : ""}`}>
            {unsavedCount > 0
              ? `${unsavedCount} ${uiText.header.unsavedCount}`
              : uiText.header.allSaved}
          </span>
          <button
            type="button"
            className="header-action"
            onClick={duplicateCategoryTemplates}
          >
            {uiText.header.duplicateTemplates}
          </button>
          <button
            type="button"
            className="header-action"
            onClick={exportCategoryData}
          >
            {uiText.header.exportCategory}
          </button>
        </div>
      </div>

      {statusMessage ? (
        <div className="status-chip">{statusMessage}</div>
      ) : null}

      {error ? (
        <div
          style={{
            marginBottom: 12,
            border: "1px solid #fecaca",
            background: "#fef2f2",
            color: "#b91c1c",
            borderRadius: 10,
            padding: "10px 12px",
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

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
            padding: "10px 12px",
            borderBottom: "1px solid #eef2f7",
            display: "grid",
            gap: 8,
          }}
        >
          <div
            style={{
              fontSize: 11,
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.08em",
              color: "#475569",
            }}
          >
            {uiText.services}
          </div>

          <div className="services-toolbar">
            <input
              value={search}
              onChange={(event) => {
                setSearch(sanitizeSearchInput(event.target.value, 80));
              }}
              placeholder={uiText.searchPlaceholder}
              maxLength={80}
              style={{
                width: "100%",
                boxSizing: "border-box",
                borderRadius: 9,
                border: "1px solid #d7dee7",
                padding: "8px 10px",
                fontSize: 13,
                background: "white",
              }}
            />
            <button
              type="button"
              className="header-action"
              onClick={() => {
                createCustomService();
              }}
            >
              {uiText.header.addCustomService}
            </button>
          </div>

          <div style={{ fontSize: 11, color: "#64748b" }}>
            {uiText.header.editingOnlyPrefix} {categoryMeta.title}. {uiText.header.editingOnlySuffix}
          </div>
        </div>

        <div style={{ maxHeight: isNarrow ? "none" : "calc(100vh - 260px)", overflowY: "auto" }}>
            {visibleServices.length === 0 ? (
              <div style={{ padding: 14, fontSize: 13, color: "#64748b" }}>
                {uiText.noResults}
              </div>
            ) : (
              visibleServices.map((service, index) => {
                const key = makeServiceKey(service);
                const draft = getDraft(service);
                const expanded = expandedKey === key;
                const isFavorite = favoriteSet.has(key);
                const isSaving = savingKey === key;
                const isDeleting = deletingKey === key;
                const isDirty = isDraftDirty(service, draft);
                const badge = service.isCustom
                  ? uiText.badges.custom
                  : service.isTemplateOnly
                    ? uiText.badges.template
                    : uiText.badges.saved;

                return (
                  <div
                    key={key}
                    style={{
                      borderBottom:
                        index < visibleServices.length - 1
                          ? "1px solid #eef2f7"
                          : "none",
                      background: expanded ? "#fcfdff" : "white",
                    }}
                  >
                    <div
                      style={{
                        display: "grid",
                        gridTemplateColumns: isMobile
                          ? "auto minmax(0, 1fr) auto"
                          : "auto minmax(0, 1fr) 110px auto auto",
                        gap: 8,
                        alignItems: "center",
                        padding: "10px 12px",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => toggleFavorite(service)}
                        title={isFavorite ? uiText.buttons.unfavorite : uiText.buttons.favorite}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: "1px solid #d7dee7",
                          background: isFavorite ? "#fff7cc" : "white",
                          color: isFavorite ? "#b45309" : "#94a3b8",
                          cursor: "pointer",
                          fontSize: 14,
                          lineHeight: 1,
                        }}
                      >
                        {isFavorite ? "★" : "☆"}
                      </button>

                      <button
                        type="button"
                        onClick={() => {
                          setExpandedKey((current) => (current === key ? "" : key));
                          setDraftByKey((current) => ({
                            ...current,
                            [key]: current[key] || buildDraft(service),
                          }));
                        }}
                        style={{
                          border: "none",
                          background: "transparent",
                          textAlign: "left",
                          cursor: "pointer",
                          padding: 0,
                          minWidth: 0,
                        }}
                      >
                        <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginBottom: 2 }}>
                          <span style={{ fontSize: 13, fontWeight: 700, color: "#111827" }}>
                            {service.name}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: service.isTemplateOnly ? "#0f766e" : "#1d4ed8",
                              background: service.isTemplateOnly ? "#ccfbf1" : "#dbeafe",
                              borderRadius: 999,
                              padding: "2px 6px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {badge}
                          </span>
                          <span
                            style={{
                              fontSize: 10,
                              fontWeight: 700,
                              color: isDirty ? "#9a3412" : "#166534",
                              background: isDirty ? "#ffedd5" : "#dcfce7",
                              borderRadius: 999,
                              padding: "2px 6px",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {isDirty ? uiText.unsaved : uiText.synced}
                          </span>
                        </div>
                        <div style={{ fontSize: 12, color: "#6b7280", lineHeight: 1.35 }}>
                          {draft.description || service.description}
                        </div>
                      </button>

                      <input
                        value={draft.price}
                        onChange={(event) => {
                          setDraftField(
                            service,
                            "price",
                            event.target.value.replace(/[^0-9.]/g, ""),
                          );
                        }}
                        placeholder={uiText.placeholders.price}
                        inputMode="decimal"
                        onBlur={() => {
                          maybeAutosaveService(service);
                        }}
                        style={{
                          width: isMobile ? 88 : 110,
                          borderRadius: 8,
                          border: "1px solid #d7dee7",
                          padding: "7px 9px",
                          fontSize: 12,
                          fontWeight: 700,
                          color: draft.price ? "#166534" : "#475569",
                          justifySelf: isMobile ? "start" : "stretch",
                        }}
                      />

                      {!isMobile ? (
                        <div style={{ display: "flex", gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => moveService(service, "up")}
                            title={uiText.buttons.moveUp}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: "1px solid #d7dee7",
                              background: "white",
                              cursor: "pointer",
                            }}
                          >
                            ↑
                          </button>
                          <button
                            type="button"
                            onClick={() => moveService(service, "down")}
                            title={uiText.buttons.moveDown}
                            style={{
                              width: 28,
                              height: 28,
                              borderRadius: 8,
                              border: "1px solid #d7dee7",
                              background: "white",
                              cursor: "pointer",
                            }}
                          >
                            ↓
                          </button>
                        </div>
                      ) : null}

                      <button
                        type="button"
                        onClick={() => {
                          setExpandedKey((current) => (current === key ? "" : key));
                          setDraftByKey((current) => ({
                            ...current,
                            [key]: current[key] || buildDraft(service),
                          }));
                        }}
                        style={{
                          width: 28,
                          height: 28,
                          borderRadius: 8,
                          border: "1px solid #d7dee7",
                          background: "white",
                          cursor: "pointer",
                          color: "#475569",
                        }}
                      >
                        {expanded ? "−" : "+"}
                      </button>
                    </div>

                    {expanded ? (
                      <div
                        style={{
                          padding: "0 12px 12px 48px",
                          display: "grid",
                          gap: 10,
                        }}
                      >
                        {isMobile ? (
                          <div style={{ display: "flex", gap: 6 }}>
                            <button
                              type="button"
                              onClick={() => moveService(service, "up")}
                              title={uiText.buttons.moveUp}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: "1px solid #d7dee7",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              ↑
                            </button>
                            <button
                              type="button"
                              onClick={() => moveService(service, "down")}
                              title={uiText.buttons.moveDown}
                              style={{
                                width: 28,
                                height: 28,
                                borderRadius: 8,
                                border: "1px solid #d7dee7",
                                background: "white",
                                cursor: "pointer",
                              }}
                            >
                              ↓
                            </button>
                          </div>
                        ) : null}

                        <div style={{ display: "grid", gap: 6 }}>
                          <label style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                            {uiText.fields.description}
                          </label>
                          <textarea
                            value={draft.description}
                            onChange={(event) => {
                              setDraftField(
                                service,
                                "description",
                                sanitizeSearchInput(event.target.value, 600),
                              );
                            }}
                            onBlur={() => {
                              maybeAutosaveService(service);
                            }}
                            placeholder={uiText.placeholders.description}
                            style={{
                              borderRadius: 8,
                              border: "1px solid #d7dee7",
                              padding: "8px 9px",
                              fontSize: 12,
                              minHeight: 60,
                              resize: "vertical",
                              width: "100%",
                              boxSizing: "border-box",
                            }}
                          />
                        </div>

                        <div
                          style={{
                            display: "grid",
                            gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr",
                            gap: 10,
                          }}
                        >
                          <div style={{ display: "grid", gap: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                              {uiText.fields.addOns}
                            </label>
                            <textarea
                              value={draft.addOns}
                              onChange={(event) => {
                                setDraftField(
                                  service,
                                  "addOns",
                                  sanitizeSearchInput(event.target.value, 1200),
                                );
                              }}
                              onBlur={() => {
                                maybeAutosaveService(service);
                              }}
                              placeholder={uiText.placeholders.addOns}
                              style={{
                                borderRadius: 8,
                                border: "1px solid #d7dee7",
                                padding: "8px 9px",
                                fontSize: 12,
                                minHeight: 74,
                                resize: "vertical",
                                width: "100%",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>

                          <div style={{ display: "grid", gap: 6 }}>
                            <label style={{ fontSize: 11, fontWeight: 700, color: "#475569" }}>
                              {uiText.fields.notes}
                            </label>
                            <textarea
                              value={draft.notes}
                              onChange={(event) => {
                                setDraftField(
                                  service,
                                  "notes",
                                  sanitizeSearchInput(event.target.value, 1200),
                                );
                              }}
                              onBlur={() => {
                                maybeAutosaveService(service);
                              }}
                              placeholder={uiText.placeholders.notes}
                              style={{
                                borderRadius: 8,
                                border: "1px solid #d7dee7",
                                padding: "8px 9px",
                                fontSize: 12,
                                minHeight: 74,
                                resize: "vertical",
                                width: "100%",
                                boxSizing: "border-box",
                              }}
                            />
                          </div>
                        </div>

                        <div
                          style={{
                            display: "flex",
                            flexWrap: "wrap",
                            gap: 8,
                            alignItems: "center",
                          }}
                        >
                          <button
                            type="button"
                            onClick={() => saveService(service)}
                            disabled={isSaving}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "none",
                              background: "#0f172a",
                              color: "white",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: isSaving ? "wait" : "pointer",
                            }}
                          >
                            {isSaving ? uiText.saving : uiText.buttons.save}
                          </button>
                          <button
                            type="button"
                            onClick={() => resetDraft(service)}
                            style={{
                              padding: "8px 12px",
                              borderRadius: 8,
                              border: "1px solid #d7dee7",
                              background: "white",
                              color: "#334155",
                              fontSize: 12,
                              fontWeight: 700,
                              cursor: "pointer",
                            }}
                          >
                            {uiText.buttons.reset}
                          </button>
                          {service._id ? (
                            <button
                              type="button"
                              onClick={() => deleteService(service)}
                              disabled={isDeleting}
                              style={{
                                padding: "8px 12px",
                                borderRadius: 8,
                                border: "1px solid #fecaca",
                                background: "#fff5f5",
                                color: "#b91c1c",
                                fontSize: 12,
                                fontWeight: 700,
                                cursor: isDeleting ? "wait" : "pointer",
                              }}
                            >
                              {isDeleting ? uiText.deleting : uiText.buttons.delete}
                            </button>
                          ) : null}
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: isDirty ? "#9a3412" : "#166534",
                            }}
                          >
                            {isDirty ? uiText.unsaved : uiText.synced}
                          </div>
                          <div
                            style={{
                              fontSize: 11,
                              fontWeight: 700,
                              color: draft.price ? "#166534" : "#64748b",
                            }}
                          >
                            {draft.price ? formatPrice(draft.price) : uiText.priceUnset}
                          </div>
                        </div>
                      </div>
                    ) : null}
                  </div>
                );
              })
            )}
        </div>
      </section>

      <style jsx>{`
        .category-page {
          animation: page-in 220ms ease;
        }

        .category-header {
          display: flex;
          align-items: flex-start;
          justify-content: space-between;
          gap: 12px;
          flex-wrap: wrap;
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

        .category-actions {
          display: flex;
          align-items: center;
          gap: 8px;
          flex-wrap: wrap;
        }

        .services-toolbar {
          display: grid;
          grid-template-columns: minmax(0, 1fr) auto;
          gap: 8px;
          align-items: center;
        }

        .unsaved-pill {
          border: 1px solid #cbd5e1;
          background: #f8fafc;
          color: #334155;
          border-radius: 999px;
          padding: 7px 10px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.02em;
        }

        .unsaved-pill.is-dirty {
          border-color: #fdba74;
          background: #fff7ed;
          color: #9a3412;
        }

        .header-action {
          border: 1px solid #cbd5e1;
          background: white;
          color: #1e3a8a;
          border-radius: 10px;
          padding: 7px 10px;
          font-size: 12px;
          font-weight: 700;
          cursor: pointer;
          transition: background 0.15s ease;
        }

        .header-action:hover {
          background: #eff6ff;
        }

        .status-chip {
          margin-bottom: 10px;
          display: inline-flex;
          align-items: center;
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 999px;
          padding: 6px 10px;
          font-size: 11px;
          font-weight: 700;
        }

        @media (max-width: 760px) {
          .services-toolbar {
            grid-template-columns: 1fr;
          }
        }

        @keyframes page-in {
          from {
            opacity: 0;
            transform: translateY(6px);
          }
          to {
            opacity: 1;
            transform: translateY(0);
          }
        }
      `}</style>
    </main>
  );
}