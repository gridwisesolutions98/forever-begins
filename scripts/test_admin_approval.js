// Real-browser end-to-end test of the admin vendor-approval flow: a vendor
// signs up (Pending), the REAL admin.html dashboard (logged in via Firebase
// Auth, not a script-based rules bypass) sees them in the Vendor
// Applications table and clicks Approve, and the vendor's still-open
// pending-gate page flips to the full dashboard automatically via
// real-time Firestore sync — no reload needed.
const { chromium } = require('playwright');

const BASE = 'http://localhost:8000';
const username = `pw_admin_test_${Date.now()}`;
const password = 'TestPass123!';

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function ok(cond, msg) { if (cond) console.log('ok: ' + msg); else fail(msg); }

(async () => {
  const browser = await chromium.launch();

  console.log('=== VENDOR SIGNUP (pending) ===');
  const vendorPage = await browser.newPage();
  const vendorErrors = [];
  vendorPage.on('console', msg => { if (msg.type() === 'error') vendorErrors.push(msg.text()); });
  await vendorPage.goto(`${BASE}/index.html`);
  const donationClose = vendorPage.locator('#donationCloseBtn');
  await donationClose.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await donationClose.isVisible().catch(() => false)) await donationClose.click();
  await vendorPage.locator('#vBusinessName').fill('Admin Approval Test Venue');
  await vendorPage.locator('#vCategory').selectOption('Wedding Venues');
  await vendorPage.locator('#vUsername').fill(username);
  await vendorPage.locator('#vPassword').fill(password);
  await vendorPage.locator('#vPhone').fill('+961 3 000 111');
  await vendorPage.locator('#vEmail').fill(`${username}@example.com`);
  await vendorPage.locator('#vLocation').fill('Beirut, Lebanon');
  await vendorPage.locator('input[name="plan"][value="Basic"]').check({ force: true });
  await vendorPage.locator('#vTransactionRef').fill('E2E-ADMIN-TEST-0001');
  await vendorPage.locator('#vendorForm button[type="submit"]').click();
  await vendorPage.waitForFunction(
    () => (document.getElementById('vendorNote') || {}).textContent?.trim().length > 0,
    { timeout: 15000 }
  );
  ok(true, 'Vendor signed up');

  await vendorPage.goto(`${BASE}/vendor.html`);
  await vendorPage.locator('#vendorUsername').fill(username);
  await vendorPage.locator('#vendorPasswordInput').fill(password);
  await vendorPage.locator('#vendorLoginForm button[type="submit"]').click();
  await vendorPage.waitForFunction(
    () => !document.getElementById('pendingWrap').classList.contains('hidden'),
    { timeout: 15000 }
  );
  ok(true, 'Vendor sitting on the pending-approval gate, page left open');

  console.log('\n=== ADMIN LOGIN (real Firebase Auth, real UI) ===');
  const adminPage = await browser.newPage();
  const adminErrors = [];
  adminPage.on('console', msg => { if (msg.type() === 'error') adminErrors.push(msg.text()); });
  await adminPage.goto(`${BASE}/admin.html`);
  await adminPage.locator('#adminUsername').fill('foreverbeginslb');
  await adminPage.locator('#adminPassword').fill('F0reverBeg1n12');
  await adminPage.locator('#adminLoginForm button[type="submit"]').click();
  await adminPage.waitForFunction(
    () => !document.getElementById('dashboardShell').classList.contains('hidden'),
    { timeout: 15000 }
  );
  ok(true, 'Admin logged in via real Firebase Auth');

  console.log('\n=== ADMIN SEES THE PENDING VENDOR ===');
  await adminPage.locator('#adminNav button[data-panel="vendors"]').click();
  await adminPage.waitForFunction(
    (uname) => document.getElementById('vendorTableBody')?.textContent.includes(uname),
    username,
    { timeout: 15000 }
  );
  const tableText = await adminPage.locator('#vendorTableBody').textContent();
  ok(tableText.includes('Admin Approval Test Venue'), 'Pending vendor appears in the admin table');
  ok(/pending/i.test(tableText), 'Vendor shows as Pending');

  console.log('\n=== ADMIN CLICKS APPROVE ===');
  const row = adminPage.locator(`#vendorTableBody tr:has-text("${username}")`);
  await row.locator('.approve-btn').click();
  await adminPage.waitForFunction(
    (uname) => {
      const row = Array.from(document.querySelectorAll('#vendorTableBody tr')).find(r => r.textContent.includes(uname));
      return row && /approved/i.test(row.textContent);
    },
    username,
    { timeout: 15000 }
  );
  ok(true, 'Admin table shows the vendor as Approved after clicking Approve');

  console.log('\n=== VENDOR PAGE (left open this whole time) FLIPS TO DASHBOARD AUTOMATICALLY ===');
  await vendorPage.waitForFunction(
    () => !document.getElementById('dashboardShell').classList.contains('hidden'),
    { timeout: 15000 }
  );
  ok(true, 'Vendor dashboard unlocked in real time — no reload, no re-login, purely from the admin\'s approval click propagating via Firestore');

  console.log('\nVendor page console errors:', vendorErrors.length);
  vendorErrors.forEach(e => console.log(' -', e));
  console.log('Admin page console errors:', adminErrors.length);
  adminErrors.forEach(e => console.log(' -', e));
  ok(vendorErrors.length === 0, 'No console errors on the vendor page');
  ok(adminErrors.length === 0, 'No console errors on the admin page');

  await browser.close();
  console.log('\n=== DONE ===');
  process.exit(process.exitCode ? 1 : 0);
})().catch(err => {
  console.error('FATAL:', err);
  process.exit(1);
});
