function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLanguage(value) {
  const language = String(value || "en")
    .trim()
    .toLowerCase();
  return ["en", "es", "pl"].includes(language) ? language : "en";
}

function addDaysIso(days) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function toAmountNumber(value) {
  const normalized = String(value || "").replace(/[^0-9.]/g, "");
  const amount = Number(normalized);
  return Number.isFinite(amount) ? amount : 0;
}

function formatAmount(value) {
  const amount = toAmountNumber(value);
  return amount > 0 ? amount.toFixed(2) : "";
}

function splitInvoiceAmount(amount, ratios) {
  if (!(amount > 0)) {
    return ratios.map(() => "");
  }

  let allocated = 0;
  return ratios.map((ratio, index) => {
    if (index === ratios.length - 1) {
      return (amount - allocated).toFixed(2);
    }

    const current = Number((amount * ratio).toFixed(2));
    allocated += current;
    return current.toFixed(2);
  });
}

function detectInvoiceProfile(input = {}) {
  const text = [input.service, input.jobTitle, input.invoiceTitle, input.notes]
    .map(normalizeText)
    .join(" ")
    .toLowerCase();

  if (/(paint|pint)/.test(text)) {
    return "painting";
  }
  if (/(clean|limpie|housekeeping)/.test(text)) {
    return "cleaning";
  }
  if (/(snow|nieve|ice|salting)/.test(text)) {
    return "snow";
  }
  if (/(garden|landscap|patio|yard|cesped|jardin)/.test(text)) {
    return "landscaping";
  }

  return "general";
}

