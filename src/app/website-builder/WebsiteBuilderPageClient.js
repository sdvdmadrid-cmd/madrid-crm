"use client";

import dynamic from "next/dynamic";

const WebsiteBuilderClient = dynamic(
  () => import("@/components/website-builder/WebsiteBuilderClient"),
  {
    ssr: false,
    loading: () => (
      <div className="wb-page-root" style={{ padding: 24, opacity: 0.85 }}>
        Loading website builder…
      </div>
    ),
  },
);

export default function WebsiteBuilderPageClient() {
  return (
    <div className="wb-page-root">
      <WebsiteBuilderClient />
    </div>
  );
}
