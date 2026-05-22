const { expect } = require('@playwright/test');

async function ensureLegalAccepted(api) {
  const originHeaders = { Origin: 'http://localhost:3000' };

  const statusRes = await api.get('/api/legal/status', { headers: originHeaders });
  const statusJson = await statusRes.json().catch(() => null);
  if (statusRes.ok() && statusJson?.data?.accepted) {
    return;
  }

  const versionRes = await api.get('/api/legal/version', { headers: originHeaders });
  const versionJson = await versionRes.json().catch(() => null);
  const version = String(versionJson?.data?.version || '').trim();

  const acceptRes = await api.post('/api/legal/accept', {
    headers: {
      ...originHeaders,
      'Content-Type': 'application/json',
    },
    data: version ? { version } : {},
  });
  expect(acceptRes.ok()).toBeTruthy();
}

async function devLogin(page, { profile = 'admin', redirect = '/dashboard' } = {}) {
  await page.goto(
    `/api/auth/dev-login?profile=${encodeURIComponent(profile)}&redirect=${encodeURIComponent(redirect)}`,
    { waitUntil: 'domcontentloaded' },
  );
  await ensureLegalAccepted(page.request);
}

module.exports = { ensureLegalAccepted, devLogin };
