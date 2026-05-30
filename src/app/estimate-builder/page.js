"use client";

import { Suspense, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

/**
 * Legacy /estimate-builder URL — single estimate workflow lives at /estimates/new.
 */
function EstimateBuilderRedirectInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    const params = new URLSearchParams();
    const clientId = String(searchParams.get("clientId") || "").trim();
    const legacyId = String(searchParams.get("id") || "").trim();

    if (clientId) params.set("clientId", clientId);
    if (legacyId) params.set("legacyBuilderId", legacyId);

    const query = params.toString();
    router.replace(query ? `/estimates/new?${query}` : "/estimates/new");
  }, [router, searchParams]);

  return (
    <div className="flex min-h-[40vh] items-center justify-center bg-slate-50 text-sm text-slate-500">
      Opening estimate editor…
    </div>
  );
}

export default function EstimateBuilderRedirectPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[40vh] items-center justify-center bg-slate-50 text-sm text-slate-500">
          Loading…
        </div>
      }
    >
      <EstimateBuilderRedirectInner />
    </Suspense>
  );
}
