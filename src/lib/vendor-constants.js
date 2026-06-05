export const VENDOR_TABLE = "vendors";

export const VENDOR_CATEGORIES = [
  { id: "material_store", label: "Material Stores" },
  { id: "subcontractor", label: "Subcontractors" },
  { id: "equipment_rental", label: "Equipment Rental Companies" },
  { id: "dump_site", label: "Dump Sites" },
  { id: "fuel", label: "Fuel Vendors" },
  { id: "nursery", label: "Nurseries & Landscape Supply" },
  { id: "trucking", label: "Trucking Companies" },
  { id: "office", label: "Office & General" },
  { id: "other", label: "Other" },
];

export const VENDOR_CATEGORY_IDS = new Set(VENDOR_CATEGORIES.map((c) => c.id));

export const BILL_EXPENSE_CATEGORIES = [
  { id: "materials", label: "Materials" },
  { id: "equipment", label: "Equipment" },
  { id: "subcontractor", label: "Subcontractors" },
  { id: "fuel", label: "Fuel" },
  { id: "dump_fee", label: "Dump Fees" },
  { id: "office", label: "Office Expenses" },
  { id: "insurance", label: "Insurance" },
  { id: "payroll", label: "Payroll Services" },
  { id: "general", label: "Other" },
];

export const BILL_STATUS_VALUES = new Set(["open", "paid", "overdue", "cancelled"]);

export function normalizeVendorCategory(value) {
  const id = String(value || "").trim().toLowerCase();
  return VENDOR_CATEGORY_IDS.has(id) ? id : "other";
}

export function vendorCategoryLabel(id) {
  return VENDOR_CATEGORIES.find((c) => c.id === id)?.label || "Other";
}

export function formatVendorAddress(vendor = {}) {
  const parts = [
    vendor.addressStreet || vendor.address_street,
    vendor.addressCity || vendor.address_city,
    vendor.addressState || vendor.address_state,
    vendor.addressZip || vendor.address_zip,
  ].filter(Boolean);
  return parts.join(", ");
}
