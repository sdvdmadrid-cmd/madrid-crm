"use client";

import PublicBillPaymentsMenu from "./Menu";

export default function PublicBillPaymentsLayout({ children }) {
  return (
    <div style={{ maxWidth: 1080, margin: "0 auto", padding: 24 }}>
      <PublicBillPaymentsMenu />
      <div>{children}</div>
    </div>
  );
}
