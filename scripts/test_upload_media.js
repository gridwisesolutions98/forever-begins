// Verifies uploadMedia() (data-shim.js) actually works against the Storage
// emulator with REALISTIC file sizes, not tiny placeholder fixtures — a
// large image (should get resized+compressed) and a large "video"
// (should pass through unresized), confirming both produce a real,
// fetchable download URL instead of a giant base64 string.
const { chromium } = require('playwright');

const BASE = 'http://localhost:8000';
const username = `pw_upload_test_${Date.now()}`;

function fail(msg) { console.log('FAIL: ' + msg); process.exitCode = 1; }
function ok(cond, msg) { if (cond) console.log('ok: ' + msg); else fail(msg); }

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const errors = [];
  page.on('console', msg => { if (msg.type() === 'error') errors.push(msg.text()); });

  console.log('=== SIGNUP (need a real, authenticated vendor for storage.rules ownership check) ===');
  await page.goto(`${BASE}/index.html`);
  const donationClose = page.locator('#donationCloseBtn');
  await donationClose.waitFor({ state: 'visible', timeout: 5000 }).catch(() => {});
  if (await donationClose.isVisible().catch(() => false)) await donationClose.click();
  await page.locator('#vBusinessName').fill('Upload Test Venue');
  await page.locator('#vCategory').selectOption('Wedding Venues');
  await page.locator('#vUsername').fill(username);
  await page.locator('#vPassword').fill('TestPass123!');
  await page.locator('#vPhone').fill('+961 3 777 000');
  await page.locator('#vEmail').fill(`${username}@example.com`);
  await page.locator('#vLocation').fill('Beirut, Lebanon');
  await page.locator('input[name="plan"][value="Basic"]').check({ force: true });
  await page.locator('#vTransactionRef').fill('E2E-UPLOAD-0001');
  await page.locator('#vendorForm button[type="submit"]').click();
  await page.waitForFunction(() => (document.getElementById('vendorNote') || {}).textContent?.trim().length > 0, { timeout: 15000 });

  await page.goto(`${BASE}/vendor.html`);
  await page.locator('#vendorUsername').fill(username);
  await page.locator('#vendorPasswordInput').fill('TestPass123!');
  await page.locator('#vendorLoginForm button[type="submit"]').click();
  // A fresh signup is Pending, not Approved — storage.rules' isOwner() check
  // doesn't care about approval status though (only isApproved() does, for
  // OTHER people's reads), so upload-as-owner should work from the pending
  // gate already. No need to approve for this test.
  await page.waitForFunction(() => !document.getElementById('pendingWrap').classList.contains('hidden'), { timeout: 15000 });
  ok(true, 'Vendor signed up and reached the pending gate (authenticated, which is all uploadMedia needs)');

  console.log('\n=== UPLOAD A REALISTIC-SIZED IMAGE ===');
  const imageResult = await page.evaluate(async (uname) => {
    // 2400x1800 canvas of per-pixel random noise -> JPEG blob: large,
    // incompressible, photographic-noise-like content (unlike a handful of
    // flat color blocks, which unrealistically favors PNG over JPEG) and
    // well over the resize cap (1600px), so this exercises both the
    // downscale and the recompression paths the way a real camera photo
    // uploaded at full resolution would.
    const canvas = document.createElement('canvas');
    canvas.width = 2400; canvas.height = 1800;
    const ctx = canvas.getContext('2d');
    const imageData = ctx.createImageData(2400, 1800);
    for (let i = 0; i < imageData.data.length; i += 4) {
      imageData.data[i] = Math.random() * 256;
      imageData.data[i + 1] = Math.random() * 256;
      imageData.data[i + 2] = Math.random() * 256;
      imageData.data[i + 3] = 255;
    }
    ctx.putImageData(imageData, 0, 0);
    const blob = await new Promise(res => canvas.toBlob(res, 'image/jpeg', 0.95));
    const file = new File([blob], 'test-photo.jpg', { type: 'image/jpeg' });
    try {
      const url = await uploadMedia(file, `vendors/${uname}/testUploads`);
      return { ok: true, url, originalSize: file.size };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, username);
  ok(imageResult.ok, 'Image upload succeeded: ' + JSON.stringify(imageResult));
  if (imageResult.ok) {
    ok(imageResult.url.startsWith('http'), 'Returned a real URL, not a data: URI: ' + imageResult.url);
    ok(imageResult.originalSize > 50000, `Original test image was realistically sized (${imageResult.originalSize} bytes), not a tiny fixture`);
    const fetched = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, size: (await res.blob()).size };
    }, imageResult.url);
    ok(fetched.status === 200, 'The returned URL is actually fetchable: status ' + fetched.status);
    ok(fetched.size > 0 && fetched.size < imageResult.originalSize, `Stored file was resized/compressed smaller than the original (${fetched.size} vs ${imageResult.originalSize} bytes)`);
  }

  console.log('\n=== UPLOAD A REALISTIC-SIZED "VIDEO" (non-image passthrough path) ===');
  const videoResult = await page.evaluate(async (uname) => {
    // 3MB of random-ish bytes standing in for a real video file — well
    // over Firestore's 1 MiB document limit on its own, which is exactly
    // the case that used to break.
    const bytes = new Uint8Array(3 * 1024 * 1024);
    for (let i = 0; i < bytes.length; i += 997) bytes[i] = Math.floor(Math.random() * 256);
    const file = new File([bytes], 'test-video.mp4', { type: 'video/mp4' });
    try {
      const url = await uploadMedia(file, `vendors/${uname}/testUploads`);
      return { ok: true, url, originalSize: file.size };
    } catch (err) {
      return { ok: false, error: err.message };
    }
  }, username);
  ok(videoResult.ok, 'Video upload succeeded: ' + JSON.stringify(videoResult));
  if (videoResult.ok) {
    ok(videoResult.url.startsWith('http'), 'Returned a real URL, not a data: URI: ' + videoResult.url);
    const fetched = await page.evaluate(async (url) => {
      const res = await fetch(url);
      return { status: res.status, size: (await res.blob()).size };
    }, videoResult.url);
    ok(fetched.status === 200, 'The returned video URL is actually fetchable: status ' + fetched.status);
    ok(fetched.size === videoResult.originalSize, `Video passed through unresized (${fetched.size} bytes, matches original ${videoResult.originalSize})`);
  }

  console.log('\nConsole errors:', errors.length);
  errors.forEach(e => console.log(' -', e));
  ok(errors.length === 0, 'No console errors');

  await browser.close();
  console.log('\n=== DONE ===');
  process.exit(process.exitCode ? 1 : 0);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
