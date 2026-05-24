"use client";

import { useCallback, useEffect, useState } from "react";
import "@/styles/public-site-premium.css";
import LeadRequestModal from "@/components/site/LeadRequestModal";

const OPEN_EVENT = "fieldbase:open-lead-form";

function revealLeadSections() {
  const section = document.getElementById("request-service");
  if (section) {
    section.classList.add("ps-visible");
    section.querySelectorAll(".ps-reveal").forEach((node) => node.classList.add("ps-visible"));
  }
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
    const section = document.getElementById("request-service");
    if (section && !detail.skipScroll) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, []);

  useEffect(() => {
    const onOpen = (e) => openForm(e.detail || {});
    window.addEventListener(OPEN_EVENT, onOpen);

    const onClick = (e) => {
      const anchor = e.target.closest?.('a[href="#request-service"], a[href*="#request-service"]');
      if (!anchor) return;
      e.preventDefault();
      openForm({});
    };

    document.addEventListener("click", onClick, true);

    if (typeof window !== "undefined" && window.location.hash === "#request-service") {
      openForm({ skipScroll: true });
    }

    revealLeadSections();

    return () => {
      window.removeEventListener(OPEN_EVENT, onOpen);
      document.removeEventListener("click", onClick, true);
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
