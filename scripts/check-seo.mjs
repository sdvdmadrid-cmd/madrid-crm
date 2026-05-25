#!/usr/bin/env node
const base = process.argv[2] || "https://fieldbaseapp.net";
const slug = process.argv[3] || "mysite";

async function probeSEO(path, label) {
  const r = await fetch(base + path);
  const html = await r.text();
  console.log(`\n${label} (${path}) status=${r.status} bytes=${html.length}`);
  const checks = {
    "og:title": /property=["']og:title["']/i.test(html),
    "og:description": /property=["']og:description["']/i.test(html),
    "og:image": /property=["']og:image["']/i.test(html),
    "twitter:card": /name=["']twitter:card["']/i.test(html),
    "canonical": /rel=["']canonical["']/i.test(html),
    "viewport": /name=["']viewport["']/i.test(html),
    "robots tag": /name=["']robots["']/i.test(html),
    "JSON-LD": /application\/ld\+json/i.test(html),
    "LocalBusiness": /"@type"\s*:\s*"LocalBusiness"|"@type":"LocalBusiness"|"LocalBusiness"/i.test(html),
  };
  Object.entries(checks).forEach(([k, v]) => console.log(`  ${v ? "OK  " : "MISS"} ${k}`));
  const titleMatch = html.match(/<title[^>]*>([^<]*)<\/title>/i);
  console.log(`  title: ${titleMatch ? titleMatch[1] : "(none)"}`);
  const descMatch = html.match(/name=["']description["'][^>]*content=["']([^"']*)["']/i);
  console.log(`  desc: ${descMatch ? descMatch[1].slice(0, 140) : "(none)"}`);
}

await probeSEO("/", "Landing");
await probeSEO("/sites/" + slug, "Public site");
await probeSEO("/sites/" + slug + "/request", "Lead form");
await probeSEO("/legal", "Legal");
