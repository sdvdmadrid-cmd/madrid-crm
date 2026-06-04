export const OWNER_NAV_GROUPS = [
  {
    id: "command",
    labelKey: "ownerNav.groupCommand",
    items: [
      { labelKey: "ownerNav.overview", href: "/owner/overview", icon: "◉" },
      { labelKey: "ownerNav.paymentCards", href: "/owner/payment-cards", icon: "💳" },
      { labelKey: "ownerNav.revenue", href: "/owner/revenue", icon: "📈" },
      { labelKey: "ownerNav.invoiceRevenue", href: "/owner/invoice-revenue", icon: "🧾" },
      { labelKey: "ownerNav.tenants", href: "/owner/tenants", icon: "🏢" },
    ],
  },
  {
    id: "ops",
    labelKey: "ownerNav.groupOps",
    items: [
      { labelKey: "ownerNav.aiOps", href: "/owner/ai-ops", icon: "🤖" },
      { labelKey: "ownerNav.monitoring", href: "/owner/monitoring", icon: "📡" },
      { labelKey: "ownerNav.emails", href: "/owner/emails", icon: "✉️" },
      { labelKey: "ownerNav.featureFlags", href: "/owner/feature-flags", icon: "🎛️" },
    ],
  },
  {
    id: "trust",
    labelKey: "ownerNav.groupTrust",
    items: [
      { labelKey: "ownerNav.activity", href: "/owner/activity", icon: "📋" },
      { labelKey: "ownerNav.support", href: "/owner/support", icon: "🎧" },
      { labelKey: "ownerNav.security", href: "/owner/security", icon: "🔒" },
      { labelKey: "ownerNav.settings", href: "/owner/settings", icon: "⚙️" },
    ],
  },
];

export function getOwnerPageTitleKey(pathname) {
  const path = String(pathname || "");
  for (const group of OWNER_NAV_GROUPS) {
    for (const item of group.items) {
      if (path.startsWith(item.href)) {
        return item.labelKey;
      }
    }
  }
  if (path.startsWith("/owner")) return "ownerNav.overview";
  return "ownerNav.commandCenter";
}
