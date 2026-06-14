import fs from "node:fs";
import path from "node:path";

const SKIP_SEGMENTS = [
  `${path.sep}subscriptions${path.sep}`,
  `${path.sep}auth${path.sep}`,
  `${path.sep}legal${path.sep}`,
  `${path.sep}company-profile${path.sep}`,
  `${path.sep}payments${path.sep}connect${path.sep}`,
  `${path.sep}payments${path.sep}webhooks${path.sep}`,
  `${path.sep}email${path.sep}webhooks${path.sep}`,
  `${path.sep}admin${path.sep}`,
  `${path.sep}platform${path.sep}`,
  `${path.sep}owner${path.sep}`,
  `${path.sep}public${path.sep}`,
  `${path.sep}health${path.sep}`,
  `${path.sep}site${path.sep}`,
];

const NL = /\r?\n/;

function walkRouteFiles(dir) {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) files.push(...walkRouteFiles(full));
    else if (entry.isFile() && entry.name === "route.js") files.push(full);
  }
  return files;
}

function shouldSkip(file) {
  return SKIP_SEGMENTS.some((segment) => file.includes(segment));
}

function ensureImport(source) {
  if (!source.includes("getSubscriptionBlockedResponse")) {
    if (source.includes("getAuthenticatedTenantContext,")) {
      source = source.replace(
        /getAuthenticatedTenantContext,/,
        "getAuthenticatedTenantContext,\n  getSubscriptionBlockedResponse,",
      );
    } else if (source.includes('from "@/lib/tenant"')) {
      source = source.replace(
        /(import[\s\S]*?from "@\/lib\/tenant";)/,
        `$1\nimport { getSubscriptionBlockedResponse } from "@/lib/tenant";`,
      );
    }
  }
  return source;
}

const guardBlock =
  "const subscriptionBlocked = getSubscriptionBlockedResponse(context);$NL    if (subscriptionBlocked) return subscriptionBlocked;$NL    ";

function insertGuard(source) {
  if (!source.includes("await getAuthenticatedTenantContext(request)")) {
    return source;
  }
  if (source.includes("subscriptionBlocked = getSubscriptionBlockedResponse")) {
    return source;
  }

  let next = source.replace(
    /const context = await getAuthenticatedTenantContext\(request\);(?:\r?\n)/g,
    `const context = await getAuthenticatedTenantContext(request);$NL    ${guardBlock}`,
  );

  next = next.replace(
    /const \{\s*([^}]+)\s*\}\s*=\s*await getAuthenticatedTenantContext\(request\);(?:\r?\n)/g,
    `const context = await getAuthenticatedTenantContext(request);$NL    ${guardBlock}const { $1 } = context;$NL    `,
  );

  next = next.replace(
    /const \{\s*([^}]+)\s*\}\s*=\s*(?:\r?\n\s*)await getAuthenticatedTenantContext\(request\);(?:\r?\n)/g,
    `const context = await getAuthenticatedTenantContext(request);$NL    ${guardBlock}const { $1 } = context;$NL    `,
  );

  return next.replace(/\$NL/g, "\n");
}

const root = path.resolve(process.cwd(), "src/app/api");
const files = walkRouteFiles(root);
let patched = 0;

for (const file of files) {
  if (shouldSkip(file)) continue;

  const before = fs.readFileSync(file, "utf8");
  if (!before.includes("getAuthenticatedTenantContext")) continue;

  let source = ensureImport(before);
  source = insertGuard(source);

  if (source !== before) {
    fs.writeFileSync(file, source);
    patched += 1;
    console.log("patched", path.relative(process.cwd(), file));
  }
}

console.log(`Done. Patched ${patched} files.`);
