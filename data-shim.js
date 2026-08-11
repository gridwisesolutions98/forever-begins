// ===================================================================
// FIRESTORE DATA SHIM — Phase 1 of the localStorage-to-Firebase migration.
//
// ~1000 call sites across vendor.js/venue.js/admin.js read and write data
// through getLS/setLS synchronously, in a single tick, and immediately
// re-render from the value they just wrote. Rewriting every one of those
// call sites to be async would be a huge, hard-to-verify rewrite. Instead,
// this shim keeps getLS/setLS's exact synchronous signature: reads come
// from an in-memory cache (kept fresh by Firestore onSnapshot listeners),
// writes update that same cache + localStorage immediately (so the
// existing "write then render" call-site pattern keeps working) and fire
// an async Firestore write in the background, not awaited by the caller.
//
// This cache is scoped to a single page load — it is NOT how data gets
// shared across tabs/devices. That's Firestore's job: each page's own
// onSnapshot listener is what pulls in changes made elsewhere.
//
// Loaded before each page's application script (vendor.js/venue.js/
// admin.js), right after firebase-init.js.
// ===================================================================

const __fbCache = new Map();
const __fbListeners = new Set();

// ===================================================================
// MEDIA UPLOAD (Firebase Storage) — Phase "go live" fix.
//
// resizeImage()/readFileAsDataURL() (still defined per-file in vendor.js/
// venue.js/script.js/admin.js, unchanged) used to be the END of the line:
// their base64 output got pushed straight into a JSON object that
// setVendorData()/writeVendorDoc() etc. store as a Firestore document.
// That's broken against a REAL project: Firestore hard-caps documents at
// 1 MiB, and a single 12MB video (this app's own upload limit) becomes
// ~16MB as base64 — 16x over the limit — while even a modest multi-photo
// gallery can blow past it too. uploadMedia() is the fix: images still get
// resized/compressed via the same canvas logic as resizeImage(), just
// ending in a Blob (for upload) instead of a data: URL (for inline
// storage); the Blob goes to Firebase Storage, and only the resulting
// download URL (a short string) ends up in the Firestore document.
function resizeImageToBlob(file, maxDim = 1600, quality = 0.85) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const reader = new FileReader();
    reader.onload = () => { img.src = reader.result; };
    reader.onerror = reject;
    img.onload = () => {
      let { width, height } = img;
      if (width > height && width > maxDim) { height *= maxDim / width; width = maxDim; }
      else if (height > maxDim) { width *= maxDim / height; height = maxDim; }
      const canvas = document.createElement('canvas');
      canvas.width = width; canvas.height = height;
      canvas.getContext('2d').drawImage(img, 0, 0, width, height);
      canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('canvas.toBlob failed')), 'image/jpeg', quality);
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// storagePath is a prefix like `vendors/${username}/gallery` — matches the
// path convention storage.rules checks ownership/approval against.
// maxDim/quality let callers that used a non-default resizeImage(file, maxDim,
// quality) size (e.g. a wider venue-map background) keep that same sizing.
async function uploadMedia(file, storagePath, maxDim = 1600, quality = 0.85) {
  if (!window.fbStorage) throw new Error('Storage service unavailable right now. Please try again in a moment.');
  // No-op for an already-authenticated vendor/admin/couple; signs in an
  // anonymous visitor otherwise (e.g. an uploaded design file attached to a
  // booking, submitted with no account at all) — storage.rules' write
  // checks all require SOME request.auth.
  await ensureSomeAuth();
  const isImage = file.type.startsWith('image/');
  const blob = isImage ? await resizeImageToBlob(file, maxDim, quality) : file;
  const ext = isImage ? 'jpg' : ((file.name.split('.').pop() || 'bin').toLowerCase());
  const filename = `${Date.now()}_${Math.random().toString(36).slice(2)}.${ext}`;
  const ref = window.fbStorage.ref().child(`${storagePath}/${filename}`);
  const snapshot = await ref.put(blob, { contentType: isImage ? 'image/jpeg' : (file.type || 'application/octet-stream') });
  return snapshot.ref.getDownloadURL();
}

