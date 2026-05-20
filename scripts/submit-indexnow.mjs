const APP_BASE_URL = String(
  process.env.APP_BASE_URL || process.env.APP_URL || "https://fieldbaseapp.net",
).replace(/\/$/, "");

const INDEXNOW_KEY =
  process.env.INDEXNOW_KEY || "23f0c57e9bc74d35b8a5a90c5fc4a1a1";
const KEY_LOCATION = `${APP_BASE_URL}/${INDEXNOW_KEY}.txt`;

const inputUrls = process.argv.slice(2).map((item) => String(item || "").trim());
const defaultUrls = [
  `${APP_BASE_URL}/`,
  `${APP_BASE_URL}/sitemap.xml`,
  `${APP_BASE_URL}/robots.txt`,
];

const urlList = Array.from(
  new Set(
    (inputUrls.length > 0 ? inputUrls : defaultUrls)
      .filter(Boolean)
      .map((url) => url.replace(/\/$/, "")),
  ),
);

if (urlList.length === 0) {
  console.error("No URLs to submit.");
  process.exit(1);
}

const payload = {
  host: new URL(APP_BASE_URL).host,
  key: INDEXNOW_KEY,
  keyLocation: KEY_LOCATION,
  urlList,
};

const response = await fetch("https://api.indexnow.org/indexnow", {
  method: "POST",
  headers: {
    "content-type": "application/json; charset=utf-8",
  },
  body: JSON.stringify(payload),
});

if (!response.ok) {
  const body = await response.text();
  console.error(`IndexNow failed (${response.status}): ${body}`);
  process.exit(1);
}

console.log(`IndexNow submitted ${urlList.length} URL(s) for ${APP_BASE_URL}`);
console.log(`Key location: ${KEY_LOCATION}`);
