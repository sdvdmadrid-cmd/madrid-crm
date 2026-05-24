const COPY = {
  en: {
    nav: {
      services: "Services",
      about: "About",
      contact: "Contact",
      getQuote: "Get a Quote",
    },
    hero: {
      licensedInsured: "Licensed & Insured",
      freeEstimates: "Free estimates — no obligation, same-day response",
      ourServices: "Our Services",
      requestEstimate: "Request Estimate",
    },
    stats: {
      freeQuote: "Free Quote",
      noObligation: "No obligation estimate",
      licensed: "Licensed",
      licensedInsured: "Fully licensed & insured",
      topRated: "5★",
      topRatedLabel: "Top-rated local contractor",
      sameDay: "Same Day",
      sameDayLabel: "Response within hours",
    },
    services: {
      title: "Our Services",
      subtitle: "Everything you need — from initial quote to completed project.",
      getQuote: "Get a quote →",
    },
    about: {
      title: "About {{company}}",
      requestQuote: "Request a quote",
    },
    gallery: {
      title: "Recent Work",
      subtitle: "See real projects completed by {{company}}.",
      caption: "Completed project",
    },
    cta: {
      callToday: "Call us today.",
      getQuote: "Get your free quote.",
      respondFast: "We respond fast.",
      noObligation: "No obligation. Free estimate. Same-day response.",
      contactForm: "Contact via secure request form",
    },
    footer: {
      tagline: "Professional home services you can trust. Request a quote anytime.",
      contact: "Contact",
      follow: "Follow",
      requestQuote: "Request a Quote",
      poweredBy: "Powered by",
    },
    request: {
      eyebrow: "REQUEST A QUOTE",
      title: "Tell {{company}} about your project",
      subtitle:
        "Submit once — your request goes straight to the contractor CRM. Typical response: same day.",
      back: "← Back to website",
    },
    form: {
      name: "Name *",
      phone: "Phone *",
      email: "Email *",
      emailOptional: "Email (optional)",
      address: "Address (optional)",
      addressPlaceholder: "123 Main St, City, State ZIP",
      service: "Service needed *",
      selectService: "Select service",
      other: "Other",
      message: "Message *",
      messagePlaceholder: "Tell us what you need done",
      photo: "Photo upload (optional)",
      sending: "Sending...",
      sent: "Request Sent",
      tryAgain: "Try Again",
      send: "Send Request",
      success: "Request received. We will contact you soon.",
      imageOnly: "Please upload an image file.",
      imageLarge: "Image is too large. Max size is 4MB.",
      imageReadFailed: "Failed to read image file.",
    },
  },
  es: {
    nav: {
      services: "Servicios",
      about: "Nosotros",
      contact: "Contacto",
      getQuote: "Pedir cotización",
    },
    hero: {
      licensedInsured: "Con licencia y seguro",
      freeEstimates: "Cotizaciones gratis — sin compromiso, respuesta el mismo día",
      ourServices: "Nuestros servicios",
      requestEstimate: "Solicitar cotización",
    },
    stats: {
      freeQuote: "Cotización gratis",
      noObligation: "Sin compromiso",
      licensed: "Con licencia",
      licensedInsured: "Licencia y seguro al día",
      topRated: "5★",
      topRatedLabel: "Contratista local mejor calificado",
      sameDay: "Mismo día",
      sameDayLabel: "Respuesta en horas",
    },
    services: {
      title: "Nuestros servicios",
      subtitle: "Todo lo que necesitas — desde la cotización hasta el proyecto terminado.",
      getQuote: "Pedir cotización →",
    },
    about: {
      title: "Sobre {{company}}",
      requestQuote: "Solicitar cotización",
    },
    gallery: {
      title: "Trabajos recientes",
      subtitle: "Proyectos reales completados por {{company}}.",
      caption: "Proyecto completado",
    },
    cta: {
      callToday: "Llámanos hoy.",
      getQuote: "Obtén tu cotización gratis.",
      respondFast: "Respondemos rápido.",
      noObligation: "Sin compromiso. Cotización gratis. Respuesta el mismo día.",
      contactForm: "Contacto por formulario seguro",
    },
    footer: {
      tagline: "Servicios profesionales en los que puedes confiar. Pide cotización cuando quieras.",
      contact: "Contacto",
      follow: "Síguenos",
      requestQuote: "Solicitar cotización",
      poweredBy: "Con tecnología de",
    },
    request: {
      eyebrow: "SOLICITAR COTIZACIÓN",
      title: "Cuéntale a {{company}} sobre tu proyecto",
      subtitle:
        "Envía una vez — tu solicitud llega directo al CRM del contratista. Respuesta típica: el mismo día.",
      back: "← Volver al sitio web",
    },
    form: {
      name: "Nombre *",
      phone: "Teléfono *",
      email: "Correo *",
      emailOptional: "Correo (opcional)",
      address: "Dirección (opcional)",
      addressPlaceholder: "Calle 123, Ciudad, Estado CP",
      service: "Servicio *",
      selectService: "Selecciona un servicio",
      other: "Otro",
      message: "Mensaje *",
      messagePlaceholder: "Cuéntanos qué necesitas",
      photo: "Foto (opcional)",
      sending: "Enviando...",
      sent: "Solicitud enviada",
      tryAgain: "Reintentar",
      send: "Enviar solicitud",
      success: "Recibimos tu solicitud. Te contactaremos pronto.",
      imageOnly: "Sube un archivo de imagen.",
      imageLarge: "La imagen es muy grande. Máximo 4 MB.",
      imageReadFailed: "No se pudo leer la imagen.",
    },
  },
};

export function resolvePublicSiteLocale(raw) {
  const lang = String(raw || "en").trim().toLowerCase();
  return lang === "es" ? "es" : "en";
}

export function getPublicSiteCopy(rawLocale) {
  const locale = resolvePublicSiteLocale(rawLocale);
  return COPY[locale];
}

export function fillPublicSiteTemplate(template, vars = {}) {
  return String(template || "").replace(/\{\{(\w+)\}\}/g, (_, key) =>
    vars[key] != null ? String(vars[key]) : "",
  );
}
