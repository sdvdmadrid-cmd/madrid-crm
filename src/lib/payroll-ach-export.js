function padLeft(value, length, char = "0") {
  return String(value || "").padStart(length, char).slice(-length);
}

function sanitizeAchText(value, maxLen) {
  return String(value || "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .slice(0, maxLen)
    .toUpperCase();
}

/**
 * Build a simplified NACHA-style ACH file for direct deposit.
 */
export function buildAchFileContent({
  companyName = "",
  companyId = "",
  effectiveDate,
  entries = [],
}) {
  const date = String(effectiveDate || new Date().toISOString().slice(0, 10)).replace(/-/g, "");
  const lines = [];
  let entryHash = 0;
  let totalCredit = 0;
  let entryCount = 0;

  const immediateDestination = " 091000019";
  const immediateOrigin = padLeft(companyId.replace(/\D/g, "").slice(0, 9) || "000000000", 10);
  const batchNumber = padLeft(String(Date.now()).slice(-7), 7);

  lines.push(
    `101 ${immediateDestination}${immediateOrigin}${date}${date}0000${"1".padEnd(94)}`,
  );
  lines.push(
    `5200${sanitizeAchText(companyName, 16).padEnd(16)}${immediateOrigin}PPDPAYROLL   ${date}${date}   1${immediateDestination.slice(0, 8)}0000001`,
  );

  for (const entry of entries) {
    const amountCents = Math.round(Number(entry.amount || 0) * 100);
    if (amountCents <= 0) continue;

    const routing = padLeft(entry.routingNumber, 9);
    const account = padLeft(entry.accountNumber, 17);
    const name = sanitizeAchText(entry.name, 22).padEnd(22);
    entryHash += Number(routing.slice(0, 8));
    totalCredit += amountCents;
    entryCount += 1;

    lines.push(
      `622${routing}${account}${padLeft(amountCents, 10)}${account.slice(-15).padEnd(15)}${name}0${padLeft(entry.traceNumber || entryCount, 15)}`,
    );
  }

  const hashMod = padLeft(String(entryHash % 10_000_000_000), 10);
  lines.push(
    `8200${padLeft(entryCount, 6)}${hashMod}${padLeft(totalCredit, 12)}0000000000000000000001${padLeft(entryCount, 8)}0000001`,
  );
  lines.push(`9000001${padLeft(1, 6)}${padLeft(entryCount + 2, 8)}${hashMod}${padLeft(totalCredit, 12)}000000000000000000000000000000000000000000000000000000000000`);

  return lines.join("\n");
}
