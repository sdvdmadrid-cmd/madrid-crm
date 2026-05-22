/**
 * Bill pay categories — broad coverage for contractor and consumer bills.
 * Providers live in `bill_providers` (DB); this drives UI filters.
 */

export const BILL_PAY_CATEGORIES = [
  {
    id: "utilities",
    label: "Utilities",
    icon: "⚡",
    description: "Electric, gas, water",
    defaultTags: ["utility"],
  },
  {
    id: "credit_card",
    label: "Credit Cards",
    icon: "💳",
    description: "Issuers & store cards",
    defaultTags: ["credit"],
  },
  {
    id: "auto_finance",
    label: "Auto & Dealer",
    icon: "🚗",
    description: "Loans, leases, dealers",
    defaultTags: ["auto", "dealer"],
  },
  {
    id: "insurance",
    label: "Insurance",
    icon: "🛡️",
    description: "Auto, home, business",
    defaultTags: ["insurance"],
  },
  {
    id: "internet",
    label: "Internet & Phone",
    icon: "📡",
    description: "Mobile, fiber, cable",
    defaultTags: ["internet", "phone"],
  },
  {
    id: "mortgage_rent",
    label: "Mortgage & Rent",
    icon: "🏠",
    description: "Landlord, HOA, lender",
    defaultTags: ["rent", "mortgage"],
  },
  {
    id: "healthcare",
    label: "Healthcare",
    icon: "🏥",
    description: "Medical, dental, vision",
    defaultTags: ["healthcare"],
  },
  {
    id: "government",
    label: "Government & Taxes",
    icon: "🏛️",
    description: "IRS, DMV, permits",
    defaultTags: ["government", "tax"],
  },
  {
    id: "equipment",
    label: "Equipment",
    icon: "🛠️",
    description: "Tool & fleet finance",
    defaultTags: ["equipment"],
  },
  {
    id: "vehicle",
    label: "Truck / Fleet",
    icon: "🚛",
    description: "Commercial vehicles",
    defaultTags: ["vehicle", "fleet"],
  },
  {
    id: "rent",
    label: "Rent / Storage",
    icon: "🏢",
    description: "Storage units, yard",
    defaultTags: ["rent"],
  },
  {
    id: "payroll",
    label: "Payroll & Subs",
    icon: "👷",
    description: "Subs & payroll services",
    defaultTags: ["payroll"],
  },
  {
    id: "materials",
    label: "Materials",
    icon: "🧱",
    description: "Suppliers & vendors",
    defaultTags: ["materials"],
  },
  {
    id: "subscriptions",
    label: "Subscriptions",
    icon: "📦",
    description: "SaaS & services",
    defaultTags: ["subscription"],
  },
  {
    id: "general",
    label: "Other",
    icon: "📄",
    description: "Any other payee",
    defaultTags: [],
  },
];

export const BILL_CATEGORY_IDS = new Set(
  BILL_PAY_CATEGORIES.map((c) => c.id),
);

export const CATEGORIES_WITH_MIN_PAYMENT = new Set([
  "credit_card",
  "auto_finance",
  "equipment",
  "vehicle",
]);
