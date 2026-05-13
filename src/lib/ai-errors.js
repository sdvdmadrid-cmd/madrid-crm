import "server-only";

const AI_ERROR_MESSAGES = {
  en: {
    insufficient_quota: "AI credits are exhausted. Please recharge OpenAI billing.",
    invalid_api_key: "AI service key is invalid. Contact support.",
    rate_limit_exceeded: "AI is busy right now. Please retry in a few seconds.",
    network_timeout: "AI request timed out. Please try again.",
    model_not_found: "Configured AI model is not available. Contact support.",
    monthly_cap_reached: "Monthly AI budget limit reached. Try again next month or increase cap.",
    throttled: "Too many AI requests. Please wait and retry.",
    unknown: "AI service is temporarily unavailable.",
  },
  es: {
    insufficient_quota: "Se agotaron los creditos de IA. Recarga la facturacion de OpenAI.",
    invalid_api_key: "La clave del servicio de IA no es valida. Contacta soporte.",
    rate_limit_exceeded: "La IA esta ocupada ahora. Intenta de nuevo en unos segundos.",
    network_timeout: "La solicitud de IA excedio el tiempo. Intenta nuevamente.",
    model_not_found: "El modelo de IA configurado no esta disponible. Contacta soporte.",
    monthly_cap_reached: "Se alcanzo el limite mensual de presupuesto IA. Intenta el proximo mes o aumenta el limite.",
    throttled: "Demasiadas solicitudes de IA. Espera un momento e intenta de nuevo.",
    unknown: "El servicio de IA no esta disponible temporalmente.",
  },
  pl: {
    insufficient_quota: "Kredyty AI sa wyczerpane. Doladuj rozliczenia OpenAI.",
    invalid_api_key: "Klucz uslugi AI jest nieprawidlowy. Skontaktuj sie z supportem.",
    rate_limit_exceeded: "AI jest teraz zajete. Sprobuj ponownie za chwile.",
    network_timeout: "Zadanie AI przekroczylo limit czasu. Sprobuj ponownie.",
    model_not_found: "Skonfigurowany model AI jest niedostepny. Skontaktuj sie z supportem.",
    monthly_cap_reached: "Osiagnieto miesieczny limit budzetu AI. Sprobuj w nastepnym miesiacu lub zwieksz limit.",
    throttled: "Zbyt wiele zapytan AI. Poczekaj chwile i sprobuj ponownie.",
    unknown: "Usluga AI jest tymczasowo niedostepna.",
  },
};

export function normalizeAiErrorCode(rawCode, status = 0, message = "") {
  const code = String(rawCode || "").trim().toLowerCase();
  const msg = String(message || "").toLowerCase();

  if (code === "insufficient_quota" || msg.includes("insufficient_quota")) {
    return "insufficient_quota";
  }
  if (code === "invalid_api_key" || msg.includes("invalid api key") || status === 401) {
    return "invalid_api_key";
  }
  if (code === "rate_limit_exceeded" || status === 429) {
    return "rate_limit_exceeded";
  }
  if (code === "model_not_found" || msg.includes("model") && msg.includes("not found")) {
    return "model_not_found";
  }
  if (
    code === "network_timeout" ||
    code.includes("timeout") ||
    msg.includes("timeout") ||
    msg.includes("timed out")
  ) {
    return "network_timeout";
  }
  if (code === "monthly_cap_reached") {
    return "monthly_cap_reached";
  }
  if (code === "throttled") {
    return "throttled";
  }

  return "unknown";
}

export function getAiUserMessage(code, language = "en") {
  const lang = ["en", "es", "pl"].includes(language) ? language : "en";
  return AI_ERROR_MESSAGES[lang]?.[code] || AI_ERROR_MESSAGES[lang].unknown;
}

export function buildAiErrorPayload({ code, language = "en", status = 502, technicalMessage = "" }) {
  const normalizedCode = normalizeAiErrorCode(code, status, technicalMessage);
  return {
    success: false,
    error: getAiUserMessage(normalizedCode, language),
    code: normalizedCode,
    details: technicalMessage ? String(technicalMessage).slice(0, 300) : undefined,
  };
}
