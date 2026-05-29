#!/usr/bin/env node
/**
 * Print the Jobber OAuth authorize URL (open while logged into Jobber Developer app).
 * Usage: node scripts/jobber/oauth-url.mjs
 */
import { loadJobberEnv, requireJobberOAuthEnv } from "./_env.mjs";
import {
  JOBBER_CLIENT_ID,
  JOBBER_OAUTH_AUTHORIZE_URL,
  JOBBER_REDIRECT_URI,
} from "../../src/lib/jobber/config.js";

loadJobberEnv();
requireJobberOAuthEnv();

const params = new URLSearchParams({
  response_type: "code",
  client_id: JOBBER_CLIENT_ID,
  redirect_uri: JOBBER_REDIRECT_URI,
  state: "manual-cli",
});

const url = `${JOBBER_OAUTH_AUTHORIZE_URL}?${params.toString()}`;
console.log("Redirect URI registered in Jobber Developer Center must match:");
console.log(`  ${JOBBER_REDIRECT_URI}`);
console.log("\nAuthorize URL (open in browser while signed into Jobber):");
console.log(url);
