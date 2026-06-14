/**
 * Route → workspace page metadata for the AI assistant.
 */

const PAGE_DEFS = [
  {
    match: (path) => path.startsWith("/website"),
    id: "website_builder",
    label: "Website Builder",
    industryKey: null,
    capabilities: [
      "website.copy",
      "website.services",
      "website.gallery",
      "website.seo",
      "website.hero",
      "website.forms",
    ],
  },
  {
    match: (path) => path.startsWith("/estimates"),
    id: "estimates",
    label: "Estimates",
    capabilities: ["estimates.draft", "estimates.navigate"],
  },
  {
    match: (path) => path.startsWith("/invoices"),
    id: "invoices",
    label: "Invoices",
    capabilities: ["invoices.navigate"],
  },
  {
    match: (path) => path.startsWith("/lead-inbox"),
    id: "lead_inbox",
    label: "Lead Inbox",
    capabilities: ["crm.leads", "crm.lead_status", "crm.navigate"],
  },
  {
    match: (path) => path.startsWith("/clients") || path.startsWith("/crm"),
    id: "crm",
    label: "CRM & Leads",
    capabilities: ["crm.summary", "crm.leads", "crm.navigate"],
  },
  {
    match: (path) => path.startsWith("/calendar") || path.startsWith("/appointments"),
    id: "scheduling",
    label: "Calendar",
    capabilities: ["schedule.parse", "schedule.navigate"],
  },
  {
    match: (path) => path.startsWith("/jobs"),
    id: "jobs",
    label: "Jobs & Projects",
    capabilities: ["jobs.create", "jobs.schedule", "jobs.navigate"],
  },
  {
    match: (path) => path.startsWith("/payroll"),
    id: "payroll",
    label: "Payroll",
    capabilities: ["payroll.employees", "payroll.runs", "payroll.reports"],
  },
  {
    match: (path) => path.startsWith("/subscriptions") || path.startsWith("/bill-payments"),
    id: "subscriptions",
    label: "Subscriptions & Billing",
    capabilities: ["billing.status", "billing.upgrade"],
  },
  {
    match: (path) => path.startsWith("/contracts"),
    id: "contracts",
    label: "Contracts",
    capabilities: ["contracts.create", "contracts.navigate"],
  },
  {
    match: (path) => path.startsWith("/dashboard"),
    id: "dashboard",
    label: "Dashboard",
    capabilities: ["dashboard.summary", "navigate"],
  },
  {
    match: (path) => path.startsWith("/services-catalog"),
    id: "services_catalog",
    label: "Services Catalog",
    capabilities: ["catalog.navigate"],
  },
  {
    match: (path) => path.startsWith("/settings") || path.startsWith("/company"),
    id: "settings",
    label: "Settings",
    capabilities: ["settings.navigate"],
  },
  {
    match: (path) => path.startsWith("/owner") || path.startsWith("/admin"),
    id: "admin",
    label: "Platform Admin",
    capabilities: ["admin.flags", "admin.insights"],
  },
];

export function resolvePageFromPathname(pathname = "") {
  const path = String(pathname || "").trim() || "/";
  const hit = PAGE_DEFS.find((def) => def.match(path));
  if (hit) {
    return {
      id: hit.id,
      label: hit.label,
      capabilities: hit.capabilities,
      industryKey: hit.industryKey,
    };
  }
  return {
    id: "general",
    label: "FieldBase Workspace",
    capabilities: ["navigate", "proposal", "crm.summary"],
  };
}
