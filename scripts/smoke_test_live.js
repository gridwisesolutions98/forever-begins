// One-off smoke test against the REAL deployed Firebase Hosting URL and the
// REAL foreverbegins-f4d0f project (not the emulator) — confirms the whole
// stack actually works end-to-end before DNS/custom domain is involved.
// Cleans up everything it creates (vendor, its data) via the Admin SDK.
const { chromium } = require('playwright');
const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');
const { getAuth } = require('firebase-admin/auth');

const KEY_PATH = process.env.GOOGLE_APPLICATION_CREDENTIALS;
const REAL_ADMIN_USERNAME = process.env.REAL_ADMIN_USERNAME;
const REAL_ADMIN_PASSWORD = process.env.REAL_ADMIN_PASSWORD;
if (!KEY_PATH || !REAL_ADMIN_USERNAME || !REAL_ADMIN_PASSWORD) {
  console.error('Set GOOGLE_APPLICATION_CREDENTIALS, REAL_ADMIN_USERNAME, and REAL_ADMIN_PASSWORD first.');
  process.exit(1);
}
initializeApp({ credential: cert(require(KEY_PATH)) });
const adminDb = getFirestore();
const adminAuth = getAuth();

const BASE = 'https://foreverbegins.pro';
const vendorUsername = `livesmoke_${Date.now()}`;

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function ok(cond, msg) { if (cond) console.log('ok: ' + msg); else fail(msg); }

async function closeDonation(page) {
  const btn = page.locator('#donationCloseBtn');
  await btn.waitFor({ state: 'visible', timeout: 8000 }).catch(() => {});
  if (await btn.isVisible().catch(() => false)) await btn.click();
}

