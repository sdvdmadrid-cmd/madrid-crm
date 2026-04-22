function dispatchStandardLeadEvent(metadata) {
  const leadPayload = {
    form_id: metadata.formId || "founder_access",
    placement: metadata.placement,
    language: metadata.language,
  };

  window.dataLayer?.push({
    event: "generate_lead",
    ...leadPayload,
  });

  if (typeof window.gtag === "function") {
    window.gtag("event", "generate_lead", leadPayload);
  }

  if (typeof window.plausible === "function") {
    window.plausible("generate_lead", { props: leadPayload });
  }
}

export function trackMarketingEvent(eventName, metadata = {}) {
  if (typeof window === "undefined") {
    return;
  }

  const payload = {
    event: eventName,
    ...metadata,
    ts: Date.now(),
  };

  window.dispatchEvent(
    new CustomEvent("contractorflow:marketing-event", {
      detail: payload,
    }),
  );

  window.dataLayer?.push(payload);

  if (typeof window.gtag === "function") {
    window.gtag("event", eventName, metadata);
  }

  if (typeof window.plausible === "function") {
    window.plausible(eventName, { props: metadata });
  }

  if (
    eventName === "founder_access_submit" ||
    eventName === "founder_access_account_submit"
  ) {
    dispatchStandardLeadEvent(metadata);
  }

  window.__contractorFlowMarketingEvents = [
    ...(window.__contractorFlowMarketingEvents || []),
    payload,
  ].slice(-50);
}