function buildInvoiceLineItems(profile, language, totalAmount) {
  const itemSets = {
    en: {
      general: [
        {
          label: "Service labor",
          details: "Core field work and completion of the agreed scope.",
        },
        {
          label: "Materials and supplies",
          details: "Consumables, standard materials, and disposal support.",
        },
        {
          label: "Project coordination",
          details: "Scheduling, site communication, and final walkthrough.",
        },
      ],
      painting: [
        {
          label: "Surface preparation",
          details: "Masking, prep, patching, and protection of work areas.",
        },
        {
          label: "Painting labor",
          details:
            "Application of paint and finish coats for the approved areas.",
        },
        {
          label: "Paint and materials",
          details: "Paint, sundries, cleanup materials, and final touch-up.",
        },
      ],
      cleaning: [
        {
          label: "Cleaning service",
          details:
            "Primary cleaning labor for the scheduled visit or service window.",
        },
        {
          label: "Supplies and sanitation",
          details:
            "Cleaning agents, consumables, liners, and sanitary materials.",
        },
        {
          label: "Detail and final check",
          details:
            "High-touch review, finishing details, and completion check.",
        },
      ],
      snow: [
        {
          label: "Snow removal labor",
          details: "Plowing, shoveling, and clearing of agreed access areas.",
        },
        {
          label: "De-icing treatment",
          details: "Salt or de-icer application where conditions require it.",
        },
        {
          label: "Priority dispatch",
          details: "Weather tracking, routing, and service coordination.",
        },
      ],
      landscaping: [
        {
          label: "Site preparation",
          details:
            "Setup, trimming, edge work, and staging of the service area.",
        },
        {
          label: "Landscape labor",
          details:
            "Main installation or maintenance labor for the agreed work.",
        },
        {
          label: "Materials and cleanup",
          details: "Planting inputs, yard waste handling, and final cleanup.",
        },
      ],
    },
    es: {
      general: [
        {
          label: "Mano de obra",
          details:
            "Trabajo principal en sitio y ejecucion del alcance acordado.",
        },
        {
          label: "Materiales e insumos",
          details: "Consumibles, materiales estandar y apoyo para desecho.",
        },
        {
          label: "Coordinacion del proyecto",
          details: "Programacion, comunicacion en sitio y revision final.",
        },
      ],
      painting: [
        {
          label: "Preparacion de superficies",
          details:
            "Proteccion, preparacion, resanes y cuidado del area de trabajo.",
        },
        {
          label: "Mano de obra de pintura",
          details: "Aplicacion de pintura y acabados en las areas aprobadas.",
        },
        {
          label: "Pintura y materiales",
          details: "Pintura, insumos, limpieza final y retoques.",
        },
      ],
      cleaning: [
        {
          label: "Servicio de limpieza",
          details:
            "Mano de obra principal para la visita o servicio programado.",
        },
        {
          label: "Insumos y sanitizacion",
          details:
            "Productos de limpieza, consumibles y materiales sanitarios.",
        },
        {
          label: "Detalle y revision final",
          details:
            "Revision de detalles, puntos de contacto y cierre del servicio.",
        },
      ],
      snow: [
        {
          label: "Mano de obra de nieve",
          details:
            "Retiro de nieve en accesos y areas incluidas en el servicio.",
        },
        {
          label: "Tratamiento antihielo",
          details: "Aplicacion de sal o deshielo segun condicion del sitio.",
        },
        {
          label: "Coordinacion prioritaria",
          details: "Monitoreo del clima, rutas y coordinacion del servicio.",
        },
      ],
      landscaping: [
        {
          label: "Preparacion del area",
          details:
            "Ajustes previos, bordes, recorte y preparacion del espacio.",
        },
        {
          label: "Mano de obra de jardineria",
          details:
            "Instalacion o mantenimiento principal segun el alcance acordado.",
        },
        {
          label: "Materiales y limpieza",
          details: "Insumos, manejo de residuos verdes y limpieza final.",
        },
      ],
    },
    pl: {
      general: [
        {
          label: "Robocizna",
          details: "Glowny zakres prac terenowych zgodnie z ustalona usluga.",
        },
        {
          label: "Materialy i srodki",
          details:
            "Materialy eksploatacyjne, standardowe dostawy i obsluga odpadow.",
        },
        {
          label: "Koordynacja zlecenia",
          details: "Harmonogram, komunikacja na miejscu i odbior koncowy.",
        },
      ],
      painting: [
        {
          label: "Przygotowanie powierzchni",
          details:
            "Zabezpieczenie, przygotowanie, naprawy i organizacja miejsca pracy.",
        },
        {
          label: "Robocizna malarska",
          details:
            "Nakladanie farby i warstw wykonczeniowych w zatwierdzonych obszarach.",
        },
        {
          label: "Farby i materialy",
          details:
            "Farba, materialy pomocnicze, sprzatanie i poprawki koncowe.",
        },
      ],
      cleaning: [
        {
          label: "Usluga sprzatania",
          details:
            "Podstawowa robocizna dla zaplanowanej wizyty lub okna serwisowego.",
        },
        {
          label: "Srodki i dezynfekcja",
          details:
            "Srodki czystosci, materialy eksploatacyjne i produkty sanitarne.",
        },
        {
          label: "Detale i kontrola",
          details:
            "Doprecyzowanie szczegolow, kontrola powierzchni i finalne sprawdzenie.",
        },
      ],
      snow: [
        {
          label: "Robocizna odsniezania",
          details: "Odsniezanie uzgodnionych podjazdow, wejsc i stref dostepu.",
        },
        {
          label: "Zabezpieczenie przed lodem",
          details:
            "Zastosowanie soli lub srodkow odladzajacych zalezne od warunkow.",
        },
        {
          label: "Koordynacja priorytetowa",
          details:
            "Monitoring pogody, planowanie trasy i organizacja realizacji.",
        },
      ],
      landscaping: [
        {
          label: "Przygotowanie terenu",
          details:
            "Prace przygotowawcze, przycinanie krawedzi i organizacja obszaru.",
        },
        {
          label: "Robocizna ogrodowa",
          details:
            "Glowna instalacja lub pielegnacja zgodna z uzgodnionym zakresem.",
        },
        {
          label: "Materialy i sprzatanie",
          details: "Materialy, obsluga odpadow zielonych i porzadki koncowe.",
        },
      ],
    },
  };

  const selected =
    itemSets[language]?.[profile] ||
    itemSets[language]?.general ||
    itemSets.en.general;
  const amounts = splitInvoiceAmount(totalAmount, [0.6, 0.25, 0.15]);

  return selected.map((item, index) => ({
    ...item,
    amount: amounts[index] || "",
  }));
}