function getLS(key, fallback) {
  if (__fbCache.has(key)) {
    const val = __fbCache.get(key);
    return val === undefined ? fallback : val;
  }
  const raw = localStorage.getItem(key);
  if (raw === null) return fallback;
  try { return JSON.parse(raw); } catch (e) { return fallback; }
}

function setLS(key, value) {
  __fbCache.set(key, value);
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch (e) {
    alert('Storage is full — this photo/video could not be saved. Try a smaller file or remove some older media.');
  }
}

// Re-renders whichever page is currently loaded after a Firestore update
// arrives. Each branch is independently try/caught by its own render
// function already (renderAll/renderProfile), so this stays a thin dispatch.
function notifyDataChanged() {
  try {
    if (typeof window.renderAll === 'function') {
      window.renderAll();
    } else if (typeof window.renderProfile === 'function' || typeof window.renderListing === 'function') {
      const params = new URLSearchParams(location.search);
      const v = params.get('v');
      if (v && typeof window.renderProfile === 'function') window.renderProfile(v);
      else if (typeof window.renderListing === 'function') window.renderListing(params.get('category') || 'Wedding Venues');
    } else if (typeof window.__coupleDataChanged === 'function') {
      window.__coupleDataChanged();
    }
    // Independent of the page-type dispatch above — index.html has none of
    // those render hooks, but still needs to react to a live homepage-hero
    // change from admin.
    if (typeof window.__heroDataChanged === 'function') window.__heroDataChanged();
  } catch (e) { console.error('Data shim: re-render after Firestore update failed:', e); }
}

// --- Single-blob vendor data (profile, settings, availability, ...) ------
// Maps the legacy flat key `fb_venue_${name}_${username}` to
// `vendors/{username}/meta/{name}` and keeps the cache in sync via a live
// listener. Values are wrapped in `{ value }` since Firestore documents
// must be maps, not bare arrays/primitives — vendor data today is a mix
// of objects, arrays and (rarely) primitives depending on category.
function ensureVendorDocListener(username, name, key) {
  if (__fbListeners.has(key)) return;
  __fbListeners.add(key);
  // If Firebase never initialized (offline, blocked script, or — during
  // development — a test harness that loads this file standalone without
  // firebase-init.js), fall back to plain localStorage: getLS/setLS above
  // already work standalone, this just skips the live-sync layer on top.
  if (!window.fbDb) return;
  window.fbDb.collection('vendors').doc(username).collection('meta').doc(name)
    .onSnapshot(
      snap => { __fbCache.set(key, snap.exists ? snap.data().value : undefined); notifyDataChanged(); },
      // Expected, not a bug: bookings/payments/inquiries/notifications/
      // appointments are owner/admin-read-only (see firestore.rules), so a
      // customer's own venue.html page calling this for their own submitted
      // booking/appointment always gets denied — they still see their own
      // just-submitted entry from the optimistic local write, just not live
      // updates from the vendor's side. Anything else stays logged.
      err => { if (err.code !== 'permission-denied') console.error('Data shim: listener error for', key, err); }
    );
}

function writeVendorDoc(username, name, value) {
  const key = `fb_venue_${name}_${username}`;
  setLS(key, value);
  if (!window.fbDb) return;
  window.fbDb.collection('vendors').doc(username).collection('meta').doc(name)
    .set({ value })
    .catch(err => console.error('Data shim: write failed for', key, err));
}

