const { test, expect } = require('@playwright/test');
const { devLogin, ensureLegalAccepted } = require('./helpers/auth');

function ymdFromParts(year, monthIndex, day) {
  return `${year}-${String(monthIndex + 1).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
}

function addDaysYmd(base, delta) {
  const d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + delta);
  return ymdFromParts(d.getFullYear(), d.getMonth(), d.getDate());
}

test.describe('calendar date safety and weather forecast', () => {
  async function expectCalendarLoaded(page) {
    await expect.poll(() => {
      try {
        return new URL(page.url()).pathname;
      } catch {
        return '';
      }
    }).toBe('/calendar');
    await expect(page.getByTestId('calendar-forecast-strip')).toBeVisible({ timeout: 15000 });
  }

  async function openNewAppointmentModal(page, dateYmd) {
    const dayCell = page.getByTestId(`calendar-day-${dateYmd}`);
    await dayCell.click({ position: { x: 8, y: 8 } });
    await expect(page.getByTestId('appointment-date-input')).toBeVisible();
  }

  test.beforeEach(async ({ page }) => {
    await devLogin(page, { profile: 'admin', redirect: '/calendar' });
    await page.goto('/calendar', { waitUntil: 'domcontentloaded' });
    await expectCalendarLoaded(page);
  });

  test('shows 5-day weather strip on load without user interaction', async ({ page }) => {
    const today = new Date();
    const nextFive = Array.from({ length: 5 }, (_, i) => addDaysYmd(today, i));

    await expect(page.getByTestId('calendar-forecast-strip')).toBeVisible();
    for (const day of nextFive) {
      await expect(page.getByTestId(`forecast-day-${day}`)).toBeVisible();
    }
  });

  test('blocks past date scheduling with explicit error and red date input', async ({ page }) => {
    const now = new Date();
    const today = addDaysYmd(now, 0);
    const yesterday = addDaysYmd(now, -1);

    await openNewAppointmentModal(page, today);

    const dateInput = page.getByTestId('appointment-date-input');
    await expect(dateInput).toHaveAttribute('min', today);
    await dateInput.evaluate((el) => el.removeAttribute('min'));

    await page.getByPlaceholder('Title').fill(`PW Past Date ${Date.now()}`);
    await page.getByPlaceholder('Client', { exact: true }).fill('Playwright Client');
    await dateInput.fill(yesterday);
    await page.locator('input[type="time"]').first().fill('10:30');

    await page.getByTestId('appointment-save-button').click();

    await expect(page.getByText('Cannot schedule in the past')).toBeVisible();
    await expect(dateInput).toHaveClass(/border-red-500/);
  });

  test('keeps selected date unchanged after save and edit', async ({ page }) => {
    test.setTimeout(60_000);
    const uniqueTitle = `PW Date Integrity ${Date.now()}`;
    const now = new Date();
    const today = addDaysYmd(now, 0);
    const future = addDaysYmd(now, 2);
    const futureUpdated = addDaysYmd(now, 3);

    await openNewAppointmentModal(page, today);
    await expect(page.getByTestId('appointment-save-button')).toBeVisible({
      timeout: 15_000,
    });

    const titleInput = page.getByTestId('appointment-title-input').or(
      page.getByPlaceholder('Title'),
    );
    await expect(titleInput).toBeVisible();
    await titleInput.fill(uniqueTitle);
    await page.getByPlaceholder('Client', { exact: true }).fill('Playwright Client');
    await page.getByTestId('appointment-date-input').fill(future);
    await page.locator('input[type="time"]').first().fill('11:45');
    const createResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/appointments') &&
        response.request().method() === 'POST',
    );
    await page.getByTestId('appointment-save-button').click();
    const createRes = await createResponse;
    expect(createRes.ok()).toBeTruthy();

    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 20_000 });
    await page.getByText(uniqueTitle).first().click();
    await page.getByTestId('appointment-edit-button').click();

    const dateInput = page.getByTestId('appointment-date-input');
    await expect(dateInput).toHaveValue(future);

    await dateInput.fill(futureUpdated);
    const updateResponse = page.waitForResponse(
      (response) =>
        response.url().includes('/api/appointments') &&
        ['PUT', 'PATCH'].includes(response.request().method()),
    );
    await page.getByTestId('appointment-save-button').click();
    expect((await updateResponse).ok()).toBeTruthy();

    await expect(page.getByText(uniqueTitle).first()).toBeVisible({ timeout: 20_000 });
    await page.getByText(uniqueTitle).first().click();
    await page.getByTestId('appointment-edit-button').click();
    await expect(page.getByTestId('appointment-date-input')).toHaveValue(futureUpdated);
  });

  test('api rejects past appointment dates with 400', async ({ page }) => {
    await ensureLegalAccepted(page.request);
    const now = new Date();
    const yesterday = addDaysYmd(now, -1);

    const res = await page.request.post('/api/appointments', {
      headers: { Origin: 'http://localhost:3000' },
      data: {
        title: `PW API Past Date ${Date.now()}`,
        clientName: 'Playwright Client',
        date: yesterday,
        time: '09:15',
        location: 'Chicago, IL',
        notes: 'Backend validation test',
        status: 'Scheduled',
      },
    });

    expect(res.status()).toBe(400);
    const body = await res.json();
    expect(body?.error).toContain('Cannot schedule in the past');
  });
});
