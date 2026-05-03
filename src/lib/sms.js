import "server-only";

const SMS_PROVIDER = (process.env.SMS_PROVIDER || "mock").toLowerCase();
const TWILIO_ACCOUNT_SID = process.env.TWILIO_ACCOUNT_SID || "";
const TWILIO_AUTH_TOKEN = process.env.TWILIO_AUTH_TOKEN || "";
const TWILIO_FROM_NUMBER = process.env.TWILIO_FROM_NUMBER || "";

function normalizePhone(value) {
  return String(value || "").replace(/[^0-9+]/g, "").trim();
}

function sendWithMock() {
  return {
    success: true,
    provider: "mock",
    providerMessageId: `mock_sms_${Date.now()}_${Math.random().toString(36).slice(2, 9)}`,
  };
}

async function sendWithTwilio({ to, text }) {
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN || !TWILIO_FROM_NUMBER) {
    return {
      success: false,
      provider: "twilio",
      error: "Missing Twilio SMS configuration",
    };
  }

  const params = new URLSearchParams({
    To: to,
    From: TWILIO_FROM_NUMBER,
    Body: text,
  });

  const auth = Buffer.from(`${TWILIO_ACCOUNT_SID}:${TWILIO_AUTH_TOKEN}`).toString("base64");
  const res = await fetch(
    `https://api.twilio.com/2010-04-01/Accounts/${TWILIO_ACCOUNT_SID}/Messages.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Basic ${auth}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: params.toString(),
    },
  );

  const payload = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      success: false,
      provider: "twilio",
      error: payload?.message || `Twilio error ${res.status}`,
    };
  }

  return {
    success: true,
    provider: "twilio",
    providerMessageId: payload?.sid || null,
  };
}

export async function sendTextMessage({ to, text }) {
  const normalizedTo = normalizePhone(to);
  if (!normalizedTo || !text) {
    return {
      success: false,
      provider: SMS_PROVIDER,
      error: "Invalid SMS payload",
    };
  }

  if (SMS_PROVIDER === "twilio") {
    return sendWithTwilio({ to: normalizedTo, text: String(text) });
  }

  return sendWithMock();
}