// For counters (profile views, portfolio views, ...) that live as one field
// inside an object-shaped vendor doc (e.g. profile.viewsCount). writeVendorDoc
// is unsafe for this: it needs a fresh read of the WHOLE object first, and if
// this fires before that doc's own onSnapshot listener has delivered its
// first real snapshot (a real race — this runs on every page/session
// reconnect, not just once), the read sees the empty {} placeholder instead
// of the real data, and writing it back destroys every other field (gallery,
// logo, cover...) that was already saved. FieldValue.increment() on a
// dotted path needs no read at all, so there's nothing to race — it can only
// ever touch the one field, never the rest of the object, no matter when it
// fires relative to the listener.
function incrementVendorField(username, name, field, amount) {
  const key = `fb_venue_${name}_${username}`;
  const current = getLS(key, {});
  current[field] = (current[field] || 0) + amount;
  setLS(key, current);
  if (!window.fbDb) return;
  window.fbDb.collection('vendors').doc(username).collection('meta').doc(name)
    .set({ value: { [field]: firebase.firestore.FieldValue.increment(amount) } }, { merge: true })
    .catch(err => console.error('Data shim: increment failed for', key, field, err));
}

// For a couple booking/messaging a vendor from venue.js: they don't own the
// vendor's document, so they can't use writeVendorDoc's full overwrite (that
// needs isOwner). This appends exactly one new item via arrayUnion instead,
// matching firestore.rules' isSingleAppend() check — a couple can add their
// own booking/payment/inquiry/notification/appointment, never edit or wipe
// anyone else's. Only for the five doc names firestore.rules allowlists.
//
// Booking a vendor has never required creating a Forever Begins account —
// venue.js lets a completely anonymous visitor submit one. But Firestore's
// append-only rule needs SOME request.auth to exist to tell a real visitor
// apart from a bare script hitting the API directly, so an anonymous
// visitor is silently signed in via Firebase Auth's Anonymous provider
// first (invisible to them — no account, no password, nothing to log into
// later). A couple who's already logged into their real account keeps that
// session; this only fires for a signed-out visitor.
// A booking's submit handler fires off several appendToVendorList calls
// back-to-back (bookings, then a payment, then a notification) without
// awaiting each one — so without this guard, each would independently see
// "no currentUser yet" and call signInAnonymously() concurrently. Firebase
// mints a NEW anonymous user per call, and a later sign-in invalidates the
// auth token an earlier write was mid-flight on, silently dropping it.
// Sharing one in-flight promise means every caller waits on the same
// sign-in instead of racing to start their own.
let __anonSignInPromise = null;
async function ensureSomeAuth() {
  if (!window.fbAuth || window.fbAuth.currentUser) return;
  if (!__anonSignInPromise) {
    __anonSignInPromise = window.fbAuth.signInAnonymously().finally(() => { __anonSignInPromise = null; });
  }
  await __anonSignInPromise;
}

async function appendToVendorList(username, name, item) {
  const key = `fb_venue_${name}_${username}`;
  const current = getLS(key, []);
  current.push(item);
  setLS(key, current);
  if (!window.fbDb) return;
  try {
    await ensureSomeAuth();
    await window.fbDb.collection('vendors').doc(username).collection('meta').doc(name)
      .set({ value: firebase.firestore.FieldValue.arrayUnion(item) }, { merge: true });
  } catch (err) {
    console.error('Data shim: append failed for', key, err);
  }
}

// --- Couple data (private — no public-read branch, unlike vendors) -------
// Mirrors the vendor-doc pair above but under `couples/{username}` — a
// couple's planning data (checklist, budget, guests, messages...) is
// never publicly browsable, only the couple themselves can read/write it.
function ensureCoupleDocListener(username, name, key) {
  if (__fbListeners.has(key)) return;
  __fbListeners.add(key);
  if (!window.fbDb) return;
  window.fbDb.collection('couples').doc(username).collection('meta').doc(name)
    .onSnapshot(
      snap => { __fbCache.set(key, snap.exists ? snap.data().value : undefined); notifyDataChanged(); },
      err => console.error('Data shim: listener error for', key, err)
    );
}

function writeCoupleDoc(username, name, value) {
  const key = `fb_couple_${name}_${username}`;
  setLS(key, value);
  if (!window.fbDb) return;
  window.fbDb.collection('couples').doc(username).collection('meta').doc(name)
    .set({ value })
    .catch(err => console.error('Data shim: write failed for', key, err));
}

