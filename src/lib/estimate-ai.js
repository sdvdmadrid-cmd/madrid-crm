const SERVICE_PROFILES = [
  {
    key: "cleaning",
    terms: ["limpieza", "clean", "deep clean"],
    label: "Limpieza",
    laborRate: 22,
    baseHours: 2.5,
    materialsBase: 12,
    areaDivisor: 20,
    areaHours: 0.75,
  },
  {
    key: "gardening",
    terms: ["jardin", "jardineria", "garden", "landscape", "podar", "poda"],
    label: "Jardineria",
    laborRate: 28,
    baseHours: 3,
    materialsBase: 18,
    areaDivisor: 30,
    areaHours: 0.8,
  },
  {
    key: "painting",
    terms: ["pintura", "paint", "pintar"],
    label: "Pintura",
    laborRate: 35,
    baseHours: 5,
    materialsBase: 65,
    areaDivisor: 12,
    areaHours: 1,
  },
  {
    key: "plumbing",
    terms: ["plomeria", "plumbing", "fuga", "tuberia"],
    label: "Plomeria",
    laborRate: 45,
    baseHours: 2.5,
    materialsBase: 40,
    areaDivisor: 50,
    areaHours: 0.2,
  },
  {
    key: "electrical",
    terms: ["electricidad", "electrical", "cableado", "luz"],
    label: "Electricidad",
    laborRate: 48,
    baseHours: 2.5,
    materialsBase: 35,
    areaDivisor: 50,
    areaHours: 0.2,
  },
  {
    key: "maintenance",
    terms: ["mantenimiento", "maintenance", "repair", "reparacion"],
    label: "Mantenimiento",
    laborRate: 30,
    baseHours: 3,
    materialsBase: 20,
    areaDivisor: 35,
    areaHours: 0.6,
  },
];

const COMPLEXITY_MULTIPLIERS = {
  low: 0.85,
  standard: 1,
  high: 1.35,
};

const URGENCY_MULTIPLIERS = {
  flexible: 1,
  week: 1.08,
  urgent: 1.2,
};

function normalizeText(value) {
  return String(value || "")
    .trim()
    .toLowerCase();
}

function roundMoney(value) {
  return Math.max(0, Math.round(value / 5) * 5);
}

function roundHours(value) {
  return Math.round(value * 10) / 10;
}

function pickProfile(service, title, notes) {
  const combined = [service, title, notes].map(normalizeText).join(" ");
  return (
    SERVICE_PROFILES.find((profile) =>
      profile.terms.some((term) => combined.includes(term)),
    ) || {
      key: "general",
      label: "Servicio general",
      laborRate: 26,
      baseHours: 3,
      materialsBase: 15,
      areaDivisor: 35,
      areaHours: 0.5,
    }
  );
}

function detectScopeHours(notes) {
  const text = normalizeText(notes);
  let hours = 0;

  if (text.includes("profunda") || text.includes("deep")) hours += 1;
  if (text.includes("exterior")) hours += 1.2;
  if (text.includes("escalera") || text.includes("stairs")) hours += 0.7;
  if (
    text.includes("segundo piso") ||
    text.includes("2 pisos") ||
    text.includes("dos pisos")
  )
    hours += 1;
  if (text.includes("muebles") || text.includes("move furniture")) hours += 0.8;
  if (text.includes("urgente")) hours += 0.2;

  return hours;
}

function detectMaterialsMultiplier(notes) {
  const text = normalizeText(notes);
  let multiplier = 1;

  if (text.includes("premium")) multiplier += 0.35;
  if (text.includes("industrial")) multiplier += 0.25;
  if (text.includes("exterior")) multiplier += 0.15;

  return multiplier;
}

function buildConfidence(detailScore, hasDueDate, hasArea) {
  let confidence = 0.58 + detailScore * 0.08;
  if (hasDueDate) confidence += 0.06;
  if (hasArea) confidence += 0.1;
  return Math.max(0.55, Math.min(0.92, confidence));
}

export function generateEstimateSuggestion(input) {
  const title = normalizeText(input.title);
  const service = normalizeText(input.service);
  const scopeDetails = normalizeText(input.scopeDetails);
  const notes = normalizeText(input.notes);
  const dueDate = normalizeText(input.dueDate);
  const area = Number(input.squareMeters || 0);
  const travelMinutes = Math.max(Number(input.travelMinutes || 0), 0);
  const materialsIncluded = Boolean(input.materialsIncluded);
  const complexity = COMPLEXITY_MULTIPLIERS[input.complexity]
    ? input.complexity
    : "standard";
  const urgency = URGENCY_MULTIPLIERS[input.urgency]
    ? input.urgency
    : "flexible";

  const profile = pickProfile(service, title, `${scopeDetails} ${notes}`);
  const extraScopeHours = detectScopeHours(`${scopeDetails} ${notes}`);
  const areaHours =
    area > 0
      ? Math.max(0, (area - 20) / profile.areaDivisor) * profile.areaHours
      : 0;
  const baseHours = profile.baseHours + areaHours + extraScopeHours;
  const estimatedHours = roundHours(
    baseHours * COMPLEXITY_MULTIPLIERS[complexity],
  );

  const laborCost = estimatedHours * profile.laborRate;
  const materialsCost = materialsIncluded
    ? profile.materialsBase *
        detectMaterialsMultiplier(`${scopeDetails} ${notes}`) +
      Math.max(area, 0) * 0.12
    : 0;
  const travelCost = travelMinutes > 0 ? Math.max(8, travelMinutes * 0.45) : 0;
  const subtotal = laborCost + materialsCost + travelCost;
  const recommended = roundMoney(subtotal * URGENCY_MULTIPLIERS[urgency]);

  const detailScore = [title, service, scopeDetails, notes].filter(
    Boolean,
  ).length;
  const confidence = buildConfidence(detailScore, Boolean(dueDate), area > 0);
  const spread = confidence >= 0.8 ? 0.12 : confidence >= 0.68 ? 0.16 : 0.22;

  const low = roundMoney(recommended * (1 - spread));
  const high = roundMoney(recommended * (1 + spread));

  const assumptions = [
    `Servicio clasificado como ${profile.label.toLowerCase()}.`,
    materialsIncluded
      ? "El estimado incluye materiales."
      : "El estimado excluye materiales.",
    area > 0
      ? `Se consideraron ${area} m2 aproximados.`
      : "No se indico superficie, se uso un tamano base.",
  ];

  const rationale = [
    `Tarifa base de mano de obra: $${profile.laborRate}/hora para ${profile.label.toLowerCase()}.`,
    `Tiempo estimado: ${estimatedHours} horas con complejidad ${complexity}.`,
    urgency === "urgent"
      ? "Se aplico recargo por urgencia."
      : urgency === "week"
        ? "Se aplico un ajuste leve por ejecucion esta semana."
        : "Sin recargo de urgencia.",
  ];

  return {
    serviceType: profile.label,
    recommendedPrice: recommended,
    lowPrice: low,
    highPrice: high,
    estimatedHours,
    laborRate: profile.laborRate,
    confidence: Math.round(confidence * 100),
    lineItems: [
      { label: "Mano de obra", amount: roundMoney(laborCost) },
      { label: "Materiales", amount: roundMoney(materialsCost) },
      { label: "Traslado", amount: roundMoney(travelCost) },
    ],
    assumptions,
    rationale,
    generatedAt: new Date().toISOString(),
  };
}
