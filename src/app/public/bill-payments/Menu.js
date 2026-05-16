"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Overview", href: "/public/bill-payments" },
  { label: "Add Bill", href: "/public/bill-payments/new" },
  { label: "Categories", href: "/public/bill-payments/categories" },
  { label: "Payment Methods", href: "/public/bill-payments/payment-methods" },
  { label: "History", href: "/public/bill-payments/history" },
  { label: "Help", href: "/public/bill-payments/help" },
];

export default function PublicBillPaymentsMenu() {
  const pathname = usePathname();
  return (
    <nav style={{ background: "#f1f5f9", borderRadius: 12, padding: 16, marginBottom: 24 }}>
      <ul style={{ display: "flex", gap: 24, listStyle: "none", margin: 0, padding: 0 }}>
        {menuItems.map((item) => (
          <li key={item.href}>
            <Link
              href={item.href}
              style={{
                color: pathname === item.href ? "#0ea5e9" : "#334155",
                fontWeight: pathname === item.href ? 700 : 500,
                textDecoration: "none",
                padding: "6px 14px",
                borderRadius: 8,
                background: pathname === item.href ? "#e0f2fe" : "transparent",
                transition: "background 0.2s, color 0.2s",
              }}
            >
              {item.label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}