(async () => {
  const browser = await chromium.launch();

  console.log('=== REAL VENDOR SIGNUP (real Firebase Auth + Firestore, real project) ===');
  const vendorPage = await browser.newPage();
  const vendorErrors = [];
  vendorPage.on('console', msg => { if (msg.type() === 'error') vendorErrors.push(msg.text()); });
  await vendorPage.goto(`${BASE}/index.html`, { waitUntil: 'domcontentloaded' });
  await closeDonation(vendorPage);
  await vendorPage.locator('#vBusinessName').fill('Live Smoke Test Venue');
  await vendorPage.locator('#vCategory').selectOption('Wedding Venues');
  await vendorPage.locator('#vUsername').fill(vendorUsername);
  await vendorPage.locator('#vPassword').fill('LiveSmoke123!');
  await vendorPage.locator('#vPhone').fill('+961 3 000 111');
  await vendorPage.locator('#vEmail').fill(`${vendorUsername}@example.com`);
  await vendorPage.locator('#vLocation').fill('Beirut, Lebanon');
  await vendorPage.locator('input[name="plan"][value="Basic"]').check({ force: true });
  await vendorPage.locator('#vTransactionRef').fill('LIVE-SMOKE-0001');
  await vendorPage.locator('#vendorForm button[type="submit"]').click();
  await vendorPage.waitForFunction(() => (document.getElementById('vendorNote') || {}).textContent?.trim().length > 0, { timeout: 20000 });
  ok(true, 'Vendor signed up against the real project');

  const vendorSnap = await adminDb.collection('vendors').doc(vendorUsername).get();
  ok(vendorSnap.exists, 'Vendor doc really exists in the real Firestore (read via Admin SDK)');

  console.log('\n=== APPROVE VIA ADMIN SDK, THEN REAL ADMIN LOGIN ===');
  await adminDb.collection('vendors').doc(vendorUsername).update({ status: 'Approved' });
  await adminDb.collection('vendors').doc(vendorUsername).collection('meta').doc('packages')
    .set({ value: [{ id: 1, name: 'Live Smoke Package', price: 500 }] });

  const adminPage = await browser.newPage();
  const adminErrors = [];
  adminPage.on('console', msg => { if (msg.type() === 'error') adminErrors.push(msg.text()); });
  await adminPage.goto(`${BASE}/admin.html`, { waitUntil: 'domcontentloaded' });
  await adminPage.locator('#adminUsername').fill(REAL_ADMIN_USERNAME);
  await adminPage.locator('#adminPassword').fill(REAL_ADMIN_PASSWORD);
  await adminPage.locator('#adminLoginForm button[type="submit"]').click();
  await adminPage.waitForFunction(() => !document.getElementById('dashboardShell').classList.contains('hidden'), { timeout: 20000 });
  ok(true, 'Real admin login works against the real project');

  console.log('\n=== VENDOR LOGS IN FOR REAL, UPLOADS A REAL PHOTO TO REAL STORAGE ===');
  await vendorPage.goto(`${BASE}/vendor.html`, { waitUntil: 'domcontentloaded' });
  await vendorPage.locator('#vendorUsername').fill(vendorUsername);
  await vendorPage.locator('#vendorPasswordInput').fill('LiveSmoke123!');
  await vendorPage.locator('#vendorLoginForm button[type="submit"]').click();
  await vendorPage.waitForFunction(() => !document.getElementById('dashboardShell').classList.contains('hidden'), { timeout: 20000 });
  ok(true, 'Vendor dashboard unlocked after real approval');

  const uploadResult = await vendorPage.evaluate(async () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1200; canvas.height = 800;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#3355aa'; ctx.fillRect(0, 0, 1200, 800);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.9));
    const file = new File([blob], 'live-smoke.jpg', { type: 'image/jpeg' });
    try {
      const url = await uploadMedia(file, `vendors/${currentVendor.username}/testLiveSmoke`);
      // Matches how the app actually consumes these URLs (<img src>/<video
      // src> in every render function) rather than fetch(), which is
      // subject to CORS in a way plain resource loads never are.
      const loaded = await new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(true);
        img.onerror = () => resolve(false);
        img.src = url;
      });
      return { ok: true, url, loaded };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  });
  ok(uploadResult.ok && uploadResult.loaded, 'Real upload to real Firebase Storage succeeded and renders via <img>: ' + JSON.stringify(uploadResult));

  console.log('\n=== ANONYMOUS CUSTOMER BOOKS THE VENDOR (real project) ===');
  const customerPage = await browser.newPage();
  const customerErrors = [];
  customerPage.on('console', msg => { if (msg.type() === 'error') customerErrors.push(msg.text()); });
  await customerPage.goto(`${BASE}/venue.html?v=${vendorUsername}`, { waitUntil: 'domcontentloaded' });
  await customerPage.locator('#openBookingBtn').click();
  await customerPage.locator('#bookPackage').selectOption('Live Smoke Package');
  await customerPage.locator('#bookFullName').fill('Live Smoke Couple');
  await customerPage.locator('#bookWeddingDate').fill('2027-09-01');
  await customerPage.locator('#bookEmail').fill('livesmokecouple@example.com');
  await customerPage.locator('#bookPhone').fill('+961 3 222 333');
  await customerPage.locator('#bookTransactionRef').fill('LIVE-SMOKE-BOOK-0001');
  await customerPage.locator('#bookingForm button[type="submit"]').click();
  await customerPage.waitForFunction(() => (document.getElementById('bookNote') || {}).textContent?.trim().length > 0, { timeout: 15000 });
  await new Promise(r => setTimeout(r, 3000));
  const bookingsSnap = await adminDb.collection('vendors').doc(vendorUsername).collection('meta').doc('bookings').get();
  const bookings = bookingsSnap.exists ? (bookingsSnap.data().value || []) : [];
  ok(bookings.length === 1 && bookings[0].coupleName === 'Live Smoke Couple', 'Anonymous booking landed in the REAL Firestore: ' + JSON.stringify(bookings));

  console.log('\nConsole errors — vendor:', vendorErrors.length, 'admin:', adminErrors.length, 'customer:', customerErrors.length);
  [...vendorErrors, ...adminErrors, ...customerErrors].forEach(e => console.log(' -', e));
  ok(vendorErrors.length === 0 && adminErrors.length === 0 && customerErrors.length === 0, 'No console errors anywhere');

  console.log('\n=== CLEANUP ===');
  try {
    const authUser = await adminAuth.getUserByEmail(`${vendorUsername}@example.com`);
    await adminAuth.deleteUser(authUser.uid);
  } catch (e) { console.log('cleanup: auth user already gone or not found'); }
  const metaSnap = await adminDb.collection('vendors').doc(vendorUsername).collection('meta').listDocuments();
  for (const d of metaSnap) await d.delete();
  const lookupSnap = await adminDb.collection('vendors').doc(vendorUsername).collection('authLookup').listDocuments();
  for (const d of lookupSnap) await d.delete();
  await adminDb.collection('vendors').doc(vendorUsername).delete();
  console.log('Cleaned up test vendor and its data.');

  await browser.close();
  console.log('\n=== DONE ===');
  process.exit(process.exitCode ? 1 : 0);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
