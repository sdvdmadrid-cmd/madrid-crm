import "server-only";
import { Configuration, PlaidApi, PlaidEnvironments } from "plaid";

let cachedPlaidClient = null;

function getServerEnvValue(key) {
  return String(process.env[key] || "").trim();
}

export function getPlaidEnv() {
  return String(getServerEnvValue("PLAID_ENV") || "sandbox").toLowerCase();
}

export function isPlaidConfigured() {
  return Boolean(
    getServerEnvValue("PLAID_CLIENT_ID") &&
      getServerEnvValue("PLAID_CLIENT_SECRET"),
  );
}

export function getPlaidClient() {
  if (cachedPlaidClient) {
    return cachedPlaidClient;
  }

  const clientId = getServerEnvValue("PLAID_CLIENT_ID");
  const clientSecret = getServerEnvValue("PLAID_CLIENT_SECRET");
  if (!clientId || !clientSecret) {
    return null;
  }

  const environmentKey = getPlaidEnv();
  const basePath = PlaidEnvironments[environmentKey] || PlaidEnvironments.sandbox;
  cachedPlaidClient = new PlaidApi(
    new Configuration({
      basePath,
      baseOptions: {
        headers: {
          "PLAID-CLIENT-ID": clientId,
          "PLAID-SECRET": clientSecret,
        },
      },
    }),
  );

  return cachedPlaidClient;
}

function requirePlaidClient() {
  const plaidClient = getPlaidClient();
  if (!plaidClient) {
    throw new Error("Plaid is not configured for Bill Payments");
  }
  return plaidClient;
}

export async function createPlaidLinkToken({ userId, redirectUri = "", language = "en" }) {
  const plaidClient = requirePlaidClient();
  const response = await plaidClient.linkTokenCreate({
    user: {
      client_user_id: String(userId || "").trim(),
    },
    client_name: "ContractorFlow",
    products: ["auth"],
    country_codes: ["US"],
    language,
    redirect_uri: redirectUri || undefined,
  });

  return response.data;
}

export async function exchangePlaidPublicToken(publicToken) {
  const plaidClient = requirePlaidClient();
  const response = await plaidClient.itemPublicTokenExchange({
    public_token: String(publicToken || "").trim(),
  });
  return response.data;
}

export async function getPlaidAccounts(accessToken) {
  const plaidClient = requirePlaidClient();
  const response = await plaidClient.accountsGet({
    access_token: String(accessToken || "").trim(),
  });
  return response.data.accounts || [];
}

/**
 * Get a Plaid processor token for Stripe from a Plaid access_token and account_id
 */
export async function getPlaidProcessorToken(accessToken, accountId) {
  const plaidClient = requirePlaidClient();
  const response = await plaidClient.processorStripeBankAccountTokenCreate({
    access_token: accessToken,
    account_id: accountId,
  });
  return response.data.stripe_bank_account_token;
}

/**
 * Get Plaid account details (for display or metadata)
 */
export async function getPlaidBankAccountDetails(accessToken, accountId) {
  const plaidClient = requirePlaidClient();
  const response = await plaidClient.accountsGet({
    access_token: accessToken,
  });
  const account = (response.data.accounts || []).find((a) => a.account_id === accountId);
  return account || null;
}