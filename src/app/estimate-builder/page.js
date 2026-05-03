"use client";
import {
  closestCenter,
  DndContext,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  arrayMove,
  SortableContext,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import NewEstimateForm from "@/components/NewEstimateForm";
import UniversalShareButton from "@/components/UniversalShareButton";
import { apiFetch, getJsonOrThrow } from "@/lib/client-auth";
import { useCurrentUserAccess } from "@/lib/current-user-client";
import { useStoredUiLanguage } from "@/lib/ui-language";

const UI_I18N = {
  en: {
    title: "Estimate Builder",
    description:
      "Select services from your catalog, set quantities, and generate a price estimate.",
    loadingCatalog: "Loading catalog...",
    loadingEstimates: "Loading saved estimates...",
    saving: "Saving...",
    noServices:
      "No services found in your catalog. Add services in the Services Catalog first.",
    noEstimates: "No saved estimates yet.",
    sections: {
      catalog: "Add services",
      lines: "Line items",
      saved: "Saved estimates",
    },
    table: {
      service: "Service",
      category: "Category",
      unit: "Unit",
      unitPrice: "Catalog range",
      qty: "Qty",
      totalLow: "Total low",
      totalHigh: "Total high",
      totalMid: "Midpoint",
      actions: "Actions",
      costPerUnit: "Cost / unit",
      suggested: "Suggested / unit",
      yourPrice: "Your price / unit",
      lineTotal: "Line total",
    },
    summary: {
      subtotalLow: "Subtotal (low)",
      subtotalHigh: "Subtotal (high)",
      recommended: "Recommended total",
      lines: "line items",
      yourTotal: "Your total",
    },
    estimate: {
      nameLabel: "Estimate name",
      namePlaceholder: "e.g. Smith backyard project",
      notesLabel: "Notes",
      notesPlaceholder: "Optional notes or scope details",
    },
    buttons: {
      addToEstimate: "Add",
      remove: "Remove",
      saveEstimate: "Save estimate",
      saveProgress: "Save progress",
      updateEstimate: "Update estimate",
      newEstimate: "New estimate",
      load: "Load",
      delete: "Delete",
      sendEstimate: "Send Estimate",
      convertToQuote: "Convert to Quote",
      generateInvoice: "Generate Invoice",
      shareEstimate: "Share quote",
      saveOnly: "Save only",
      sending: "Sending\u2026",
      sentSuccess: "Quote created and sent",
      sentSuccessDetail: "Quote {n} sent to client",
      sendError: "Failed to send estimate",
      workflowHint: "Next step: save progress, convert to quote, or generate invoice.",
      invoiceReady: "Invoice generated and linked",
      invoiceError: "Failed to generate invoice",
    },
    filters: {
      search: "Search catalog...",
      category: "Category:",
      allCategories: "All categories",
      saveProgress: "Guardar progreso",
    },
    custom: {
      sectionTitle: "Custom Service",
      addButton: "+ Add Custom Service",
      catalogButton: "From Catalog",
      convertToQuote: "Convertir a cotizacion",
      generateInvoice: "Generar factura",
      namePlaceholder: "Service name",
      descriptionPlaceholder: "Description (optional)",
      pricePlaceholder: "Price / unit",
      unitPlaceholder: "Unit (e.g. hr, sqft)",
      addToEstimate: "Add to Estimate",
      errorName: "Name is required",
      workflowHint: "Siguiente paso: guardar progreso, convertir a cotizacion o generar factura.",
      invoiceReady: "Factura generada y vinculada",
      invoiceError: "No se pudo generar la factura",
      errorPrice: "Price must be a positive number",
      globalSearch: "Search service or add custom...",
      globalSearchHint: 'Press Enter to add "{q}" as a custom item',
      pressEnter: "Enter",
    },
    categories: {
      landscaping: "Landscaping",
      hardscaping: "Hardscaping",
    },
    errors: {
      fetchCatalog: "Unable to load catalog",
      fetchEstimates: "Unable to load saved estimates",
      save: "Unable to save estimate",
      saveProgress: "Zapisz postep",
      delete: "Unable to delete estimate",
      ai: "Unable to generate description",
    },
    ai: {
      sectionTitle: "AI Description",
      convertToQuote: "Konwertuj do oferty",
      generateInvoice: "Generuj fakture",
      inputLabel: "Describe the project",
      inputPlaceholder:
        "e.g. Backyard renovation for the Smith family. Includes paver patio, retaining wall along the back fence, and re-seeding the lawn area...",
      generateButton: "Generate Professional Description",
      generatingButton: "Generating...",
      resultLabel: "Generated description",
      workflowHint: "Nastepny krok: zapisz postep, konwertuj do oferty lub generuj fakture.",
      invoiceReady: "Faktura wygenerowana i polaczona",
      invoiceError: "Nie udalo sie wygenerowac faktury",
      copyButton: "Copy",
      copiedButton: "Copied!",
      hint: "Edit the text below before saving.",
    },
    actions: {
      button: "Actions",
      sendEmail: "Send via Email",
      sendSms: "Send via SMS",
      save: "Save Estimate",
      exportPdf: "Export as PDF",
      emailTitle: "Send estimate by email",
      emailLabel: "Recipient email",
      emailPlaceholder: "client@example.com",
      smsTitle: "Send estimate by SMS",
      smsLabel: "Recipient phone number",
      smsPlaceholder: "+1 555 000 0000",
      saveTitle: "Save this estimate",
      saveConfirm: "Save and update the current estimate.",
      pdfTitle: "Export as PDF",
      pdfConfirm:
        "Your browser print dialog will open. Choose 'Save as PDF' as the destination.",
      send: "Send",
      confirmSave: "Save",
      print: "Open Print Dialog",
      cancel: "Cancel",
      close: "Close",
      sending: "Sending...",
      sent: "Sent!",
      smsComing: "SMS sending is not yet available.",
      needsSave: "Save the estimate first before sending.",
      shareReadyText: "Quote {name} for ${amount} is ready to review.",
      linkCopied: "Link copied",
      copyFailed: "Unable to copy link",
      shareError: "Unable to prepare share link",
      errorSend: "Unable to send",
    },
    client: {
      sectionTitle: "Client",
      selectLabel: "Select a client",
      addButton: "+ Add Client",
      noClients: "No clients yet",
      modalTitle: "New Client",
      nameLabel: "Name",
      namePlaceholder: "Full name",
      companyLabel: "Company (optional)",
      companyPlaceholder: "e.g. Smith Landscaping",
      phoneLabel: "Phone",
      phonePlaceholder: "+1 555 000 0000",
      emailLabel: "Email",
      emailPlaceholder: "client@example.com",
      addressLabel: "Address",
      addressPlaceholder: "123 Main St, City, State",
      saveButton: "Save Client",
      cancel: "Cancel",
      saving: "Saving...",
      errorFetch: "Unable to load clients",
      errorSave: "Unable to save client",
    },
    estimateFormPanel: {
      title: "Estimate form",
      description:
        "Create a new estimate linked to an existing client and job.",
    },
  },
  es: {
    title: "Constructor de Estimados",
    description:
      "Selecciona servicios de tu catalogo, ingresa cantidades y genera un estimado de precio.",
    loadingCatalog: "Cargando catalogo...",
    loadingEstimates: "Cargando estimados guardados...",
    saving: "Guardando...",
    noServices:
      "Sin servicios en tu catalogo. Agrega servicios en el Catalogo de Servicios primero.",
    noEstimates: "Sin estimados guardados aun.",
    sections: {
      catalog: "Agregar servicios",
      lines: "Partidas",
      saved: "Estimados guardados",
    },
    table: {
      service: "Servicio",
      category: "Categoria",
      unit: "Unidad",
      unitPrice: "Rango catalogo",
      qty: "Cant.",
      totalLow: "Total minimo",
      totalHigh: "Total maximo",
      totalMid: "Punto medio",
      actions: "Acciones",
      costPerUnit: "Costo / unidad",
      suggested: "Sugerido / unidad",
      yourPrice: "Tu precio / unidad",
      lineTotal: "Total partida",
    },
    summary: {
      subtotalLow: "Subtotal (minimo)",
      subtotalHigh: "Subtotal (maximo)",
      recommended: "Total recomendado",
      lines: "partidas",
      yourTotal: "Tu total",
    },
    estimate: {
      nameLabel: "Nombre del estimado",
      namePlaceholder: "ej. Proyecto jardin Smith",
      notesLabel: "Notas",
      notesPlaceholder: "Notas opcionales o detalles del alcance",
    },
    buttons: {
      addToEstimate: "Agregar",
      remove: "Eliminar",
      saveEstimate: "Guardar estimado",
      updateEstimate: "Actualizar estimado",
      newEstimate: "Nuevo estimado",
      load: "Cargar",
      delete: "Eliminar",
      sendEstimate: "Enviar estimado",
      shareEstimate: "Compartir cotizacion",
      saveOnly: "Solo guardar",
      sending: "Enviando\u2026",
      sentSuccess: "Cotizaci\u00f3n creada y enviada",
      sentSuccessDetail: "Cotizaci\u00f3n {n} enviada al cliente",
      sendError: "No se pudo enviar el estimado",
    },
    filters: {
      search: "Buscar catalogo...",
      category: "Categoria:",
      allCategories: "Todas las categorias",
    },
    custom: {
      sectionTitle: "Servicio personalizado",
      addButton: "+ Agregar servicio personalizado",
      catalogButton: "Del catalogo",
      namePlaceholder: "Nombre del servicio",
      descriptionPlaceholder: "Descripcion (opcional)",
      pricePlaceholder: "Precio / unidad",
      unitPlaceholder: "Unidad (ej. hr, m2)",
      addToEstimate: "Agregar al estimado",
      errorName: "El nombre es requerido",
      errorPrice: "El precio debe ser un numero positivo",
      globalSearch: "Buscar servicio o agregar personalizado...",
      globalSearchHint:
        'Presiona Enter para agregar "{q}" como item personalizado',
      pressEnter: "Enter",
    },
    categories: {
      landscaping: "Landscaping",
      hardscaping: "Hardscaping",
    },
    errors: {
      fetchCatalog: "No se pudo cargar el catalogo",
      fetchEstimates: "No se pudieron cargar los estimados",
      save: "No se pudo guardar el estimado",
      delete: "No se pudo eliminar el estimado",
      ai: "No se pudo generar la descripcion",
    },
    ai: {
      sectionTitle: "Descripcion con IA",
      inputLabel: "Describe el proyecto",
      inputPlaceholder:
        "ej. Remodelacion del jardin trasero para la familia Garcia. Incluye patio de adoquines, muro de contencion y resembrado del cesped...",
      generateButton: "Generar descripcion profesional",
      generatingButton: "Generando...",
      resultLabel: "Descripcion generada",
      copyButton: "Copiar",
      copiedButton: "Copiado!",
      hint: "Edita el texto antes de guardar.",
    },
    actions: {
      button: "Acciones",
      sendEmail: "Enviar por correo",
      sendSms: "Enviar por SMS",
      save: "Guardar estimado",
      exportPdf: "Exportar como PDF",
      emailTitle: "Enviar estimado por correo",
      emailLabel: "Correo del destinatario",
      emailPlaceholder: "cliente@ejemplo.com",
      smsTitle: "Enviar estimado por SMS",
      smsLabel: "Numero de telefono",
      smsPlaceholder: "+1 555 000 0000",
      saveTitle: "Guardar este estimado",
      saveConfirm: "Guarda y actualiza el estimado actual.",
      pdfTitle: "Exportar como PDF",
      pdfConfirm:
        "Se abrira el dialogo de impresion. Selecciona 'Guardar como PDF'.",
      send: "Enviar",
      confirmSave: "Guardar",
      print: "Abrir dialogo de impresion",
      cancel: "Cancelar",
      close: "Cerrar",
      sending: "Enviando...",
      sent: "Enviado!",
      smsComing: "El envio por SMS no esta disponible aun.",
      needsSave: "Guarda el estimado antes de enviarlo.",
      shareReadyText: "La cotizacion {name} por ${amount} esta lista para revisar.",
      linkCopied: "Enlace copiado",
      copyFailed: "No se pudo copiar el enlace",
      shareError: "No se pudo preparar el enlace para compartir",
      errorSend: "No se pudo enviar",
    },
    client: {
      sectionTitle: "Cliente",
      selectLabel: "Seleccionar cliente",
      addButton: "+ Agregar cliente",
      noClients: "Sin clientes aun",
      modalTitle: "Nuevo cliente",
      nameLabel: "Nombre",
      namePlaceholder: "Nombre completo",
      companyLabel: "Empresa (opcional)",
      companyPlaceholder: "ej. Paisajismo Garcia",
      phoneLabel: "Telefono",
      phonePlaceholder: "+1 555 000 0000",
      emailLabel: "Email",
      emailPlaceholder: "cliente@ejemplo.com",
      addressLabel: "Direccion",
      addressPlaceholder: "Calle 123, Ciudad, Estado",
      saveButton: "Guardar cliente",
      cancel: "Cancelar",
      saving: "Guardando...",
      errorFetch: "No se pudieron cargar los clientes",
      errorSave: "No se pudo guardar el cliente",
    },
    estimateFormPanel: {
      title: "Formulario de estimado",
      description:
        "Crea un nuevo estimado vinculado a un cliente y trabajo existentes.",
    },
  },
  pl: {
    title: "Kalkulator Wyceny",
    description: "Wybierz uslugi z katalogu, podaj ilosci i wygeneruj wycene.",
    loadingCatalog: "Ladowanie katalogu...",
    loadingEstimates: "Ladowanie zapisanych wycen...",
    saving: "Zapisywanie...",
    noServices:
      "Brak uslug w katalogu. Najpierw dodaj uslugi w Katalogu Uslug.",
    noEstimates: "Brak zapisanych wycen.",
    sections: {
      catalog: "Dodaj uslugi",
      lines: "Pozycje",
      saved: "Zapisane wyceny",
    },
    table: {
      service: "Usluga",
      category: "Kategoria",
      unit: "Jednostka",
      unitPrice: "Przedzial katalogu",
      qty: "Ilosc",
      totalLow: "Laczny min",
      totalHigh: "Laczny max",
      totalMid: "Srodkowy",
      actions: "Akcje",
      costPerUnit: "Koszt / jedn.",
      suggested: "Sugerowane / jedn.",
      yourPrice: "Twoja cena / jedn.",
      lineTotal: "Suma pozycji",
    },
    summary: {
      subtotalLow: "Suma (min)",
      subtotalHigh: "Suma (max)",
      recommended: "Rekomendowana laczna",
      lines: "pozycji",
      yourTotal: "Twoj lacznie",
    },
    estimate: {
      nameLabel: "Nazwa wyceny",
      namePlaceholder: "np. Projekt ogrodu Kowalski",
      notesLabel: "Notatki",
      notesPlaceholder: "Opcjonalne notatki lub szczegoly zakresu",
    },
    buttons: {
      addToEstimate: "Dodaj",
      remove: "Usun",
      saveEstimate: "Zapisz wycene",
      updateEstimate: "Aktualizuj wycene",
      newEstimate: "Nowa wycena",
      load: "Zaladuj",
      delete: "Usun",
      sendEstimate: "Wyslij wycene",
      shareEstimate: "Udostepnij oferte",
      saveOnly: "Tylko zapisz",
      sending: "Wysylanie\u2026",
      sentSuccess: "Wycena utworzona i wys\u0142ana",
      sentSuccessDetail: "Wycena {n} wys\u0142ana do klienta",
      sendError: "Nie udalo sie wyslac wyceny",
    },
    filters: {
      search: "Szukaj w katalogu...",
      category: "Kategoria:",
      allCategories: "Wszystkie kategorie",
    },
    custom: {
      sectionTitle: "Usluga wlasna",
      addButton: "+ Dodaj usluge wlasna",
      catalogButton: "Z katalogu",
      namePlaceholder: "Nazwa uslugi",
      descriptionPlaceholder: "Opis (opcjonalnie)",
      pricePlaceholder: "Cena / jedn.",
      unitPlaceholder: "Jednostka (np. godz, m2)",
      addToEstimate: "Dodaj do wyceny",
      errorName: "Nazwa jest wymagana",
      errorPrice: "Cena musi byc liczba dodatnia",
      globalSearch: "Szukaj uslugi lub dodaj wlasna...",
      globalSearchHint: 'Nacisnij Enter aby dodac "{q}" jako pozycje wlasna',
      pressEnter: "Enter",
    },
    categories: {
      landscaping: "Ogrodnictwo",
      hardscaping: "Prace twarde",
    },
    errors: {
      fetchCatalog: "Nie udalo sie zaladowac katalogu",
      fetchEstimates: "Nie udalo sie zaladowac wycen",
      save: "Nie udalo sie zapisac wyceny",
      delete: "Nie udalo sie usunac wyceny",
      ai: "Nie udalo sie wygenerowac opisu",
    },
    ai: {
      sectionTitle: "Opis AI",
      inputLabel: "Opisz projekt",
      inputPlaceholder:
        "np. Renowacja ogrodu dla rodziny Kowalskich. Obejmuje patio z kostek brukowych, mur oporowy i ponowny wysiew trawy...",
      generateButton: "Wygeneruj profesjonalny opis",
      generatingButton: "Generowanie...",
      resultLabel: "Wygenerowany opis",
      copyButton: "Kopiuj",
      copiedButton: "Skopiowano!",
      hint: "Edytuj tekst przed zapisaniem.",
    },
    actions: {
      button: "Akcje",
      sendEmail: "Wyslij emailem",
      sendSms: "Wyslij SMS-em",
      save: "Zapisz wycene",
      exportPdf: "Eksportuj jako PDF",
      emailTitle: "Wyslij wycene emailem",
      emailLabel: "Adres email odbiorcy",
      emailPlaceholder: "klient@przyklad.pl",
      smsTitle: "Wyslij wycene SMS-em",
      smsLabel: "Numer telefonu",
      smsPlaceholder: "+48 500 000 000",
      saveTitle: "Zapisz te wycene",
      saveConfirm: "Zapisz i zaktualizuj biezaca wycene.",
      pdfTitle: "Eksportuj jako PDF",
      pdfConfirm:
        "Zostanie otwarte okno drukowania. Wybierz 'Zapisz jako PDF'.",
      send: "Wyslij",
      confirmSave: "Zapisz",
      print: "Otworz okno drukowania",
      cancel: "Anuluj",
      close: "Zamknij",
      sending: "Wysylanie...",
      sent: "Wyslano!",
      smsComing: "Wysylanie SMS nie jest jeszcze dostepne.",
      needsSave: "Zapisz wycene przed wyslaniem.",
      shareReadyText: "Oferta {name} na kwote ${amount} jest gotowa do przejrzenia.",
      linkCopied: "Link skopiowany",
      copyFailed: "Nie udalo sie skopiowac linku",
      shareError: "Nie udalo sie przygotowac linku do udostepnienia",
      errorSend: "Nie mozna wyslac",
    },
    client: {
      sectionTitle: "Klient",
      selectLabel: "Wybierz klienta",
      addButton: "+ Dodaj klienta",
      noClients: "Brak klientow",
      modalTitle: "Nowy klient",
      nameLabel: "Imie",
      namePlaceholder: "Imie i nazwisko",
      companyLabel: "Firma (opcjonalnie)",
      companyPlaceholder: "np. Ogrodnictwo Kowalski",
      phoneLabel: "Telefon",
      phonePlaceholder: "+48 500 000 000",
      emailLabel: "Email",
      emailPlaceholder: "klient@przyklad.pl",
      addressLabel: "Adres",
      addressPlaceholder: "ul. Glowna 1, Miasto",
      saveButton: "Zapisz klienta",
      cancel: "Anuluj",
      saving: "Zapisywanie...",
      errorFetch: "Nie udalo sie zaladowac klientow",
      errorSave: "Nie udalo sie zapisac klienta",
    },
    estimateFormPanel: {
      title: "Formularz wyceny",
      description:
        "Utworz nowa wycene powiazana z istniejacym klientem i zleceniem.",
    },
  },
};

const INPUT_STYLE = {
  padding: "10px 12px",
  borderRadius: "8px",
  border: "1px solid #ccc",
  width: "100%",
  boxSizing: "border-box",
};

const LOCAL_SEARCH_SERVICES = [
  { id: "svc-mowing", name: "Mowing" },
  { id: "svc-trimming", name: "Trimming" },
  { id: "svc-fertilizing", name: "Fertilizing" },
  { id: "svc-cleanup", name: "Cleanup" },
  { id: "svc-aeration", name: "Aeration" },
  { id: "svc-seeding", name: "Seeding" },
  { id: "svc-sod-installation", name: "Sod Installation" },
  { id: "svc-mulching", name: "Mulching" },
  { id: "svc-tree-removal", name: "Tree Removal" },
  { id: "svc-gutter-cleaning", name: "Gutter Cleaning" },
];

function fmtMoney(value) {
  return Number(value || 0).toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function midpoint(low, high) {
  return (Number(low || 0) + Number(high || 0)) / 2;
}

function toNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function getLineQty(line) {
  // Support both legacy fields and the new fast-search shape.
  return toNumber(line.qty ?? line.quantity);
}

function getLinePrice(line) {
  // Prefer editable price/finalPrice, then suggested fallback.
  return toNumber(line.finalPrice ?? line.price ?? line.suggestedPrice);
}

function calculateLineTotal(line) {
  return getLinePrice(line) * getLineQty(line);
}

function calculateLiveItemsTotal(lines) {
  return lines.reduce((sum, line) => sum + calculateLineTotal(line), 0);
}

// Compute cost-structure fields for a service/line object.
// Falls back to midpoint(priceMin, priceMax) when no cost data is present.
function calcLineFields(source) {
  const mat = Number(source.materialCost) || 0;
  const lab = Number(source.laborCost) || 0;
  const totalCostPerUnit = mat + lab;
  const overhead = Number(source.overheadPercentage) || 0;
  const profit = Number(source.profitPercentage) || 0;
  let suggestedPrice;
  if (totalCostPerUnit > 0) {
    const ovAmt = totalCostPerUnit * (overhead / 100);
    const prAmt = (totalCostPerUnit + ovAmt) * (profit / 100);
    suggestedPrice = totalCostPerUnit + ovAmt + prAmt;
  } else {
    suggestedPrice = midpoint(
      Number(source.priceMin) || 0,
      Number(source.priceMax) || 0,
    );
  }
  return {
    materialCost: mat,
    laborCost: lab,
    totalCostPerUnit,
    overheadPercentage: overhead,
    profitPercentage: profit,
    suggestedPrice,
  };
}

// Ensure a line (from saved estimate or newly added) has all computed fields.
function normalizeLine(line) {
  const fields = calcLineFields(line);
  const suggested =
    line.suggestedPrice !== undefined
      ? Number(line.suggestedPrice)
      : fields.suggestedPrice;
  const final =
    line.finalPrice !== undefined ? Number(line.finalPrice) : suggested;
  return { ...line, ...fields, suggestedPrice: suggested, finalPrice: final };
}

// Wrapper that makes each line card sortable via dnd-kit
// Drag handle icon - 6-dot grid (2 cols x 3 rows)
function DragHandleIcon() {
  return (
    <svg
      width="12"
      height="18"
      viewBox="0 0 12 18"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-hidden="true"
    >
      {[0, 6, 12].map((y) =>
        [0, 6].map((x) => (
          <circle
            key={`${x}-${y}`}
            cx={x + 3}
            cy={y + 3}
            r="1.8"
            fill="#9ca3af"
          />
        )),
      )}
    </svg>
  );
}

// Sortable card wrapper with a dedicated drag handle.
// Only the handle has listeners - inputs inside still work normally.
function DraggableLineItem({ id, children }) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.45 : 1,
        display: "flex",
        alignItems: "stretch",
        border: "1px solid #e5e7eb",
        borderRadius: "12px",
        background: isDragging ? "#f0f9ff" : "#fff",
        overflow: "hidden",
        boxShadow: isDragging ? "0 4px 16px rgba(0,0,0,0.12)" : "none",
      }}
      {...attributes}
    >
      {/* Drag handle - only this element has pointer listeners */}
      <div
        {...listeners}
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "0 10px",
          cursor: "grab",
          borderRight: "1px solid #f3f4f6",
          background: "#fafafa",
          flexShrink: 0,
          touchAction: "none",
        }}
        title="Drag to reorder"
      >
        <DragHandleIcon />
      </div>
      {/* Card content */}
      <div style={{ flex: 1, minWidth: 0 }}>{children}</div>
    </div>
  );
}

