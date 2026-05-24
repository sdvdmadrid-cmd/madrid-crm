"use client";

import { Suspense } from "react";
import ContractorPaymentsSettings from "@/components/settings/ContractorPaymentsSettings";

export default function SettingsPaymentsPage() {
  return (
    <Suspense fallback={null}>
      <ContractorPaymentsSettings />
    </Suspense>
  );
}
