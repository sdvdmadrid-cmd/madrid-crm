import {
  getInvoiceLineItemDescription,
  normalizeInvoiceLineItemsForSave,
} from "./invoice-line-items.js";

const MIN_WORDS = 50;
const MAX_WORDS = 120;

const GENERIC_LABELS = new Set([
  "service",
  "services",
  "labor",
  "materials",
  "work",
  "item",
  "line item",
]);

const INSUFFICIENT_INFO = {
  en:
    "More detail is needed before a work performed summary can be generated. " +
    "Add line items with clear service descriptions (for example, the exact maintenance or labor billed on this invoice). " +
    "This assistant only summarizes services already listed on the invoice and does not invent work.",
  es:
    "Se necesitan mas detalles antes de generar un resumen del trabajo realizado. " +
    "Agrega partidas con descripciones claras del servicio facturado en esta factura. " +
    "Este asistente solo resume los servicios ya listados y no inventa trabajo.",
  pl:
    "Potrzeba wiecej szczegolow, zanim mozna wygenerowac podsumowanie wykonanych prac. " +
    "Dodaj pozycje z jasnym opisem uslug rozliczonych na tej fakturze. " +
    "Ten asystent podsumowuje wylacznie uslugi juz wymienione na fakturze i nie wymysla prac.",
};

const INTRO = {
  en: "Work performed for this billing period included",
  es: "El trabajo realizado durante este periodo de facturacion incluyo",
  pl: "Wykonane prace w tym okresie rozliczeniowym obejmowaly",
};

const CLOSING = {
  en:
    "Each item above reflects the labor and materials billed on this invoice. " +
    "This summary is based solely on the line items shown and does not include services beyond those entries.",
  es:
    "Cada partida refleja la mano de obra y los materiales facturados en esta factura. " +
    "Este resumen se basa unicamente en las partidas mostradas y no incluye servicios fuera de ellas.",
  pl:
    "Kazda pozycja odzwierciedla robocizne i materialy rozliczone na tej fakturze. " +
    "To podsumowanie opiera sie wylacznie na wymienionych pozycjach i nie obejmuje uslug spoza nich.",
};

function normalizeLanguage(value) {
  const language = String(value || "en")
    .trim()
    .toLowerCase();
  return ["en", "es", "pl"].includes(language) ? language : "en";
}

function countWords(text) {
  return String(text || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean).length;
}

function dedupeSentences(text) {
  const sentences = String(text || "")
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  const seen = new Set();
  const unique = [];

  for (const sentence of sentences) {
    const key = sentence.toLowerCase().replace(/\s+/g, " ");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(sentence);
  }

  return unique.join(" ");
}

function trimToMaxWords(text, maxWords) {
  const words = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) {
    return words.join(" ");
  }
  return `${words.slice(0, maxWords).join(" ").replace(/[,;:]?$/, "")}.`;
}

function extractLineItems(input = {}) {
  return normalizeInvoiceLineItemsForSave(input.lineItems || []).map((item) => {
    const label = getInvoiceLineItemDescription(item);
    const details = String(item.details || "").trim();
    return { label, details };
  });
}

function isMeaningfulLineItem(item = {}) {
  const label = String(item.label || "").trim();
  const details = String(item.details || "").trim();
  if (details.length >= 10) return true;
  if (label.length >= 8 && !GENERIC_LABELS.has(label.toLowerCase())) return true;
  return false;
}

function formatServicePhrase(item = {}) {
  const label = String(item.label || "").trim();
  const details = String(item.details || "").trim();

  if (!label && !details) return "";
  if (!label) return details;
  if (!details) return label;
  if (details.toLowerCase().startsWith(label.toLowerCase())) return details;
  if (label.toLowerCase() === details.toLowerCase()) return label;
  return `${label}: ${details}`;
}

function joinServicePhrases(phrases, language) {
  const cleaned = phrases.map((phrase) => phrase.trim()).filter(Boolean);
  if (cleaned.length === 0) return "";
  if (cleaned.length === 1) return cleaned[0];

  if (language === "es") {
    if (cleaned.length === 2) {
      return `${cleaned[0]} y ${cleaned[1]}`;
    }
    return `${cleaned.slice(0, -1).join("; ")}; y ${cleaned[cleaned.length - 1]}`;
  }

  if (language === "pl") {
    if (cleaned.length === 2) {
      return `${cleaned[0]} oraz ${cleaned[1]}`;
    }
    return `${cleaned.slice(0, -1).join("; ")}; oraz ${cleaned[cleaned.length - 1]}`;
  }

  if (cleaned.length === 2) {
    return `${cleaned[0]} and ${cleaned[1]}`;
  }
  return `${cleaned.slice(0, -1).join("; ")}, and ${cleaned[cleaned.length - 1]}`;
}

function buildParagraph(phrases, language) {
  const joined = joinServicePhrases(phrases, language);
  const intro = INTRO[language] || INTRO.en;
  const closing = CLOSING[language] || CLOSING.en;
  let paragraph = `${intro} ${joined}. ${closing}`;

  if (countWords(paragraph) > MAX_WORDS) {
    paragraph = trimToMaxWords(paragraph, MAX_WORDS);
  }

  if (countWords(paragraph) < MIN_WORDS && phrases.length === 1) {
    paragraph = `${intro} ${joined}. ${closing}`;
    paragraph = trimToMaxWords(paragraph, MAX_WORDS);
  }

  return dedupeSentences(paragraph);
}

/**
 * Deterministic work-performed summary from the current invoice line items only.
 * Never invents services, never rewrites invoice metadata, never uses cached templates.
 */
export function generateInvoiceWorkPerformed(input = {}) {
  const language = normalizeLanguage(input.language);
  const lineItems = extractLineItems(input);
  const meaningfulItems = lineItems.filter(isMeaningfulLineItem);

  if (meaningfulItems.length === 0) {
    return {
      notes: INSUFFICIENT_INFO[language] || INSUFFICIENT_INFO.en,
      insufficientData: true,
    };
  }

  const phrases = meaningfulItems
    .map(formatServicePhrase)
    .filter(Boolean);

  const notes = buildParagraph(phrases, language);

  return {
    notes,
    insufficientData: false,
  };
}