export default function EstimateBuilderPage() {
  const [uiLanguage, setLanguage] = useStoredUiLanguage();
  const { capabilities } = useCurrentUserAccess();
  const t = UI_I18N[uiLanguage] || UI_I18N.en;
  const showLegacyBuilder =
    process.env.NEXT_PUBLIC_ENABLE_LEGACY_ESTIMATE_BUILDER === "true";

  const catalog = LOCAL_SEARCH_SERVICES;

  // Line items on current estimate
  const [lines, setLines] = useState([]);

  // Estimate metadata
  const [estimateName, setEstimateName] = useState("");
  const [estimateNotes, setEstimateNotes] = useState("");
  const [estimateDescription, setEstimateDescription] = useState("");

  // Saved estimates
  const [savedEstimates, setSavedEstimates] = useState([]);
  const [savedLoading, setSavedLoading] = useState(false);
  const [savedError, setSavedError] = useState("");

  // Viewport helpers for responsive layout
  const [viewportWidth, setViewportWidth] = useState(1280);
  const isNarrowLayout = viewportWidth < 1140;
  const isMobile = viewportWidth < 760;

  // Global search bar (catalog + custom)
  const [globalSearch, setGlobalSearch] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [activeSearchIndex, setActiveSearchIndex] = useState(-1);

  // Save state
  const [saving, setSaving] = useState(false);
  const [editId, setEditId] = useState(null); // id of currently loaded saved estimate
  const [saveError, setSaveError] = useState("");

  // Send state
  const [sending, setSending] = useState(false);
  const [sendError, setSendError] = useState("");
  const [sendSuccess, setSendSuccess] = useState(false);
  const [sentQuoteNumber, setSentQuoteNumber] = useState("");
  const [workflowSuccess, setWorkflowSuccess] = useState("");
  const [workflowError, setWorkflowError] = useState("");

  // AI description
  const [aiInput, setAiInput] = useState("");
  const [aiDescription, setAiDescription] = useState("");
  const [aiLoading, setAiLoading] = useState(false);
  const [aiError, setAiError] = useState("");
  const [aiCopied, setAiCopied] = useState(false);

  // Actions dropdown + modal
  const actionsRef = useRef(null);
  const sendSuccessTimerRef = useRef(null);
  const modalSuccessTimerRef = useRef(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [actionsModal, setActionsModal] = useState(null); // 'email' | 'sms' | 'save' | 'pdf'
  const [modalEmail, setModalEmail] = useState("");
  const [modalSending, setModalSending] = useState(false);
  const [modalError, setModalError] = useState("");
  const [modalSuccess, setModalSuccess] = useState(false);

  // Clients
  const [clients, setClients] = useState([]);
  const [clientId, setClientId] = useState("");
  const [clientModalOpen, setClientModalOpen] = useState(false);
  const [newClient, setNewClient] = useState({
    name: "",
    companyName: "",
    phone: "",
    email: "",
    address: "",
  });
  const [clientSaving, setClientSaving] = useState(false);
  const [clientError, setClientError] = useState("");

  // Advanced pricing toggle - Set of serviceIds with advanced panel open
  const [advancedLines, setAdvancedLines] = useState(new Set());
  const toggleAdvanced = useCallback((serviceId) => {
    setAdvancedLines((prev) => {
      const next = new Set(prev);
      if (next.has(serviceId)) next.delete(serviceId);
      else next.add(serviceId);
      return next;
    });
  }, []);

  const fetchSaved = useCallback(async () => {
    setSavedLoading(true);
    setSavedError("");
    try {
      const res = await apiFetch("/api/estimate-builder");
      const data = await getJsonOrThrow(res, t.errors.fetchEstimates);
      setSavedEstimates(Array.isArray(data) ? data : []);
    } catch (err) {
      setSavedError(err.message || t.errors.fetchEstimates);
    } finally {
      setSavedLoading(false);
    }
  }, [t.errors.fetchEstimates]);

  const fetchClients = useCallback(async () => {
    try {
      const res = await apiFetch("/api/clients");
      const data = await getJsonOrThrow(res, t.client.errorFetch);
      setClients(Array.isArray(data) ? data : []);
    } catch (_err) {
      // clients are optional - silently ignore fetch errors
    }
  }, [t.client.errorFetch]);

  useEffect(() => {
    const updateViewport = () => setViewportWidth(window.innerWidth || 1280);
    updateViewport();
    window.addEventListener("resize", updateViewport);
    return () => window.removeEventListener("resize", updateViewport);
  }, []);

  useEffect(() => {
    fetchSaved();
    fetchClients();
  }, [fetchSaved, fetchClients]);

  // Close actions dropdown on outside click
  useEffect(() => {
    if (!actionsOpen) return;
    const onMouseDown = (e) => {
      if (actionsRef.current && !actionsRef.current.contains(e.target)) {
        setActionsOpen(false);
      }
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [actionsOpen]);

  // Catalog results for the global search bar (top 8 matches)
  const globalSearchResults = useMemo(() => {
    const q = globalSearch.trim().toLowerCase();
    if (!q) return [];
    return catalog.filter((s) => s.name?.toLowerCase().includes(q)).slice(0, 8);
  }, [globalSearch, catalog]);

  useEffect(() => {
    if (!searchFocused) {
      setActiveSearchIndex(-1);
      return;
    }
    if (globalSearchResults.length === 0) {
      setActiveSearchIndex(-1);
      return;
    }
    setActiveSearchIndex((prev) =>
      prev < 0 || prev >= globalSearchResults.length ? 0 : prev,
    );
  }, [globalSearchResults, searchFocused]);

  // True when the query doesn't match anything in the catalog
  const globalSearchIsCustom =
    globalSearch.trim().length > 0 && globalSearchResults.length === 0;

  const addSearchLine = (name, source = "catalog") => {
    const lineId = `line-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    setLines((prev) => [
      ...prev,
      {
        id: lineId,
        serviceId: lineId,
        name,
        category: source === "custom" ? "Custom" : "Search",
        unit: "unit",
        pricingType: "per_unit",
        priceMin: 0,
        priceMax: 0,
        materialCost: 0,
        laborCost: 0,
        totalCostPerUnit: 0,
        overheadPercentage: 0,
        profitPercentage: 0,
        suggestedPrice: 0,
        finalPrice: 0,
        qty: 1,
        quantity: 1,
        price: 0,
        isCustom: source === "custom",
      },
    ]);
  };

  const removeLine = (serviceId) => {
    setLines((prev) => prev.filter((l) => l.serviceId !== serviceId));
  };

  // Called when user presses Enter in the global search bar.
  // If there's an exact/partial catalog match -> add selected/first result.
  // Otherwise -> add as a custom line with price 0 (editable inline).
  const handleGlobalSearchEnter = () => {
    const q = globalSearch.trim();
    if (!q) return;
    if (globalSearchResults.length > 0) {
      const selectedIndex =
        activeSearchIndex >= 0 && activeSearchIndex < globalSearchResults.length
          ? activeSearchIndex
          : 0;
      addSearchLine(globalSearchResults[selectedIndex].name, "catalog");
    } else {
      addSearchLine(q, "custom");
    }
    setGlobalSearch("");
    setSearchFocused(false);
    setActiveSearchIndex(-1);
  };

  const updateQty = (serviceId, raw) => {
    setLines((prev) =>
      prev.map((l) =>
        l.serviceId === serviceId ? { ...l, qty: raw, quantity: raw } : l,
      ),
    );
  };

  const updateFinalPrice = (serviceId, raw) => {
    setLines((prev) =>
      prev.map((l) =>
        l.serviceId === serviceId ? { ...l, finalPrice: raw, price: raw } : l,
      ),
    );
  };

  // Drag-and-drop sensors (pointer = desktop+mobile, touch = mobile fallback)
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 200, tolerance: 5 },
    }),
  );

  const handleDragEnd = useCallback(({ active, over }) => {
    if (!over || active.id === over.id) return;
    setLines((prev) => {
      const oldIndex = prev.findIndex((l) => l.serviceId === active.id);
      const newIndex = prev.findIndex((l) => l.serviceId === over.id);
      return arrayMove(prev, oldIndex, newIndex);
    });
  }, []);

  // Totals
  const totals = useMemo(() => {
    let low = 0;
    let high = 0;
    for (const l of lines) {
      const q = getLineQty(l);
      low += l.priceMin * q;
      high += l.priceMax * q;
    }
    const final = calculateLiveItemsTotal(lines);
    return { low, high, mid: midpoint(low, high), final };
  }, [lines]);

  // Save / update
  const saveEstimate = async (options = {}) => {
    setSaving(true);
    setSaveError("");
    try {
      const payload = {
        name: estimateName.trim() || "Untitled estimate",
        notes: estimateNotes,
        lines,
        totalLow: totals.low,
        totalHigh: totals.high,
        totalMid: totals.mid,
        totalFinal: totals.final,
        description: estimateDescription,
        clientId: clientId || null,
        ...(options.removeQuoteSignature ? { removeQuoteSignature: true } : {}),
      };

      const method = editId ? "PATCH" : "POST";
      const url = editId
        ? `/api/estimate-builder/${editId}`
        : "/api/estimate-builder";

      const res = await apiFetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const result = await getJsonOrThrow(res, t.errors.save);

      if (editId) {
        setSavedEstimates(
          savedEstimates.map((e) => (e._id === editId ? result.data : e)),
        );
      } else {
        setSavedEstimates([result.data, ...savedEstimates]);
        setEditId(result.data._id);
      }
      // Return the saved id so callers can chain send
      return result.data._id;
    } catch (err) {
      if (
        !options.removeQuoteSignature &&
        String(err?.message || "").toLowerCase().includes("signed and locked") &&
        typeof window !== "undefined" &&
        window.confirm(
          "This quote is signed and locked. Remove the signature lock and continue editing?",
        )
      ) {
        return saveEstimate({ removeQuoteSignature: true });
      }
      setSaveError(err.message || t.errors.save);
      throw err;
    } finally {
      setSaving(false);
    }
  };

  // Save then promote to a Quote and send in one click
  const handleSaveAndSend = async () => {
    setSendError("");
    setSendSuccess(false);
    setWorkflowError("");
    setWorkflowSuccess("");
    setSentQuoteNumber("");
    setSending(true);
    try {
      // Step 1: save (create or update)
      const savedId = await saveEstimate();

      // Step 2: promote estimate -> Quote + send email
      const res = await apiFetch(`/api/estimate-builder/${savedId}/promote`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await getJsonOrThrow(res, t.buttons.sendError);
      setSentQuoteNumber(data.quote?.quoteNumber || "");
      setSendSuccess(true);
      if (sendSuccessTimerRef.current)
        clearTimeout(sendSuccessTimerRef.current);
      sendSuccessTimerRef.current = setTimeout(() => {
        setSendSuccess(false);
        setSentQuoteNumber("");
      }, 1500);
    } catch (err) {
      setSendError(err.message || t.buttons.sendError);
    } finally {
      setSending(false);
    }
  };

  const handleGenerateInvoice = async () => {
    setWorkflowError("");
    setWorkflowSuccess("");
    setSendError("");
    setSending(true);
    try {
      const savedId = editId || (await saveEstimate());
      const res = await apiFetch(`/api/estimate-builder/${savedId}/share-link`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ensureInvoice: true }),
      });
      await getJsonOrThrow(res, t.buttons.invoiceError);
      setWorkflowSuccess(t.buttons.invoiceReady);
    } catch (err) {
      setWorkflowError(err.message || t.buttons.invoiceError);
    } finally {
      setSending(false);
    }
  };

  const loadEstimate = (est) => {
    setLines((est.lines || []).map(normalizeLine));
    setEstimateName(est.name || "");
    setEstimateNotes(est.notes || "");
    setEstimateDescription(est.description || "");
    setAiDescription(est.description || "");
    setAiInput("");
    setClientId(est.clientId || "");
    setEditId(est._id);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const resetEstimate = () => {
    setLines([]);
    setEstimateName("");
    setEstimateNotes("");
    setEstimateDescription("");
    setAiInput("");
    setAiDescription("");
    setAiError("");
    setClientId("");
    setNewClient({
      name: "",
      companyName: "",
      phone: "",
      email: "",
      address: "",
    });
    setClientModalOpen(false);
    setClientError("");
    setEditId(null);
    setSaveError("");
  };

  const deleteEstimate = async (id) => {
    try {
      const res = await apiFetch(`/api/estimate-builder/${id}`, {
        method: "DELETE",
      });
      await getJsonOrThrow(res, t.errors.delete);
      setSavedEstimates(savedEstimates.filter((e) => e._id !== id));
      if (editId === id) resetEstimate();
    } catch (err) {
      setSavedError(err.message || t.errors.delete);
    }
  };

  const categoryLabel = (slug) => t.categories[slug] || String(slug || "");

  const openActionsModal = (type) => {
    setActionsOpen(false);
    setActionsModal(type);
    setModalError("");
    setModalSuccess(false);
    setModalSending(false);
    setModalEmail("");
  };

  const closeActionsModal = useCallback(() => {
    setActionsModal(null);
    setModalEmail("");
    setModalError("");
    setModalSuccess(false);
    setModalSending(false);
  }, []);

  // Close actions modal on Escape
  useEffect(() => {
    if (!actionsModal) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeActionsModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [actionsModal, closeActionsModal]);

  const closeClientModal = useCallback(() => {
    setClientModalOpen(false);
    setNewClient({
      name: "",
      companyName: "",
      phone: "",
      email: "",
      address: "",
    });
    setClientError("");
    setClientSaving(false);
  }, []);

  // Close client modal on Escape
  useEffect(() => {
    if (!clientModalOpen) return;
    const onKeyDown = (e) => {
      if (e.key === "Escape") closeClientModal();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [clientModalOpen, closeClientModal]);

  const handleEmailSend = async () => {
    setModalSending(true);
    setModalError("");
    try {
      const res = await apiFetch(`/api/estimate-builder/${editId}/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ method: "email", to: modalEmail }),
      });
      await getJsonOrThrow(res, t.actions.errorSend);
      setModalSuccess(true);
      if (modalSuccessTimerRef.current)
        clearTimeout(modalSuccessTimerRef.current);
      modalSuccessTimerRef.current = setTimeout(
        () => closeActionsModal(),
        1500,
      );
    } catch (err) {
      setModalError(err.message || t.actions.errorSend);
    } finally {
      setModalSending(false);
    }
  };

  const handleSaveNow = async () => {
    closeActionsModal();
    await saveEstimate();
  };

  const handleExportPdf = () => {
    closeActionsModal();
    window.print();
  };

  const resolveEstimateShareData = useCallback(async () => {
    const estimateId = editId || (await saveEstimate());
    const res = await apiFetch(`/api/estimate-builder/${estimateId}/share-link`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({}),
    });
    const result = await getJsonOrThrow(res, t.actions.shareError);
    const quoteUrl = result?.data?.quoteUrl;
    if (!quoteUrl) {
      throw new Error(t.actions.shareError);
    }

    return {
      title: estimateName.trim() || t.buttons.sendEstimate,
      text: t.actions.shareReadyText
        .replace("{name}", estimateName.trim() || t.buttons.sendEstimate)
        .replace("{amount}", fmtMoney(totals.final)),
      url: quoteUrl,
    };
  }, [editId, estimateName, saveEstimate, t.actions, t.buttons.sendEstimate, totals.final]);

  const saveClient = async () => {
    if (!newClient.name.trim()) return;
    setClientSaving(true);
    setClientError("");
    try {
      const res = await apiFetch("/api/clients", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: newClient.name.trim(),
          companyName: newClient.companyName.trim(),
          phone: newClient.phone.trim(),
          email: newClient.email.trim(),
          address: newClient.address.trim(),
        }),
      });
      const data = await getJsonOrThrow(res, t.client.errorSave);
      setClients((prev) => [data.data, ...prev]);
      setClientId(data.data._id);
      closeClientModal();
    } catch (err) {
      setClientError(err.message || t.client.errorSave);
    } finally {
      setClientSaving(false);
    }
  };

  const generateDescription = async () => {
    setAiLoading(true);
    setAiError("");
    try {
      const res = await apiFetch("/api/generate-description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ input: aiInput }),
      });
      const data = await getJsonOrThrow(res, t.errors.ai);
      const desc = data.data?.description || "";
      setAiDescription(desc);
      setEstimateDescription(desc);
    } catch (err) {
      setAiError(err.message || t.errors.ai);
    } finally {
      setAiLoading(false);
    }
  };

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "#f4f5f7",
        fontFamily: "'Inter', system-ui, sans-serif",
      }}
    >
      {/* Page top bar */}
      <div
        style={{
          background: "white",
          borderBottom: "1px solid #e5e7eb",
          padding: isMobile ? "10px 12px" : "0 24px",
          minHeight: 60,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
          flexWrap: isMobile ? "wrap" : "nowrap",
          position: "sticky",
          top: 0,
          zIndex: 20,
          boxShadow: "0 1px 0 rgba(0,0,0,0.04)",
        }}
      >
        <h1
          style={{
            margin: 0,
            fontSize: isMobile ? 16 : 18,
            fontWeight: 700,
            color: "#0f172a",
            letterSpacing: "-0.4px",
          }}
        >
          {t.title}
        </h1>

        <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
            {["en", "es", "pl"].map((lang) => {
              const flag = lang === "en" ? "🇺🇸" : lang === "es" ? "🇲🇽" : "🇵🇱";
              return (
                <button
                  key={lang}
                  type="button"
                  onClick={() => setLanguage(lang)}
                  title={lang.toUpperCase()}
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "999px",
                    border:
                      uiLanguage === lang
                        ? "1px solid #2563eb"
                        : "1px solid #e5e7eb",
                    background: "#fff",
                    cursor: "pointer",
                    fontSize: "12px",
                    fontWeight: 700,
                    color: uiLanguage === lang ? "#1d4ed8" : "#64748b",
                    opacity: uiLanguage === lang ? 1 : 0.65,
                  }}
                >
                  {flag}
                </button>
              );
            })}
          </div>

          {/* Actions dropdown */}
          <div
            ref={actionsRef}
            style={{ position: "relative", flexShrink: 0, marginTop: "6px" }}
          >
            <button
              type="button"
              onClick={() => setActionsOpen((v) => !v)}
              style={{
                padding: "10px 18px",
                borderRadius: "8px",
                border: "1px solid #e5e7eb",
                background: "#fff",
                cursor: "pointer",
                fontSize: "14px",
                fontWeight: 600,
                display: "flex",
                alignItems: "center",
                gap: "6px",
                boxShadow: "0 1px 3px rgba(0,0,0,0.08)",
                whiteSpace: "nowrap",
              }}
            >
              {t.actions.button}
              <span style={{ fontSize: "10px", opacity: 0.6 }}>v</span>
            </button>

            {actionsOpen && (
              <div
                style={{
                  position: "absolute",
                  right: 0,
                  top: "calc(100% + 6px)",
                  background: "#fff",
                  border: "1px solid #e5e7eb",
                  borderRadius: "10px",
                  boxShadow: "0 4px 16px rgba(0,0,0,0.12)",
                  minWidth: "200px",
                  zIndex: 100,
                  overflow: "hidden",
                }}
              >
                {[
                  { key: "email", label: t.actions.sendEmail },
                  { key: "sms", label: t.actions.sendSms },
                  { key: "save", label: t.actions.save },
                  { key: "pdf", label: t.actions.exportPdf },
                ].map((item, idx, arr) => (
                  <button
                    key={item.key}
                    type="button"
                    onClick={() => openActionsModal(item.key)}
                    style={{
                      width: "100%",
                      textAlign: "left",
                      padding: "11px 16px",
                      border: "none",
                      borderBottom:
                        idx < arr.length - 1 ? "1px solid #f3f4f6" : "none",
                      background: "transparent",
                      cursor: "pointer",
                      fontSize: "14px",
                      display: "flex",
                      alignItems: "center",
                      gap: "10px",
                      color: "#111",
                    }}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <div
        style={{
          padding: isMobile ? "12px 12px 0" : "16px 24px 0",
        }}
      >
        <div className="cf-panel" style={{ padding: isMobile ? 12 : 16 }}>
          <NewEstimateForm onCreated={() => fetchSaved()} />
        </div>
      </div>

      {showLegacyBuilder
        ? <div
            style={{
              display: "grid",
              gridTemplateColumns: isNarrowLayout ? "1fr" : "1fr 320px",
              gap: isNarrowLayout ? "16px" : "20px",
              alignItems: "start",
              padding: isMobile ? "12px 12px 28px" : "24px 24px 48px",
            }}
          >
            {/* CENTER - Line items + AI */}
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: isMobile ? "12px" : "16px",
              }}
            >
              {/* Estimate metadata - hidden, state managed here */}
              <section
                style={{
                  display: "none",
                  visibility: "hidden",
                  position: "absolute",
                }}
              >
                <div style={{ display: "grid", gap: "12px" }}>
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns: "1fr 1fr",
                      gap: "12px",
                    }}
                  >
                    <div>
                      <label
                        htmlFor="estimate-name"
                        style={{
                          display: "block",
                          fontSize: "12px",
                          color: "#555",
                          marginBottom: "4px",
                        }}
                      >
                        {t.estimate.nameLabel}
                      </label>
                      <input
                        id="estimate-name"
                        placeholder={t.estimate.namePlaceholder}
                        value={estimateName}
                        onChange={(e) => setEstimateName(e.target.value)}
                        style={INPUT_STYLE}
                      />
                    </div>
                    <div>
                      <label
                        htmlFor="estimate-notes"
                        style={{
                          display: "block",
                          fontSize: "12px",
                          color: "#555",
                          marginBottom: "4px",
                        }}
                      >
                        {t.estimate.notesLabel}
                      </label>
                      <input
                        id="estimate-notes"
                        placeholder={t.estimate.notesPlaceholder}
                        value={estimateNotes}
                        onChange={(e) => setEstimateNotes(e.target.value)}
                        style={INPUT_STYLE}
                      />
                    </div>
                  </div>

                  {/* Client selector */}
                  <div
                    style={{
                      display: "flex",
                      gap: "10px",
                      alignItems: "flex-end",
                    }}
                  >
                    <div style={{ flex: 1 }}>
                      <label
                        htmlFor="estimate-client"
                        style={{
                          display: "block",
                          fontSize: "12px",
                          color: "#555",
                          marginBottom: "4px",
                        }}
                      >
                        {t.client.sectionTitle}
                      </label>
                      <select
                        id="estimate-client"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        style={{ ...INPUT_STYLE, background: "white" }}
                      >
                        <option value="">{t.client.selectLabel}</option>
                        {clients.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                            {c.companyName ? ` \u2014 ${c.companyName}` : ""}
                          </option>
                        ))}
                      </select>
                    </div>
                    <button
                      type="button"
                      onClick={() => setClientModalOpen(true)}
                      style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        border: "1px solid #e5e7eb",
                        background: "#fff",
                        cursor: "pointer",
                        fontSize: "13px",
                        fontWeight: 600,
                        whiteSpace: "nowrap",
                        flexShrink: 0,
                      }}
                    >
                      {t.client.addButton}
                    </button>
                  </div>
                </div>
                <div
                  style={{
                    marginTop: "12px",
                    display: "flex",
                    gap: "10px",
                    flexWrap: "wrap",
                  }}
                >
                  {/* Primary: Save + Send */}
                  <button
                    type="button"
                    onClick={handleSaveAndSend}
                    disabled={
                      sending ||
                      saving ||
                      lines.length === 0 ||
                      !estimateName.trim() ||
                      !clientId
                    }
                    style={{
                      padding: "10px 20px",
                      borderRadius: "8px",
                      border: "none",
                      background:
                        sending ||
                        saving ||
                        lines.length === 0 ||
                        !estimateName.trim() ||
                        !clientId
                          ? "#bbb"
                          : "#0b69ff",
                      color: "white",
                      cursor:
                        sending ||
                        saving ||
                        lines.length === 0 ||
                        !estimateName.trim() ||
                        !clientId
                          ? "default"
                          : "pointer",
                      fontWeight: 600,
                      fontSize: "14px",
                    }}
                  >
                    {sending ? t.buttons.sending : t.buttons.sendEstimate}
                  </button>
                  {/* Secondary: Save without sending */}
                  <button
                    type="button"
                    onClick={saveEstimate}
                    disabled={
                      saving ||
                      sending ||
                      lines.length === 0 ||
                      !estimateName.trim() ||
                      !clientId
                    }
                    style={{
                      padding: "10px 18px",
                      borderRadius: "8px",
                      border: "1px solid #ccc",
                      background: "white",
                      cursor:
                        saving ||
                        sending ||
                        lines.length === 0 ||
                        !estimateName.trim() ||
                        !clientId
                          ? "default"
                          : "pointer",
                      fontWeight: 600,
                      fontSize: "14px",
                      color:
                        saving ||
                        sending ||
                        lines.length === 0 ||
                        !estimateName.trim() ||
                        !clientId
                          ? "#aaa"
                          : "#374151",
                    }}
                  >
                    {saving ? t.saving : t.buttons.saveOnly}
                  </button>
                  {capabilities.canSendExternalCommunications ? (
                    <UniversalShareButton
                      label={t.buttons.shareEstimate}
                      copiedLabel={t.actions.linkCopied}
                      copyFailedLabel={t.actions.copyFailed}
                      resolveShareData={resolveEstimateShareData}
                      disabled={
                        saving ||
                        sending ||
                        lines.length === 0 ||
                        !estimateName.trim() ||
                        !clientId
                      }
                      style={{
                        padding: "10px 18px",
                        minHeight: 0,
                        fontSize: "14px",
                        fontWeight: 600,
                        borderRadius: "8px",
                        whiteSpace: "nowrap",
                      }}
                    />
                  ) : null}
                  {editId && (
                    <button
                      type="button"
                      onClick={resetEstimate}
                      style={{
                        padding: "10px 18px",
                        borderRadius: "8px",
                        border: "1px solid #ccc",
                        background: "white",
                        cursor: "pointer",
                        fontSize: "14px",
                      }}
                    >
                      {t.buttons.newEstimate}
                    </button>
                  )}
                </div>
                {sendSuccess && (
                  <p
                    style={{
                      color: "#16a34a",
                      margin: "10px 0 0 0",
                      fontSize: "14px",
                      fontWeight: 600,
                    }}
                  >
                    {sentQuoteNumber
                      ? t.buttons.sentSuccessDetail.replace(
                          "{n}",
                          sentQuoteNumber,
                        )
                      : t.buttons.sentSuccess}
                  </p>
                )}
                {sendError && (
                  <p
                    style={{
                      color: "#b00020",
                      margin: "10px 0 0 0",
                      fontSize: "14px",
                    }}
                  >
                    {sendError}
                  </p>
                )}
                {saveError && !sendError && (
                  <p
                    style={{
                      color: "#b00020",
                      margin: "10px 0 0 0",
                      fontSize: "14px",
                    }}
                  >
                    {saveError}
                  </p>
                )}
              </section>

              {/* AI Description Generator */}
              <section
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  background: "#fff",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                  }}
                >
                  <span style={{ fontSize: 14 }}>*</span>
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#64748b",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t.ai.sectionTitle}
                  </h2>
                </div>
                <div style={{ padding: "16px 20px 20px" }}>
                  <label
                    htmlFor="ai-input"
                    style={{
                      fontSize: "12px",
                      color: "#555",
                      display: "block",
                      marginBottom: "6px",
                      fontWeight: 600,
                    }}
                  >
                    {t.ai.inputLabel}
                  </label>
                  <textarea
                    id="ai-input"
                    value={aiInput}
                    onChange={(e) => setAiInput(e.target.value)}
                    placeholder={t.ai.inputPlaceholder}
                    style={{
                      ...INPUT_STYLE,
                      minHeight: "80px",
                      resize: "vertical",
                      width: "100%",
                      boxSizing: "border-box",
                    }}
                  />
                  <button
                    type="button"
                    onClick={generateDescription}
                    disabled={aiLoading || !aiInput.trim()}
                    style={{
                      marginTop: "10px",
                      padding: "9px 18px",
                      background:
                        aiLoading || !aiInput.trim() ? "#e5e7eb" : "#7c3aed",
                      color: aiLoading || !aiInput.trim() ? "#999" : "#fff",
                      border: "none",
                      borderRadius: "8px",
                      fontSize: "14px",
                      fontWeight: 600,
                      cursor:
                        aiLoading || !aiInput.trim()
                          ? "not-allowed"
                          : "pointer",
                    }}
                  >
                    {aiLoading ? t.ai.generatingButton : t.ai.generateButton}
                  </button>
                  {aiError && (
                    <p
                      style={{
                        color: "#b00020",
                        fontSize: "13px",
                        marginTop: "8px",
                      }}
                    >
                      {aiError}
                    </p>
                  )}
                  {aiDescription && (
                    <div style={{ marginTop: "14px" }}>
                      <label
                        htmlFor="ai-result"
                        style={{
                          fontSize: "12px",
                          color: "#555",
                          display: "block",
                          marginBottom: "6px",
                          fontWeight: 600,
                        }}
                      >
                        {t.ai.resultLabel}
                      </label>
                      <textarea
                        id="ai-result"
                        value={aiDescription}
                        onChange={(e) => {
                          setAiDescription(e.target.value);
                          setEstimateDescription(e.target.value);
                        }}
                        style={{
                          ...INPUT_STYLE,
                          minHeight: "120px",
                          resize: "vertical",
                          width: "100%",
                          boxSizing: "border-box",
                          background: "#f9fafb",
                          borderColor: "#7c3aed",
                        }}
                      />
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: "10px",
                          marginTop: "8px",
                        }}
                      >
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(aiDescription);
                            setAiCopied(true);
                            setTimeout(() => setAiCopied(false), 2000);
                          }}
                          style={{
                            padding: "6px 14px",
                            background: aiCopied ? "#16a34a" : "#f3f4f6",
                            color: aiCopied ? "#fff" : "#333",
                            border: "1px solid #e5e7eb",
                            borderRadius: "6px",
                            fontSize: "13px",
                            cursor: "pointer",
                            fontFamily: "inherit",
                          }}
                        >
                          {aiCopied ? t.ai.copiedButton : t.ai.copyButton}
                        </button>
                        <span style={{ fontSize: "12px", color: "#94a3b8" }}>
                          {t.ai.hint}
                        </span>
                      </div>
                    </div>
                  )}
                </div>
              </section>

              {/* Global search bar */}
              <section
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  background: "#fff",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)",
                  padding: isMobile ? "10px" : "14px",
                  position: "relative",
                }}
              >
                <input
                  placeholder={t.custom.globalSearch}
                  value={globalSearch}
                  onChange={(e) => {
                    setGlobalSearch(e.target.value);
                    setActiveSearchIndex(0);
                  }}
                  onFocus={() => {
                    setSearchFocused(true);
                    if (globalSearchResults.length > 0) setActiveSearchIndex(0);
                  }}
                  onBlur={() => setTimeout(() => setSearchFocused(false), 120)}
                  onKeyDown={(e) => {
                    if (e.key === "ArrowDown") {
                      e.preventDefault();
                      if (!searchFocused) setSearchFocused(true);
                      if (globalSearchResults.length > 0) {
                        setActiveSearchIndex((prev) =>
                          prev < globalSearchResults.length - 1 ? prev + 1 : 0,
                        );
                      }
                      return;
                    }
                    if (e.key === "ArrowUp") {
                      e.preventDefault();
                      if (globalSearchResults.length > 0) {
                        setActiveSearchIndex((prev) =>
                          prev > 0 ? prev - 1 : globalSearchResults.length - 1,
                        );
                      }
                      return;
                    }
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleGlobalSearchEnter();
                    }
                  }}
                  style={{
                    ...INPUT_STYLE,
                    width: "100%",
                    boxSizing: "border-box",
                    fontSize: "14px",
                    borderRadius: "10px",
                    background: "#0f172a",
                    border: "1px solid #334155",
                    color: "#e2e8f0",
                  }}
                />

                {searchFocused && globalSearchResults.length > 0 && (
                  <div
                    style={{
                      position: "absolute",
                      left: isMobile ? "10px" : "14px",
                      right: isMobile ? "10px" : "14px",
                      top: "calc(100% - 2px)",
                      background: "#0b1220",
                      border: "1px solid #334155",
                      borderRadius: "10px",
                      boxShadow: "0 14px 32px rgba(2,6,23,0.7)",
                      maxHeight: isMobile ? "220px" : "280px",
                      overflowY: "auto",
                      zIndex: 9999,
                    }}
                  >
                    {globalSearchResults.map((service, index) => (
                      <button
                        key={service.id}
                        type="button"
                        onMouseDown={(e) => {
                          e.preventDefault();
                          addSearchLine(service.name, "catalog");
                          setGlobalSearch("");
                          setSearchFocused(false);
                          setActiveSearchIndex(-1);
                        }}
                        style={{
                          width: "100%",
                          border: "none",
                          background:
                            index === activeSearchIndex
                              ? "rgba(30,41,59,0.9)"
                              : "transparent",
                          textAlign: "left",
                          padding: "10px 12px",
                          cursor: "pointer",
                          borderBottom: "1px solid #1e293b",
                        }}
                      >
                        <div
                          style={{
                            fontSize: "13px",
                            fontWeight: 600,
                            color: "#e2e8f0",
                          }}
                        >
                          {service.name}
                        </div>
                        <div
                          style={{
                            fontSize: "11px",
                            color: "#94a3b8",
                            marginTop: "2px",
                          }}
                        >
                          Quick add
                        </div>
                      </button>
                    ))}
                  </div>
                )}

                {globalSearchIsCustom && (
                  <p
                    style={{
                      margin: "8px 2px 0",
                      fontSize: "12px",
                      color: "#64748b",
                    }}
                  >
                    <span
                      style={{
                        display: "inline-block",
                        background: "#eff6ff",
                        color: "#1d4ed8",
                        border: "1px solid #bfdbfe",
                        borderRadius: "999px",
                        padding: "2px 8px",
                        marginRight: "8px",
                        fontWeight: 700,
                      }}
                    >
                      {t.custom.pressEnter}
                    </span>
                    {t.custom.globalSearchHint.replace(
                      "{q}",
                      globalSearch.trim(),
                    )}
                  </p>
                )}
              </section>

              {/* Line items table */}
              <section
                style={{
                  border: "1px solid #e5e7eb",
                  borderRadius: "12px",
                  background: "#fff",
                  boxShadow:
                    "0 1px 2px rgba(0,0,0,0.04), 0 2px 6px rgba(0,0,0,0.04)",
                  overflow: "hidden",
                }}
              >
                <div
                  style={{
                    padding: "14px 20px",
                    borderBottom: "1px solid #f1f5f9",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                  }}
                >
                  <h2
                    style={{
                      margin: 0,
                      fontSize: 12,
                      fontWeight: 700,
                      color: "#64748b",
                      letterSpacing: "0.07em",
                      textTransform: "uppercase",
                    }}
                  >
                    {t.sections.lines}
                    {lines.length > 0 && (
                      <span
                        style={{
                          marginLeft: "8px",
                          fontWeight: 500,
                          color: "#94a3b8",
                          textTransform: "none",
                          letterSpacing: 0,
                        }}
                      >
                        ({lines.length})
                      </span>
                    )}
                  </h2>
                </div>
                <div style={{ padding: "16px 20px 20px" }}>
                  {lines.length === 0
                    ? <p
                        style={{
                          color: "#999",
                          fontSize: "14px",
                          margin: 0,
                          padding: "20px 0",
                          textAlign: "center",
                        }}
                      >
                        {t.custom.globalSearch}
                      </p>
                    : <>
                        {/* Simple-mode line cards */}
                        <DndContext
                          sensors={sensors}
                          collisionDetection={closestCenter}
                          onDragEnd={handleDragEnd}
                        >
                          <SortableContext
                            items={lines.map((l) => l.serviceId)}
                            strategy={verticalListSortingStrategy}
                          >
                            <div
                              style={{
                                display: "grid",
                                gap: "10px",
                                marginBottom: "8px",
                              }}
                            >
                              {lines.map((line) => {
                                const lineTotal = calculateLineTotal(line);
                                const isAdvanced = advancedLines.has(
                                  line.serviceId,
                                );
                                return (
                                  <DraggableLineItem
                                    key={line.serviceId}
                                    id={line.serviceId}
                                  >
                                    <div
                                      style={{
                                        borderRadius: "12px",
                                        background: "#fff",
                                        overflow: "hidden",
                                      }}
                                    >
                                      {/* Simple row */}
                                      <div
                                        style={{
                                          display: "grid",
                                          gridTemplateColumns: isMobile
                                            ? "1fr"
                                            : "1fr 90px 120px 110px 36px",
                                          gap: "10px",
                                          alignItems: "center",
                                          padding: isMobile
                                            ? "12px"
                                            : "12px 16px",
                                        }}
                                      >
                                        {/* Service name */}
                                        <div>
                                          <div
                                            style={{
                                              fontWeight: 700,
                                              fontSize: "14px",
                                              color: "#111",
                                            }}
                                          >
                                            {line.name}
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "12px",
                                              color: "#888",
                                              marginTop: "2px",
                                            }}
                                          >
                                            {categoryLabel(line.category)} -{" "}
                                            {line.unit}
                                          </div>
                                        </div>
                                        {/* Qty */}
                                        <div>
                                          <div
                                            style={{
                                              fontSize: "11px",
                                              color: "#888",
                                              marginBottom: "3px",
                                            }}
                                          >
                                            Qty
                                          </div>
                                          <input
                                            type="number"
                                            min="0"
                                            value={line.qty}
                                            onChange={(e) =>
                                              updateQty(
                                                line.serviceId,
                                                e.target.value,
                                              )
                                            }
                                            style={{
                                              width: "100%",
                                              padding: "7px 8px",
                                              borderRadius: "7px",
                                              border: "1px solid #d1d5db",
                                              fontSize: "14px",
                                              textAlign: "right",
                                              fontWeight: 600,
                                            }}
                                          />
                                        </div>
                                        {/* Price / unit */}
                                        <div>
                                          <div
                                            style={{
                                              fontSize: "11px",
                                              color: "#888",
                                              marginBottom: "3px",
                                            }}
                                          >
                                            Price / unit
                                          </div>
                                          <div
                                            style={{
                                              display: "flex",
                                              alignItems: "center",
                                            }}
                                          >
                                            <span
                                              style={{
                                                fontSize: "13px",
                                                color: "#555",
                                                marginRight: "4px",
                                              }}
                                            >
                                              $
                                            </span>
                                            <input
                                              type="number"
                                              min="0"
                                              value={line.finalPrice}
                                              onChange={(e) =>
                                                updateFinalPrice(
                                                  line.serviceId,
                                                  e.target.value,
                                                )
                                              }
                                              style={{
                                                flex: 1,
                                                padding: "7px 8px",
                                                borderRadius: "7px",
                                                border: "1.5px solid #2563eb",
                                                fontSize: "14px",
                                                textAlign: "right",
                                                color: "#2563eb",
                                                fontWeight: 700,
                                              }}
                                            />
                                          </div>
                                        </div>
                                        {/* Line total */}
                                        <div
                                          style={{
                                            textAlign: isMobile
                                              ? "left"
                                              : "right",
                                          }}
                                        >
                                          <div
                                            style={{
                                              fontSize: "11px",
                                              color: "#888",
                                              marginBottom: "3px",
                                            }}
                                          >
                                            Total
                                          </div>
                                          <div
                                            style={{
                                              fontSize: "16px",
                                              fontWeight: 800,
                                              color: "#111",
                                            }}
                                          >
                                            ${fmtMoney(lineTotal)}
                                          </div>
                                        </div>
                                        {/* Remove */}
                                        <button
                                          type="button"
                                          onClick={() =>
                                            removeLine(line.serviceId)
                                          }
                                          style={{
                                            width: "30px",
                                            height: "30px",
                                            borderRadius: "50%",
                                            border: "none",
                                            background: "#fee2e2",
                                            color: "#dc2626",
                                            cursor: "pointer",
                                            fontSize: "16px",
                                            lineHeight: 1,
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "center",
                                            flexShrink: 0,
                                            justifySelf: isMobile
                                              ? "end"
                                              : "auto",
                                          }}
                                          aria-label="Remove"
                                        >
                                          x
                                        </button>
                                      </div>

                                      {/* Advanced pricing toggle */}
                                      <div
                                        style={{
                                          borderTop: "1px solid #f3f4f6",
                                          padding: "6px 16px",
                                          background: "#fafafa",
                                        }}
                                      >
                                        <button
                                          type="button"
                                          onClick={() =>
                                            toggleAdvanced(line.serviceId)
                                          }
                                          style={{
                                            background: "none",
                                            border: "none",
                                            cursor: "pointer",
                                            fontSize: "12px",
                                            color: "#6b7280",
                                            fontWeight: 600,
                                            padding: "4px 0",
                                            display: "flex",
                                            alignItems: "center",
                                            gap: "5px",
                                          }}
                                        >
                                          <span style={{ fontSize: "10px" }}>
                                            {isAdvanced ? "v" : ">"}
                                          </span>
                                          Advanced Pricing
                                        </button>
                                      </div>

                                      {/* Advanced breakdown panel */}
                                      {isAdvanced && (
                                        <div
                                          style={{
                                            borderTop: "1px solid #f3f4f6",
                                            padding: "14px 16px",
                                            background: "#f8fafc",
                                            display: "grid",
                                            gridTemplateColumns:
                                              "repeat(auto-fit, minmax(140px, 1fr))",
                                            gap: "12px",
                                          }}
                                        >
                                          {[
                                            {
                                              label: "Material cost",
                                              value: line.materialCostPerUnit,
                                              color: "#374151",
                                            },
                                            {
                                              label: "Labor cost",
                                              value: line.laborCostPerUnit,
                                              color: "#374151",
                                            },
                                            {
                                              label: "Overhead",
                                              value: line.overheadPerUnit,
                                              color: "#374151",
                                            },
                                            {
                                              label: "Profit",
                                              value: line.profitPerUnit,
                                              color: "#16a34a",
                                            },
                                            {
                                              label: "Cost / unit",
                                              value: line.totalCostPerUnit,
                                              color: "#374151",
                                            },
                                            {
                                              label: "Suggested",
                                              value: line.suggestedPrice,
                                              color: "#1d6f42",
                                            },
                                          ].map(({ label, value, color }) => (
                                            <div key={label}>
                                              <div
                                                style={{
                                                  fontSize: "11px",
                                                  color: "#6b7280",
                                                  marginBottom: "2px",
                                                }}
                                              >
                                                {label}
                                              </div>
                                              <div
                                                style={{
                                                  fontSize: "14px",
                                                  fontWeight: 700,
                                                  color,
                                                }}
                                              >
                                                {value != null && value > 0
                                                  ? `$${fmtMoney(value)}`
                                                  : "-"}
                                              </div>
                                            </div>
                                          ))}
                                          <div>
                                            <div
                                              style={{
                                                fontSize: "11px",
                                                color: "#6b7280",
                                                marginBottom: "2px",
                                              }}
                                            >
                                              Overhead %
                                            </div>
                                            <div
                                              style={{
                                                fontSize: "14px",
                                                fontWeight: 700,
                                                color: "#374151",
                                              }}
                                            >
                                              {line.overheadPercentage != null
                                                ? `${line.overheadPercentage}%`
                                                : "-"}
                                            </div>
                                          </div>
                                          <div>
                                            <div
                                              style={{
                                                fontSize: "11px",
                                                color: "#6b7280",
                                                marginBottom: "2px",
                                              }}
                                            >
                                              Profit %
                                            </div>
                                            <div
                                              style={{
                                                fontSize: "14px",
                                                fontWeight: 700,
                                                color: "#16a34a",
                                              }}
                                            >
                                              {line.profitPercentage != null
                                                ? `${line.profitPercentage}%`
                                                : "-"}
                                            </div>
                                          </div>
                                        </div>
                                      )}
                                    </div>
                                  </DraggableLineItem>
                                );
                              })}
                            </div>
                          </SortableContext>
                        </DndContext>

                        {/* Summary */}
                        <div
                          style={{
                            marginTop: "18px",
                            padding: "16px 20px",
                            borderRadius: "12px",
                            background: "#f9fafb",
                            border: "1px solid #e5e7eb",
                            display: "grid",
                            gridTemplateColumns:
                              "repeat(auto-fit, minmax(180px, 1fr))",
                            gap: "14px",
                          }}
                        >
                          <div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#6b7280",
                                marginBottom: "4px",
                              }}
                            >
                              {t.summary.subtotalLow}
                            </div>
                            <div
                              style={{
                                fontSize: "20px",
                                fontWeight: 700,
                                color: "#374151",
                              }}
                            >
                              ${fmtMoney(totals.low)}
                            </div>
                          </div>
                          <div>
                            <div
                              style={{
                                fontSize: "12px",
                                color: "#6b7280",
                                marginBottom: "4px",
                              }}
                            >
                              {t.summary.subtotalHigh}
                            </div>
                            <div
                              style={{
                                fontSize: "20px",
                                fontWeight: 700,
                                color: "#374151",
                              }}
                            >
                              ${fmtMoney(totals.high)}
                            </div>
                          </div>
                          <div
                            style={{
                              padding: "10px 14px",
                              borderRadius: "10px",
                              background: "#0b69ff",
                              color: "white",
                            }}
                          >
                            <div
                              style={{
                                fontSize: "12px",
                                opacity: 0.85,
                                marginBottom: "4px",
                              }}
                            >
                              {t.summary.yourTotal}
                            </div>
                            <div style={{ fontSize: "26px", fontWeight: 700 }}>
                              ${fmtMoney(totals.final)}
                            </div>
                          </div>
                        </div>
                      </>}
                </div>
              </section>

              {/* Saved estimates - rendered in the RIGHT column instead */}
              <section
                style={{
                  display: "none",
                  visibility: "hidden",
                  position: "absolute",
                }}
              >
                <h2
                  style={{
                    margin: "0 0 14px 0",
                    fontSize: "17px",
                    color: "#111",
                  }}
                >
                  {t.sections.saved}
                </h2>
                {savedLoading && (
                  <p style={{ color: "#777", fontSize: "14px" }}>
                    {t.loadingEstimates}
                  </p>
                )}
                {savedError && (
                  <p style={{ color: "#b00020", fontSize: "14px" }}>
                    {savedError}
                  </p>
                )}
                {!savedLoading && savedEstimates.length === 0 && (
                  <p style={{ color: "#999", fontSize: "14px" }}>
                    {t.noEstimates}
                  </p>
                )}
                <div style={{ display: "grid", gap: "10px" }}>
                  {savedEstimates.map((est) => (
                    <div
                      key={est._id}
                      style={{
                        padding: "14px 16px",
                        borderRadius: "10px",
                        border:
                          est._id === editId
                            ? "1px solid #0b69ff"
                            : "1px solid #e5e7eb",
                        background: est._id === editId ? "#eff6ff" : "#fafafa",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        gap: "12px",
                        flexWrap: "wrap",
                      }}
                    >
                      <div>
                        <div
                          style={{
                            fontWeight: 600,
                            color: "#111",
                            fontSize: "14px",
                          }}
                        >
                          {est.name || "Untitled"}
                        </div>
                        <div
                          style={{
                            color: "#777",
                            fontSize: "12px",
                            marginTop: "2px",
                          }}
                        >
                          {(est.lines || []).length} {t.summary.lines} -{" "}
                          <span style={{ color: "#0b69ff", fontWeight: 600 }}>
                            ${fmtMoney(est.totalMid)}
                          </span>{" "}
                          (${fmtMoney(est.totalLow)}-${fmtMoney(est.totalHigh)})
                        </div>
                        {est.notes && (
                          <div
                            style={{
                              color: "#555",
                              fontSize: "12px",
                              marginTop: "4px",
                            }}
                          >
                            {est.notes}
                          </div>
                        )}
                      </div>
                      <div style={{ display: "flex", gap: "8px" }}>
                        <button
                          type="button"
                          onClick={() => loadEstimate(est)}
                          disabled={est._id === editId}
                          style={{
                            padding: "7px 14px",
                            borderRadius: "7px",
                            border: "none",
                            background: est._id === editId ? "#bbb" : "#0b69ff",
                            color: "white",
                            cursor: est._id === editId ? "default" : "pointer",
                            fontSize: "13px",
                          }}
                        >
                          {t.buttons.load}
                        </button>
                        {capabilities.canDeleteRecords
                          ? <button
                              type="button"
                              onClick={() => deleteEstimate(est._id)}
                              style={{
                                padding: "6px 10px",
                                borderRadius: "999px",
                                border: "1px solid #fecaca",
                                background: "#fff5f5",
                                color: "#b91c1c",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                cursor: "pointer",
                                fontSize: "12px",
                                fontWeight: 600,
                              }}
                            >
                              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <path d="M3 6h18" />
                                <path d="M8 6V4h8v2" />
                                <path d="M19 6l-1 14H6L5 6" />
                                <path d="M10 11v6" />
                                <path d="M14 11v6" />
                              </svg>
                              {t.buttons.delete}
                            </button>
                          : null}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>

            {/* RIGHT COLUMN - estimate details, total, CTA */}
            <div
              style={{
                position: isNarrowLayout ? "static" : "sticky",
                top: isNarrowLayout ? "auto" : "68px",
                display: "flex",
                flexDirection: "column",
                gap: "16px",
              }}
            >
              {/* Estimate details */}
              <section
                style={{
                  background: "white",
                  border: "1px solid #e5e7eb",
                  borderRadius: "14px",
                  padding: "20px",
                  boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                }}
              >
                <h3
                  style={{
                    margin: "0 0 14px 0",
                    fontSize: "14px",
                    fontWeight: 700,
                    color: "#111",
                    textTransform: "uppercase",
                    letterSpacing: "0.05em",
                  }}
                >
                  Estimate Details
                </h3>
                <div style={{ display: "grid", gap: "12px" }}>
                  <div>
                    <label
                      htmlFor="estimate-name-right"
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "5px",
                      }}
                    >
                      {t.estimate.nameLabel}
                    </label>
                    <input
                      id="estimate-name-right"
                      value={estimateName}
                      onChange={(e) => setEstimateName(e.target.value)}
                      placeholder={t.estimate.namePlaceholder}
                      style={{ ...INPUT_STYLE, width: "100%" }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="estimate-notes-right"
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "5px",
                      }}
                    >
                      {t.estimate.notesLabel}
                    </label>
                    <input
                      id="estimate-notes-right"
                      value={estimateNotes}
                      onChange={(e) => setEstimateNotes(e.target.value)}
                      placeholder={t.estimate.notesPlaceholder}
                      style={{ ...INPUT_STYLE, width: "100%" }}
                    />
                  </div>
                  <div>
                    <label
                      htmlFor="estimate-client-right"
                      style={{
                        display: "block",
                        fontSize: "12px",
                        fontWeight: 600,
                        color: "#374151",
                        marginBottom: "5px",
                      }}
                    >
                      {t.client.sectionTitle}
                    </label>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <select
                        id="estimate-client-right"
                        value={clientId}
                        onChange={(e) => setClientId(e.target.value)}
                        style={{ ...INPUT_STYLE, flex: 1, background: "white" }}
                      >
                        <option value="">{t.client.selectLabel}</option>
                        {clients.map((c) => (
                          <option key={c._id} value={c._id}>
                            {c.name}
                            {c.companyName ? ` \u2014 ${c.companyName}` : ""}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        onClick={() => setClientModalOpen(true)}
                        style={{
                          padding: "9px 12px",
                          borderRadius: "8px",
                          border: "1px solid #e5e7eb",
                          background: "white",
                          cursor: "pointer",
                          fontSize: "13px",
                          fontWeight: 600,
                          whiteSpace: "nowrap",
                          fontFamily: "inherit",
                        }}
                      >
                        {t.client.addButton}
                      </button>
                    </div>
                  </div>
                </div>
              </section>

              {/* TOTAL PRICE - highlighted green card */}
              <div
                style={{
                  background: lines.length > 0 ? "#16a34a" : "#f3f4f8",
                  border: lines.length > 0 ? "none" : "1px solid #e5e7eb",
                  borderRadius: "14px",
                  padding: "24px 20px",
                  textAlign: "center",
                  transition: "background 0.2s",
                }}
              >
                <div
                  style={{
                    color:
                      lines.length > 0 ? "rgba(255,255,255,0.75)" : "#9ca3af",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    textTransform: "uppercase",
                    marginBottom: 6,
                  }}
                >
                  {t.summary.yourTotal}
                </div>
                <div
                  style={{
                    color: lines.length > 0 ? "white" : "#d1d5db",
                    fontSize: 42,
                    fontWeight: 800,
                    lineHeight: 1,
                    letterSpacing: "-1px",
                  }}
                >
                  ${fmtMoney(totals.final)}
                </div>
                {lines.length > 0 && (
                  <div
                    style={{
                      color: "rgba(255,255,255,0.6)",
                      fontSize: 11,
                      marginTop: 8,
                    }}
                  >
                    {t.summary.subtotalLow}: ${fmtMoney(totals.low)} &mdash;{" "}
                    {t.summary.subtotalHigh}: ${fmtMoney(totals.high)}
                  </div>
                )}
              </div>

              {/* Generate Estimate CTA */}
              <div
                style={{ display: "flex", flexDirection: "column", gap: "8px" }}
              >
                <div
                  style={{
                    fontSize: "12px",
                    color: "#475569",
                    background: "#eef2ff",
                    border: "1px solid #c7d2fe",
                    borderRadius: "8px",
                    padding: "8px 10px",
                  }}
                >
                  {t.buttons.workflowHint}
                </div>
                {/* Convert to quote */}
                {capabilities.canSendExternalCommunications
                  ? <button
                      type="button"
                      onClick={handleSaveAndSend}
                      disabled={
                        sending ||
                        saving ||
                        lines.length === 0 ||
                        !estimateName.trim() ||
                        !clientId
                      }
                      style={{
                        width: "100%",
                        padding: "14px 20px",
                        borderRadius: "10px",
                        border: "none",
                        background:
                          sending ||
                          saving ||
                          lines.length === 0 ||
                          !estimateName.trim() ||
                          !clientId
                            ? "#d1d5db"
                            : "#0b69ff",
                        color: "white",
                        cursor:
                          sending ||
                          saving ||
                          lines.length === 0 ||
                          !estimateName.trim() ||
                          !clientId
                            ? "default"
                            : "pointer",
                        fontWeight: 700,
                        fontSize: "15px",
                        fontFamily: "inherit",
                        boxShadow:
                          sending ||
                          saving ||
                          lines.length === 0 ||
                          !estimateName.trim() ||
                          !clientId
                            ? "none"
                            : "0 4px 12px rgba(11,105,255,0.3)",
                      }}
                    >
                      {sending ? t.buttons.sending : t.buttons.convertToQuote}
                    </button>
                  : null}
                {/* Save progress */}
                <button
                  type="button"
                  onClick={saveEstimate}
                  disabled={
                    saving ||
                    sending ||
                    lines.length === 0 ||
                    !estimateName.trim() ||
                    !clientId
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #e5e7eb",
                    background: "white",
                    cursor:
                      saving ||
                      sending ||
                      lines.length === 0 ||
                      !estimateName.trim() ||
                      !clientId
                        ? "default"
                        : "pointer",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    color:
                      saving ||
                      sending ||
                      lines.length === 0 ||
                      !estimateName.trim() ||
                      !clientId
                        ? "#aaa"
                        : "#374151",
                    fontWeight: 600,
                  }}
                >
                  {saving ? t.saving : t.buttons.saveProgress}
                </button>
                {/* Generate invoice */}
                <button
                  type="button"
                  onClick={handleGenerateInvoice}
                  disabled={
                    saving ||
                    sending ||
                    lines.length === 0 ||
                    !estimateName.trim() ||
                    !clientId
                  }
                  style={{
                    width: "100%",
                    padding: "10px",
                    borderRadius: "8px",
                    border: "1px solid #bbf7d0",
                    background: "#f0fdf4",
                    cursor:
                      saving ||
                      sending ||
                      lines.length === 0 ||
                      !estimateName.trim() ||
                      !clientId
                        ? "default"
                        : "pointer",
                    fontSize: "13px",
                    fontFamily: "inherit",
                    color:
                      saving ||
                      sending ||
                      lines.length === 0 ||
                      !estimateName.trim() ||
                      !clientId
                        ? "#86a38f"
                        : "#166534",
                    fontWeight: 700,
                  }}
                >
                  {t.buttons.generateInvoice}
                </button>
                {editId && (
                  <button
                    type="button"
                    onClick={resetEstimate}
                    style={{
                      width: "100%",
                      padding: "10px",
                      borderRadius: "8px",
                      border: "1px solid #e5e7eb",
                      background: "white",
                      cursor: "pointer",
                      fontSize: "13px",
                      fontFamily: "inherit",
                      color: "#374151",
                    }}
                  >
                    {t.buttons.newEstimate}
                  </button>
                )}
                {workflowSuccess ? (
                  <p style={{ color: "#166534", margin: "2px 0 0", fontSize: "12px" }}>
                    {workflowSuccess}
                  </p>
                ) : null}
                {workflowError ? (
                  <p style={{ color: "#b91c1c", margin: "2px 0 0", fontSize: "12px" }}>
                    {workflowError}
                  </p>
                ) : null}
                {sendSuccess && (
                  <p
                    style={{
                      color: "#16a34a",
                      margin: "8px 0 0 0",
                      fontSize: 13,
                      fontWeight: 600,
                    }}
                  >
                    {sentQuoteNumber
                      ? t.buttons.sentSuccessDetail.replace(
                          "{n}",
                          sentQuoteNumber,
                        )
                      : t.buttons.sentSuccess}
                  </p>
                )}
                {sendError && (
                  <p
                    style={{
                      color: "#dc2626",
                      margin: "8px 0 0 0",
                      fontSize: 13,
                    }}
                  >
                    {sendError}
                  </p>
                )}
                {saveError && !sendError && (
                  <p
                    style={{
                      color: "#dc2626",
                      margin: "8px 0 0 0",
                      fontSize: 13,
                    }}
                  >
                    {saveError}
                  </p>
                )}
              </div>

              {/* Saved estimates (compact list) */}
              {savedEstimates.length > 0 && (
                <section
                  style={{
                    background: "white",
                    border: "1px solid #e5e7eb",
                    borderRadius: "14px",
                    padding: "16px",
                    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
                  }}
                >
                  <h3
                    style={{
                      margin: "0 0 10px 0",
                      fontSize: "12px",
                      fontWeight: 700,
                      color: "#6b7280",
                      textTransform: "uppercase",
                      letterSpacing: "0.07em",
                    }}
                  >
                    {t.sections.saved}
                  </h3>
                  <div
                    style={{
                      display: "flex",
                      flexDirection: "column",
                      gap: 6,
                      maxHeight: 240,
                      overflowY: "auto",
                    }}
                  >
                    {savedEstimates.map((est) => (
                      <div
                        key={est._id}
                        style={{
                          padding: "9px 12px",
                          borderRadius: 8,
                          border:
                            est._id === editId
                              ? "1px solid #2563eb"
                              : "1px solid #e5e7eb",
                          background: est._id === editId ? "#eff6ff" : "white",
                          display: "flex",
                          justifyContent: "space-between",
                          alignItems: "center",
                          gap: 8,
                        }}
                      >
                        <div>
                          <div
                            style={{
                              fontWeight: 600,
                              color: "#111",
                              fontSize: 13,
                            }}
                          >
                            {est.name || "Untitled"}
                          </div>
                          <div style={{ color: "#6b7280", fontSize: 11 }}>
                            ${fmtMoney(est.totalMid)} &middot;{" "}
                            {(est.lines || []).length} items
                          </div>
                        </div>
                        <div style={{ display: "flex", gap: 5 }}>
                          <button
                            type="button"
                            onClick={() => loadEstimate(est)}
                            disabled={est._id === editId}
                            style={{
                              padding: "4px 10px",
                              borderRadius: 6,
                              border: "none",
                              background:
                                est._id === editId ? "#e5e7eb" : "#2563eb",
                              color: est._id === editId ? "#9ca3af" : "white",
                              cursor:
                                est._id === editId ? "default" : "pointer",
                              fontSize: 12,
                              fontFamily: "inherit",
                            }}
                          >
                            {t.buttons.load}
                          </button>
                          {capabilities.canDeleteRecords
                            ? <button
                                type="button"
                                onClick={() => deleteEstimate(est._id)}
                                style={{
                                  padding: "5px 9px",
                                  borderRadius: 999,
                                  border: "1px solid #fecaca",
                                  background: "#fee2e2",
                                  color: "#b91c1c",
                                  cursor: "pointer",
                                  fontSize: 12,
                                  fontWeight: 600,
                                  fontFamily: "inherit",
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 6,
                                }}
                              >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M3 6h18" />
                                  <path d="M8 6V4h8v2" />
                                  <path d="M19 6l-1 14H6L5 6" />
                                  <path d="M10 11v6" />
                                  <path d="M14 11v6" />
                                </svg>
                                {t.buttons.delete}
                              </button>
                            : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              )}
            </div>
          </div>
        : null}
      {/* Add Client modal */}
      {clientModalOpen && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            <h3 style={{ margin: "0 0 18px 0", fontSize: "18px" }}>
              {t.client.modalTitle}
            </h3>
            <div style={{ display: "grid", gap: "12px" }}>
              {[
                {
                  id: "nc-name",
                  key: "name",
                  label: t.client.nameLabel,
                  placeholder: t.client.namePlaceholder,
                  type: "text",
                },
                {
                  id: "nc-company",
                  key: "companyName",
                  label: t.client.companyLabel,
                  placeholder: t.client.companyPlaceholder,
                  type: "text",
                },
                {
                  id: "nc-phone",
                  key: "phone",
                  label: t.client.phoneLabel,
                  placeholder: t.client.phonePlaceholder,
                  type: "tel",
                },
                {
                  id: "nc-email",
                  key: "email",
                  label: t.client.emailLabel,
                  placeholder: t.client.emailPlaceholder,
                  type: "email",
                },
                {
                  id: "nc-address",
                  key: "address",
                  label: t.client.addressLabel,
                  placeholder: t.client.addressPlaceholder,
                  type: "text",
                },
              ].map((field) => (
                <div key={field.key}>
                  <label
                    htmlFor={field.id}
                    style={{
                      display: "block",
                      fontSize: "12px",
                      color: "#555",
                      marginBottom: "4px",
                    }}
                  >
                    {field.label}
                  </label>
                  <input
                    id={field.id}
                    type={field.type}
                    value={newClient[field.key]}
                    onChange={(e) =>
                      setNewClient((prev) => ({
                        ...prev,
                        [field.key]: e.target.value,
                      }))
                    }
                    placeholder={field.placeholder}
                    style={INPUT_STYLE}
                  />
                </div>
              ))}
            </div>
            {clientError && (
              <p
                style={{
                  color: "#b00020",
                  fontSize: "13px",
                  marginTop: "10px",
                }}
              >
                {clientError}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "20px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={closeClientModal}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {t.client.cancel}
              </button>
              <button
                type="button"
                onClick={saveClient}
                disabled={clientSaving || !newClient.name.trim()}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "none",
                  background:
                    clientSaving || !newClient.name.trim() ? "#bbb" : "black",
                  color: "#fff",
                  cursor:
                    clientSaving || !newClient.name.trim()
                      ? "not-allowed"
                      : "pointer",
                  fontSize: "14px",
                  fontWeight: 600,
                }}
              >
                {clientSaving ? t.client.saving : t.client.saveButton}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Actions confirmation modal */}
      {actionsModal && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(0,0,0,0.45)",
            zIndex: 200,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "20px",
          }}
        >
          <div
            style={{
              background: "#fff",
              borderRadius: "16px",
              padding: "28px",
              width: "100%",
              maxWidth: "420px",
              boxShadow: "0 12px 40px rgba(0,0,0,0.18)",
            }}
          >
            {/* Email */}
            {actionsModal === "email" && (
              <>
                <h3 style={{ margin: "0 0 16px 0", fontSize: "18px" }}>
                  {t.actions.emailTitle}
                </h3>
                {modalSuccess
                  ? <p
                      style={{
                        color: "#16a34a",
                        fontWeight: 600,
                        fontSize: "15px",
                      }}
                    >
                      {t.actions.sent}
                    </p>
                  : !editId
                    ? <p style={{ color: "#b00020", fontSize: "14px" }}>
                        {t.actions.needsSave}
                      </p>
                    : <>
                        <label
                          htmlFor="modal-email"
                          style={{
                            fontSize: "13px",
                            color: "#555",
                            display: "block",
                            marginBottom: "6px",
                          }}
                        >
                          {t.actions.emailLabel}
                        </label>
                        <input
                          id="modal-email"
                          type="email"
                          value={modalEmail}
                          onChange={(e) => setModalEmail(e.target.value)}
                          placeholder={t.actions.emailPlaceholder}
                          style={INPUT_STYLE}
                        />
                        {modalError && (
                          <p
                            style={{
                              color: "#b00020",
                              fontSize: "13px",
                              marginTop: "8px",
                            }}
                          >
                            {modalError}
                          </p>
                        )}
                      </>}
              </>
            )}

            {/* SMS */}
            {actionsModal === "sms" && (
              <>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>
                  {t.actions.smsTitle}
                </h3>
                <p style={{ color: "#555", fontSize: "14px", margin: 0 }}>
                  {t.actions.smsComing}
                </p>
              </>
            )}

            {/* Save */}
            {actionsModal === "save" && (
              <>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>
                  {t.actions.saveTitle}
                </h3>
                <p style={{ color: "#555", fontSize: "14px", margin: 0 }}>
                  {t.actions.saveConfirm}
                </p>
              </>
            )}

            {/* PDF */}
            {actionsModal === "pdf" && (
              <>
                <h3 style={{ margin: "0 0 12px 0", fontSize: "18px" }}>
                  {t.actions.pdfTitle}
                </h3>
                <p style={{ color: "#555", fontSize: "14px", margin: 0 }}>
                  {t.actions.pdfConfirm}
                </p>
              </>
            )}

            {/* Footer buttons */}
            <div
              style={{
                display: "flex",
                gap: "10px",
                marginTop: "22px",
                justifyContent: "flex-end",
              }}
            >
              <button
                type="button"
                onClick={closeActionsModal}
                style={{
                  padding: "9px 18px",
                  borderRadius: "8px",
                  border: "1px solid #ccc",
                  background: "#fff",
                  cursor: "pointer",
                  fontSize: "14px",
                }}
              >
                {modalSuccess ? t.actions.close : t.actions.cancel}
              </button>

              {actionsModal === "email" && !modalSuccess && editId && (
                <button
                  type="button"
                  onClick={handleEmailSend}
                  disabled={modalSending || !modalEmail.trim()}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background:
                      modalSending || !modalEmail.trim() ? "#bbb" : "#0b69ff",
                    color: "#fff",
                    cursor:
                      modalSending || !modalEmail.trim()
                        ? "not-allowed"
                        : "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {modalSending ? t.actions.sending : t.actions.send}
                </button>
              )}

              {actionsModal === "save" && (
                <button
                  type="button"
                  onClick={handleSaveNow}
                  disabled={lines.length === 0}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: lines.length === 0 ? "#bbb" : "black",
                    color: "#fff",
                    cursor: lines.length === 0 ? "not-allowed" : "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {t.actions.confirmSave}
                </button>
              )}

              {actionsModal === "pdf" && (
                <button
                  type="button"
                  onClick={handleExportPdf}
                  style={{
                    padding: "9px 18px",
                    borderRadius: "8px",
                    border: "none",
                    background: "#374151",
                    color: "#fff",
                    cursor: "pointer",
                    fontSize: "14px",
                    fontWeight: 600,
                  }}
                >
                  {t.actions.print}
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