// --- Site-wide public config (homepage hero, etc.) --------------------
// Admin-only write, publicly readable — matches firestore.rules' existing
// `config/{doc}` collection (scaffolded early in the migration but never
// actually wired to a feature until now: the homepage hero image/video and
// similar site-wide settings used to live in admin's own browser only,
// invisible to real visitors on their own devices).
function ensureConfigListener(name, key) {
  if (__fbListeners.has(key)) return;
  __fbListeners.add(key);
  if (!window.fbDb) return;
  window.fbDb.collection('config').doc(name)
    .onSnapshot(
      snap => { __fbCache.set(key, snap.exists ? snap.data().value : undefined); notifyDataChanged(); },
      err => console.error('Data shim: config listener error for', key, err)
    );
}

// key matches whatever legacy localStorage key the callers already use
// (e.g. 'fb_homepage_hero'), same pairing convention as ensureConfigListener.
function writeConfig(name, key, value) {
  setLS(key, value);
  if (!window.fbDb) return;
  window.fbDb.collection('config').doc(name)
    .set({ value })
    .catch(err => console.error('Data shim: config write failed for', key, err));
}

// --- Vendor "Promote Your Service" requests (moderation queue) --------
// Created by a vendor, then only ever edited by admin (approve/reject,
// attach banner media) — unlike a vendor's own data, this needs individually
// addressable documents a vendor can create without being able to read or
// tamper with anyone else's request, so it's its own top-level collection
// (matching the existing `reviews` collection's create-by-anyone,
// moderate-by-admin shape) rather than the vendor-owned meta-doc pattern.
function ensurePromotionsListener() {
  const key = 'fb_promotions';
  if (__fbListeners.has(key)) return;
  __fbListeners.add(key);
  if (!window.fbDb) return;
  window.fbDb.collection('promotions').onSnapshot(
    snap => { setLS(key, snap.docs.map(d => ({ id: d.id, ...d.data() }))); notifyDataChanged(); },
    err => console.error('Data shim: promotions listener error:', err)
  );
}

function createPromotion(item) {
  if (!window.fbDb) {
    const list = getLS('fb_promotions', []);
    list.push(item);
    setLS('fb_promotions', list);
    return;
  }
  window.fbDb.collection('promotions').add(item).catch(err => console.error('Data shim: promotion create failed:', err));
}

function updatePromotion(id, patch) {
  const list = getLS('fb_promotions', []);
  const p = list.find(x => x.id === id);
  if (p) Object.assign(p, patch);
  setLS('fb_promotions', list);
  if (!window.fbDb) return;
  window.fbDb.collection('promotions').doc(id).update(patch).catch(err => console.error('Data shim: promotion update failed:', err));
}

// --- Vendor applications directory ----------------------------------
// `fb_vendor_applications` is read everywhere as a flat array; back it
// with the `vendors` collection (one document per vendor).
//
// Only queries approved vendors: Firestore requires a `list`/query to have
// a `.where()` clause its rules engine can statically prove satisfies the
// security rule (it does not run the query then filter results
// per-document) — an unfiltered `.collection('vendors').onSnapshot(...)`
// would be rejected outright since the read rule depends on per-document
// fields. A vendor's own (possibly non-approved) record is covered
// separately by the single-document listener in vendor.js's routeVendor,
// which isn't subject to this list-query restriction. Phase 2 will give
// admin.js its own path to see pending/frozen vendors too.
function ensureApplicationsListener() {
  const key = 'fb_vendor_applications';
  if (__fbListeners.has(key)) return;
  __fbListeners.add(key);
  if (!window.fbDb) return;
  window.fbDb.collection('vendors').where('status', '==', 'Approved').onSnapshot(
    snap => { setLS(key, snap.docs.map(d => d.data())); notifyDataChanged(); },
    err => console.error('Data shim: vendors listener error:', err)
  );
}
