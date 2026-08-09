// Verifies the vendor "Change Password" fix actually changes the real
// Firebase Auth password (not just a dead local value): sign up, log in,
// change password via the Settings UI, log out, confirm the OLD password
// now fails and the NEW one succeeds.
const { chromium } = require('playwright');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
initializeApp({ projectId: 'demo-forever-begins' });
const adminDb = getFirestore();

const BASE = 'http://localhost:8000';
const username = `pw_changepw_test_${Date.now()}`;
const oldPassword = 'OldPass123!';
const newPassword = 'NewPass456!';

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function ok(cond, msg) { if (cond) console.log('ok: ' + msg); else fail(msg); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  console.log('=== SIGNUP + APPROVE ===');
  await page.goto(`${BASE}/index.html`);
  const donationClose = page.locator('#donationCloseBtn');
  await donationClose.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await donationClose.isVisible().catch(() => false)) await donationClose.click();
  await page.locator('#vBusinessName').fill('Change Password Test Venue');
  await page.locator('#vCategory').selectOption('Wedding Venues');
  await page.locator('#vUsername').fill(username);
  await page.locator('#vPassword').fill(oldPassword);
  await page.locator('#vPhone').fill('+961 3 000 222');
  await page.locator('#vEmail').fill(`${username}@example.com`);
  await page.locator('#vLocation').fill('Beirut, Lebanon');
  await page.locator('input[name="plan"][value="Basic"]').check({ force: true });
  await page.locator('#vTransactionRef').fill('E2E-PW-TEST-0001');
  await page.locator('#vendorForm button[type="submit"]').click();
  await page.waitForFunction(() => (document.getElementById('vendorNote') || {}).textContent?.trim().length > 0, { timeout: 15000 });
  await adminDb.collection('vendors').doc(username).update({ status: 'Approved' });

  console.log('\n=== LOGIN with old password, change to new ===');
  await page.goto(`${BASE}/vendor.html`);
  await page.locator('#vendorUsername').fill(username);
  await page.locator('#vendorPasswordInput').fill(oldPassword);
  await page.locator('#vendorLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('dashboardShell').classList.contains('hidden'), { timeout: 15000 });
  ok(true, 'Logged in with old password');

  await page.locator('#vendorNav button[data-panel="settings"]').click();
  await page.locator('#vendorNewPassword').fill(newPassword);
  await page.locator('#vendorChangePasswordForm button[type="submit"]').click();
  await page.waitForFunction(() => (document.getElementById('vendorPasswordNote') || {}).textContent === 'Password updated.', { timeout: 10000 });
  ok(true, 'Password change confirmed by the UI');

  console.log('\n=== LOG OUT, OLD PASSWORD NOW FAILS ===');
  await page.locator('#vendorLogoutBtn').click();
  await page.waitForFunction(() => !document.getElementById('loginWrap').classList.contains('hidden'), { timeout: 10000 });
  await page.locator('#vendorUsername').fill(username);
  await page.locator('#vendorPasswordInput').fill(oldPassword);
  await page.locator('#vendorLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => (document.getElementById('vendorLoginNote') || {}).textContent?.trim().length > 0, { timeout: 10000 });
  const oldPwNote = await page.locator('#vendorLoginNote').textContent();
  ok(/incorrect/i.test(oldPwNote), 'Old password now correctly rejected: ' + oldPwNote);

  console.log('\n=== NEW PASSWORD WORKS ===');
  await page.locator('#vendorPasswordInput').fill(newPassword);
  await page.locator('#vendorLoginForm button[type="submit"]').click();
  await page.waitForFunction(() => !document.getElementById('dashboardShell').classList.contains('hidden'), { timeout: 15000 });
  ok(true, 'New password logs in successfully — the real Firebase Auth password actually changed');

  console.log('\nConsole errors:', errors.length);
  errors.forEach(e => console.log(' -', e));
  ok(errors.length === 0, 'No console errors');

  await browser.close();
  console.log('\n=== DONE ===');
  process.exit(process.exitCode ? 1 : 0);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
