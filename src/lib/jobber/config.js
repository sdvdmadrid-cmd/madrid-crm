export const JOBBER_GRAPHQL_URL = "https://api.getjobber.com/api/graphql";
export const JOBBER_OAUTH_AUTHORIZE_URL =
  "https://api.getjobber.com/api/oauth/authorize";
export const JOBBER_OAUTH_TOKEN_URL = "https://api.getjobber.com/api/oauth/token";
export const JOBBER_OAUTH_COOKIE = "jobber_oauth_nonce";
export const JOBBER_PROVIDER = "jobber";

export const JOBBER_GRAPHQL_VERSION =
  process.env.JOBBER_GRAPHQL_VERSION || "2025-01-20";

export const JOBBER_CLIENT_ID = process.env.JOBBER_CLIENT_ID || "";
export const JOBBER_CLIENT_SECRET = process.env.JOBBER_CLIENT_SECRET || "";
export const JOBBER_REDIRECT_URI =
  process.env.JOBBER_REDIRECT_URI ||
  `${process.env.APP_BASE_URL || "http://localhost:3000"}/api/integrations/jobber/callback`;

export function isJobberConfigured() {
  return Boolean(JOBBER_CLIENT_ID && JOBBER_CLIENT_SECRET && JOBBER_REDIRECT_URI);
}
