"use client";

import { useEffect } from "react";
import {
  handlePublicSiteNavClick,
  LEAD_FORM_SECTION_IDS,
  parseInPageHash,
  scrollToPublicSiteSection,
} from "@/lib/public-site-navigation";
import { openPublicLeadForm } from "@/components/site/PublicSiteLeadExperience";

export default function PublicSiteScrollNav() {
  useEffect(() => {
    const onClick = (event) => {
      handlePublicSiteNavClick(event, {
        onLeadForm: (detail) => openPublicLeadForm(detail || {}),
      });
    };

    document.addEventListener("click", onClick, true);

    const hash = parseInPageHash(
      typeof window !== "undefined" ? window.location.hash : "",
    );
    if (hash && document.getElementById(hash)) {
      scrollToPublicSiteSection(hash, { behavior: "auto" });
      if (LEAD_FORM_SECTION_IDS.has(hash)) {
        openPublicLeadForm({ skipScroll: true });
      }
    }

    return () => document.removeEventListener("click", onClick, true);
  }, []);

  return null;
}
