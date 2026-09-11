import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import path from "node:path";

import {
  buildWinOnSiteWeatherSlots,
  isWinOnSiteWeatherSafeDay,
  normalizePreferredSlot,
  scoreWinOnSiteWeatherDay,
} from "../../src/lib/win-on-site-weather.js";

const root = process.cwd();

test("scoreWinOnSiteWeatherDay blocks rain storm snow freeze wind", () => {
  assert.equal(scoreWinOnSiteWeatherDay({ variant: "rain", temp: 60 }).safe, false);
  assert.equal(scoreWinOnSiteWeatherDay({ variant: "storm", temp: 70 }).safe, false);
  assert.equal(scoreWinOnSiteWeatherDay({ variant: "snow", temp: 30 }).safe, false);
  assert.equal(scoreWinOnSiteWeatherDay({ variant: "clear", temp: 30 }).safe, false);
  assert.equal(
    scoreWinOnSiteWeatherDay({ variant: "clear", temp: 55, windSpeed: 30 }).safe,
    false,
  );
  assert.equal(scoreWinOnSiteWeatherDay({ variant: "clear", temp: 68, windSpeed: 5 }).safe, true);
  assert.equal(isWinOnSiteWeatherSafeDay({ variant: "clouds", temp: 50 }), true);
});

test("buildWinOnSiteWeatherSlots returns top safe windows", () => {
  const slots = buildWinOnSiteWeatherSlots({
    fromYmd: "2026-09-11",
    limit: 3,
    weatherByDate: {
      "2026-09-12": { variant: "rain", temp: 60, windSpeed: 5, emoji: "🌧️", condition: "Rain" },
      "2026-09-13": { variant: "clear", temp: 72, windSpeed: 4, emoji: "☀️", condition: "Clear" },
      "2026-09-14": { variant: "clouds", temp: 65, windSpeed: 8, emoji: "☁️", condition: "Clouds" },
      "2026-09-15": { variant: "storm", temp: 70, windSpeed: 20, emoji: "⛈️", condition: "Storm" },
      "2026-09-16": { variant: "clear", temp: 70, windSpeed: 3, emoji: "☀️", condition: "Clear" },
    },
  });
  assert.ok(slots.length >= 2);
  assert.ok(slots.every((s) => s.date !== "2026-09-12" && s.date !== "2026-09-15"));
  assert.equal(slots[0].date, "2026-09-13");
  assert.equal(slots[0].window, "morning");
});

test("normalizePreferredSlot validates date and time", () => {
  assert.equal(normalizePreferredSlot(null), null);
  assert.equal(normalizePreferredSlot({ date: "bad", time: "09:00" }), null);
  const slot = normalizePreferredSlot({
    date: "2026-09-20",
    time: "13:00",
    window: "afternoon",
    weather: { emoji: "☀️", temp: 70, condition: "Clear" },
  });
  assert.equal(slot.date, "2026-09-20");
  assert.equal(slot.time, "13:00");
  assert.equal(slot.window, "afternoon");
});

test("phase 3 routes and form wire weather slots", () => {
  const weatherRoute = readFileSync(
    path.join(root, "src/app/api/site/[slug]/win-on-site/weather-slots/route.js"),
    "utf8",
  );
  const contact = readFileSync(
    path.join(root, "src/app/api/site/[slug]/contact/route.js"),
    "utf8",
  );
  const form = readFileSync(
    path.join(root, "src/components/site/PremiumLeadForm.jsx"),
    "utf8",
  );
  const helpers = readFileSync(
    path.join(root, "src/lib/win-on-site-helpers.js"),
    "utf8",
  );
  assert.match(weatherRoute, /suggestWinOnSiteWeatherSlots/);
  assert.match(contact, /preferredSlot/);
  assert.match(contact, /normalizePreferredSlot/);
  assert.match(form, /weather-slots/);
  assert.match(form, /preferredSlot/);
  assert.match(helpers, /WIN_ON_SITE_PHASE = [345]/);
});
