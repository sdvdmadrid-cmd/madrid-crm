const path = require('path');
const { test, expect } = require('@playwright/test');

const photoFixture = path.join(__dirname, 'fixtures', 'test-photo.jpg');
const pdfFixture = path.join(__dirname, 'fixtures', 'test-doc.pdf');

async function loginAsAdmin(page) {
  await page.goto('/api/auth/dev-login?profile=admin&redirect=%2Fjobs', {
    waitUntil: 'domcontentloaded',
  });
  await page.goto('/jobs', { waitUntil: 'domcontentloaded' });
  await expect(page.getByRole('heading', { name: 'Jobs' })).toBeVisible();
}

async function createJob(page, title) {
  await page.getByPlaceholder('Title').fill(title);
  await page.getByPlaceholder('Client').fill('Playwright Client');
  await page.getByPlaceholder('Service').fill('File Management Test');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: title })).toBeVisible();
}

function getJobCard(page, title) {
  return page.getByTestId('job-card').filter({
    has: page.getByRole('heading', { name: title }),
  }).first();
}

test.describe('jobs file management', () => {
  test.describe.configure({ timeout: 60000 });

  test.beforeEach(async ({ page }) => {
    await loginAsAdmin(page);
  });

  test('validates photo upload type in Manage files panel', async ({ page }) => {
    const title = `PW Job Files ${Date.now()}`;
    await createJob(page, title);

    const jobCard = getJobCard(page, title);
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
    await createJob(page, title);

    const jobCard = getJobCard(page, title);
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
