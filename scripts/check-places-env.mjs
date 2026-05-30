import fs from "node:fs";

const files = [".env.local", ".env.vercel.prod", ".env.production"];
const want = ["GOOGLE_PLACES_API_KEY", "NEXT_PUBLIC_GOOGLE_MAPS_API_KEY", "YELP_FUSION_API_KEY"];

for (const file of files) {
  if (!fs.existsSync(file)) {
    console.log(`${file}: (missing)`);
    continue;
  }
  const map = {};
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    const eq = t.indexOf("=");
    if (eq === -1) continue;
    const key = t.slice(0, eq).trim();
    let val = t.slice(eq + 1).trim();
    if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    map[key] = val;
  }
  console.log(`\n${file}:`);
  for (const key of want) {
    const val = map[key];
    console.log(`  ${key}: ${val ? `set (${val.length} chars)` : "not set"}`);
  }
  const googleOther = Object.keys(map).filter((k) => /GOOGLE/i.test(k) && !want.includes(k));
  if (googleOther.length) {
    console.log(`  other Google vars: ${googleOther.join(", ")}`);
  }
}
