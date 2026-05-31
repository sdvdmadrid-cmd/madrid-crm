"use client";

import { useCallback, useEffect, useState } from "react";
import "@/styles/public-site-premium.css";
import LeadRequestModal from "@/components/site/LeadRequestModal";
import {
  PUBLIC_SITE_SECTIONS,
  revealSectionElement,
  scrollToPublicSiteSection,
} from "@/lib/public-site-navigation";

const OPEN_EVENT = "fieldbase:open-lead-form";

function revealLeadSections() {
  revealSectionElement(document.getElementById(PUBLIC_SITE_SECTIONS.requestService));
}

export function openPublicLeadForm(detail = {}) {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(OPEN_EVENT, { detail }));
}

export default function PublicSiteLeadExperience({
  children,
  slug,
  serviceOptions = [],
  locale = "en",
  themeColor = "#1d4ed8",
  companyName = "",
}) {
  const [modalOpen, setModalOpen] = useState(false);
  const [initialService, setInitialService] = useState("");

  const openForm = useCallback((detail = {}) => {
    revealLeadSections();
    setInitialService(String(detail.service || "").trim());
    setModalOpen(true);
    if (!detail.skipScroll) {
      scrollToPublicSiteSection(PUBLIC_SITE_SECTIONS.requestService);
    }
  }, []);

  useEffect(() => {
    const onOpen = (e) => openForm(e.detail || {});
    window.addEventListener(OPEN_EVENT, onOpen);
    revealLeadSections();

    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
    };
  }, [openForm]);

  return (
    <>
      {children}
      <LeadRequestModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        slug={slug}
        serviceOptions={serviceOptions}
        initialService={initialService}
        locale={locale}
        themeColor={themeColor}
        companyName={companyName}
      />
    </>
  );
}