const INVOICE_TEXT = {
  en: {
    intro: "Invoice prepared for",
    forClient: "for",
    scope: "Service summary",
    paymentTerms: "Payment is due by",
    totalAmount: "Total amount currently set:",
    contact:
      "Please contact us with any billing questions before the due date.",
    thanks: "Thank you for your business.",
    fallbackTitle: "contracted services",
    additionalNotes: "Additional notes",
  },
  es: {
    intro: "Factura preparada para",
    forClient: "para",
    scope: "Resumen del servicio",
    paymentTerms: "El pago vence el",
    totalAmount: "Monto total actual:",
    contact:
      "Contactanos si tienes preguntas de facturacion antes de la fecha de vencimiento.",
    thanks: "Gracias por tu preferencia.",
    fallbackTitle: "servicios contratados",
    additionalNotes: "Notas adicionales",
  },
  pl: {
    intro: "Faktura przygotowana za",
    forClient: "dla",
    scope: "Podsumowanie uslugi",
    paymentTerms: "Platnosc jest wymagana do",
    totalAmount: "Biezaca kwota laczna:",
    contact:
      "W razie pytan dotyczacych faktury skontaktuj sie z nami przed terminem platnosci.",
    thanks: "Dziekujemy za wspolprace.",
    fallbackTitle: "wykonane uslugi",
    additionalNotes: "Dodatkowe uwagi",
  },
};

const CONTRACT_TEXT = {
  en: {
    titleSuffix: "SERVICE AGREEMENT",
    parties:
      "This agreement is made between the contractor and the client listed below.",
    client: "Client",
    project: "Project",
    amount: "Contract amount",
    scope: "Scope",
    timeline: "Timeline",
    terms: "Terms",
    scopeClause:
      "Contractor will complete the services described below using commercially reasonable workmanship.",
    clientClause:
      "Client will provide timely site access, approvals, and any required utility availability during the work window.",
    changeClause:
      "Any work outside the listed scope, including material substitutions or schedule changes, requires written approval.",
    paymentClause:
      "Pricing applies only to the described scope. Invoices are due according to the issued billing schedule.",
    scheduleClause:
      "Timeline dates are estimates and may adjust for weather, access limits, permit delays, or conditions discovered on site.",
    signoff:
      "Both parties may review and approve any future change requests in writing.",
    fallbackProject: "Custom service agreement",
    fallbackScope:
      "The contractor will provide the services described in this agreement in a professional manner.",
    dueDate: "Work is expected to be completed by",
    additionalTerms: "Additional provisions",
    statusLabel: "Current internal status",
  },
  es: {
    titleSuffix: "CONTRATO DE SERVICIO",
    parties:
      "Este acuerdo se celebra entre el contratista y el cliente indicados abajo.",
    client: "Cliente",
    project: "Proyecto",
    amount: "Monto del contrato",
    scope: "Alcance",
    timeline: "Tiempo estimado",
    terms: "Terminos",
    scopeClause:
      "El contratista ejecutara los servicios descritos abajo con mano de obra profesional y razonable.",
    clientClause:
      "El cliente facilitara acceso al sitio, aprobaciones oportunas y disponibilidad de servicios necesarios durante el trabajo.",
    changeClause:
      "Cualquier trabajo fuera del alcance, cambios de materiales o ajustes de calendario requieren aprobacion por escrito.",
    paymentClause:
      "El precio aplica solo al alcance descrito. Las facturas vencen conforme al calendario de cobro emitido.",
    scheduleClause:
      "Las fechas son estimadas y pueden ajustarse por clima, acceso, permisos o condiciones encontradas en sitio.",
    signoff:
      "Ambas partes podran revisar y aprobar por escrito cualquier cambio futuro.",
    fallbackProject: "Contrato personalizado de servicio",
    fallbackScope:
      "El contratista prestara los servicios descritos en este acuerdo de manera profesional.",
    dueDate: "El trabajo se espera completar para",
    additionalTerms: "Disposiciones adicionales",
    statusLabel: "Estado interno actual",
  },
  pl: {
    titleSuffix: "UMOWA O USLUGE",
    parties:
      "Niniejsza umowa zostaje zawarta pomiedzy wykonawca a klientem wskazanym ponizej.",
    client: "Klient",
    project: "Projekt",
    amount: "Kwota umowy",
    scope: "Zakres",
    timeline: "Termin",
    terms: "Warunki",
    scopeClause:
      "Wykonawca zrealizuje uslugi opisane ponizej z nalezyta starannoscia i profesjonalnym standardem wykonania.",
    clientClause:
      "Klient zapewni terminowy dostep do miejsca prac, niezbedne zgody oraz dostepnosc wymaganych mediow w czasie realizacji.",
    changeClause:
      "Kazda praca wykraczajaca poza wskazany zakres, zmiana materialow lub harmonogramu wymaga pisemnej akceptacji.",
    paymentClause:
      "Cena obejmuje wylacznie opisany zakres prac. Faktury sa platne zgodnie z wystawionym harmonogramem rozliczen.",
    scheduleClause:
      "Terminy maja charakter orientacyjny i moga ulec zmianie z powodu pogody, ograniczonego dostepu, opoznien formalnych lub warunkow na miejscu.",
    signoff:
      "Obie strony moga zatwierdzac przyszle zmiany wylacznie w formie pisemnej.",
    fallbackProject: "Niestandardowa umowa uslugowa",
    fallbackScope:
      "Wykonawca zrealizuje uslugi opisane w tej umowie w sposob profesjonalny.",
    dueDate: "Prace powinny zostac zakonczone do",
    additionalTerms: "Dodatkowe postanowienia",
    statusLabel: "Biezacy status wewnetrzny",
  },
};

