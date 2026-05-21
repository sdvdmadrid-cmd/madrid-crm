/**
 * Product pillars — inspired by field-service ops, contractor payments,
 * and AI growth tools, without copying any single competitor.
 */

export const FIELDBASE_PILLARS = [
  {
    id: "run",
    accent: "#14b8a6",
    titleKey: "pillars.run.title",
    taglineKey: "pillars.run.tagline",
    descKey: "pillars.run.desc",
    links: [
      { href: "/clients", labelKey: "pillars.run.linkClients" },
      { href: "/jobs", labelKey: "pillars.run.linkJobs" },
      { href: "/calendar", labelKey: "pillars.run.linkCalendar" },
    ],
  },
  {
    id: "paid",
    accent: "#6366f1",
    titleKey: "pillars.paid.title",
    taglineKey: "pillars.paid.tagline",
    descKey: "pillars.paid.desc",
    links: [
      { href: "/invoices", labelKey: "pillars.paid.linkInvoices" },
      { href: "/invoices?focus=client-payments", labelKey: "pillars.paid.linkCollect" },
    ],
  },
  {
    id: "grow",
    accent: "#f59e0b",
    titleKey: "pillars.grow.title",
    taglineKey: "pillars.grow.tagline",
    descKey: "pillars.grow.desc",
    links: [
      { href: "/estimates", labelKey: "pillars.grow.linkEstimates" },
      { href: "/lead-inbox", labelKey: "pillars.grow.linkLeads" },
      { href: "/website", labelKey: "pillars.grow.linkWebsite" },
    ],
  },
];
