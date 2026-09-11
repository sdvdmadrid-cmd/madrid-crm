import { generateEstimateSuggestion } from "./estimate-ai.js";

export function normalizeEstimateDraftServices(rawServices) {
  if (!Array.isArray(rawServices)) return [];
  return rawServices
    .slice(0, 6)
    .map((s, idx) => {
      const name = String(s?.name || s?.label || "").slice(0, 200).trim();
      const qty = Math.max(1, Math.min(999, Number(s?.qty) || 1));
      const unitPrice = Math.max(
        0,
        Math.min(1_000_000, Number(s?.unitPrice ?? s?.amount) || 0),
      );
      const notes = String(s?.notes || "").slice(0, 300).trim();
      return {
        id: `ai_${idx + 1}`,
        name: name || `Service ${idx + 1}`,
        qty,
        unitPrice,
        price: Math.round(qty * unitPrice * 100) / 100,
        notes,
      };
    })
    .filter((s) => s.name);
}

export function buildEstimateDraftFromParsed(parsed) {
  const services = normalizeEstimateDraftServices(parsed?.services);
  return {
    title: String(parsed?.title || "").slice(0, 200).trim(),
    clientName: String(parsed?.clientName || "").slice(0, 200).trim(),
    address: String(parsed?.address || "").slice(0, 300).trim(),
    services,
    scopeNotes: String(parsed?.scopeNotes || "").slice(0, 2000).trim(),
    assumptions: Array.isArray(parsed?.assumptions)
      ? parsed.assumptions.slice(0, 6).map((v) => String(v).slice(0, 200))
      : [],
    confidence: Math.min(1, Math.max(0, Number(parsed?.confidence) || 0.5)),
    missing: Array.isArray(parsed?.missing)
      ? parsed.missing.slice(0, 6).map((v) => String(v).slice(0, 40))
      : [],
    subtotal: services.reduce((sum, s) => sum + (s.price || 0), 0),
  };
}

export function buildHeuristicEstimateDraft({
  title = "",
  service = "",
  details = "",
  clientName = "",
  address = "",
} = {}) {
  const heuristic = generateEstimateSuggestion({
    title: title || service,
    service: service || title,
    details,
    scopeDetails: details,
    complexity: "medium",
    urgency: "normal",
    materialsIncluded: true,
  });

  const recommended = Math.max(0, Number(heuristic?.recommendedPrice) || 0);
  const services =
    recommended > 0
      ? [
          {
            id: "ai_1",
            name: String(service || title || heuristic?.serviceType || "Service").slice(
              0,
              200,
            ),
            qty: 1,
            unitPrice: recommended,
            price: recommended,
            notes: "",
          },
        ]
      : [];

  return {
    title: String(title || service || heuristic?.serviceType || "Website lead estimate").slice(
      0,
      200,
    ),
    clientName: String(clientName || "").slice(0, 200).trim(),
    address: String(address || "").slice(0, 300).trim(),
    services,
    scopeNotes: String(details || "").slice(0, 2000).trim(),
    assumptions: Array.isArray(heuristic?.assumptions)
      ? heuristic.assumptions.slice(0, 6).map((v) => String(v).slice(0, 200))
      : [],
    confidence: Math.min(1, Math.max(0, Number(heuristic?.confidence || 50) / 100)),
    missing: services.length ? [] : ["pricing"],
    subtotal: services.reduce((sum, s) => sum + (s.price || 0), 0),
    source: "heuristic",
  };
}

export function buildHeuristicReference(draft) {
  try {
    const heuristic = generateEstimateSuggestion({
      title: draft?.title,
      service: draft?.title,
      details: draft?.scopeNotes,
      complexity: "medium",
      urgency: "normal",
    });
    return {
      recommendedPrice: heuristic?.recommendedPrice ?? null,
      lowPrice: heuristic?.lowPrice ?? null,
      highPrice: heuristic?.highPrice ?? null,
    };
  } catch {
    return null;
  }
}
