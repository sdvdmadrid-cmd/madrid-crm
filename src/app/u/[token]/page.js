import { Suspense } from "react";
import MobileUploadClient from "./MobileUploadClient";

// Public, no-session mobile-friendly photo upload page. Users land here
// by scanning a QR code generated in the contractor's website builder.
// The token in the URL is the JWT issued by /api/website-builder/qr-token
// and carries the tenant id internally — the page itself doesn't need
// to know who the contractor is.
export const dynamic = "force-dynamic";

export const metadata = {
  title: "Upload photos",
  description: "Add photos to your contractor's website gallery.",
  robots: { index: false, follow: false },
};

export default async function MobileUploadPage({ params }) {
  const { token } = await params;
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <MobileUploadClient token={String(token || "")} />
    </Suspense>
  );
}