export function generateInvoiceAssistant(input = {}) {
  const language = normalizeLanguage(input.language);
  const text = INVOICE_TEXT[language];
  const title =
    normalizeText(
      input.invoiceTitle ||
        input.jobTitle ||
        input.service ||
        input.invoiceNumber,
    ) || text.fallbackTitle;
  const clientName = normalizeText(input.clientName) || "Client";
  const amount = normalizeText(input.amount || input.jobPrice || "");
  const dueDate = normalizeText(input.dueDate) || addDaysIso(14);
  const existingNotes = normalizeText(input.notes);
  const totalAmount = toAmountNumber(amount || input.jobPrice || 0);
  const lineItems = buildInvoiceLineItems(
    detectInvoiceProfile(input),
    language,
    totalAmount,
  );
  const scopeLine = lineItems
    .map((item) => item.label)
    .filter(Boolean)
    .join(", ");

  const notes = [
    `${text.intro} ${title} ${text.forClient} ${clientName}.`,
    scopeLine ? `${text.scope}: ${scopeLine}.` : "",
    `${text.paymentTerms} ${dueDate}.`,
    totalAmount ? `${text.totalAmount} $${totalAmount.toFixed(2)}.` : "",
    existingNotes ? `${text.additionalNotes}: ${existingNotes}` : "",
    text.contact,
    text.thanks,
  ]
    .filter(Boolean)
    .join("\n\n");

  return {
    amount: formatAmount(amount || input.jobPrice || ""),
    dueDate,
    invoiceTitle: title,
    lineItems,
    notes,
  };
}

export function generateContractAssistant(input = {}) {
  const language = normalizeLanguage(input.language);
  const text = CONTRACT_TEXT[language];
  const category = normalizeText(input.category || "Service");
  const option = normalizeText(input.option || "");
  const clientName = normalizeText(input.clientName) || text.client;
  const jobTitle =
    normalizeText(input.jobTitle) || option || text.fallbackProject;
  const amount = normalizeText(input.amount);
  const scope =
    normalizeText(input.scopeDetails || input.additionalTerms) ||
    text.fallbackScope;
  const dueDate = normalizeText(input.dueDate);
  const status = normalizeText(input.status || "Draft");
  const body = normalizeText(input.body);
  const additionalTerms = normalizeText(input.additionalTerms);

  if (body) {
    return { body };
  }

  const extraClauses = additionalTerms
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean)
    .map((item) => `- ${item}`);

  const lines = [
    `${category.toUpperCase()} ${text.titleSuffix}`,
    "",
    text.parties,
    "",
    `${text.client}: ${clientName}`,
    `${text.project}: ${jobTitle}`,
    amount ? `${text.amount}: $${Number(amount || 0).toFixed(2)}` : "",
    dueDate ? `${text.timeline}: ${text.dueDate} ${dueDate}` : "",
    "",
    `${text.scope}:`,
    scope,
    "",
    `${text.terms}:`,
    `1. ${text.scopeClause}`,
    `2. ${text.clientClause}`,
    `3. ${text.paymentClause}`,
    `4. ${text.changeClause}`,
    `5. ${text.scheduleClause}`,
    `6. ${text.signoff}`,
    `7. ${text.statusLabel}: ${status}.`,
    ...(extraClauses.length
      ? ["", `${text.additionalTerms}:`, ...extraClauses]
      : []),
  ].filter(Boolean);

  return {
    body: lines.join("\n"),
  };
}
