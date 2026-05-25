import { Suspense } from "react";
import LeaveReviewClient from "./LeaveReviewClient";

export const dynamic = "force-dynamic";

export const metadata = {
  title: "Leave a review",
  description: "Share your experience with your contractor.",
  robots: { index: false, follow: false },
};

export default async function LeaveReviewPage({ params }) {
  const { token } = await params;
  return (
    <Suspense fallback={<div style={{ padding: 24 }}>Loading…</div>}>
      <LeaveReviewClient token={String(token || "")} />
    </Suspense>
  );
}
