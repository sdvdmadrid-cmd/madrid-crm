const { test, expect } = require("@playwright/test");

function ymdFromParts(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function futureDate(monthsAhead = 2, dayOffset = 0) {
  const base = new Date();
  const day = Math.min(28, 12 + monthsAhead * 3 + dayOffset);
  const d = new Date(base.getFullYear(), base.getMonth() + monthsAhead, day);
  if (d <= base) {
    d.setDate(base.getDate() + 1);
  }
  return ymdFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

async function devLoginAs(page, profile, redirect = "/calendar") {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: "commit" },
  );
  await page.waitForURL(/\/calendar/, { timeout: 45_000 });
}

async function openCalendarOnDate(page, dateYmd) {
  await page.goto(`/calendar?date=${dateYmd}`, { waitUntil: "domcontentloaded" });
  await expect(page.getByTestId("calendar-forecast-strip")).toBeVisible({
    timeout: 15_000,
  });
  const dayCell = page.getByTestId(`calendar-day-${dateYmd}`);
  await expect(dayCell).toBeVisible({ timeout: 15_000 });
  const moreBtn = dayCell.getByRole("button", { name: /^\+\d+ more$/ });
  if (await moreBtn.isVisible().catch(() => false)) {
    await moreBtn.click();
  }
  return dayCell;
}

async function expectCalendarChip(dayCell, testId, titleMatcher) {
  const byTestId = dayCell.getByTestId(testId);
  const byTitle =
    typeof titleMatcher === "string"
      ? dayCell.getByTitle(titleMatcher)
      : dayCell.getByText(titleMatcher);
  await expect
    .poll(
      async () => {
        if (await byTestId.isVisible().catch(() => false)) return true;
        if (byTitle && (await byTitle.isVisible().catch(() => false))) return true;
        return false;
      },
      { timeout: 25_000 },
    )
    .toBe(true);
}

test.describe("calendar jobs and estimates", () => {
  test.setTimeout(90_000);

  test.beforeEach(async ({ page }) => {
    await devLoginAs(page, "admin", "/calendar");
  });

  test("shows scheduled job on calendar and opens job details", async ({
    page,
  }) => {
    const stamp = Date.now();
    const scheduleDate = futureDate(2, 1);
    const title = `Cal Job ${stamp}`;

    const createRes = await page.request.post("/api/jobs", {
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      data: {
        title,
        clientName: "Calendar E2E Client",
        service: "Inspection",
        status: "Pending",
        dueDate: scheduleDate,
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const jobId = created?.data?._id || created?.data?.id;
    expect(jobId).toBeTruthy();

    await openCalendarOnDate(page, scheduleDate);

    const dayCell = page.getByTestId(`calendar-day-${scheduleDate}`);
    await expectCalendarChip(dayCell, `calendar-job-${jobId}`, `Job: ${title}`);
    const jobChip =
      dayCell.getByTestId(`calendar-job-${jobId}`).or(dayCell.getByTitle(`Job: ${title}`));
    await expect(jobChip).toContainText(title);

    await jobChip.click();
    await expect(page).toHaveURL(new RegExp(`/jobs\\?jobId=${jobId}`), {
      timeout: 15_000,
    });

    await page.request.delete(`/api/jobs/${jobId}`, {
      headers: { Origin: "http://localhost:3000" },
    });
  });

  test("shows scheduled estimate visit on calendar and opens estimate details", async ({
    page,
  }) => {
    const stamp = Date.now();
    const visitDate = futureDate(2, 2);
    const clientName = `E2E Cal Est ${stamp}`;

    const createRes = await page.request.post("/api/estimates", {
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      data: {
        clientName,
        address: "123 Calendar Lane",
        status: "draft",
        services: [{ description: "Site visit", qty: 1, unitPrice: 100 }],
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const estimateId = created?.data?.id;
    expect(estimateId).toBeTruthy();

    const patchRes = await page.request.patch(`/api/estimates/${estimateId}`, {
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      data: { scheduledVisitDate: visitDate },
    });
    expect(patchRes.ok()).toBeTruthy();
    const patched = await patchRes.json();
    expect(patched?.data?.scheduledVisitDate).toBe(visitDate);

    const eventsRes = await page.request.get(
      `/api/calendar/events?from=${visitDate}&to=${visitDate}`,
    );
    expect(eventsRes.ok()).toBeTruthy();
    const eventsPayload = await eventsRes.json();
    const estimates = eventsPayload?.data?.estimates || [];
    expect(estimates.some((row) => String(row.id) === String(estimateId))).toBe(
      true,
    );

    const dayCell = await openCalendarOnDate(page, visitDate);
    await expectCalendarChip(
      dayCell,
      `calendar-estimate-${estimateId}`,
      new RegExp(clientName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
    );
    const estChip = dayCell.getByTestId(`calendar-estimate-${estimateId}`);

    await estChip.click();
    await expect(page).toHaveURL(
      new RegExp(`/estimates\\?estimateId=${estimateId}`),
      { timeout: 15_000 },
    );
  });

  test("job without due date does not appear on calendar", async ({ page }) => {
    const stamp = Date.now();
    const title = `Unscheduled Job ${stamp}`;

    const createRes = await page.request.post("/api/jobs", {
      headers: {
        Origin: "http://localhost:3000",
        "Content-Type": "application/json",
      },
      data: {
        title,
        clientName: "No Date Client",
        service: "TBD",
        status: "Pending",
      },
    });
    expect(createRes.ok()).toBeTruthy();
    const created = await createRes.json();
    const jobId = created?.data?._id || created?.data?.id;
    expect(jobId).toBeTruthy();

    await page.goto("/calendar", { waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("calendar-forecast-strip")).toBeVisible({
      timeout: 15_000,
    });
    await expect(page.getByTestId(`calendar-job-${jobId}`)).toHaveCount(0, {
      timeout: 10_000,
    });

    await page.request.delete(`/api/jobs/${jobId}`, {
      headers: { Origin: "http://localhost:3000" },
    });
  });
});
