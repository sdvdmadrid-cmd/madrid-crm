function dispatchStandardLeadEvent(metadata) {
  const leadPayload = {
    form_id: metadata.formId || "account_signup",
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
    new CustomEvent("FieldBase:marketing-event", {
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
    eventName === "account_signup_submit" ||
    eventName === "account_create_submit"
  ) {
    dispatchStandardLeadEvent(metadata);
  }

  window.__FieldBaseMarketingEvents = [
    ...(window.__FieldBaseMarketingEvents || []),
    payload,
  ].slice(-50);
}
