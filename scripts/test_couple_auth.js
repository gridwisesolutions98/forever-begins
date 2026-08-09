// Real-browser end-to-end test of the couple (Wedding Planning dashboard)
// Firebase Auth migration: signup -> dashboard shows -> reload resumes the
// session via Firestore (not a dead local dict) -> a second, separate
// browser context logging in with the same credentials sees the same data,
// proving the cross-device sync this migration exists to provide.
const { chromium } = require('playwright');

const BASE = 'http://localhost:8000';
const username = `pw_couple_test_${Date.now()}`;
const password = 'TestPass123!';

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function ok(cond, msg) { if (cond) console.log('ok: ' + msg); else fail(msg); }

(async () => {
  const browser = await chromium.launch();

  console.log('=== COUPLE SIGNUP (Firebase Auth + Firestore) ===');
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });
  await page.goto(`${BASE}/index.html#planning`);
  const donationClose = page.locator('#donationCloseBtn');
  await donationClose.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await donationClose.isVisible().catch(() => false)) await donationClose.click();

  // The Wedding Planning auth form starts on Login; switch to Sign Up.
  const signupToggle = page.locator('a, button', { hasText: /sign up/i }).first();
  if (await signupToggle.isVisible().catch(() => false)) await signupToggle.click();

  await page.locator('#signupUsername').fill(username);
  await page.locator('#signupPassword').fill(password);
  await page.locator('#signupBride').fill('Playwright Bride');
  await page.locator('#signupGroom').fill('Playwright Groom');
  await page.locator('#signupEmail').fill(`${username}@example.com`);
  await page.locator('#signupPhone').fill('+961 3 222 333');
  await page.locator('#signupForm button[type="submit"]').click();

  await page.waitForFunction(
    () => !document.getElementById('dashboard').classList.contains('hidden'),
    { timeout: 15000 }
  );
  const dashboardUserText = await page.locator('#dashboardUser').textContent();
  ok(dashboardUserText.includes('Playwright Bride') && dashboardUserText.includes('Playwright Groom'), 'Dashboard shows the couple name from Firestore: ' + dashboardUserText);

  console.log('\n=== RELOAD (session resume waits for Firebase Auth, reads Firestore) ===');
  await page.reload();
  await page.waitForFunction(
    () => !document.getElementById('dashboard').classList.contains('hidden'),
    { timeout: 15000 }
  );
  const reloadedUserText = await page.locator('#dashboardUser').textContent();
  ok(reloadedUserText.includes('Playwright Bride'), 'Session resumed after reload, name still shows correctly: ' + reloadedUserText);

  console.log('\n=== SECOND BROWSER CONTEXT: same login sees the same account ===');
  const otherPage = await browser.newContext().then(c => c.newPage());
  const otherErrors = [];
  otherPage.on('console', msg => { if (msg.type() === 'error') otherErrors.push(msg.text()); });
  await otherPage.goto(`${BASE}/index.html#planning`);
  const otherDonationClose = otherPage.locator('#donationCloseBtn');
  await otherDonationClose.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await otherDonationClose.isVisible().catch(() => false)) await otherDonationClose.click();
  await otherPage.locator('#loginUsername').fill(username);
  await otherPage.locator('#loginPassword').fill(password);
  await otherPage.locator('#loginForm button[type="submit"]').click();
  await otherPage.waitForFunction(
    () => !document.getElementById('dashboard').classList.contains('hidden'),
    { timeout: 15000 }
  );
  const otherUserText = await otherPage.locator('#dashboardUser').textContent();
  ok(otherUserText.includes('Playwright Bride') && otherUserText.includes('Playwright Groom'), 'A totally separate browser context logging in with the same credentials sees the same couple profile: ' + otherUserText);

  console.log('\nFirst page console errors:', errors.length);
  errors.forEach(e => console.log(' -', e));
  console.log('Second context console errors:', otherErrors.length);
  otherErrors.forEach(e => console.log(' -', e));
  ok(errors.length === 0, 'No console errors on the first page');
  ok(otherErrors.length === 0, 'No console errors on the second context');

  await browser.close();
  console.log('\n=== DONE ===');
  process.exit(process.exitCode ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
