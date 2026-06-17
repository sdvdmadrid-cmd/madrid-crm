export function collectStripeWebhookSecrets(env = process.env) {
  const secrets = [];
  for (const key of ["STRIPE_WEBHOOK_SECRET", "STRIPE_WEBHOOK_SECRET_PREVIOUS"]) {
    const value = String(env[key] || "").trim();
    if (value) secrets.push(value);
  }

  const combined = String(env.STRIPE_WEBHOOK_SECRETS || "").trim();
  if (combined) {
    for (const part of combined.split(",")) {
      const trimmed = part.trim();
      if (trimmed) secrets.push(trimmed);
    }
  }

  return [...new Set(secrets)];
}

export function verifyStripeWebhookPayload(stripe, rawBody, signature, secrets) {
  const list = Array.isArray(secrets) ? secrets : collectStripeWebhookSecrets();
  if (!stripe || list.length === 0 || !signature) {
    return null;
  }

  for (const secret of list) {
    try {
      return stripe.webhooks.constructEvent(rawBody, signature, secret);
    } catch {
      continue;
    }
  }

  return null;
}
