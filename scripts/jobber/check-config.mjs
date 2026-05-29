#!/usr/bin/env node
import {
  JOBBER_CLIENT_ID,
  JOBBER_REDIRECT_URI,
  isJobberConfigured,
} from "../../src/lib/jobber/config.js";
import { loadJobberEnv } from "./_env.mjs";

loadJobberEnv();

const ok = isJobberConfigured();
console.log(JSON.stringify(
  {
    ok,
    clientIdSet: Boolean(JOBBER_CLIENT_ID),
    redirectUri: JOBBER_REDIRECT_URI,
    graphqlVersion: process.env.JOBBER_GRAPHQL_VERSION || "2025-01-20",
    productionCallback:
      "https://fieldbaseapp.net/api/integrations/jobber/callback",
    localCallback:
      "http://localhost:3000/api/integrations/jobber/callback",
  },
  null,
  2,
));

if (!ok) {
  console.error(
    "\nAdd JOBBER_CLIENT_ID and JOBBER_CLIENT_SECRET to .env.local (see .env.local.example).",
  );
  process.exit(1);
}
