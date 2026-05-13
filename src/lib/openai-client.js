import "server-only";

import OpenAI from "openai";

let cachedClient = null;

export function getOpenAiClient() {
  if (cachedClient) return cachedClient;

  const apiKey = String(process.env.OPENAI_API_KEY || "").trim();
  if (!apiKey) {
    throw new Error("OPENAI_API_KEY is not configured");
  }

  cachedClient = new OpenAI({
    apiKey,
    maxRetries: 0,
  });

  return cachedClient;
}
