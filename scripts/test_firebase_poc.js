// Real-browser (Playwright) end-to-end test of the Phase 1 Firebase
// migration proof-of-concept: vendor signup (Firebase Auth) -> login ->
// profile edit (Firestore write) -> reload (proves persistence, not just
// in-memory cache) -> customer-facing read on venue.html (proves the
// cross-page/customer read path). Requires the Firebase Local Emulator
// Suite (auth:9099, firestore:8080, storage:9199) AND the site's own HTTP
// server (python http.server on :8000) to already be running.
const { chromium } = require('playwright');
const { initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

process.env.FIRESTORE_EMULATOR_HOST = 'localhost:8080';
initializeApp({ projectId: 'demo-forever-begins' });
const adminDb = getFirestore();

const BASE = 'http://localhost:8000';
const username = `pw_test_venue_${Date.now()}`;
const password = 'TestPass123!';
const description = `E2E test description ${Date.now()}`;

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function ok(cond, msg) { if (cond) console.log('ok: ' + msg); else fail(msg); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const consoleErrors = [];
  page.on('console', msg => { if (msg.type() === 'error') consoleErrors.push(msg.text()); });
  page.on('pageerror', err => consoleErrors.push('pageerror: ' + err.message));

  console.log('=== SIGNUP (Firebase Auth + Firestore) ===');
  await page.goto(`${BASE}/index.html`);
  const donationClose = page.locator('#donationCloseBtn');
  await donationClose.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await donationClose.isVisible().catch(() => false)) await donationClose.click();
  await page.locator('#vBusinessName').fill('Playwright Test Venue');
  await page.locator('#vCategory').selectOption('Wedding Venues');
  await page.locator('#vUsername').fill(username);
  await page.locator('#vPassword').fill(password);
  await page.locator('#vPhone').fill('+961 3 000 000');
  await page.locator('#vEmail').fill(`${username}@example.com`);
  await page.locator('#vLocation').fill('Beirut, Lebanon');
  await page.locator('input[name="plan"][value="Professional"]').check({ force: true });
  await page.locator('#vTransactionRef').fill('E2E-TEST-0001');
  await page.locator('#vendorForm button[type="submit"]').click();

  await page.waitForFunction(
    () => (document.getElementById('vendorNote') || {}).textContent?.trim().length > 0,
    { timeout: 15000 }
  );
  const signupNote = await page.locator('#vendorNote').textContent();
  ok(!/could not|error/i.test(signupNote || ''), 'Signup succeeded: ' + signupNote);

  console.log('\n=== LOGIN (Firebase Auth sign-in) ===');
  await page.goto(`${BASE}/vendor.html`);
  await page.locator('#vendorUsername').fill(username);
  await page.locator('#vendorPasswordInput').fill(password);
  await page.locator('#vendorLoginForm button[type="submit"]').click();

  // A fresh signup has no `status` field (matches the pre-migration app's
  // `app.status || 'Pending'` fallback), so login should route to the
  // pending-approval gate rather than the full dashboard.
  await page.waitForFunction(
    () => !document.getElementById('pendingWrap').classList.contains('hidden')
       || !document.getElementById('dashboardShell').classList.contains('hidden'),
    { timeout: 15000 }
  );
  const pendingVisible = await page.locator('#pendingWrap').isVisible();
  ok(pendingVisible, 'New signup correctly routed to the pending-approval gate (proves Firestore application record was read back correctly after Firebase Auth sign-in)');

  console.log('\n=== APPROVE via firebase-admin (bypasses rules, same as a real admin operation) ===');
  // A vendor cannot flip their own status: the security rules require
  // status/frozen to stay unchanged unless an admin is writing. Confirm
  // that by first trying it as the vendor themselves (must be rejected),
  // then approve for real via the Admin SDK, which always bypasses rules —
  // mirroring how a real admin approval (via a backend/Cloud Function)
  // would work, not a client-side shortcut.
  const selfApproveBlockedInBrowser = await page.evaluate(async (uname) => {
    try {
      await window.fbDb.collection('vendors').doc(uname).update({ status: 'Approved' });
      return false;
    } catch (e) { return true; }
  }, username);
  ok(selfApproveBlockedInBrowser, 'Security rules correctly block a vendor from self-approving their own application');

  await adminDb.collection('vendors').doc(username).update({ status: 'Approved' });

  await page.waitForFunction(
    () => !document.getElementById('dashboardShell').classList.contains('hidden'),
    { timeout: 15000 }
  );
  ok(true, 'Dashboard became visible after Firestore status flip propagated via onSnapshot (real-time sync working)');

  console.log('\n=== PROFILE EDIT (Firestore write via getVendorData/setVendorData) ===');
  await page.locator('#vendorNav button[data-panel="venue"]').click();
  await page.locator('#venueDescription').fill(description);
  await page.locator('#saveVenueInfoBtn').click();
  await page.waitForFunction(
    () => (document.getElementById('venueInfoNote') || {}).textContent?.includes('Saved'),
    { timeout: 10000 }
  );
  ok(true, 'Profile save note confirmed');

  console.log('\n=== RELOAD (proves persistence via Firestore, not just in-memory cache) ===');
  await page.reload();
  try {
    await page.waitForFunction(
      () => !document.getElementById('dashboardShell').classList.contains('hidden'),
      { timeout: 15000 }
    );
  } catch (e) {
    const diag = await page.evaluate(() => ({
      authUser: window.fbAuth.currentUser ? window.fbAuth.currentUser.email : null,
      session: localStorage.getItem('fb_vendor_session'),
      appsCount: JSON.parse(localStorage.getItem('fb_vendor_applications') || '[]').length,
      pendingHidden: document.getElementById('pendingWrap').classList.contains('hidden'),
      dashboardHidden: document.getElementById('dashboardShell').classList.contains('hidden'),
    }));
    console.log('DIAGNOSTIC after reload timeout:', JSON.stringify(diag, null, 2));
    console.log('Console errors so far:', consoleErrors);
    throw e;
  }
  await page.locator('#vendorNav button[data-panel="venue"]').click();
  await page.waitForFunction(
    (expected) => document.getElementById('venueDescription')?.value === expected,
    description,
    { timeout: 10000 }
  );
  const reloadedValue = await page.locator('#venueDescription').inputValue();
  ok(reloadedValue === description, 'Description survived a full page reload (real Firestore round-trip): ' + reloadedValue);

  console.log('\n=== CUSTOMER-FACING READ (venue.html, no login, proves cross-page sync) ===');
  const customerPage = await browser.newContext().then(c => c.newPage());
  const customerErrors = [];
  customerPage.on('console', msg => { if (msg.type() === 'error') customerErrors.push(msg.text()); });
  await customerPage.goto(`${BASE}/venue.html?v=${username}`);
  await customerPage.waitForFunction(
    (expected) => document.getElementById('profileDescription')?.textContent === expected,
    description,
    { timeout: 15000 }
  );
  const customerDescription = await customerPage.locator('#profileDescription').textContent();
  ok(customerDescription === description, 'Customer-facing profile page (different browser context, no login) shows the same description: ' + customerDescription);

  console.log('\nBrowser console errors (dashboard):', consoleErrors.length);
  consoleErrors.forEach(e => console.log(' -', e));
  console.log('Browser console errors (customer page):', customerErrors.length);
  customerErrors.forEach(e => console.log(' -', e));
  ok(consoleErrors.length === 0, 'No console errors on the vendor dashboard');
  ok(customerErrors.length === 0, 'No console errors on the customer-facing page');

  await browser.close();
  console.log('\n=== DONE ===');
  process.exit(process.exitCode ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
