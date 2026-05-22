const path = require('path');
const { test, expect } = require('@playwright/test');
const { devLogin } = require('./helpers/auth');

const photoFixture = path.join(__dirname, 'fixtures', 'test-photo.jpg');
const pdfFixture = path.join(__dirname, 'fixtures', 'test-doc.pdf');

async function loginAsAdmin(page) {
  await devLogin(page, { profile: 'admin', redirect: '/jobs' });
  await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: /Jobs/i })).toBeVisible();
}

async function createJob(page, title) {
  const res = await page.request.post('/api/jobs', {
    headers: { Origin: 'http://localhost:3000' },
    data: {
      title,
      clientName: 'Playwright Client',
      service: 'File Management Test',
      status: 'scheduled',
      price: 100,
    },
  });
  const body = await res.json().catch(() => null);
  expect(res.ok(), JSON.stringify(body)).toBeTruthy();

  const jobTitle = String(body?.data?.title || title);
  await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
  const jobCard = getJobCard(page, jobTitle);
  await expect(jobCard).toBeVisible({ timeout: 20_000 });

  return jobTitle;
}

function getJobCard(page, title) {
  return page.getByTestId('job-card').filter({
    has: page.locator('h3', { hasText: title }),
  }).first();
}

test.describe('jobs file management', () => {
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('validates photo upload type in Manage files panel', async ({ page }) => {
    const title = `PW Job Files ${Date.now()}`;
    const createdTitle = await createJob(page, title);

    const jobCard = getJobCard(page, createdTitle);
    await jobCard.getByRole('button', { name: 'Manage files' }).click();
    const filesPanel = jobCard.getByTestId('job-files-panel');

    const chooserPromise = page.waitForEvent('filechooser');
    await filesPanel.getByRole('button', { name: 'Upload Photos' }).click();
    const chooser = await chooserPromise;
    await chooser.setFiles(pdfFixture);

    await expect(filesPanel.getByText('Photos must be JPG or PNG')).toBeVisible();

    const validChooserPromise = page.waitForEvent('filechooser');
    await filesPanel.getByRole('button', { name: 'Upload Photos' }).click();
    const validChooser = await validChooserPromise;
    await validChooser.setFiles(photoFixture);

    // Upload may fail if DB migration is not applied; we only assert client-side validation no longer blocks.
    await expect(filesPanel.getByText('Photos must be JPG or PNG')).toHaveCount(0);
  });

  test('requires typing DELETE in job delete modal', async ({ page }) => {
    const title = `PW Job Delete ${Date.now()}`;
    const createdTitle = await createJob(page, title);

    const jobCard = getJobCard(page, createdTitle);
    await jobCard.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByRole('heading', { name: 'Delete this item?' })).toBeVisible();
    await expect(
      page.getByText('To delete').filter({ hasText: 'type DELETE' }),
    ).toBeVisible();

    const deleteModal = page
      .getByRole('heading', { name: 'Delete this item?' })
      .locator('xpath=ancestor::div[2]');

    await deleteModal.getByPlaceholder('Type DELETE to confirm').fill('WRONG');
    await deleteModal.getByRole('button', { name: 'Delete' }).click();

    await expect(page.getByText('Type "DELETE" to confirm job deletion.')).toBeVisible();
  });
});
