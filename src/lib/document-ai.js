import { generateInvoiceWorkPerformed } from "./invoice-work-performed.js";

function normalizeText(value) {
  return String(value || "").trim();
}

function normalizeLanguage(value) {
  const language = String(value || "en")
    .trim()
    .toLowerCase();
  return ["en", "es", "pl"].includes(language) ? language : "en";
}

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
  const { notes, insufficientData } = generateInvoiceWorkPerformed(input);

  return {
    notes,
    insufficientData,
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
