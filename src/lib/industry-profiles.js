const INDUSTRY_PROFILES = {
  landscaping_hardscaping: {
    key: "landscaping_hardscaping",
    label: "Landscaping & Hardscaping",
    websiteServices: [
      "Lawn Maintenance",
      "Mulch Installation",
      "Irrigation Repair",
      "Retaining Walls",
      "Patio & Pavers",
    ],
    estimateTemplate: [
      { description: "Lawn mowing and edging", quantity: "1", unitPrice: "180" },
      { description: "Mulch delivery and spread", quantity: "3", unitPrice: "65" },
    ],
    estimateFields: [
      { key: "propertySize", label: "Property size", placeholder: "e.g. 8,000 sq ft" },
      { key: "irrigationStatus", label: "Irrigation status", placeholder: "Working / Repair needed" },
    ],
    requestServiceOptions: [
      "Lawn Maintenance",
      "Mulch / Rock",
      "Irrigation",
      "Hardscape Install",
      "Yard Cleanup",
    ],
  },
  roofing: {
    key: "roofing",
    label: "Roofing",
    websiteServices: [
      "Roof Inspection",
      "Roof Repair",
      "Shingle Replacement",
      "Full Roof Replacement",
      "Emergency Leak Service",
    ],
    estimateTemplate: [
      { description: "Roof inspection and report", quantity: "1", unitPrice: "149" },
      { description: "Shingle repair area", quantity: "120", unitPrice: "4.5" },
    ],
    estimateFields: [
      { key: "roofType", label: "Roof type", placeholder: "Asphalt, Tile, Metal..." },
      { key: "roofPitch", label: "Roof pitch", placeholder: "e.g. 6/12" },
    ],
    requestServiceOptions: [
      "Roof Inspection",
      "Leak Repair",
      "Shingle Repair",
      "Full Replacement",
      "Emergency Service",
    ],
  },
  painting: {
    key: "painting",
    label: "Painting",
    websiteServices: [
      "Interior Painting",
      "Exterior Painting",
      "Cabinet Refinishing",
      "Drywall Patch & Paint",
      "Commercial Repaint",
    ],
    estimateTemplate: [
      { description: "Prep and masking", quantity: "1", unitPrice: "225" },
      { description: "Interior wall painting", quantity: "900", unitPrice: "1.35" },
    ],
    estimateFields: [
      { key: "paintType", label: "Paint type", placeholder: "Flat, Eggshell, Satin..." },
      { key: "surfaceCondition", label: "Surface condition", placeholder: "Good / Needs prep" },
    ],
    requestServiceOptions: [
      "Interior Painting",
      "Exterior Painting",
      "Cabinet Painting",
      "Drywall + Paint",
      "Commercial Painting",
    ],
  },
  plumbing: {
    key: "plumbing",
    label: "Plumbing",
    websiteServices: [
      "Leak Repair",
      "Drain Cleaning",
      "Water Heater Install",
      "Fixture Replacement",
      "Emergency Plumbing",
    ],
    estimateTemplate: [
      { description: "Diagnosis and service call", quantity: "1", unitPrice: "125" },
      { description: "Repair labor", quantity: "2", unitPrice: "145" },
    ],
    estimateFields: [
      { key: "fixtureType", label: "Fixture/system", placeholder: "Sink, toilet, water heater..." },
      { key: "urgency", label: "Urgency", placeholder: "Same day / Flexible" },
    ],
    requestServiceOptions: [
      "Leak Repair",
      "Drain Cleaning",
      "Water Heater",
      "Fixture Install",
      "Emergency Plumbing",
    ],
  },
  hvac: {
    key: "hvac",
    label: "HVAC",
    websiteServices: [
      "AC Repair",
      "Heating Repair",
      "Tune-Up / Maintenance",
      "System Replacement",
      "Ductwork Service",
    ],
    estimateTemplate: [
      { description: "System diagnostic", quantity: "1", unitPrice: "129" },
      { description: "Repair labor", quantity: "2", unitPrice: "160" },
    ],
    estimateFields: [
      { key: "systemType", label: "System type", placeholder: "Split, package, heat pump..." },
      { key: "unitAge", label: "Unit age", placeholder: "Approx. years" },
    ],
    requestServiceOptions: [
      "AC Repair",
      "Heating Repair",
      "Maintenance",
      "Replacement Quote",
      "Ductwork",
    ],
  },
  electrical: {
    key: "electrical",
    label: "Electrical",
    websiteServices: [
      "Panel Upgrade",
      "Wiring Repair",
      "Lighting Installation",
      "Outlet / Switch Service",
      "Troubleshooting",
    ],
    estimateTemplate: [
      { description: "Electrical diagnostic", quantity: "1", unitPrice: "140" },
      { description: "Repair labor", quantity: "2", unitPrice: "155" },
    ],
    estimateFields: [
      { key: "panelAmps", label: "Panel amperage", placeholder: "100A / 200A" },
      { key: "issueArea", label: "Issue area", placeholder: "Kitchen, panel, exterior..." },
    ],
    requestServiceOptions: [
      "Panel Upgrade",
      "Wiring Repair",
      "Lighting Install",
      "Outlet / Switch",
      "Electrical Troubleshooting",
    ],
  },
  cleaning: {
    key: "cleaning",
    label: "Cleaning",
    websiteServices: [
      "Deep Cleaning",
      "Recurring Cleaning",
      "Move-In / Move-Out",
      "Post-Construction Cleaning",
      "Office Cleaning",
    ],
    estimateTemplate: [
      { description: "Cleaning crew labor", quantity: "4", unitPrice: "55" },
      { description: "Supplies and materials", quantity: "1", unitPrice: "45" },
    ],
    estimateFields: [
      { key: "propertyType", label: "Property type", placeholder: "Home, office, retail..." },
      { key: "frequency", label: "Frequency", placeholder: "One-time / Weekly / Monthly" },
    ],
    requestServiceOptions: [
      "Deep Cleaning",
      "Recurring Cleaning",
      "Move-In / Move-Out",
      "Post-Construction",
      "Office Cleaning",
    ],
  },
  general: {
    key: "general",
    label: "General Contractor",
    websiteServices: [
      "General Repairs",
      "Remodel Projects",
      "Maintenance",
      "Installations",
      "Project Management",
    ],
    estimateTemplate: [
      { description: "Project planning and site visit", quantity: "1", unitPrice: "200" },
      { description: "Labor", quantity: "8", unitPrice: "95" },
    ],
    estimateFields: [
      { key: "projectScope", label: "Project scope", placeholder: "Kitchen, bath, addition..." },
      { key: "timeline", label: "Target timeline", placeholder: "Preferred start date" },
    ],
    requestServiceOptions: [
      "General Repair",
      "Remodel",
      "Installation",
      "Maintenance",
      "Other",
    ],
  },
};

const DEFAULT_INDUSTRY_KEY = "landscaping_hardscaping";

export function getIndustryProfile(industry) {
  const normalized = String(industry || "")
    .trim()
    .toLowerCase();

  return INDUSTRY_PROFILES[normalized] || INDUSTRY_PROFILES[DEFAULT_INDUSTRY_KEY];
}

export function getIndustryOptions() {
  return Object.values(INDUSTRY_PROFILES).map((profile) => ({
    value: profile.key,
    label: profile.label,
  }));
}

export { DEFAULT_INDUSTRY_KEY, INDUSTRY_PROFILES };
