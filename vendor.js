// ===================================================================
// Forever Begins — Vendor Dashboard (demo)
// Gated by the vendor's subscription plan (Basic / Professional / Premium
// Featured) and by admin approval status, both set in the admin dashboard.
// Currently tailored to "Wedding Venues" category vendors.
// ===================================================================

// getLS/setLS are now provided by data-shim.js (loaded before this file),
// backed by Firestore instead of plain localStorage — see that file for
// the full explanation. Everything below still calls them exactly as before.
// Live from page load (not gated behind login) since attemptLogin itself
// needs to look up the application record right after Firebase Auth succeeds.
ensureApplicationsListener();
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
// A vendor's own tour-link preview is rendered as a clickable <a href> in
// their dashboard — reject non-http(s) schemes so a stray "javascript:"
// entry can't run script the moment the vendor previews their own link.
function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}
function resizeImage(file, maxDim = 1600, quality = 0.85) {
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
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = reject;
    reader.readAsDataURL(file);
  });
}
function readFileAsDataURL(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}
// Contract/license/insurance uploads get stored as a data: URI and later
// opened directly via <a href target="_blank"> using the browser-reported
// MIME type — unlike photos (which only ever get *decoded* as an image),
// a document opened this way with a type like text/html could render as a
// page and run any script it contains. Restrict to real document/image
// types so that path can't be used to smuggle in an HTML/script payload.
const SAFE_DOCUMENT_TYPES = ['application/pdf', 'image/jpeg', 'image/png', 'image/webp'];
function isSafeDocumentFile(file) {
  return SAFE_DOCUMENT_TYPES.includes(file.type);
}
function sameMonth(a, b) { return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth(); }

// Cover media can be a photo or a video. Supports the older plain-string
// (image dataURL) shape too, from before video covers were supported.
function coverMediaTag(cover, className) {
  if (!cover) return '';
  if (typeof cover === 'object' && cover.src) {
    return cover.type === 'video'
      ? `<video src="${cover.src}" class="${className}" muted loop autoplay playsinline></video>`
      : `<img loading="lazy" decoding="async" src="${cover.src}" class="${className}" alt="Cover">`;
  }
  return `<img loading="lazy" decoding="async" src="${cover}" class="${className}" alt="Cover">`;
}

const PLAN_LEVEL = { Basic: 1, Professional: 2, 'Premium Featured': 3 };
const AMENITIES = ['Parking', 'WiFi', 'Bridal Suite', 'Sound System', 'Catering Kitchen', 'Air Conditioning', 'Wheelchair Accessible', 'Backup Generator', 'Dance Floor', 'Outdoor Garden'];
const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

// Pure-JS SHA-256 (not the Web Crypto API): crypto.subtle is only available
// in "secure contexts" (HTTPS, or localhost) — this static site may well be
// served over plain HTTP, where crypto.subtle would silently be undefined
// and break every login.
function hashPassword(password) {
  const K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2,
  ];
  let H = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  const bytes = new TextEncoder().encode(password);
  const bitLen = bytes.length * 8;
  const padLen = (bytes.length % 64 < 56) ? (56 - bytes.length % 64) : (120 - bytes.length % 64);
  const total = bytes.length + padLen + 8;
  const buf = new Uint8Array(total);
  buf.set(bytes);
  buf[bytes.length] = 0x80;
  const view = new DataView(buf.buffer);
  view.setUint32(total - 4, bitLen >>> 0, false);
  view.setUint32(total - 8, Math.floor(bitLen / 0x100000000), false);
  const rotr = (x, n) => (x >>> n) | (x << (32 - n));
  for (let chunk = 0; chunk < total; chunk += 64) {
    const w = new Uint32Array(64);
    for (let i = 0; i < 16; i++) w[i] = view.getUint32(chunk + i * 4, false);
    for (let i = 16; i < 64; i++) {
      const s0 = rotr(w[i - 15], 7) ^ rotr(w[i - 15], 18) ^ (w[i - 15] >>> 3);
      const s1 = rotr(w[i - 2], 17) ^ rotr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
      w[i] = (w[i - 16] + s0 + w[i - 7] + s1) >>> 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let i = 0; i < 64; i++) {
      const S1 = rotr(e, 6) ^ rotr(e, 11) ^ rotr(e, 25);
      const ch = (e & f) ^ (~e & g);
      const t1 = (h + S1 + ch + K[i] + w[i]) >>> 0;
      const S0 = rotr(a, 2) ^ rotr(a, 13) ^ rotr(a, 22);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const t2 = (S0 + maj) >>> 0;
      h = g; g = f; f = e; e = (d + t1) >>> 0; d = c; c = b; b = a; a = (t1 + t2) >>> 0;
    }
    H = [H[0] + a, H[1] + b, H[2] + c, H[3] + d, H[4] + e, H[5] + f, H[6] + g, H[7] + h].map(x => x >>> 0);
  }
  return H.map(x => x.toString(16).padStart(8, '0')).join('');
}

// All 19 categories previously had client-side demo-seed IIFEs here (one
// per category, writing a fake local-only vendor into
// fb_vendor_accounts/fb_vendor_applications on every page load). Removed —
// vendor accounts are real Firebase Auth users now, and these seeds would
// just get overwritten by the live vendors-collection listener moments
// after running anyway. Sign up a real test vendor through the "Become a
// Vendor" form, or use a scripts/provision_admin.js-style one-time
// firebase-admin script against the dev project for repeatable test data.


let currentVendor = null; // the vendor's application record

function planLevel() { return PLAN_LEVEL[currentVendor.plan] || 1; }
function vKey(name) { return `fb_venue_${name}_${currentVendor.username}`; }
// Firestore-backed (see data-shim.js): getVendorData/setVendorData are the
// single funnel ~425/~300 call sites go through, so this is the only place
// that needs to know about the Firestore path underneath the legacy key.
function getVendorData(name, fallback) {
  ensureVendorDocListener(currentVendor.username, name, vKey(name));
  return getLS(vKey(name), fallback);
}
function setVendorData(name, value) { writeVendorDoc(currentVendor.username, name, value); }

// ===== Elements =====
const loginWrap = document.getElementById('loginWrap');
const pendingWrap = document.getElementById('pendingWrap');
const wrongCategoryWrap = document.getElementById('wrongCategoryWrap');
const frozenWrap = document.getElementById('frozenWrap');
const dashboardShell = document.getElementById('dashboardShell');

function hideAllGates() {
  loginWrap.classList.add('hidden');
  pendingWrap.classList.add('hidden');
  wrongCategoryWrap.classList.add('hidden');
  frozenWrap.classList.add('hidden');
  dashboardShell.classList.add('hidden');
}

document.getElementById('vendorLoginForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const username = document.getElementById('vendorUsername').value.trim();
  const password = document.getElementById('vendorPasswordInput').value;
  attemptLogin(username, password);
});

// ===================================================================
// FORGOT PASSWORD — real Firebase password-reset email (accounts are
// keyed by real email now, see attemptLogin above), gated behind the same
// email/WhatsApp verification against the publicly-readable
// authLookup/contact doc. No "enter the code" step: the emailed link goes
// straight to Firebase's own password-reset page.
// ===================================================================
function contactMatches(contactOnFile, contact) {
  const normalized = contact.trim().toLowerCase();
  if (!normalized) return false;
  const emailMatch = contactOnFile.email && contactOnFile.email.toLowerCase() === normalized;
  const digits = normalized.replace(/\D/g, '');
  const phoneMatch = digits.length >= 7 && contactOnFile.phone && contactOnFile.phone.replace(/\D/g, '').endsWith(digits);
  return !!(emailMatch || phoneMatch);
}

document.getElementById('vendorForgotPasswordLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('vendorForgotPasswordWrap').classList.toggle('hidden');
});

document.getElementById('vendorSendCodeBtn').addEventListener('click', async () => {
  const username = document.getElementById('vendorForgotUsername').value.trim();
  const contact = document.getElementById('vendorForgotContact').value.trim();
  const note = document.getElementById('vendorForgotNote1');
  note.style.color = '#c0392b';
  if (!window.fbDb || !window.fbAuth) { note.textContent = 'Service unavailable right now. Please try again in a moment.'; return; }
  let contactOnFile;
  try {
    const doc = await window.fbDb.collection('vendors').doc(username).collection('authLookup').doc('contact').get();
    if (!doc.exists) { note.textContent = 'No account found with that username.'; return; }
    contactOnFile = doc.data();
  } catch (err) {
    note.textContent = 'Could not reach the login service. Please try again.';
    return;
  }
  if (!contactMatches(contactOnFile, contact)) { note.textContent = "That email/WhatsApp doesn't match our records for this account."; return; }
  try {
    await window.fbAuth.sendPasswordResetEmail(contactOnFile.email);
  } catch (err) {
    note.textContent = err.message || 'Could not send the reset email. Please try again.';
    return;
  }
  note.style.color = 'var(--primary)';
  note.textContent = `📩 A password reset link has been sent to ${contactOnFile.email}. Check your inbox (and spam folder) and follow the link to set a new password.`;
  setTimeout(() => {
    document.getElementById('vendorForgotPasswordWrap').classList.add('hidden');
    ['vendorForgotUsername', 'vendorForgotContact'].forEach(id => document.getElementById(id).value = '');
    note.textContent = '';
  }, 6000);
});

// Vendor accounts are real Firebase Auth users, identified by their real
// email under the hood (see the authLookup/contact doc, resolved from
// "username" before sign-in) — Firebase Auth throttles repeated failed
// sign-ins server-side, real protection unlike the old client-side attempt
// counter this replaced (removed — trivially clearable via DevTools anyway).
// Firebase Auth throttles repeated failed sign-ins server-side, which is
// real protection unlike the old client-side attempt counter (removed).
async function attemptLogin(username, password) {
  const note = document.getElementById('vendorLoginNote');
  if (!window.fbAuth) {
    note.textContent = 'Login service unavailable right now. Please try again in a moment.';
    return;
  }
  // Login is by real email under the hood now (so Forgot Password can use
  // Firebase's own sendPasswordResetEmail) — resolve "username" to that
  // real email via the publicly-readable authLookup/contact doc first.
  let realEmail;
  try {
    const lookup = await window.fbDb.collection('vendors').doc(username).collection('authLookup').doc('contact').get();
    if (!lookup.exists) { note.textContent = 'Incorrect username or password.'; return; }
    realEmail = lookup.data().email;
  } catch (err) {
    note.textContent = 'Could not reach the login service. Please check your connection and try again.';
    return;
  }
  let userCredential;
  try {
    userCredential = await window.fbAuth.signInWithEmailAndPassword(realEmail, password);
  } catch (err) {
    note.textContent = err.code === 'auth/too-many-requests'
      ? 'Too many failed attempts. Please try again later.'
      : 'Incorrect username or password.';
    return;
  }
  let app;
  try {
    const doc = await window.fbDb.collection('vendors').doc(username).get();
    app = doc.exists ? doc.data() : null;
  } catch (err) {
    note.textContent = 'Could not load your account. Please check your connection and try again.';
    return;
  }
  if (!app || app.uid !== userCredential.user.uid) {
    note.textContent = 'No business application found for this account. Please contact support.';
    return;
  }
  note.textContent = '';
  localStorage.setItem('fb_vendor_session', username);
  routeVendor(app);
}

let __ownDocListenerAttached = false;
function routeVendor(app) {
  currentVendor = app;
  // Re-runs this exact gate/dashboard decision whenever this vendor's own
  // application doc changes server-side (e.g. an admin approves/freezes
  // them while they're sitting on the pending-approval screen) — without
  // this, a real-time status change would never move them past the gate
  // until they manually reloaded, defeating the point of a live backend.
  if (!__ownDocListenerAttached && window.fbDb) {
    __ownDocListenerAttached = true;
    window.fbDb.collection('vendors').doc(app.username).onSnapshot(
      snap => { if (snap.exists) routeVendor(snap.data()); },
      err => console.error('Data shim: own-vendor-doc listener error:', err)
    );
  }
  hideAllGates();
  const status = app.status || 'Pending';
  if (status !== 'Approved') {
    document.getElementById('pendingBusinessName').textContent = app.businessName;
    pendingWrap.classList.remove('hidden');
    return;
  }
  if (app.frozen) {
    frozenWrap.classList.remove('hidden');
    return;
  }
  const SUPPORTED_CATEGORIES =['Wedding Venues', 'Photographers & Videographers', 'DJs & Bands', 'Wedding Planner', 'Florists & Decor', 'Makeup Artists', 'Hair Stylists', 'Bridal Dress Shops', 'Suit Rental', 'Vehicle Rental', 'Catering', 'Honeymoon Agency', 'Invitation Cards', 'Bridal Stylist', 'Jewelry', 'Zaffeh', 'Cake Designers', 'Restaurants', 'Wedding Entertainment'];
  if (!SUPPORTED_CATEGORIES.includes(app.category)) {
    document.getElementById('wrongCategoryName').textContent = app.category;
    wrongCategoryWrap.classList.remove('hidden');
    return;
  }
  dashboardShell.classList.remove('hidden');
  bumpProfileViews();
  if (app.category === 'Photographers & Videographers') bumpPortfolioViews();
  document.getElementById('vendorPlanLabel').textContent = `${app.plan} Plan`;
  updateNavForCategory(app.category);
  renderAll();
}

// Adjusts sidebar labels/visibility for the vendor's category — some tabs
// (Food Menu) only apply to venues, and the profile tab's framing differs
// between a venue and a solo photographer/videographer.
const CATEGORY_ICONS = {
  'Wedding Venues': '🏛️',
  'Photographers & Videographers': '📸',
  'DJs & Bands': '🎧',
  'Wedding Planner': '📋',
  'Florists & Decor': '🌸',
  'Makeup Artists': '💄',
  'Hair Stylists': '💇',
  'Bridal Dress Shops': '👗',
  'Suit Rental': '🤵',
  'Vehicle Rental': '🚗',
  'Catering': '🍽️',
  'Honeymoon Agency': '🏝️',
  'Invitation Cards': '💌',
  'Bridal Stylist': '💫',
  'Jewelry': '💎',
  'Zaffeh': '🥁',
  'Cake Designers': '🎂',
  'Restaurants': '🍷',
  'Wedding Entertainment': '🎪',
};

function updateNavForCategory(category) {
  const isVenue = category === 'Wedding Venues';
  const isPhotographer = category === 'Photographers & Videographers';
  const isWeddingPlanner = category === 'Wedding Planner';
  const isFlorist = category === 'Florists & Decor';
  const isMakeupArtist = category === 'Makeup Artists';
  const isHairStylist = category === 'Hair Stylists';
  const isBridalShop = category === 'Bridal Dress Shops';
  const isSuitRental = category === 'Suit Rental';
  const isVehicleRental = category === 'Vehicle Rental';
  const isCatering = category === 'Catering';
  const isHoneymoonAgency = category === 'Honeymoon Agency';
  const isInvitationCards = category === 'Invitation Cards';
  const isBridalStylist = category === 'Bridal Stylist';
  const isJewelry = category === 'Jewelry';
  const isZaffeh = category === 'Zaffeh';
  const isCakeDesigner = category === 'Cake Designers';
  const isRestaurant = category === 'Restaurants';
  const isEntertainment = category === 'Wedding Entertainment';
  const venueNavBtn = document.querySelector('#vendorNav button[data-panel="venue"]');
  const foodMenuNavBtn = document.querySelector('#vendorNav button[data-panel="foodmenu"]');
  const venueSeatingNavBtn = document.querySelector('#vendorNav button[data-panel="venueseating"]');
  const venueMapNavBtn = document.querySelector('#vendorNav button[data-panel="venuemap"]');
  const portfolioNavBtn = document.querySelector('#vendorNav button[data-panel="portfolio"]');
  const analyticsNavBtn = document.querySelector('#vendorNav button[data-panel="analytics"]');
  const timelineNavBtn = document.querySelector('#vendorNav button[data-panel="timeline"]');
  const budgetNavBtn = document.querySelector('#vendorNav button[data-panel="budget"]');
  const designGalleryNavBtn = document.querySelector('#vendorNav button[data-panel="designgallery"]');
  const makeupPortfolioNavBtn = document.querySelector('#vendorNav button[data-panel="makeupportfolio"]');
  const clientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="clientmanagement"]');
  const hairPortfolioNavBtn = document.querySelector('#vendorNav button[data-panel="hairportfolio"]');
  const hairClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="hairclientmanagement"]');
  const dressCollectionNavBtn = document.querySelector('#vendorNav button[data-panel="dresscollection"]');
  const inventoryNavBtn = document.querySelector('#vendorNav button[data-panel="inventory"]');
  const bridalClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="bridalclientmanagement"]');
  const suitCollectionNavBtn = document.querySelector('#vendorNav button[data-panel="suitcollection"]');
  const suitInventoryNavBtn = document.querySelector('#vendorNav button[data-panel="suitinventory"]');
  const suitClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="suitclientmanagement"]');
  const vehicleManagementNavBtn = document.querySelector('#vendorNav button[data-panel="vehiclemanagement"]');
  const driverManagementNavBtn = document.querySelector('#vendorNav button[data-panel="drivermanagement"]');
  const vehicleClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="vehicleclientmanagement"]');
  const menuManagementNavBtn = document.querySelector('#vendorNav button[data-panel="menumanagement"]');
  const eventManagementNavBtn = document.querySelector('#vendorNav button[data-panel="eventmanagement"]');
  const cateringClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="cateringclientmanagement"]');
  const customHoneymoonPlanningNavBtn = document.querySelector('#vendorNav button[data-panel="customhoneymoonplanning"]');
  const honeymoonClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="honeymoonclientmanagement"]');
  const designCollectionNavBtn = document.querySelector('#vendorNav button[data-panel="designcollection"]');
  const invitationClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="invitationclientmanagement"]');
  const deliveryManagementNavBtn = document.querySelector('#vendorNav button[data-panel="deliverymanagement"]');
  const serviceManagementNavBtn = document.querySelector('#vendorNav button[data-panel="servicemanagement"]');
  const bridalStylistPortfolioNavBtn = document.querySelector('#vendorNav button[data-panel="bridalstylistportfolio"]');
  const brideProfilesNavBtn = document.querySelector('#vendorNav button[data-panel="brideprofiles"]');
  const jewelryCollectionNavBtn = document.querySelector('#vendorNav button[data-panel="jewelrycollection"]');
  const jewelryReservationsNavBtn = document.querySelector('#vendorNav button[data-panel="jewelryreservations"]');
  const jewelryInventoryNavBtn = document.querySelector('#vendorNav button[data-panel="jewelryinventory"]');
  const jewelryClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="jewelryclientmanagement"]');
  const zaffehGalleryNavBtn = document.querySelector('#vendorNav button[data-panel="zaffehgallery"]');
  const zaffehTeamNavBtn = document.querySelector('#vendorNav button[data-panel="zaffehteam"]');
  const cakeCollectionNavBtn = document.querySelector('#vendorNav button[data-panel="cakecollection"]');
  const cakeClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="cakeclientmanagement"]');
  const restaurantMenuNavBtn = document.querySelector('#vendorNav button[data-panel="restaurantmenu"]');
  const entertainmentServicesNavBtn = document.querySelector('#vendorNav button[data-panel="entertainmentservices"]');
  const entertainmentGalleryNavBtn = document.querySelector('#vendorNav button[data-panel="entertainmentgallery"]');
  const entertainmentClientManagementNavBtn = document.querySelector('#vendorNav button[data-panel="entertainmentclientmanagement"]');
  const icon = CATEGORY_ICONS[category] || '📋';
  venueNavBtn.innerHTML = isVenue ? `${icon} My Venue` : `${icon} My Profile`;
  foodMenuNavBtn.classList.toggle('hidden', !isVenue);
  venueSeatingNavBtn.classList.toggle('hidden', !isVenue);
  venueMapNavBtn.classList.toggle('hidden', !isVenue);
  portfolioNavBtn.classList.toggle('hidden', !isPhotographer);
  analyticsNavBtn.classList.toggle('hidden', isVenue);
  timelineNavBtn.classList.toggle('hidden', !isWeddingPlanner);
  budgetNavBtn.classList.toggle('hidden', !isWeddingPlanner);
  designGalleryNavBtn.classList.toggle('hidden', !isFlorist);
  makeupPortfolioNavBtn.classList.toggle('hidden', !isMakeupArtist);
  clientManagementNavBtn.classList.toggle('hidden', !isMakeupArtist);
  hairPortfolioNavBtn.classList.toggle('hidden', !isHairStylist);
  hairClientManagementNavBtn.classList.toggle('hidden', !isHairStylist);
  dressCollectionNavBtn.classList.toggle('hidden', !isBridalShop);
  inventoryNavBtn.classList.toggle('hidden', !isBridalShop);
  bridalClientManagementNavBtn.classList.toggle('hidden', !isBridalShop);
  suitCollectionNavBtn.classList.toggle('hidden', !isSuitRental);
  suitInventoryNavBtn.classList.toggle('hidden', !isSuitRental);
  suitClientManagementNavBtn.classList.toggle('hidden', !isSuitRental);
  vehicleManagementNavBtn.classList.toggle('hidden', !isVehicleRental);
  driverManagementNavBtn.classList.toggle('hidden', !isVehicleRental);
  vehicleClientManagementNavBtn.classList.toggle('hidden', !isVehicleRental);
  menuManagementNavBtn.classList.toggle('hidden', !isCatering);
  eventManagementNavBtn.classList.toggle('hidden', !isCatering);
  cateringClientManagementNavBtn.classList.toggle('hidden', !isCatering);
  customHoneymoonPlanningNavBtn.classList.toggle('hidden', !isHoneymoonAgency);
  honeymoonClientManagementNavBtn.classList.toggle('hidden', !isHoneymoonAgency);
  designCollectionNavBtn.classList.toggle('hidden', !isInvitationCards);
  invitationClientManagementNavBtn.classList.toggle('hidden', !isInvitationCards);
  deliveryManagementNavBtn.classList.toggle('hidden', !isInvitationCards);
  serviceManagementNavBtn.classList.toggle('hidden', !isBridalStylist);
  bridalStylistPortfolioNavBtn.classList.toggle('hidden', !isBridalStylist);
  brideProfilesNavBtn.classList.toggle('hidden', !isBridalStylist);
  jewelryCollectionNavBtn.classList.toggle('hidden', !isJewelry);
  jewelryReservationsNavBtn.classList.toggle('hidden', !isJewelry);
  jewelryInventoryNavBtn.classList.toggle('hidden', !isJewelry);
  jewelryClientManagementNavBtn.classList.toggle('hidden', !isJewelry);
  zaffehGalleryNavBtn.classList.toggle('hidden', !isZaffeh);
  zaffehTeamNavBtn.classList.toggle('hidden', !isZaffeh);
  cakeCollectionNavBtn.classList.toggle('hidden', !isCakeDesigner);
  cakeClientManagementNavBtn.classList.toggle('hidden', !isCakeDesigner);
  restaurantMenuNavBtn.classList.toggle('hidden', !isRestaurant);
  entertainmentServicesNavBtn.classList.toggle('hidden', !isEntertainment);
  entertainmentGalleryNavBtn.classList.toggle('hidden', !isEntertainment);
  entertainmentClientManagementNavBtn.classList.toggle('hidden', !isEntertainment);
}

document.getElementById('pendingLogoutBtn').addEventListener('click', logout);
document.getElementById('wrongCategoryLogoutBtn').addEventListener('click', logout);
document.getElementById('frozenLogoutBtn').addEventListener('click', logout);
document.getElementById('vendorLogoutBtn').addEventListener('click', logout);
function logout() {
  localStorage.removeItem('fb_vendor_session');
  currentVendor = null;
  hideAllGates();
  loginWrap.classList.remove('hidden');
  document.getElementById('vendorLoginForm').reset();
}

// Resume session — deferred with setTimeout so it runs only after this
// entire script has finished its first pass. Several render functions below
// use `const`/`let` declared later in the file; calling them synchronously
// from here (before those declarations execute) throws a temporal-dead-zone
// ReferenceError on every reload where a session is already saved.
// Waits for Firebase Auth's own (async) session restoration to report in
// at least once before resuming — resuming immediately on a bare page
// reload would race ahead of it, and any Firestore reads/writes attempted
// before Auth has restored its session would be rejected by security rules
// as unauthenticated. onAuthStateChanged's callback is itself deferred, so
// by the time it fires the rest of this script has already finished
// executing (no temporal-dead-zone risk calling getLS/routeVendor from it).
let __sessionResumeAttempted = false;
if (window.fbAuth) window.fbAuth.onAuthStateChanged((user) => {
  if (__sessionResumeAttempted) return;
  __sessionResumeAttempted = true;
  try {
    if (new URLSearchParams(window.location.search).has('logout')) {
      localStorage.removeItem('fb_vendor_session');
      history.replaceState(null, '', window.location.pathname);
      return;
    }
    const savedUsername = localStorage.getItem('fb_vendor_session');
    if (!savedUsername || !user) return;
    // A direct single-document read, not the shared fb_vendor_applications
    // cache (which only ever contains Approved vendors — see
    // ensureApplicationsListener in data-shim.js) — a still-pending vendor
    // resuming their session needs to see the pending gate, not nothing.
    window.fbDb.collection('vendors').doc(savedUsername).get().then(doc => {
      if (doc.exists) routeVendor(doc.data());
    }).catch(err => console.error('Vendor dashboard: failed to resume session:', err));
  } catch (err) {
    console.error('Vendor dashboard: failed to resume session:', err);
  }
});

// ===== Sidebar nav =====
// Each panel is re-rendered on every visit (not just once at login) so that
// cross-tab dependencies stay fresh — e.g. a package created on the Packages
// tab must immediately show up in the Bookings tab's "New Booking" dropdown,
// even though the two panels are rendered independently.
const PANEL_RENDERERS = {
  overview: renderOverview, venue: renderVenuePanel, portfolio: renderPortfolio, designgallery: renderDesignGallery,
  makeupportfolio: renderMakeupPortfolio, clientmanagement: renderClientManagement, hairportfolio: renderHairPortfolio,
  hairclientmanagement: renderHairClientManagement, dresscollection: renderDressCollection, inventory: renderInventoryManagement,
  bridalclientmanagement: renderBridalClientManagement, suitcollection: renderSuitCollection,
  suitinventory: renderSuitInventoryManagement, suitclientmanagement: renderSuitClientManagement,
  vehiclemanagement: renderVehicleManagement, drivermanagement: renderDriverManagement, vehicleclientmanagement: renderVehicleClientManagement,
  menumanagement: renderMenuManagement, eventmanagement: renderEventManagement, cateringclientmanagement: renderCateringClientManagement,
  customhoneymoonplanning: renderCustomHoneymoonPlanning, honeymoonclientmanagement: renderHoneymoonClientManagement,
  designcollection: renderDesignCollection, invitationclientmanagement: renderInvitationClientManagement, deliverymanagement: renderDeliveryManagement,
  servicemanagement: renderServiceManagement, bridalstylistportfolio: renderBridalStylistPortfolio, brideprofiles: renderBrideProfiles,
  zaffehgallery: renderZaffehGallery, zaffehteam: renderZaffehTeam, cakecollection: renderCakeCollection,
  cakeclientmanagement: renderCakeClientManagement, restaurantmenu: renderRestaurantMenu,
  entertainmentservices: renderEntertainmentServices, entertainmentgallery: renderEntertainmentGallery,
  entertainmentclientmanagement: renderEntertainmentClientManagement,
  jewelrycollection: renderJewelryCollection, jewelryreservations: renderJewelryReservations,
  jewelryinventory: renderJewelryInventoryManagement, jewelryclientmanagement: renderJewelryClientManagement,
  packages: renderPackages, timeline: renderWeddingTimeline, budget: renderBudgetManagement,
  foodmenu: renderFoodMenu, venueseating: renderVenueSeating, venuemap: renderVenueMap, availability: renderAvailability,
  appointments: renderAppointments, bookings: renderBookings, payments: renderPayments,
  inquiries: renderInquiries, reviews: renderReviews, blog: renderBlog, analytics: renderAnalytics,
  documents: renderDocuments, notifications: renderNotifications, settings: renderSettings,
  marketing: renderMarketing,
};

document.querySelectorAll('#vendorNav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#vendorNav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
    const renderFn = PANEL_RENDERERS[btn.dataset.panel];
    if (renderFn) {
      try { renderFn(); } catch (err) { console.error(`Vendor dashboard: ${renderFn.name} failed to render:`, err); }
    }
  });
});

function saveCurrentVendorToApplications() {
  const applications = getLS('fb_vendor_applications', []);
  const idx = applications.findIndex(a => String(a.time) === String(currentVendor.time));
  if (idx > -1) { applications[idx] = currentVendor; setLS('fb_vendor_applications', applications); }
}

function bumpProfileViews() {
  incrementVendorField(currentVendor.username, 'profile', 'viewsCount', Math.floor(Math.random() * 3) + 1);
}

function bumpPortfolioViews() {
  incrementVendorField(currentVendor.username, 'profile', 'portfolioViewsCount', Math.floor(Math.random() * 5) + 1);
}

function renderAll() {
  // Guards against being invoked by a Firestore listener callback that
  // fires before login (e.g. the shared vendor-applications listener,
  // which is active from page load) — nothing to render yet.
  if (!currentVendor) return;
  // Each section renders independently — if one throws (e.g. from an older
  // data shape left over in localStorage), it's logged but doesn't stop the
  // rest of this script from running, which would otherwise leave every
  // button on the page dead with no click listeners attached.
  const renderers = [
    renderOverview, renderVenuePanel, renderPortfolio, renderDesignGallery, renderMakeupPortfolio, renderClientManagement, renderHairPortfolio, renderHairClientManagement, renderDressCollection, renderInventoryManagement, renderBridalClientManagement, renderSuitCollection, renderSuitInventoryManagement, renderSuitClientManagement, renderVehicleManagement, renderDriverManagement, renderVehicleClientManagement, renderFoodCategories, renderMenuItems, renderEventManagement, renderCateringClientManagement, renderCustomHoneymoonPlanning, renderHoneymoonClientManagement, renderDesignCollection, renderInvitationClientManagement, renderDeliveryManagement, renderServiceManagement, renderBridalStylistPortfolio, renderBrideProfiles,
    renderZaffehGallery, renderZaffehTeam, renderCakeCollection, renderCakeClientManagement, renderRestaurantMenu,
    renderEntertainmentServices, renderEntertainmentGallery, renderEntertainmentClientManagement,
    renderJewelryCollection, renderJewelryReservations, renderJewelryInventoryManagement, renderJewelryClientManagement,
    renderPackages, renderWeddingTimeline, renderBudgetManagement, renderFoodMenu, renderVenueSeating, renderVenueMap,
    renderAvailability, renderBookings, renderPayments, renderInquiries,
    renderReviews, renderBlog, renderAnalytics, renderDocuments, renderNotifications, renderSettings, renderMarketing, renderAppointments,
  ];
  renderers.forEach(fn => {
    try { fn(); } catch (err) { console.error(`Vendor dashboard: ${fn.name} failed to render:`, err); }
  });
}

// ===================================================================
// OVERVIEW
// ===================================================================
function renderOverview() {
  document.getElementById('overviewBusinessName').textContent = currentVendor.businessName;
  const bookings = getVendorData('bookings', []);
  const payments = getVendorData('payments', []);
  const inquiries = getVendorData('inquiries', []);
  const reviews = getVendorData('reviews', []);
  const profile = getVendorData('profile', {});

  const totalBookings = bookings.length;
  const pendingBookings = bookings.filter(b => b.status === 'Pending').length;
  const confirmedBookings = bookings.filter(b => b.status === 'Confirmed').length;
  const now = new Date();
  const upcoming = bookings.filter(b => b.status === 'Confirmed' && new Date(b.date) >= now).length;
  const monthlyRevenue = payments.filter(p => p.status === 'Completed' && sameMonth(new Date(p.time), now)).reduce((s, p) => s + Number(p.amount || 0), 0);
  const newMessages = inquiries.filter(i => i.status === 'Unread').length;
  const avgRating = avgOf(reviews, 'rating');

  const isBridalShop = currentVendor.category === 'Bridal Dress Shops';
  const isHoneymoonAgency = currentVendor.category === 'Honeymoon Agency';
  const isInvitationCards = currentVendor.category === 'Invitation Cards';
  const appointments = getVendorData('appointments', []);
  const confirmedFittings = appointments.filter(a => a.status === 'Confirmed');

  const stats = [
    { num: totalBookings, label: isInvitationCards ? 'Total Orders' : 'Total Bookings' },
    { num: pendingBookings, label: 'Pending Booking Requests' },
    { num: confirmedBookings, label: isHoneymoonAgency ? 'Confirmed Trips' : isInvitationCards ? 'Confirmed Orders' : 'Confirmed Bookings' },
    { num: upcoming, label: isHoneymoonAgency ? 'Upcoming Honeymoons' : isInvitationCards ? 'Upcoming Deliveries' : 'Upcoming Events' },
    { num: `$${monthlyRevenue}`, label: 'Monthly Revenue' },
    planLevel() >= 2
      ? { num: profile.viewsCount || 0, label: 'Profile Views' }
      : { num: '🔒', label: 'Profile Views (Professional+)' },
    { num: newMessages, label: 'New Messages' },
    { num: avgRating ? `⭐ ${avgRating}` : '—', label: 'Average Rating' },
  ];
  if (isBridalShop) stats.splice(4, 0, { num: confirmedFittings.length, label: 'Confirmed Fittings' });
  document.getElementById('overviewStats').innerHTML = stats.map(s => `
    <div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>
  `).join('');

  document.getElementById('overviewConfirmedFittingsWrap').classList.toggle('hidden', !isBridalShop);
  if (isBridalShop) {
    document.getElementById('overviewConfirmedFittingsList').innerHTML = confirmedFittings.length
      ? confirmedFittings.slice().sort((a, b) => new Date(a.apptDate) - new Date(b.apptDate)).map(a => `
        <div class="my-appt-row">
          <span>${escapeHtml(a.fullName)} — ${escapeHtml(a.apptDate)} ${escapeHtml(a.apptTime)}${a.purpose ? `<br><span style="color:#999;">📝 ${escapeHtml(a.purpose)}</span>` : ''}${a.dressName ? `<br><span style="color:#999;">👗 ${escapeHtml(a.dressName)}</span>` : ''}</span>
        </div>`).join('')
      : '<p class="admin-empty">No confirmed fittings yet.</p>';
  }

  const avg = reviews.length ? (reviews.reduce((s, r) => s + Number(r.rating), 0) / reviews.length).toFixed(1) : '—';
  document.getElementById('overviewReviewsSummary').textContent = `${avg} average rating across ${reviews.length} review(s).`;

  // Subscription renewal alert — mirrors the 30-day cycle admin manages in
  // the Subscriptions panel; warn the vendor themselves once ≤3 days remain
  // or the renewal is already overdue, so freezing doesn't come as a surprise.
  const SUBSCRIPTION_PERIOD_DAYS = 30;
  const renewalTime = currentVendor.subscriptionRenewalDate
    ? new Date(currentVendor.subscriptionRenewalDate).getTime()
    : currentVendor.time + SUBSCRIPTION_PERIOD_DAYS * 86400000;
  const daysLeft = Math.ceil((renewalTime - Date.now()) / 86400000);
  const renewalAlertWrap = document.getElementById('renewalAlertWrap');
  if (daysLeft <= 3) {
    renewalAlertWrap.classList.remove('hidden');
    renewalAlertWrap.innerHTML = daysLeft < 0
      ? `<strong>⚠️ Your subscription renewal is ${Math.abs(daysLeft)} day(s) overdue.</strong> Please renew soon to avoid your account being frozen.`
      : `<strong>⚠️ Your subscription renews in ${daysLeft} day(s)</strong> (${new Date(renewalTime).toLocaleDateString()}). Contact us to renew and avoid any interruption to your listing.`;
  } else {
    renewalAlertWrap.classList.add('hidden');
  }
}

document.getElementById('printReportBtn').addEventListener('click', () => {
  document.querySelectorAll('#vendorNav button').forEach(b => b.classList.remove('active'));
  document.querySelector('#vendorNav button[data-panel="overview"]').classList.add('active');
  document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
  document.getElementById('panel-overview').classList.add('active');
  window.print();
});

// ===================================================================
// DASHBOARD SEARCH — one shared search box (Overview panel) across every
// vendor category, scanning all of that vendor's own data stores at once.
// Each store is read defensively (falls back to []) since most categories
// only populate a handful of these keys.
// ===================================================================
function performDashboardSearch(query) {
  const q = query.trim().toLowerCase();
  const resultsEl = document.getElementById('dashboardSearchResults');
  if (!q) { resultsEl.classList.add('hidden'); resultsEl.innerHTML = ''; return; }

  const results = [];
  const add = (type, label, panel) => { if ((label || '').toLowerCase().includes(q)) results.push({ type, label, panel }); };

  getVendorData('bookings', []).forEach(b => add('Booking', b.coupleName, 'bookings'));
  getVendorData('appointments', []).forEach(a => add('Appointment', a.fullName, 'appointments'));
  getVendorData('packages', []).forEach(p => add('Package', p.name, 'packages'));
  getVendorData('inquiries', []).forEach(i => add('Message', i.from, 'inquiries'));
  getVendorData('clients', []).forEach(c => add('Client', c.brideName, 'clientmanagement'));
  getVendorData('hairClients', []).forEach(c => add('Client', c.brideName, 'hairclientmanagement'));
  getVendorData('bridalClients', []).forEach(c => add('Client', c.brideName, 'bridalclientmanagement'));
  getVendorData('suitClients', []).forEach(c => add('Client', c.groomName, 'suitclientmanagement'));
  getVendorData('dresses', []).forEach(d => add('Dress', d.name, 'dresscollection'));
  getVendorData('suits', []).forEach(s => add('Suit', s.name, 'suitcollection'));
  getVendorData('vehicleClients', []).forEach(c => add('Client', c.coupleName, 'vehicleclientmanagement'));
  getVendorData('cateringClients', []).forEach(c => add('Client', c.coupleName, 'cateringclientmanagement'));
  getVendorData('cateringEvents', []).forEach(ev => add('Event', ev.coupleName, 'eventmanagement'));
  getVendorData('menuItems', []).forEach(item => add('Menu Item', item.name, 'menumanagement'));
  getVendorData('customHoneymoonRequests', []).forEach(r => add('Custom Request', r.coupleName, 'customhoneymoonplanning'));
  getVendorData('honeymoonClients', []).forEach(c => add('Client', c.coupleName, 'honeymoonclientmanagement'));
  getVendorData('designs', []).forEach(d => add('Design', d.name, 'designcollection'));
  getVendorData('invitationClients', []).forEach(c => add('Client', c.coupleName, 'invitationclientmanagement'));
  getVendorData('deliveries', []).forEach(d => add('Delivery', d.coupleName, 'deliverymanagement'));
  getVendorData('stylistServices', []).forEach(s => add('Service', s.name, 'servicemanagement'));
  getVendorData('brideProfiles', []).forEach(b => add('Bride', b.name, 'brideprofiles'));
  getVendorData('jewelryItems', []).forEach(j => add('Jewelry', j.name, 'jewelrycollection'));
  getVendorData('jewelryReservations', []).forEach(r => add('Reservation', r.customerName, 'jewelryreservations'));
  getVendorData('jewelryClients', []).forEach(c => add('Client', c.brideName, 'jewelryclientmanagement'));
  getVendorData('entertainmentServices', []).forEach(s => add('Service', s.name, 'entertainmentservices'));
  getVendorData('entertainmentClients', []).forEach(c => add('Client', c.coupleName, 'entertainmentclientmanagement'));

  resultsEl.classList.remove('hidden');
  if (!results.length) { resultsEl.innerHTML = '<p class="admin-empty">No matches found.</p>'; return; }
  resultsEl.innerHTML = results.slice(0, 30).map(r => `
    <div class="dashboard-search-result" data-panel="${r.panel}"><span class="plan-tag" style="background:var(--primary);">${escapeHtml(r.type)}</span> ${escapeHtml(r.label)}</div>
  `).join('');
  resultsEl.querySelectorAll('.dashboard-search-result').forEach(el => {
    el.addEventListener('click', () => {
      const navBtn = document.querySelector(`#vendorNav button[data-panel="${el.dataset.panel}"]`);
      if (navBtn) navBtn.click();
      resultsEl.classList.add('hidden');
      document.getElementById('dashboardSearchInput').value = '';
    });
  });
}

document.getElementById('dashboardSearchInput').addEventListener('input', (e) => performDashboardSearch(e.target.value));

// ===================================================================
// MY VENUE
// ===================================================================
const GALLERY_HEADINGS = {
  'Wedding Venues': 'Gallery Photos ',
  'Photographers & Videographers': 'Portfolio Gallery ',
  'DJs & Bands': 'Photo Gallery ',
  'Catering': 'Event Photos ',
  'Honeymoon Agency': 'Destination Gallery ',
  'Invitation Cards': 'Portfolio Gallery ',
  'Jewelry': 'Store Photos ',
};
const VIDEO_HEADINGS = {
  'Wedding Venues': 'Videos ',
  'Photographers & Videographers': 'Videos / Highlight Reels ',
  'DJs & Bands': 'Performance Videos ',
  'Florists & Decor': 'Decoration Videos ',
  'Catering': 'Event Videos ',
  'Honeymoon Agency': 'Travel Videos ',
  'Zaffeh': 'Performance Videos ',
};

function renderVenuePanel() {
  const isVenueCat = currentVendor.category === 'Wedding Venues';
  document.getElementById('venuePanelTitle').textContent = isVenueCat ? 'My Venue' : 'My Profile';
  document.getElementById('galleryHeading').firstChild.textContent = GALLERY_HEADINGS[currentVendor.category] || 'Gallery Photos ';
  document.getElementById('videosHeading').firstChild.textContent = VIDEO_HEADINGS[currentVendor.category] || 'Videos ';

  document.getElementById('venueBusinessName').value = currentVendor.businessName || '';
  document.getElementById('venuePhone').value = currentVendor.phone || '';
  document.getElementById('venueEmail').value = currentVendor.email || '';
  document.getElementById('venueLocation').value = currentVendor.location || '';
  document.getElementById('venueMapsLink').value = currentVendor.mapsLink || '';
  document.getElementById('venueWebsite').value = currentVendor.website || '';
  document.getElementById('venueInstagram').value = currentVendor.instagram || '';
  document.getElementById('venueFacebook').value = currentVendor.facebook || '';
  document.getElementById('venueTiktok').value = currentVendor.tiktok || '';
  document.getElementById('venueWhatsapp').value = currentVendor.whatsapp || '';

  const profile = getVendorData('profile', {});
  document.getElementById('venueDescription').value = profile.description || '';
  document.getElementById('venueCapacity').value = profile.capacity || '';
  document.getElementById('venueIndoorOutdoor').value = profile.indoorOutdoor || 'Both';
  document.getElementById('venueParking').value = profile.parkingInfo || '';
  document.getElementById('venueAccessibility').value = profile.accessibility || '';

  document.getElementById('coverPreviewWrap').innerHTML = profile.coverPhoto
    ? coverMediaTag(profile.coverPhoto, 'cover-preview') : '<p class="admin-empty">No cover photo or video yet.</p>';

  document.getElementById('logoPreviewWrap').innerHTML = profile.logo
    ? `<img loading="lazy" decoding="async" src="${profile.logo}" style="width:100px;height:100px;object-fit:cover;border-radius:50%;margin:0.6rem 0;box-shadow:var(--shadow);">` : '<p class="admin-empty">No logo yet.</p>';

  const gallery = profile.gallery || [];
  const galleryLimitNote = document.getElementById('galleryLimitNote');
  const galleryInput = document.getElementById('galleryPhotoInput');
  if (planLevel() < 2) {
    galleryLimitNote.textContent = `(${gallery.length}/10 — upgrade to Professional for unlimited)`;
    galleryInput.disabled = gallery.length >= 10;
  } else {
    galleryLimitNote.textContent = `(${gallery.length} uploaded — unlimited on your plan)`;
    galleryInput.disabled = false;
  }
  document.getElementById('galleryGridVendor').innerHTML = gallery.map((src, i) => `
    <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${src}"><button data-i="${i}" class="remove-gallery-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No gallery photos yet.</p>';
  document.querySelectorAll('.remove-gallery-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.gallery.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderVenuePanel();
    });
  });

  const videosLocked = planLevel() < 2;
  document.getElementById('videosLockNote').innerHTML = videosLocked
    ? `<p class="admin-hint" style="text-align:left;">Upgrade to the Professional plan to upload videos.</p>` : '';
  document.getElementById('videosInput').disabled = videosLocked;
  const videos = profile.videos || [];
  document.getElementById('videosGridVendor').innerHTML = videos.map((src, i) => `
    <div class="gallery-thumb"><video src="${src}" muted></video><button data-i="${i}" class="remove-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No videos yet.</p>';
  document.querySelectorAll('.remove-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.videos.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderVenuePanel();
    });
  });

  const tourLocked = planLevel() < 2;
  document.getElementById('tourLockNote').innerHTML = tourLocked
    ? `<p class="admin-hint" style="text-align:left;">Upgrade to the Professional plan to add a 360° tour link.</p>` : '';
  document.getElementById('tourLinkInput').disabled = tourLocked;
  document.getElementById('saveTourBtn').disabled = tourLocked;
  document.getElementById('tourLinkInput').value = profile.tourLink || '';
  document.getElementById('tourPreview').innerHTML = safeUrl(profile.tourLink)
    ? `<a href="${escapeHtml(safeUrl(profile.tourLink))}" target="_blank" rel="noopener noreferrer" class="admin-btn small">🔗 Open 360° Tour</a>` : '';

  document.getElementById('amenityGrid').innerHTML = AMENITIES.map(a => `
    <label class="amenity-item"><input type="checkbox" value="${a}" class="amenity-check" ${(profile.amenities || []).includes(a) ? 'checked' : ''}> ${a}</label>
  `).join('');

  // Category-specific section: venues get Venue Details, photographers/
  // videographers get Services & Expertise, DJs & Bands get Performance
  // Details, wedding planners get Planning Services, florists get Service
  // Areas & Previous Wedding Projects, makeup artists get Artist Details,
  // hair stylists get Stylist Details.
  const isVenue = currentVendor.category === 'Wedding Venues';
  const isPhotographer = currentVendor.category === 'Photographers & Videographers';
  const isDjBand = currentVendor.category === 'DJs & Bands';
  const isWeddingPlanner = currentVendor.category === 'Wedding Planner';
  const isFlorist = currentVendor.category === 'Florists & Decor';
  const isMakeupArtist = currentVendor.category === 'Makeup Artists';
  const isHairStylist = currentVendor.category === 'Hair Stylists';
  const isBridalShop = currentVendor.category === 'Bridal Dress Shops';
  const isSuitRental = currentVendor.category === 'Suit Rental';
  const isVehicleRental = currentVendor.category === 'Vehicle Rental';
  const isCatering = currentVendor.category === 'Catering';
  const isHoneymoonAgency = currentVendor.category === 'Honeymoon Agency';
  const isInvitationCards = currentVendor.category === 'Invitation Cards';
  const isBridalStylist = currentVendor.category === 'Bridal Stylist';
  const isJewelry = currentVendor.category === 'Jewelry';
  const isZaffeh = currentVendor.category === 'Zaffeh';
  const isCakeDesigner = currentVendor.category === 'Cake Designers';
  const isRestaurant = currentVendor.category === 'Restaurants';
  const isEntertainment = currentVendor.category === 'Wedding Entertainment';
  document.getElementById('kitchenPhotosCard').classList.toggle('hidden', !isCatering);
  if (isCatering) renderKitchenPhotos(profile.kitchenPhotos || []);
  document.getElementById('cateringDetailsCard').classList.toggle('hidden', !isCatering);
  document.getElementById('previousDesignsCard').classList.toggle('hidden', !isInvitationCards);
  if (isInvitationCards) renderPreviousDesigns(profile.previousDesigns || []);
  document.getElementById('venueDetailsCard').classList.toggle('hidden', !isVenue);
  document.getElementById('photographerDetailsCard').classList.toggle('hidden', !isPhotographer);
  document.getElementById('djBandDetailsCard').classList.toggle('hidden', !isDjBand);
  document.getElementById('weddingPlannerDetailsCard').classList.toggle('hidden', !isWeddingPlanner);
  document.getElementById('floristDetailsCard').classList.toggle('hidden', !isFlorist);
  document.getElementById('makeupArtistDetailsCard').classList.toggle('hidden', !isMakeupArtist);
  document.getElementById('hairStylistDetailsCard').classList.toggle('hidden', !isHairStylist);
  document.getElementById('bridalShopDetailsCard').classList.toggle('hidden', !isBridalShop);
  document.getElementById('suitRentalDetailsCard').classList.toggle('hidden', !isSuitRental);
  document.getElementById('vehicleRentalDetailsCard').classList.toggle('hidden', !isVehicleRental);
  document.getElementById('honeymoonAgencyDetailsCard').classList.toggle('hidden', !isHoneymoonAgency);
  document.getElementById('invitationCardsDetailsCard').classList.toggle('hidden', !isInvitationCards);
  document.getElementById('bridalStylistDetailsCard').classList.toggle('hidden', !isBridalStylist);
  document.getElementById('jewelryDetailsCard').classList.toggle('hidden', !isJewelry);
  document.getElementById('zaffehDetailsCard').classList.toggle('hidden', !isZaffeh);
  document.getElementById('cakeDesignerDetailsCard').classList.toggle('hidden', !isCakeDesigner);
  document.getElementById('restaurantDetailsCard').classList.toggle('hidden', !isRestaurant);
  if (isRestaurant) renderVirtualTour(profile.virtualTour || []);
  document.getElementById('entertainmentDetailsCard').classList.toggle('hidden', !isEntertainment);
  document.getElementById('descriptionLabel').textContent = isVenue ? 'Venue Description' : isPhotographer ? 'About Me' : isHoneymoonAgency ? 'About the Agency' : isInvitationCards ? 'About the Brand' : isJewelry ? 'About the Shop' : isZaffeh ? 'About the Troupe' : isCakeDesigner ? 'About the Bakery' : isRestaurant ? 'About the Restaurant' : isEntertainment ? 'About the Entertainment Company' : 'About Us';

  if (isPhotographer) {
    document.getElementById('servicesGrid').innerHTML = SERVICES_OFFERED.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="service-check" ${(profile.servicesOffered || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('equipmentUsed').value = profile.equipmentUsed || '';
    renderAwardsList(profile.awards || []);
  } else if (isDjBand) {
    document.getElementById('djYearsExperience').value = profile.yearsExperience || '';
    document.getElementById('djServicesGrid').innerHTML = DJ_SERVICES_OFFERED.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="dj-service-check" ${(profile.servicesOffered || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('musicGenresGrid').innerHTML = MUSIC_LIBRARY.map(g => `
      <label class="amenity-item"><input type="checkbox" value="${g}" class="genre-check" ${(profile.musicGenres || []).includes(g) ? 'checked' : ''}> ${g}</label>
    `).join('');
    document.getElementById('languagesGrid').innerHTML = LANGUAGES_PERFORMED.map(l => `
      <label class="amenity-item"><input type="checkbox" value="${l}" class="language-check" ${(profile.languages || []).includes(l) ? 'checked' : ''}> ${l}</label>
    `).join('');
  } else if (isWeddingPlanner) {
    document.getElementById('plannerServicesGrid').innerHTML = WEDDING_PLANNER_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="planner-service-check" ${(profile.servicesOffered || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isFlorist) {
    document.getElementById('floralServicesGrid').innerHTML = FLORAL_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="floral-service-check" ${(profile.floralServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('decorationServicesGrid').innerHTML = DECORATION_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="decoration-service-check" ${(profile.decorationServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('serviceAreasGrid').innerHTML = SERVICE_AREAS.map(a => `
      <label class="amenity-item"><input type="checkbox" value="${a}" class="service-area-check" ${(profile.serviceAreas || []).includes(a) ? 'checked' : ''}> ${a}</label>
    `).join('');
    renderWeddingProjects();
  } else if (isMakeupArtist) {
    document.getElementById('artistName').value = profile.artistName || '';
    renderCertificationsList(profile.certifications || []);
    document.getElementById('bridalMakeupGrid').innerHTML = BRIDAL_MAKEUP_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="bridal-makeup-check" ${(profile.bridalMakeupServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('additionalMakeupGrid').innerHTML = ADDITIONAL_MAKEUP_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="additional-makeup-check" ${(profile.additionalMakeupServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('beautyServicesGrid').innerHTML = BEAUTY_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="beauty-service-check" ${(profile.beautyServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('beautyStyleGrid').innerHTML = BEAUTY_STYLES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="beauty-style-check" ${(profile.beautyStyle || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('makeupServiceAreasGrid').innerHTML = SERVICE_AREAS.map(a => `
      <label class="amenity-item"><input type="checkbox" value="${a}" class="makeup-service-area-check" ${(profile.serviceAreas || []).includes(a) ? 'checked' : ''}> ${a}</label>
    `).join('');
  } else if (isHairStylist) {
    document.getElementById('stylistName').value = profile.stylistName || '';
    renderHairCertificationsList(profile.hairCertifications || []);
    document.getElementById('bridalHairGrid').innerHTML = BRIDAL_HAIR_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="bridal-hair-check" ${(profile.bridalHairServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('additionalHairGrid').innerHTML = ADDITIONAL_HAIR_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="additional-hair-check" ${(profile.additionalHairServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('hairStyleGrid').innerHTML = HAIR_STYLES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="hair-style-check" ${(profile.hairStyles || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('hairServiceAreasGrid').innerHTML = SERVICE_AREAS.map(a => `
      <label class="amenity-item"><input type="checkbox" value="${a}" class="hair-service-area-check" ${(profile.serviceAreas || []).includes(a) ? 'checked' : ''}> ${a}</label>
    `).join('');
  } else if (isBridalShop) {
    document.getElementById('shopName').value = profile.shopName || '';
    renderDesignerBrandsList(profile.designerBrands || []);
    document.getElementById('bridalShopServicesGrid').innerHTML = BRIDAL_SHOP_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="bridal-shop-service-check" ${(profile.bridalShopServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('bridalServiceAreasGrid').innerHTML = SERVICE_AREAS.map(a => `
      <label class="amenity-item"><input type="checkbox" value="${a}" class="bridal-service-area-check" ${(profile.serviceAreas || []).includes(a) ? 'checked' : ''}> ${a}</label>
    `).join('');
  } else if (isSuitRental) {
    document.getElementById('suitShopName').value = profile.shopName || '';
    renderSuitDesignerBrandsList(profile.designerBrands || []);
    document.getElementById('suitRentalServicesGrid').innerHTML = SUIT_RENTAL_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="suit-rental-service-check" ${(profile.suitRentalServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('suitServiceAreasGrid').innerHTML = SERVICE_AREAS.map(a => `
      <label class="amenity-item"><input type="checkbox" value="${a}" class="suit-service-area-check" ${(profile.serviceAreas || []).includes(a) ? 'checked' : ''}> ${a}</label>
    `).join('');
  } else if (isVehicleRental) {
    document.getElementById('vehicleCompanyName').value = profile.companyName || '';
    renderVehicleBrandsList(profile.vehicleBrands || []);
    document.getElementById('vehicleRentalServicesGrid').innerHTML = VEHICLE_RENTAL_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="vehicle-rental-service-check" ${(profile.vehicleRentalServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('vehicleServiceAreasGrid').innerHTML = SERVICE_AREAS.map(a => `
      <label class="amenity-item"><input type="checkbox" value="${a}" class="vehicle-service-area-check" ${(profile.serviceAreas || []).includes(a) ? 'checked' : ''}> ${a}</label>
    `).join('');
  } else if (isCatering) {
    document.getElementById('cateringServicesGrid').innerHTML = CATERING_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="catering-service-check" ${(profile.cateringServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isHoneymoonAgency) {
    document.getElementById('honeymoonYearsExperience').value = profile.yearsExperience || '';
    document.getElementById('honeymoonWorkingHours').value = profile.workingHours || '';
    renderTravelCertificationsList(profile.travelCertifications || []);
    renderTeamMembersList(profile.teamMembers || []);
    document.getElementById('honeymoonServicesGrid').innerHTML = HONEYMOON_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="honeymoon-service-check" ${(profile.honeymoonServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isInvitationCards) {
    document.getElementById('invitationYearsExperience').value = profile.yearsExperience || '';
    document.getElementById('invitationDesignerInfo').value = profile.designerInfo || '';
    document.getElementById('invitationWorkingHours').value = profile.workingHours || '';
    document.getElementById('invitationServicesGrid').innerHTML = INVITATION_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="invitation-service-check" ${(profile.invitationServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isBridalStylist) {
    document.getElementById('bridalStylistName').value = profile.stylistName || '';
    document.getElementById('bridalStylistLanguagesGrid').innerHTML = LANGUAGES_SPOKEN.map(l => `
      <label class="amenity-item"><input type="checkbox" value="${l}" class="bridal-stylist-language-check" ${(profile.languagesSpoken || []).includes(l) ? 'checked' : ''}> ${l}</label>
    `).join('');
  } else if (isJewelry) {
    document.getElementById('jewelryDesignerInfo').value = profile.designerInfo || '';
    document.getElementById('jewelryServicesGrid').innerHTML = JEWELRY_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="jewelry-service-check" ${(profile.jewelryServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isZaffeh) {
    document.getElementById('zaffehServicesGrid').innerHTML = ZAFFEH_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="zaffeh-service-check" ${(profile.zaffehServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isCakeDesigner) {
    document.getElementById('cakeDesignerServicesGrid').innerHTML = CAKE_DESIGNER_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="cake-designer-service-check" ${(profile.cakeDesignerServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isRestaurant) {
    document.getElementById('restaurantCuisineType').value = profile.cuisineType || '';
    document.getElementById('restaurantServicesGrid').innerHTML = RESTAURANT_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="restaurant-service-check" ${(profile.restaurantServices || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
    document.getElementById('restaurantVenueSpacesGrid').innerHTML = RESTAURANT_VENUE_SPACES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="restaurant-venue-space-check" ${(profile.restaurantVenueSpaces || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  } else if (isEntertainment) {
    document.getElementById('entertainmentServiceTypesGrid').innerHTML = ENTERTAINMENT_SERVICE_TYPES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="entertainment-service-type-check" ${(profile.entertainmentServiceTypes || []).includes(s) ? 'checked' : ''}> ${s}</label>
    `).join('');
  }
}

const SERVICES_OFFERED = [
  'Wedding Photography', 'Wedding Videography', 'Engagement Shoot', 'Drone Coverage',
  'Same-Day Edit', 'Photo Albums', 'Live Streaming', 'Second Shooter', 'Destination Weddings',
];

const DJ_SERVICES_OFFERED = [
  'Wedding DJ', 'Live Band', 'Singer', 'MC/Host', 'Ceremony Music', 'Reception Music',
  'Cocktail Hour Music', 'After Party', 'Custom Playlist', 'Sound & Lighting',
  'LED Dance Floor (optional)', 'Smoke & Special Effects (optional)',
];
const MUSIC_LIBRARY = [
  'Arabic', 'Lebanese', 'English', 'French', 'Pop', 'Rock', 'EDM', 'Traditional', 'Dabke', 'Jazz',
  "Couple's Custom Playlist", 'Do-Not-Play List',
];
const LANGUAGES_PERFORMED = ['Arabic', 'English', 'French', 'Spanish', 'Italian', 'Turkish', 'Armenian', 'Kurdish'];
const LANGUAGES_SPOKEN = ['Arabic', 'English', 'French', 'Spanish', 'Italian', 'Turkish', 'Armenian', 'Kurdish'];

const WEDDING_PLANNER_SERVICES = [
  'Full Wedding Planning', 'Partial Wedding Planning', 'Day-Of Coordination', 'Destination Weddings',
  'Engagement Planning', 'Bridal Shower Planning', 'Bachelor/Bachelorette Party Planning',
  'Proposal Planning', 'Honeymoon Planning', 'Bridal Chocolate Table', 'Groom Chocolate Table',
];

const SERVICE_AREAS = [
  'Beirut', 'Mount Lebanon', 'Keserwan', 'Byblos (Jbeil)', 'Metn', 'Baabda',
  'Chouf', 'North Lebanon', 'Bekaa', 'South Lebanon', 'Nabatieh',
];

const FLORAL_SERVICES = [
  'Bridal Bouquet', 'Bridesmaid Bouquets', 'Table Centerpieces', 'Flower Arches',
  'Ceremony Flowers', 'Cars Decoration', 'Flower Walls', 'Custom Floral Designs',
];
const DECORATION_SERVICES = [
  'Wedding Theme Design', 'Stage Decoration', 'Lighting Design', 'Entrance Decoration',
  'Ceiling Decoration', 'Table Setup', 'Outdoor Decoration', 'Luxury Decoration', 'Custom Concepts',
];

const DESIGN_STYLE_CATEGORIES = ['Romantic', 'Luxury', 'Classic', 'Modern', 'Outdoor', 'Lebanese Style', 'Minimalist'];

const BEAUTY_STYLES = ['Natural', 'Glam', 'Editorial', 'Bridal Classic', 'Bold & Dramatic', 'Airbrush', 'Soft Glam', 'Vintage'];

const HAIR_STYLES = ['Updo', 'Half-Up Half-Down', 'Sleek & Straight', 'Curly/Wavy', 'Braided', 'Vintage/Retro', 'Boho', 'Modern'];

const BRIDAL_HAIR_SERVICES = ['Bridal Hairstyle', 'Bridal Hair Trial', 'Wedding Day Styling', 'Veil Installation', 'Hair Accessories Styling'];
const ADDITIONAL_HAIR_SERVICES = [
  'Bridesmaids Styles', 'Mother of Bride Styling', 'Engagement Hairstyles', 'Party Hairstyles',
  'Hair Extensions', 'Hair Treatment', 'Blow Dry', 'Hair Coloring', 'Hair Consultation', '2 Hairstyles Wedding Day',
];

const BRIDAL_SHOP_SERVICES = [
  'Custom Design', 'Dress Cleaning & Preservation', 'Veil Styling', 'Accessories Matching', 'Ruining the Dress Fees',
];

function itemStatusPillClass(status) {
  if (status === 'Available') return 'approved';
  if (status === 'Sold' || status === 'Maintenance/Cleaning' || status === 'Cleaning' || status === 'Repair') return 'rejected';
  return 'pending'; // Reserved, Rented, Returned
}

const DRESS_STYLES = ['Princess', 'Mermaid', 'A-line', 'Ball Gown', 'Minimalist', 'Luxury', 'Traditional', 'Custom'];

const DRESS_CATEGORIES = [
  'Wedding Dresses', 'Engagement Dresses', 'Civil Wedding Dresses', 'Reception Dresses',
  'Bridesmaid Dresses', 'Guest Dresses', 'Mother of Bride Dresses', 'Proposal Dresses',
  'Veils', 'Accessories',
];

const SUIT_RENTAL_SERVICES = [
  'Suit Rental', 'Suit Purchase', 'Custom Tailoring', 'Alterations', 'Groom Styling', 'Groomsmen Coordination', 'Accessories Rental',
];
const SUIT_STYLES = ['Classic', 'Slim Fit', 'Modern', 'Luxury', 'Traditional'];
const SUIT_STOCK_STATUSES = ['Available', 'Reserved', 'Rented', 'Returned', 'Cleaning', 'Repair'];
const SUIT_CATEGORIES = [
  'Wedding Suits', 'Tuxedos', 'Classic Suits', 'Luxury Suits', 'Groom Packages',
  'Groomsmen Suits', 'Kids Suits', 'Shirts', 'Shoes', 'Accessories',
];

const VEHICLE_CATEGORIES = [
  'Luxury Cars', 'Classic Cars', 'Sports Cars', 'Limousines', 'SUVs',
  'Vintage Cars', 'Convertible Cars', 'Motorcycles (Pre-Wedding Photoshoots)',
];
const VEHICLE_FEATURES = ['Luxury Interior', 'Leather Seats', 'Air Conditioning', 'Decorations Available', 'Driver Included'];
const VEHICLE_RENTAL_SERVICES = [
  'Bride Pickup', 'Groom Transportation', "Bride's Family Car", "Groom's Family Car",
  'Wedding Ceremony Transportation', 'Hotel Transfer', 'Venue Transfer', 'Guest Transportation',
  'Airport Transfer', 'Photo Session Transportation', 'Full-Day Wedding Package',
];

const FOOD_CATEGORIES = [
  'Lebanese Cuisine', 'International Cuisine', 'Appetizers', 'Main Courses', 'Desserts',
  'Beverages', 'Kids Menu', 'Vegetarian Menu', 'Vegan Menu', 'Special Dietary Options',
];
const CATERING_SERVICES = [
  'Full Wedding Catering', 'Buffet Service', 'Welcome Drink', 'Seated Dinner',
  'Cocktail Reception', 'Live Cooking Stations', 'Dessert Tables', 'Coffee Stations',
  'Beverage Packages', 'Waiter Service', 'Table Setup & Decoration',
];
const HONEYMOON_SERVICES = [
  'Flight Booking', 'Hotel Reservation', 'Airport Transfers (Optional)', 'Tours & Activities',
  'Travel Insurance', 'Private Transportation', 'Romantic Experiences', 'Dinner Setup',
  'Room Decoration', 'Photoshoot (Optional)',
];
const INVITATION_SERVICES = [
  'Custom Invitation Design', 'Digital Invitations', 'Printed Invitations', 'Guest Name Printing',
  'Envelope Design', 'Wedding Stationery', 'QR Code Invitations', 'RSVP Cards',
];

const JEWELRY_SERVICES = [
  'Jewelry Purchase', 'Jewelry Rental', 'Custom Design', 'Ring Resizing',
  'Engraving', 'Cleaning & Maintenance', 'Jewelry Consultation', 'Bridal Set Creation',
];
const JEWELRY_CATEGORIES = [
  'Engagement Rings', 'Wedding Rings', 'Diamond Jewelry', 'Gold Jewelry', 'Bridal Sets',
  'Necklaces', 'Earrings', 'Bracelets', 'Tiaras & Hair Accessories', 'Custom Jewelry',
];
const JEWELRY_MATERIALS = ['Gold', 'Diamond', 'Platinum', 'Silver'];
const JEWELRY_AVAILABILITY_STATUSES = ['Available', 'Reserved', 'Sold', 'Rented Out', 'Made to Order'];
const JEWELRY_STYLE_PREFERENCES = ['Classic', 'Modern', 'Vintage', 'Minimalist', 'Bold/Statement', 'Halo', 'Solitaire', 'Custom'];

const ZAFFEH_SERVICES = [
  'Traditional Lebanese Zaffeh', 'Luxury Zaffeh', 'Oriental Zaffeh', 'Modern Zaffeh',
  'Dabke Performance', 'Drum Show', 'Fire Show (Optional)', 'LED Show',
  'Bride & Groom Entrance', 'Sword Show (Optional)', 'Live Singers', 'Custom Performance',
];
const CAKE_DESIGNER_SERVICES = [
  'Custom Cake Design', 'Cake Tasting Session', 'Dessert Table Setup', 'Cupcake Station',
  'Macaron Tower', 'Cookie Favors', 'Delivery', 'Venue Setup', 'Pickup',
];
const CAKE_CATEGORIES = [
  'Wedding Cakes', 'Engagement Cakes', 'Bridal Shower Cakes', "Groom's Cakes", 'Cupcake Towers',
  'Proposal Cakes', 'Gender Reveal', 'Dessert Tables', 'Mini Cakes', 'Custom Cakes',
];
const CAKE_AVAILABILITY_STATUSES = ['Available', 'Made to Order', 'Sold Out'];
const CAKE_FLAVORS = ['Vanilla', 'Chocolate', 'Red Velvet', 'Lemon', 'Pistachio', 'Strawberry', 'Caramel', 'Custom Flavor'];
const CAKE_FILLINGS = ['Chocolate Ganache', 'Vanilla Cream', 'Cream Cheese', 'Strawberry', 'Pistachio', 'Nutella', 'Custom Filling'];
const CAKE_DECORATION_STYLES = ['Floral', 'Modern', 'Luxury', 'Minimalist', 'Rustic', 'Marble Effect', 'Gold Details', 'Custom Theme'];

const RESTAURANT_SERVICES = [
  'Proposal Setup', 'Engagement Dinner', 'Private Dining', 'Romantic Dinner', 'Rooftop Dining',
  'Garden Dining', 'Beachfront Dining', 'Family Engagement Party', 'VIP Dining Room', 'Event Decoration',
];
const RESTAURANT_VENUE_SPACES = ['Indoor Hall', 'Outdoor Garden', 'Rooftop', 'Terrace', 'Private Room', 'VIP Area'];
const RESTAURANT_MENU_CATEGORIES = [
  'Appetizers', 'Main Courses', 'Desserts', 'Drinks', 'Special Couple Menus',
  'Vegetarian & Vegan Options', 'Kids Menu (Engagement Parties)',
];
const ENTERTAINMENT_SERVICE_TYPES = [
  'Face Painting', 'Mascot Characters', 'Magic Show', 'Bubble Show', 'Photo Booth',
  '360° Video Booth', 'Mirror Photo Booth', 'Live Painter', 'Caricature Artist',
  'Henna Artist', 'Fire Show', 'Custom Entertainment',
];
const ENTERTAINMENT_AGE_GROUPS = ['Kids', 'Teens', 'Adults', 'All Ages'];

const DESIGN_CATEGORIES = [
  'Wedding Invitations', 'Engagement Invitations', 'Save the Date Cards', 'Digital Invitations',
  'Luxury Invitations', 'Minimalist Invitations', 'Traditional Invitations', 'Lebanese Style Invitations',
  'Thank You Cards', 'Menu Cards', 'Table Number Cards', 'Wedding Signs',
];
const DESIGN_STYLES = ['Classic', 'Modern', 'Luxury', 'Floral', 'Minimal', 'Custom'];

const BRIDAL_MAKEUP_SERVICES = ['Bride Makeup', 'Bridal Trial Session', 'Wedding Day Makeup', 'Touch-up Service'];
const ADDITIONAL_MAKEUP_SERVICES = [
  'Bridesmaids Makeup', 'Mother of Bride Makeup', 'Engagement Makeup', 'Proposal Makeup',
  'Party Makeup', 'Photoshoot Makeup', 'Special Event Makeup',
];
const BEAUTY_SERVICES = ['Hair Styling', 'Eyelashes', 'Skin Preparation', 'Nail Services'];

// Package "type" dropdown options vary by vendor category (only categories
// that price by service tier/type rather than purely by guest count).
const PACKAGE_TYPE_OPTIONS = {
  'Photographers & Videographers': [
    'Basic Photography', 'Premium Photography', 'Basic Videography', 'Premium Videography',
    'Photography + Videography', 'Drone Coverage', 'Same-Day Edit', 'Wedding Highlight Film',
    'Full Wedding Film', 'Photo Album Printing', 'Live Streaming', 'Proposal', 'Engagement', 'Custom Package',
  ],
  'DJs & Bands': ['Standard Package', 'Premium Package', 'Luxury Package', 'Hourly Rate', 'Full Wedding Package', 'Custom Package'],
  'Florists & Decor': ['Basic Package', 'Standard', 'Premium', 'Luxury', 'Custom'],
  'Makeup Artists': ['Basic', 'Premium', 'Luxury', 'Bride + Bridesmaids', 'Custom Package'],
  'Hair Stylists': ['Basic', 'Premium', 'Luxury', 'Bride + Bridesmaids', 'Custom Package'],
  'Bridal Dress Shops': ['Rental Package', 'Purchase Package', 'Luxury Collection Package', 'Custom Design Package', 'Alteration Package'],
  'Suit Rental': ['Groom Package', 'Groomsmen Package', 'Luxury Package'],
  'Vehicle Rental': ['Basic Package', 'Premium Package', 'VIP Package'],
  'Catering': ['Silver Package', 'Gold Package', 'Luxury Package', 'Custom Package'],
  'Honeymoon Agency': [
    'Travel Destination', 'Beach Honeymoon', 'Luxury Resort', 'Adventure Honeymoon',
    'Romantic City Escape', 'Island Honeymoon', 'Mountain Retreat', 'Cruise Honeymoon',
    'Budget Honeymoon', 'Luxury VIP Honeymoon', 'Hotels',
  ],
  'Invitation Cards': ['Digital Package', 'Standard Printing Package', 'Luxury Package', 'Custom Package'],
  'Bridal Stylist': ['Basic', 'Premium', 'Luxury', 'Bride + Bridesmaids', 'Custom Package'],
  'Jewelry': ['Custom Classic Bridal Set', 'Custom Luxury Diamond Package', 'Custom Jewelry Package'],
};

function renderAwardsList(awards) {
  document.getElementById('awardsList').innerHTML = awards.map((a, i) => `
    <span class="category-chip">${escapeHtml(a)} <button type="button" data-i="${i}" class="remove-award-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No awards added yet.</p>';
  document.querySelectorAll('.remove-award-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.awards = profile.awards || [];
      profile.awards.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderAwardsList(profile.awards);
    });
  });
}

document.getElementById('addAwardBtn').addEventListener('click', () => {
  const input = document.getElementById('awardInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.awards = profile.awards || [];
  profile.awards.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderAwardsList(profile.awards);
});

function renderCertificationsList(certifications) {
  document.getElementById('certificationsList').innerHTML = certifications.map((c, i) => `
    <span class="category-chip">${escapeHtml(c)} <button type="button" data-i="${i}" class="remove-certification-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No certifications added yet.</p>';
  document.querySelectorAll('.remove-certification-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.certifications = profile.certifications || [];
      profile.certifications.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderCertificationsList(profile.certifications);
    });
  });
}

document.getElementById('addCertificationBtn').addEventListener('click', () => {
  const input = document.getElementById('certificationInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.certifications = profile.certifications || [];
  profile.certifications.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderCertificationsList(profile.certifications);
});

document.getElementById('saveMakeupDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.artistName = document.getElementById('artistName').value.trim();
  profile.bridalMakeupServices = Array.from(document.querySelectorAll('.bridal-makeup-check:checked')).map(c => c.value);
  profile.additionalMakeupServices = Array.from(document.querySelectorAll('.additional-makeup-check:checked')).map(c => c.value);
  profile.beautyServices = Array.from(document.querySelectorAll('.beauty-service-check:checked')).map(c => c.value);
  profile.beautyStyle = Array.from(document.querySelectorAll('.beauty-style-check:checked')).map(c => c.value);
  profile.serviceAreas = Array.from(document.querySelectorAll('.makeup-service-area-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('makeupDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

function renderHairCertificationsList(certifications) {
  document.getElementById('hairCertificationsList').innerHTML = certifications.map((c, i) => `
    <span class="category-chip">${escapeHtml(c)} <button type="button" data-i="${i}" class="remove-hair-certification-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No certifications added yet.</p>';
  document.querySelectorAll('.remove-hair-certification-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.hairCertifications = profile.hairCertifications || [];
      profile.hairCertifications.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderHairCertificationsList(profile.hairCertifications);
    });
  });
}

document.getElementById('addHairCertificationBtn').addEventListener('click', () => {
  const input = document.getElementById('hairCertificationInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.hairCertifications = profile.hairCertifications || [];
  profile.hairCertifications.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderHairCertificationsList(profile.hairCertifications);
});

document.getElementById('saveHairStylistDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.stylistName = document.getElementById('stylistName').value.trim();
  profile.bridalHairServices = Array.from(document.querySelectorAll('.bridal-hair-check:checked')).map(c => c.value);
  profile.additionalHairServices = Array.from(document.querySelectorAll('.additional-hair-check:checked')).map(c => c.value);
  profile.hairStyles = Array.from(document.querySelectorAll('.hair-style-check:checked')).map(c => c.value);
  profile.serviceAreas = Array.from(document.querySelectorAll('.hair-service-area-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('hairStylistDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

function renderDesignerBrandsList(brands) {
  document.getElementById('designerBrandsList').innerHTML = brands.map((b, i) => `
    <span class="category-chip">${escapeHtml(b)} <button type="button" data-i="${i}" class="remove-designer-brand-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No designer brands added yet.</p>';
  document.querySelectorAll('.remove-designer-brand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.designerBrands = profile.designerBrands || [];
      profile.designerBrands.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderDesignerBrandsList(profile.designerBrands);
    });
  });
}

document.getElementById('addDesignerBrandBtn').addEventListener('click', () => {
  const input = document.getElementById('designerBrandInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.designerBrands = profile.designerBrands || [];
  profile.designerBrands.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderDesignerBrandsList(profile.designerBrands);
});

document.getElementById('saveBridalShopDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.shopName = document.getElementById('shopName').value.trim();
  profile.bridalShopServices = Array.from(document.querySelectorAll('.bridal-shop-service-check:checked')).map(c => c.value);
  profile.serviceAreas = Array.from(document.querySelectorAll('.bridal-service-area-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('bridalShopDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

function renderSuitDesignerBrandsList(brands) {
  document.getElementById('suitDesignerBrandsList').innerHTML = brands.map((b, i) => `
    <span class="category-chip">${escapeHtml(b)} <button type="button" data-i="${i}" class="remove-suit-designer-brand-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No designer brands added yet.</p>';
  document.querySelectorAll('.remove-suit-designer-brand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.designerBrands = profile.designerBrands || [];
      profile.designerBrands.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderSuitDesignerBrandsList(profile.designerBrands);
    });
  });
}

document.getElementById('addSuitDesignerBrandBtn').addEventListener('click', () => {
  const input = document.getElementById('suitDesignerBrandInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.designerBrands = profile.designerBrands || [];
  profile.designerBrands.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderSuitDesignerBrandsList(profile.designerBrands);
});

document.getElementById('saveSuitRentalDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.shopName = document.getElementById('suitShopName').value.trim();
  profile.suitRentalServices = Array.from(document.querySelectorAll('.suit-rental-service-check:checked')).map(c => c.value);
  profile.serviceAreas = Array.from(document.querySelectorAll('.suit-service-area-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('suitRentalDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

function renderVehicleBrandsList(brands) {
  document.getElementById('vehicleBrandsList').innerHTML = brands.map((b, i) => `
    <span class="category-chip">${escapeHtml(b)} <button type="button" data-i="${i}" class="remove-vehicle-brand-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No vehicle brands added yet.</p>';
  document.querySelectorAll('.remove-vehicle-brand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.vehicleBrands = profile.vehicleBrands || [];
      profile.vehicleBrands.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderVehicleBrandsList(profile.vehicleBrands);
    });
  });
}

document.getElementById('addVehicleBrandBtn').addEventListener('click', () => {
  const input = document.getElementById('vehicleBrandInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.vehicleBrands = profile.vehicleBrands || [];
  profile.vehicleBrands.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderVehicleBrandsList(profile.vehicleBrands);
});

document.getElementById('saveVehicleRentalDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.companyName = document.getElementById('vehicleCompanyName').value.trim();
  profile.vehicleRentalServices = Array.from(document.querySelectorAll('.vehicle-rental-service-check:checked')).map(c => c.value);
  profile.serviceAreas = Array.from(document.querySelectorAll('.vehicle-service-area-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('vehicleRentalDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveCateringDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.cateringServices = Array.from(document.querySelectorAll('.catering-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('cateringDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

function renderTravelCertificationsList(certifications) {
  document.getElementById('travelCertificationsList').innerHTML = certifications.map((c, i) => `
    <span class="category-chip">${escapeHtml(c)} <button type="button" data-i="${i}" class="remove-travel-certification-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No travel licenses or certifications added yet.</p>';
  document.querySelectorAll('.remove-travel-certification-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.travelCertifications = profile.travelCertifications || [];
      profile.travelCertifications.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderTravelCertificationsList(profile.travelCertifications);
    });
  });
}

document.getElementById('addTravelCertificationBtn').addEventListener('click', () => {
  const input = document.getElementById('travelCertificationInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.travelCertifications = profile.travelCertifications || [];
  profile.travelCertifications.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderTravelCertificationsList(profile.travelCertifications);
});

function renderTeamMembersList(members) {
  document.getElementById('teamMembersList').innerHTML = members.map((m, i) => `
    <span class="category-chip">${escapeHtml(m)} <button type="button" data-i="${i}" class="remove-team-member-btn">✕</button></span>
  `).join('') || '<p class="admin-empty">No team members added yet.</p>';
  document.querySelectorAll('.remove-team-member-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.teamMembers = profile.teamMembers || [];
      profile.teamMembers.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderTeamMembersList(profile.teamMembers);
    });
  });
}

document.getElementById('addTeamMemberBtn').addEventListener('click', () => {
  const input = document.getElementById('teamMemberInput');
  const text = input.value.trim();
  if (!text) return;
  const profile = getVendorData('profile', {});
  profile.teamMembers = profile.teamMembers || [];
  profile.teamMembers.push(text);
  setVendorData('profile', profile);
  input.value = '';
  renderTeamMembersList(profile.teamMembers);
});

document.getElementById('saveHoneymoonAgencyDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.yearsExperience = document.getElementById('honeymoonYearsExperience').value;
  profile.workingHours = document.getElementById('honeymoonWorkingHours').value.trim();
  profile.honeymoonServices = Array.from(document.querySelectorAll('.honeymoon-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('honeymoonAgencyDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveInvitationCardsDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.yearsExperience = document.getElementById('invitationYearsExperience').value;
  profile.designerInfo = document.getElementById('invitationDesignerInfo').value.trim();
  profile.workingHours = document.getElementById('invitationWorkingHours').value.trim();
  profile.invitationServices = Array.from(document.querySelectorAll('.invitation-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('invitationCardsDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveBridalStylistDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.stylistName = document.getElementById('bridalStylistName').value.trim();
  profile.languagesSpoken = Array.from(document.querySelectorAll('.bridal-stylist-language-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('bridalStylistDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveJewelryDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.designerInfo = document.getElementById('jewelryDesignerInfo').value.trim();
  profile.jewelryServices = Array.from(document.querySelectorAll('.jewelry-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('jewelryDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveZaffehDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.zaffehServices = Array.from(document.querySelectorAll('.zaffeh-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('zaffehDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveCakeDesignerDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.cakeDesignerServices = Array.from(document.querySelectorAll('.cake-designer-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('cakeDesignerDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveRestaurantDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.cuisineType = document.getElementById('restaurantCuisineType').value.trim();
  profile.restaurantServices = Array.from(document.querySelectorAll('.restaurant-service-check:checked')).map(c => c.value);
  profile.restaurantVenueSpaces = Array.from(document.querySelectorAll('.restaurant-venue-space-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('restaurantDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveEntertainmentDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.entertainmentServiceTypes = Array.from(document.querySelectorAll('.entertainment-service-type-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('entertainmentDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

// Restaurants get a "Virtual Tour" gallery on their profile — a walkthrough
// of photos/videos of the space (indoor hall, rooftop, terrace, etc.) since
// a real interactive 3D/AR tour isn't feasible in a static localStorage app.
function renderVirtualTour(media) {
  document.getElementById('virtualTourGridVendor').innerHTML = media.map((m, i) => `
    <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-virtual-tour-media-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No virtual tour photos or videos yet.</p>';
  document.querySelectorAll('.remove-virtual-tour-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      profile.virtualTour.splice(i, 1);
      setVendorData('profile', profile);
      renderVirtualTour(profile.virtualTour);
    });
  });
}

document.getElementById('virtualTourInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const profile = getVendorData('profile', {});
  profile.virtualTour = profile.virtualTour || [];
  for (const file of files) {
    if (file.type.startsWith('video/')) {
      if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
      profile.virtualTour.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/virtualTour`) });
    } else {
      profile.virtualTour.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/virtualTour`) });
    }
  }
  setVendorData('profile', profile);
  renderVirtualTour(profile.virtualTour);
});

document.getElementById('savePhotographerDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.servicesOffered = Array.from(document.querySelectorAll('.service-check:checked')).map(c => c.value);
  profile.equipmentUsed = document.getElementById('equipmentUsed').value.trim();
  setVendorData('profile', profile);
  const note = document.getElementById('photographerDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveDjBandDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.yearsExperience = document.getElementById('djYearsExperience').value;
  profile.servicesOffered = Array.from(document.querySelectorAll('.dj-service-check:checked')).map(c => c.value);
  profile.musicGenres = Array.from(document.querySelectorAll('.genre-check:checked')).map(c => c.value);
  profile.languages = Array.from(document.querySelectorAll('.language-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('djBandDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveWeddingPlannerDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.servicesOffered = Array.from(document.querySelectorAll('.planner-service-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('weddingPlannerDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('saveFloristDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  profile.floralServices = Array.from(document.querySelectorAll('.floral-service-check:checked')).map(c => c.value);
  profile.decorationServices = Array.from(document.querySelectorAll('.decoration-service-check:checked')).map(c => c.value);
  profile.serviceAreas = Array.from(document.querySelectorAll('.service-area-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('floristDetailsNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

// ===================================================================
// PREVIOUS WEDDING PROJECTS (Florists & Decor only)
// ===================================================================
function renderWeddingProjects() {
  const projects = getVendorData('weddingProjects', []);
  document.getElementById('projectsList').innerHTML = projects.map(p => `
    <div class="admin-card" data-project-id="${p.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(p.title)}</h4>
        <button type="button" class="admin-btn small danger delete-project-btn">Delete Project</button>
      </div>
      <p class="admin-hint" style="text-align:left;">
        ${p.venue ? `📍 ${escapeHtml(p.venue)}` : ''} ${p.date ? `· ${escapeHtml(p.date)}` : ''}
      </p>
      ${p.description ? `<p style="color:#555;">${escapeHtml(p.description)}</p>` : ''}
      <input type="file" class="project-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(p.photos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-project-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos added yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No wedding projects yet — add one above.</p>';

  document.querySelectorAll('.delete-project-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-project-id]').dataset.projectId);
      setVendorData('weddingProjects', getVendorData('weddingProjects', []).filter(p => p.id !== id));
      renderWeddingProjects();
    });
  });
  document.querySelectorAll('.project-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-project-id]').dataset.projectId);
      const projects = getVendorData('weddingProjects', []);
      const project = projects.find(p => p.id === id);
      if (!project) return;
      project.photos = project.photos || [];
      for (const file of Array.from(e.target.files)) {
        project.photos.push(await uploadMedia(file, `vendors/${currentVendor.username}/weddingProjects`));
      }
      setVendorData('weddingProjects', projects);
      renderWeddingProjects();
    });
  });
  document.querySelectorAll('.remove-project-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-project-id]').dataset.projectId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const projects = getVendorData('weddingProjects', []);
      const project = projects.find(p => p.id === id);
      if (project) project.photos.splice(i, 1);
      setVendorData('weddingProjects', projects);
      renderWeddingProjects();
    });
  });
}

document.getElementById('addProjectBtn').addEventListener('click', () => {
  const title = document.getElementById('projectTitle').value.trim();
  if (!title) { alert('Please enter a project title or couple name.'); return; }
  const projects = getVendorData('weddingProjects', []);
  projects.push({
    id: Date.now(),
    title,
    venue: document.getElementById('projectVenue').value.trim(),
    date: document.getElementById('projectDate').value,
    description: document.getElementById('projectDescription').value.trim(),
    photos: [],
  });
  setVendorData('weddingProjects', projects);
  ['projectTitle', 'projectVenue', 'projectDate', 'projectDescription'].forEach(id => document.getElementById(id).value = '');
  renderWeddingProjects();
});

// ===================================================================
// DESIGN GALLERY (Florists & Decor only)
// ===================================================================
function renderDesignGallery() {
  if (currentVendor.category !== 'Florists & Decor') return;

  const albums = getVendorData('designAlbums', []);
  document.getElementById('designAlbumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-design-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(al.category)}</span></h4>
        <button type="button" class="admin-btn small danger delete-design-album-btn">Delete Album</button>
      </div>
      <input type="file" class="design-album-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((p, i) => `
          <div data-photo-i="${i}">
            <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${p.src}"><button type="button" class="remove-design-photo-btn">✕</button></div>
            <input type="text" class="photo-flower-type-input" value="${escapeHtml(p.flowerType || '')}" placeholder="Flower type (e.g. Roses)">
          </div>
        `).join('') || '<p class="admin-empty">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No albums yet — create one above.</p>';

  document.querySelectorAll('.delete-design-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-design-album-id]').dataset.designAlbumId);
      setVendorData('designAlbums', getVendorData('designAlbums', []).filter(a => a.id !== id));
      renderDesignGallery();
    });
  });
  document.querySelectorAll('.design-album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-design-album-id]').dataset.designAlbumId);
      const albums = getVendorData('designAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        album.photos.push({ src: await uploadMedia(file, `vendors/${currentVendor.username}/designAlbums`), flowerType: '' });
      }
      setVendorData('designAlbums', albums);
      renderDesignGallery();
    });
  });
  document.querySelectorAll('.remove-design-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-design-album-id]').dataset.designAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('designAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('designAlbums', albums);
      renderDesignGallery();
    });
  });
  document.querySelectorAll('.photo-flower-type-input').forEach(input => {
    input.addEventListener('change', () => {
      const id = Number(input.closest('[data-design-album-id]').dataset.designAlbumId);
      const i = Number(input.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('designAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos[i].flowerType = input.value.trim();
      setVendorData('designAlbums', albums);
    });
  });

  const designVideos = getVendorData('designVideos', []);
  document.getElementById('designVideosGrid').innerHTML = designVideos.map((v, i) => `
    <div class="gallery-thumb"><video src="${v.src}" muted></video><button data-i="${i}" class="remove-design-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No design videos yet.</p>';
  document.querySelectorAll('.remove-design-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const videos = getVendorData('designVideos', []);
      videos.splice(Number(btn.dataset.i), 1);
      setVendorData('designVideos', videos);
      renderDesignGallery();
    });
  });
}

document.getElementById('createDesignAlbumBtn').addEventListener('click', () => {
  const input = document.getElementById('newDesignAlbumName');
  const name = input.value.trim();
  if (!name) { alert('Please enter an album name.'); return; }
  const albums = getVendorData('designAlbums', []);
  albums.push({ id: Date.now(), name, category: document.getElementById('newDesignAlbumCategory').value, photos: [] });
  setVendorData('designAlbums', albums);
  input.value = '';
  renderDesignGallery();
});

document.getElementById('designVideosInput').addEventListener('change', async (e) => {
  const videos = getVendorData('designVideos', []);
  for (const file of Array.from(e.target.files)) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
    videos.push({ id: Date.now() + Math.random(), src: await uploadMedia(file, `vendors/${currentVendor.username}/designVideos`) });
  }
  setVendorData('designVideos', videos);
  renderDesignGallery();
});

// ===================================================================
// PORTFOLIO (Makeup Artists only): albums grouped by look category, plus
// before/after transformation photos.
// ===================================================================
function renderMakeupPortfolio() {
  if (currentVendor.category !== 'Makeup Artists') return;

  const albums = getVendorData('makeupAlbums', []);
  document.getElementById('makeupAlbumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-makeup-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(al.category)}</span></h4>
        <button type="button" class="admin-btn small danger delete-makeup-album-btn">Delete Album</button>
      </div>
      <input type="file" class="makeup-album-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-makeup-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No albums yet — create one above.</p>';

  document.querySelectorAll('.delete-makeup-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-makeup-album-id]').dataset.makeupAlbumId);
      setVendorData('makeupAlbums', getVendorData('makeupAlbums', []).filter(a => a.id !== id));
      renderMakeupPortfolio();
    });
  });
  document.querySelectorAll('.makeup-album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-makeup-album-id]').dataset.makeupAlbumId);
      const albums = getVendorData('makeupAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        album.photos.push(await uploadMedia(file, `vendors/${currentVendor.username}/makeupAlbums`));
      }
      setVendorData('makeupAlbums', albums);
      renderMakeupPortfolio();
    });
  });
  document.querySelectorAll('.remove-makeup-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-makeup-album-id]').dataset.makeupAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('makeupAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('makeupAlbums', albums);
      renderMakeupPortfolio();
    });
  });

  const beforeAfter = getVendorData('makeupBeforeAfter', []);
  document.getElementById('makeupBeforeAfterList').innerHTML = beforeAfter.length ? beforeAfter.map((ba, i) => `
    <div class="admin-card" data-i="${i}" style="background:var(--bg);">
      <div class="form-row-2">
        <div><p class="admin-hint" style="text-align:left;">Before</p><img loading="lazy" decoding="async" src="${ba.before}" style="width:100%;border-radius:8px;"></div>
        <div><p class="admin-hint" style="text-align:left;">After</p><img loading="lazy" decoding="async" src="${ba.after}" style="width:100%;border-radius:8px;"></div>
      </div>
      ${ba.label ? `<p style="margin-top:0.5rem;">${escapeHtml(ba.label)}</p>` : ''}
      <button type="button" class="admin-btn small danger remove-makeup-before-after-btn" style="margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') : '<p class="admin-empty">No before/after pairs yet.</p>';
  document.querySelectorAll('.remove-makeup-before-after-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = getVendorData('makeupBeforeAfter', []);
      list.splice(Number(btn.closest('[data-i]').dataset.i), 1);
      setVendorData('makeupBeforeAfter', list);
      renderMakeupPortfolio();
    });
  });
}

document.getElementById('createMakeupAlbumBtn').addEventListener('click', () => {
  const input = document.getElementById('newMakeupAlbumName');
  const name = input.value.trim();
  if (!name) { alert('Please enter an album name.'); return; }
  const albums = getVendorData('makeupAlbums', []);
  albums.push({ id: Date.now(), name, category: document.getElementById('newMakeupAlbumCategory').value, photos: [] });
  setVendorData('makeupAlbums', albums);
  input.value = '';
  renderMakeupPortfolio();
});

document.getElementById('addMakeupBeforeAfterBtn').addEventListener('click', async () => {
  const beforeFile = document.getElementById('makeupBeforeImageInput').files[0];
  const afterFile = document.getElementById('makeupAfterImageInput').files[0];
  if (!beforeFile || !afterFile) { alert('Please choose both a before and an after photo.'); return; }
  const list = getVendorData('makeupBeforeAfter', []);
  list.push({
    id: Date.now(),
    before: await uploadMedia(beforeFile, `vendors/${currentVendor.username}/makeupBeforeAfter`),
    after: await uploadMedia(afterFile, `vendors/${currentVendor.username}/makeupBeforeAfter`),
    label: document.getElementById('makeupBeforeAfterLabel').value.trim(),
  });
  setVendorData('makeupBeforeAfter', list);
  ['makeupBeforeImageInput', 'makeupAfterImageInput', 'makeupBeforeAfterLabel'].forEach(id => document.getElementById(id).value = '');
  renderMakeupPortfolio();
});

// ===================================================================
// PORTFOLIO (Hair Stylists only): albums grouped by style category, plus
// before/after transformation photos and highlight-reel videos.
// ===================================================================
function renderHairPortfolio() {
  if (currentVendor.category !== 'Hair Stylists') return;

  const albums = getVendorData('hairAlbums', []);
  document.getElementById('hairAlbumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-hair-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(al.category)}</span></h4>
        <button type="button" class="admin-btn small danger delete-hair-album-btn">Delete Album</button>
      </div>
      <input type="file" class="hair-album-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-hair-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No albums yet — create one above.</p>';

  document.querySelectorAll('.delete-hair-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-hair-album-id]').dataset.hairAlbumId);
      setVendorData('hairAlbums', getVendorData('hairAlbums', []).filter(a => a.id !== id));
      renderHairPortfolio();
    });
  });
  document.querySelectorAll('.hair-album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-hair-album-id]').dataset.hairAlbumId);
      const albums = getVendorData('hairAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        album.photos.push(await uploadMedia(file, `vendors/${currentVendor.username}/hairAlbums`));
      }
      setVendorData('hairAlbums', albums);
      renderHairPortfolio();
    });
  });
  document.querySelectorAll('.remove-hair-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-hair-album-id]').dataset.hairAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('hairAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('hairAlbums', albums);
      renderHairPortfolio();
    });
  });

  const beforeAfter = getVendorData('hairBeforeAfter', []);
  document.getElementById('hairBeforeAfterList').innerHTML = beforeAfter.length ? beforeAfter.map((ba, i) => `
    <div class="admin-card" data-i="${i}" style="background:var(--bg);">
      <div class="form-row-2">
        <div><p class="admin-hint" style="text-align:left;">Before</p><img loading="lazy" decoding="async" src="${ba.before}" style="width:100%;border-radius:8px;"></div>
        <div><p class="admin-hint" style="text-align:left;">After</p><img loading="lazy" decoding="async" src="${ba.after}" style="width:100%;border-radius:8px;"></div>
      </div>
      ${ba.label ? `<p style="margin-top:0.5rem;">${escapeHtml(ba.label)}</p>` : ''}
      <button type="button" class="admin-btn small danger remove-hair-before-after-btn" style="margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') : '<p class="admin-empty">No before/after pairs yet.</p>';
  document.querySelectorAll('.remove-hair-before-after-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = getVendorData('hairBeforeAfter', []);
      list.splice(Number(btn.closest('[data-i]').dataset.i), 1);
      setVendorData('hairBeforeAfter', list);
      renderHairPortfolio();
    });
  });

  const hairVideos = getVendorData('hairVideos', []);
  document.getElementById('hairVideosGrid').innerHTML = hairVideos.map((v, i) => `
    <div class="gallery-thumb"><video src="${v.src}" muted></video><button data-i="${i}" class="remove-hair-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No videos yet.</p>';
  document.querySelectorAll('.remove-hair-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const videos = getVendorData('hairVideos', []);
      videos.splice(Number(btn.dataset.i), 1);
      setVendorData('hairVideos', videos);
      renderHairPortfolio();
    });
  });
}

document.getElementById('createHairAlbumBtn').addEventListener('click', () => {
  const input = document.getElementById('newHairAlbumName');
  const name = input.value.trim();
  if (!name) { alert('Please enter an album name.'); return; }
  const albums = getVendorData('hairAlbums', []);
  albums.push({ id: Date.now(), name, category: document.getElementById('newHairAlbumCategory').value, photos: [] });
  setVendorData('hairAlbums', albums);
  input.value = '';
  renderHairPortfolio();
});

document.getElementById('addHairBeforeAfterBtn').addEventListener('click', async () => {
  const beforeFile = document.getElementById('hairBeforeImageInput').files[0];
  const afterFile = document.getElementById('hairAfterImageInput').files[0];
  if (!beforeFile || !afterFile) { alert('Please choose both a before and an after photo.'); return; }
  const list = getVendorData('hairBeforeAfter', []);
  list.push({
    id: Date.now(),
    before: await uploadMedia(beforeFile, `vendors/${currentVendor.username}/hairBeforeAfter`),
    after: await uploadMedia(afterFile, `vendors/${currentVendor.username}/hairBeforeAfter`),
    label: document.getElementById('hairBeforeAfterLabel').value.trim(),
  });
  setVendorData('hairBeforeAfter', list);
  ['hairBeforeImageInput', 'hairAfterImageInput', 'hairBeforeAfterLabel'].forEach(id => document.getElementById(id).value = '');
  renderHairPortfolio();
});

document.getElementById('hairVideosInput').addEventListener('change', async (e) => {
  const videos = getVendorData('hairVideos', []);
  for (const file of Array.from(e.target.files)) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
    videos.push({ id: Date.now() + Math.random(), src: await uploadMedia(file, `vendors/${currentVendor.username}/hairVideos`) });
  }
  setVendorData('hairVideos', videos);
  renderHairPortfolio();
});

// ===================================================================
// CLIENT MANAGEMENT (Hair Stylists only) — bride profiles with an
// inspiration-photo gallery per client, uploaded after the profile exists.
// ===================================================================
function renderHairClientManagement() {
  if (currentVendor.category !== 'Hair Stylists') return;

  const clients = getVendorData('hairClients', []);
  const search = document.getElementById('hairClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.brideName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('hairClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-hair-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.brideName)}</h4>
        <button type="button" class="admin-btn small danger delete-hair-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Bride Name</label><input type="text" class="hair-client-edit-field" data-field="brideName" value="${escapeHtml(c.brideName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="hair-client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Contact</label><input type="text" class="hair-client-edit-field" data-field="contact" value="${escapeHtml(c.contact || '')}"></div>
      <div class="admin-form-group"><label>Hair Type</label><input type="text" class="hair-client-edit-field" data-field="hairType" value="${escapeHtml(c.hairType || '')}"></div>
      <div class="admin-form-group"><label>Hair Length</label><input type="text" class="hair-client-edit-field" data-field="hairLength" value="${escapeHtml(c.hairLength || '')}"></div>
      <div class="admin-form-group"><label>Preferred Style</label><input type="text" class="hair-client-edit-field" data-field="preferredStyle" value="${escapeHtml(c.preferredStyle || '')}"></div>
      <div class="admin-form-group"><label>Previous Appointments</label><input type="text" class="hair-client-edit-field" data-field="previousAppointments" value="${escapeHtml(c.previousAppointments || '')}"></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="hair-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-hair-client-btn">Save</button>
      <span class="admin-note save-hair-client-note"></span>
      <p style="margin-top:0.6rem;"><strong>Inspiration Photos</strong></p>
      <input type="file" class="hair-client-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(c.inspirationPhotos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-hair-client-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No inspiration photos yet.</p>'}
      </div>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No bride profiles match that search.' : 'No bride profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-hair-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-hair-client-id]').dataset.hairClientId);
      setVendorData('hairClients', getVendorData('hairClients', []).filter(c => c.id !== id));
      renderHairClientManagement();
    });
  });
  document.querySelectorAll('.save-hair-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-hair-client-id]');
      const id = Number(card.dataset.hairClientId);
      const clients = getVendorData('hairClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.hair-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('hairClients', clients);
      const note = card.querySelector('.save-hair-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
  document.querySelectorAll('.hair-client-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-hair-client-id]').dataset.hairClientId);
      const clients = getVendorData('hairClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      client.inspirationPhotos = client.inspirationPhotos || [];
      for (const file of Array.from(e.target.files)) {
        client.inspirationPhotos.push(await uploadMedia(file, `vendors/${currentVendor.username}/hairClients`));
      }
      setVendorData('hairClients', clients);
      renderHairClientManagement();
    });
  });
  document.querySelectorAll('.remove-hair-client-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-hair-client-id]').dataset.hairClientId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const clients = getVendorData('hairClients', []);
      const client = clients.find(c => c.id === id);
      if (client) client.inspirationPhotos.splice(i, 1);
      setVendorData('hairClients', clients);
      renderHairClientManagement();
    });
  });
}

document.getElementById('hairClientSearchInput').addEventListener('input', renderHairClientManagement);

document.getElementById('addHairClientBtn').addEventListener('click', () => {
  const brideName = document.getElementById('hairClientBrideName').value.trim();
  if (!brideName) { alert('Please enter the bride\'s name.'); return; }
  const clients = getVendorData('hairClients', []);
  clients.push({
    id: Date.now(),
    brideName,
    weddingDate: document.getElementById('hairClientWeddingDate').value,
    contact: document.getElementById('hairClientContact').value.trim(),
    hairType: document.getElementById('hairClientHairType').value.trim(),
    hairLength: document.getElementById('hairClientHairLength').value.trim(),
    preferredStyle: document.getElementById('hairClientPreferredStyle').value.trim(),
    previousAppointments: document.getElementById('hairClientPreviousAppointments').value.trim(),
    notes: document.getElementById('hairClientNotes').value.trim(),
    inspirationPhotos: [],
  });
  setVendorData('hairClients', clients);
  [
    'hairClientBrideName', 'hairClientWeddingDate', 'hairClientContact', 'hairClientHairType',
    'hairClientHairLength', 'hairClientPreferredStyle', 'hairClientPreviousAppointments', 'hairClientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  renderHairClientManagement();
});

// ===================================================================
// DRESS COLLECTION (Bridal Dress Shops only)
// ===================================================================
let editingDressId = null;
function cancelDressEdit() {
  editingDressId = null;
  ['dressName', 'dressDesignerName', 'dressCollectionName', 'dressSizes', 'dressColors', 'dressFabricType', 'dressBarcode', 'dressBuyPrice', 'dressRentPrice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('dressBuyCheck').checked = false;
  document.getElementById('dressRentCheck').checked = false;
  document.getElementById('dressBuyPriceGroup').classList.add('hidden');
  document.getElementById('dressRentPriceGroup').classList.add('hidden');
  document.getElementById('addDressBtn').textContent = 'Add Dress';
  document.getElementById('cancelDressEditBtn').classList.add('hidden');
}
document.getElementById('cancelDressEditBtn').addEventListener('click', cancelDressEdit);

function renderDressCollection() {
  if (currentVendor.category !== 'Bridal Dress Shops') return;

  document.getElementById('dressCategory').innerHTML = DRESS_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('dressStyle').innerHTML = DRESS_STYLES.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  const filterSelect = document.getElementById('dressFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + DRESS_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const dresses = getVendorData('dresses', []);
  const filter = filterSelect.value;
  const barcodeSearch = document.getElementById('dressBarcodeSearch').value.trim().toLowerCase();
  let filtered = filter ? dresses.filter(d => d.category === filter) : dresses;
  if (barcodeSearch) filtered = filtered.filter(d => (d.barcode || '').toLowerCase().includes(barcodeSearch));

  document.getElementById('dressCollectionList').innerHTML = filtered.slice().reverse().map(d => `
    <div class="admin-card" data-dress-id="${d.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(d.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(d.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-dress-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-dress-btn">Delete</button>
        </span>
      </div>
      ${d.designerName || d.collectionName ? `<p class="admin-hint" style="text-align:left;">${d.designerName ? `Designer: ${escapeHtml(d.designerName)}` : ''}${d.designerName && d.collectionName ? ' · ' : ''}${d.collectionName ? `Collection: ${escapeHtml(d.collectionName)}` : ''}</p>` : ''}
      <div class="amenity-tags">
        ${d.style ? `<span class="amenity-tag">${escapeHtml(d.style)}</span>` : ''}
        <span class="status-pill ${itemStatusPillClass(d.availability)}">${escapeHtml(d.availability)}</span>
        ${d.buy ? `<span class="amenity-tag">Buy${d.buyPrice ? ` — $${escapeHtml(d.buyPrice)}` : ''}</span>` : ''}
        ${d.rent ? `<span class="amenity-tag">Rent${d.rentPrice ? ` — $${escapeHtml(d.rentPrice)}` : ''}</span>` : ''}
      </div>
      ${d.sizes && d.sizes.length ? `<p><strong>Sizes:</strong> ${d.sizes.map(escapeHtml).join(', ')}</p>` : ''}
      ${d.colors && d.colors.length ? `<p><strong>Colors:</strong> ${d.colors.map(escapeHtml).join(', ')}</p>` : ''}
      ${d.fabricType ? `<p><strong>Fabric:</strong> ${escapeHtml(d.fabricType)}</p>` : ''}
      ${d.barcode ? `<p><strong>Barcode:</strong> ${escapeHtml(d.barcode)}</p>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos &amp; Videos</strong></p>
      <input type="file" class="dress-media-input" accept="image/*,video/*" multiple>
      <div class="gallery-grid-vendor">
        ${(d.media || []).map((m, i) => `
          <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-dress-media-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos or videos yet.</p>'}
      </div>
    </div>
  `).join('') || `<p class="admin-empty">${barcodeSearch ? 'No dresses match that barcode.' : 'No dresses in the collection yet — add one above.'}</p>`;

  document.querySelectorAll('.edit-dress-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-dress-id]').dataset.dressId);
      const dress = getVendorData('dresses', []).find(d => d.id === id);
      if (!dress) return;
      editingDressId = id;
      document.getElementById('dressName').value = dress.name || '';
      document.getElementById('dressCategory').value = dress.category || '';
      document.getElementById('dressDesignerName').value = dress.designerName || '';
      document.getElementById('dressCollectionName').value = dress.collectionName || '';
      document.getElementById('dressStyle').value = dress.style || '';
      document.getElementById('dressSizes').value = (dress.sizes || []).join(', ');
      document.getElementById('dressColors').value = (dress.colors || []).join(', ');
      document.getElementById('dressFabricType').value = dress.fabricType || '';
      document.getElementById('dressBarcode').value = dress.barcode || '';
      document.getElementById('dressAvailability').value = dress.availability || '';
      document.getElementById('dressBuyCheck').checked = !!dress.buy;
      document.getElementById('dressBuyPriceGroup').classList.toggle('hidden', !dress.buy);
      document.getElementById('dressBuyPrice').value = dress.buyPrice || '';
      document.getElementById('dressRentCheck').checked = !!dress.rent;
      document.getElementById('dressRentPriceGroup').classList.toggle('hidden', !dress.rent);
      document.getElementById('dressRentPrice').value = dress.rentPrice || '';
      document.getElementById('addDressBtn').textContent = 'Save Changes';
      document.getElementById('cancelDressEditBtn').classList.remove('hidden');
      const dressNameEl = document.getElementById('dressName'); if (dressNameEl.scrollIntoView) dressNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-dress-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-dress-id]').dataset.dressId);
      setVendorData('dresses', getVendorData('dresses', []).filter(d => d.id !== id));
      if (editingDressId === id) cancelDressEdit();
      renderDressCollection();
    });
  });
  document.querySelectorAll('.dress-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-dress-id]').dataset.dressId);
      const dresses = getVendorData('dresses', []);
      const dress = dresses.find(d => d.id === id);
      if (!dress) return;
      dress.media = dress.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          dress.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/dresses`) });
        } else {
          dress.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/dresses`) });
        }
      }
      setVendorData('dresses', dresses);
      renderDressCollection();
    });
  });
  document.querySelectorAll('.remove-dress-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-dress-id]').dataset.dressId);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const dresses = getVendorData('dresses', []);
      const dress = dresses.find(d => d.id === id);
      if (dress) dress.media.splice(i, 1);
      setVendorData('dresses', dresses);
      renderDressCollection();
    });
  });
}

document.getElementById('dressFilterCategory').addEventListener('change', renderDressCollection);
document.getElementById('dressBarcodeSearch').addEventListener('input', renderDressCollection);

document.getElementById('dressBuyCheck').addEventListener('change', (e) => {
  document.getElementById('dressBuyPriceGroup').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('dressRentCheck').addEventListener('change', (e) => {
  document.getElementById('dressRentPriceGroup').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('addDressBtn').addEventListener('click', () => {
  const name = document.getElementById('dressName').value.trim();
  if (!name) { alert('Please enter a dress name.'); return; }
  const fields = {
    category: document.getElementById('dressCategory').value,
    name,
    designerName: document.getElementById('dressDesignerName').value.trim(),
    collectionName: document.getElementById('dressCollectionName').value.trim(),
    style: document.getElementById('dressStyle').value,
    sizes: splitList(document.getElementById('dressSizes').value),
    colors: splitList(document.getElementById('dressColors').value),
    fabricType: document.getElementById('dressFabricType').value.trim(),
    barcode: document.getElementById('dressBarcode').value.trim(),
    availability: document.getElementById('dressAvailability').value,
    buy: document.getElementById('dressBuyCheck').checked,
    buyPrice: document.getElementById('dressBuyCheck').checked ? document.getElementById('dressBuyPrice').value : '',
    rent: document.getElementById('dressRentCheck').checked,
    rentPrice: document.getElementById('dressRentCheck').checked ? document.getElementById('dressRentPrice').value : '',
  };
  const dresses = getVendorData('dresses', []);
  if (editingDressId) {
    const dress = dresses.find(d => d.id === editingDressId);
    if (dress) Object.assign(dress, fields);
  } else {
    dresses.push({ id: Date.now(), ...fields, stockQuantity: 1, media: [] });
  }
  setVendorData('dresses', dresses);
  cancelDressEdit();
  renderDressCollection();
});

// ===================================================================
// INVENTORY MANAGEMENT (Bridal Dress Shops only) — an operational view over
// the same `dresses` records created in Dress Collection: update status and
// quantity on hand here without re-opening the full catalog form.
// ===================================================================
const DRESS_STOCK_STATUSES = ['Available', 'Reserved', 'Rented', 'Sold', 'Maintenance/Cleaning'];

function renderInventoryManagement() {
  if (currentVendor.category !== 'Bridal Dress Shops') return;

  const dresses = getVendorData('dresses', []);
  const counts = DRESS_STOCK_STATUSES.map(status => ({
    num: dresses.filter(d => d.availability === status).length,
    label: status,
  }));
  const totalStock = dresses.reduce((sum, d) => sum + (Number(d.stockQuantity) || 0), 0);
  document.getElementById('inventoryStats').innerHTML = [...counts, { num: totalStock, label: 'Total Units in Stock' }].map(s => `
    <div class="stat-card"><div class="num">${s.num}</div><div class="label">${escapeHtml(s.label)}</div></div>
  `).join('');

  const body = document.getElementById('inventoryTableBody');
  if (!dresses.length) { body.innerHTML = `<tr><td colspan="4" class="admin-empty">No dresses yet — add one in Dress Collection first.</td></tr>`; return; }

  body.innerHTML = dresses.slice().reverse().map(d => `
    <tr data-dress-id="${d.id}">
      <td>${escapeHtml(d.name)}</td>
      <td>${escapeHtml(d.category)}</td>
      <td>
        <select class="inventory-status-select">
          ${DRESS_STOCK_STATUSES.map(s => `<option ${d.availability === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" class="inventory-quantity-input" min="0" value="${escapeHtml(d.stockQuantity != null ? d.stockQuantity : 1)}"></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.dressId);
    function update(patch) {
      const dresses = getVendorData('dresses', []);
      const d = dresses.find(x => x.id === id);
      if (d) Object.assign(d, patch);
      setVendorData('dresses', dresses);
      renderInventoryManagement();
    }
    row.querySelector('.inventory-status-select').addEventListener('change', (e) => update({ availability: e.target.value }));
    row.querySelector('.inventory-quantity-input').addEventListener('change', (e) => update({ stockQuantity: e.target.value }));
  });
}

// ===================================================================
// CUSTOMER MANAGEMENT (Bridal Dress Shops only) — bride profiles with
// measurements/preferences plus a "Saved Dresses" wishlist referencing the
// shop's own Dress Collection records by id.
// ===================================================================
function renderBridalClientManagement() {
  if (currentVendor.category !== 'Bridal Dress Shops') return;

  document.getElementById('bridalClientFavoriteStylesGrid').innerHTML = DRESS_STYLES.map(s => `
    <label class="amenity-item"><input type="checkbox" value="${s}" class="bridal-client-favorite-style-check"> ${s}</label>
  `).join('');

  const clients = getVendorData('bridalClients', []);
  const dresses = getVendorData('dresses', []);
  const search = document.getElementById('bridalClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.brideName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('bridalClientsList').innerHTML = filtered.map(c => {
    const savedDresses = (c.savedDressIds || []).map(id => dresses.find(d => d.id === id));
    return `
    <div class="admin-card" data-bridal-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.brideName)}</h4>
        <button type="button" class="admin-btn small danger delete-bridal-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Bride Name</label><input type="text" class="bridal-client-edit-field" data-field="brideName" value="${escapeHtml(c.brideName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="bridal-client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Contact</label><input type="text" class="bridal-client-edit-field" data-field="contact" value="${escapeHtml(c.contact || '')}"></div>
      <div class="admin-form-group"><label>Measurements</label><textarea class="bridal-client-edit-field" data-field="measurements" rows="2">${escapeHtml(c.measurements || '')}</textarea></div>
      <div class="admin-form-group"><label>Dress Preferences</label><input type="text" class="bridal-client-edit-field" data-field="dressPreferences" value="${escapeHtml(c.dressPreferences || '')}"></div>
      <p style="margin-top:0.6rem;"><strong>Favorite Styles</strong></p>
      <div class="amenity-grid">
        ${DRESS_STYLES.map(s => `<label class="amenity-item"><input type="checkbox" value="${s}" class="bridal-client-edit-favorite-style-check" ${(c.favoriteStyles || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
      </div>
      <div class="admin-form-group" style="margin-top:0.6rem;"><label>Notes</label><textarea class="bridal-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-bridal-client-btn">Save</button>
      <span class="admin-note save-bridal-client-note"></span>
      <p style="margin-top:0.6rem;"><strong>Saved Dresses</strong></p>
      <div class="admin-inline-form" style="margin-bottom:0.5rem;">
        <select class="bridal-client-dress-select">
          ${dresses.length ? dresses.map(d => `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(d.category)})</option>`).join('') : '<option value="">No dresses in your collection yet</option>'}
        </select>
        <button type="button" class="admin-btn small outline save-bridal-client-dress-btn" ${dresses.length ? '' : 'disabled'}>Save Dress</button>
      </div>
      <div>
        ${savedDresses.length ? savedDresses.map((d, i) => `
          <span class="category-chip">${d ? escapeHtml(d.name) : '(dress no longer available)'} <button type="button" data-i="${i}" class="remove-bridal-client-dress-btn">✕</button></span>
        `).join('') : '<p class="admin-empty">No saved dresses yet.</p>'}
      </div>
    </div>
  `;
  }).join('') || `<p class="admin-empty">${search ? 'No bride profiles match that search.' : 'No bride profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-bridal-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-bridal-client-id]').dataset.bridalClientId);
      setVendorData('bridalClients', getVendorData('bridalClients', []).filter(c => c.id !== id));
      renderBridalClientManagement();
    });
  });
  document.querySelectorAll('.save-bridal-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-bridal-client-id]');
      const id = Number(card.dataset.bridalClientId);
      const clients = getVendorData('bridalClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.bridal-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      client.favoriteStyles = Array.from(card.querySelectorAll('.bridal-client-edit-favorite-style-check:checked')).map(cb => cb.value);
      setVendorData('bridalClients', clients);
      const note = card.querySelector('.save-bridal-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
  document.querySelectorAll('.save-bridal-client-dress-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-bridal-client-id]');
      const id = Number(card.dataset.bridalClientId);
      const dressId = Number(card.querySelector('.bridal-client-dress-select').value);
      if (!dressId) return;
      const clients = getVendorData('bridalClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      client.savedDressIds = client.savedDressIds || [];
      if (!client.savedDressIds.includes(dressId)) client.savedDressIds.push(dressId);
      setVendorData('bridalClients', clients);
      renderBridalClientManagement();
    });
  });
  document.querySelectorAll('.remove-bridal-client-dress-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-bridal-client-id]').dataset.bridalClientId);
      const i = Number(btn.dataset.i);
      const clients = getVendorData('bridalClients', []);
      const client = clients.find(c => c.id === id);
      if (client) client.savedDressIds.splice(i, 1);
      setVendorData('bridalClients', clients);
      renderBridalClientManagement();
    });
  });
}

document.getElementById('bridalClientSearchInput').addEventListener('input', renderBridalClientManagement);

document.getElementById('addBridalClientBtn').addEventListener('click', () => {
  const brideName = document.getElementById('bridalClientBrideName').value.trim();
  if (!brideName) { alert('Please enter the bride\'s name.'); return; }
  const clients = getVendorData('bridalClients', []);
  clients.push({
    id: Date.now(),
    brideName,
    weddingDate: document.getElementById('bridalClientWeddingDate').value,
    contact: document.getElementById('bridalClientContact').value.trim(),
    measurements: document.getElementById('bridalClientMeasurements').value.trim(),
    dressPreferences: document.getElementById('bridalClientDressPreferences').value.trim(),
    favoriteStyles: Array.from(document.querySelectorAll('.bridal-client-favorite-style-check:checked')).map(c => c.value),
    notes: document.getElementById('bridalClientNotes').value.trim(),
    savedDressIds: [],
  });
  setVendorData('bridalClients', clients);
  [
    'bridalClientBrideName', 'bridalClientWeddingDate', 'bridalClientContact',
    'bridalClientMeasurements', 'bridalClientDressPreferences', 'bridalClientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.bridal-client-favorite-style-check').forEach(cb => cb.checked = false);
  renderBridalClientManagement();
});

// ===================================================================
// SUIT COLLECTION (Suit Rental only)
// ===================================================================
let editingSuitId = null;
function cancelSuitEdit() {
  editingSuitId = null;
  ['suitName', 'suitCollectionName', 'suitBrand', 'suitSizes', 'suitColors', 'suitFabricType', 'suitBarcode'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addSuitBtn').textContent = 'Add Suit';
  document.getElementById('cancelSuitEditBtn').classList.add('hidden');
}
document.getElementById('cancelSuitEditBtn').addEventListener('click', cancelSuitEdit);

function renderSuitCollection() {
  if (currentVendor.category !== 'Suit Rental') return;

  document.getElementById('suitCategory').innerHTML = SUIT_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('suitStyle').innerHTML = SUIT_STYLES.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  document.getElementById('suitAvailability').innerHTML = SUIT_STOCK_STATUSES.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  const filterSelect = document.getElementById('suitFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + SUIT_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const suits = getVendorData('suits', []);
  const filter = filterSelect.value;
  const filtered = filter ? suits.filter(s => s.category === filter) : suits;

  document.getElementById('suitCollectionList').innerHTML = filtered.slice().reverse().map(s => `
    <div class="admin-card" data-suit-id="${s.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(s.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(s.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-suit-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-suit-btn">Delete</button>
        </span>
      </div>
      ${s.brand || s.collectionName ? `<p class="admin-hint" style="text-align:left;">${s.brand ? `Brand: ${escapeHtml(s.brand)}` : ''}${s.brand && s.collectionName ? ' · ' : ''}${s.collectionName ? `Collection: ${escapeHtml(s.collectionName)}` : ''}</p>` : ''}
      <div class="amenity-tags">
        ${s.style ? `<span class="amenity-tag">${escapeHtml(s.style)}</span>` : ''}
        <span class="status-pill ${itemStatusPillClass(s.availability)}">${escapeHtml(s.availability)}</span>
      </div>
      ${s.sizes && s.sizes.length ? `<p><strong>Sizes:</strong> ${s.sizes.map(escapeHtml).join(', ')}</p>` : ''}
      ${s.colors && s.colors.length ? `<p><strong>Colors:</strong> ${s.colors.map(escapeHtml).join(', ')}</p>` : ''}
      ${s.fabricType ? `<p><strong>Fabric:</strong> ${escapeHtml(s.fabricType)}</p>` : ''}
      ${s.barcode ? `<p><strong>Barcode:</strong> ${escapeHtml(s.barcode)}</p>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos &amp; Videos</strong></p>
      <input type="file" class="suit-media-input" accept="image/*,video/*" multiple>
      <div class="gallery-grid-vendor">
        ${(s.media || []).map((m, i) => `
          <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-suit-media-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos or videos yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No suits in the collection yet — add one above.</p>';

  document.querySelectorAll('.edit-suit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-suit-id]').dataset.suitId);
      const suit = getVendorData('suits', []).find(s => s.id === id);
      if (!suit) return;
      editingSuitId = id;
      document.getElementById('suitName').value = suit.name || '';
      document.getElementById('suitCategory').value = suit.category || '';
      document.getElementById('suitCollectionName').value = suit.collectionName || '';
      document.getElementById('suitBrand').value = suit.brand || '';
      document.getElementById('suitStyle').value = suit.style || '';
      document.getElementById('suitSizes').value = (suit.sizes || []).join(', ');
      document.getElementById('suitColors').value = (suit.colors || []).join(', ');
      document.getElementById('suitFabricType').value = suit.fabricType || '';
      document.getElementById('suitBarcode').value = suit.barcode || '';
      document.getElementById('suitAvailability').value = suit.availability || '';
      document.getElementById('addSuitBtn').textContent = 'Save Changes';
      document.getElementById('cancelSuitEditBtn').classList.remove('hidden');
      const suitNameEl = document.getElementById('suitName'); if (suitNameEl.scrollIntoView) suitNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-suit-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-suit-id]').dataset.suitId);
      setVendorData('suits', getVendorData('suits', []).filter(s => s.id !== id));
      if (editingSuitId === id) cancelSuitEdit();
      renderSuitCollection();
    });
  });
  document.querySelectorAll('.suit-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-suit-id]').dataset.suitId);
      const suits = getVendorData('suits', []);
      const suit = suits.find(s => s.id === id);
      if (!suit) return;
      suit.media = suit.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          suit.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/suits`) });
        } else {
          suit.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/suits`) });
        }
      }
      setVendorData('suits', suits);
      renderSuitCollection();
    });
  });
  document.querySelectorAll('.remove-suit-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-suit-id]').dataset.suitId);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const suits = getVendorData('suits', []);
      const suit = suits.find(s => s.id === id);
      if (suit) suit.media.splice(i, 1);
      setVendorData('suits', suits);
      renderSuitCollection();
    });
  });
}

document.getElementById('suitFilterCategory').addEventListener('change', renderSuitCollection);

document.getElementById('addSuitBtn').addEventListener('click', () => {
  const name = document.getElementById('suitName').value.trim();
  if (!name) { alert('Please enter a suit name.'); return; }
  const fields = {
    category: document.getElementById('suitCategory').value,
    name,
    collectionName: document.getElementById('suitCollectionName').value.trim(),
    brand: document.getElementById('suitBrand').value.trim(),
    style: document.getElementById('suitStyle').value,
    sizes: splitList(document.getElementById('suitSizes').value),
    colors: splitList(document.getElementById('suitColors').value),
    fabricType: document.getElementById('suitFabricType').value.trim(),
    barcode: document.getElementById('suitBarcode').value.trim(),
    availability: document.getElementById('suitAvailability').value,
  };
  const suits = getVendorData('suits', []);
  if (editingSuitId) {
    const suit = suits.find(s => s.id === editingSuitId);
    if (suit) Object.assign(suit, fields);
  } else {
    suits.push({ id: Date.now(), ...fields, stockQuantity: 1, media: [] });
  }
  setVendorData('suits', suits);
  cancelSuitEdit();
  renderSuitCollection();
});

// ===================================================================
// VEHICLE MANAGEMENT (Vehicle Rental only)
// ===================================================================
let editingVehicleId = null;
function cancelVehicleEdit() {
  editingVehicleId = null;
  ['vehicleName', 'vehicleBrandModel', 'vehicleYear', 'vehicleColor', 'vehiclePassengerCapacity', 'vehicleDescription'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.vehicle-feature-check').forEach(cb => cb.checked = false);
  document.getElementById('addVehicleBtn').textContent = 'Add Vehicle';
  document.getElementById('cancelVehicleEditBtn').classList.add('hidden');
}
document.getElementById('cancelVehicleEditBtn').addEventListener('click', cancelVehicleEdit);

function renderVehicleManagement() {
  if (currentVendor.category !== 'Vehicle Rental') return;

  document.getElementById('vehicleCategory').innerHTML = VEHICLE_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('vehicleFeaturesGrid').innerHTML = VEHICLE_FEATURES.map(f => `
    <label class="amenity-item"><input type="checkbox" value="${f}" class="vehicle-feature-check"> ${f}</label>
  `).join('');
  const filterSelect = document.getElementById('vehicleFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + VEHICLE_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const vehicles = getVendorData('vehicles', []);
  const filter = filterSelect.value;
  const filtered = filter ? vehicles.filter(v => v.category === filter) : vehicles;

  document.getElementById('vehicleManagementList').innerHTML = filtered.slice().reverse().map(v => `
    <div class="admin-card" data-vehicle-id="${v.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(v.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(v.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-vehicle-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-vehicle-btn">Delete</button>
        </span>
      </div>
      ${v.brandModel || v.year ? `<p class="admin-hint" style="text-align:left;">${v.brandModel ? escapeHtml(v.brandModel) : ''}${v.brandModel && v.year ? ' · ' : ''}${v.year ? escapeHtml(v.year) : ''}</p>` : ''}
      ${v.color ? `<p><strong>Color:</strong> ${escapeHtml(v.color)}</p>` : ''}
      ${v.passengerCapacity ? `<p><strong>Passenger Capacity:</strong> ${escapeHtml(v.passengerCapacity)}</p>` : ''}
      ${v.description ? `<p><strong>Description:</strong> ${escapeHtml(v.description)}</p>` : ''}
      ${v.features && v.features.length ? `<div class="amenity-tags">${v.features.map(f => `<span class="amenity-tag">${escapeHtml(f)}</span>`).join('')}</div>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos &amp; Videos</strong></p>
      <input type="file" class="vehicle-media-input" accept="image/*,video/*" multiple>
      <div class="gallery-grid-vendor">
        ${(v.media || []).map((m, i) => `
          <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-vehicle-media-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos or videos yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No vehicles in your fleet yet — add one above.</p>';

  document.querySelectorAll('.edit-vehicle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-vehicle-id]').dataset.vehicleId);
      const vehicle = getVendorData('vehicles', []).find(v => v.id === id);
      if (!vehicle) return;
      editingVehicleId = id;
      document.getElementById('vehicleName').value = vehicle.name || '';
      document.getElementById('vehicleCategory').value = vehicle.category || '';
      document.getElementById('vehicleBrandModel').value = vehicle.brandModel || '';
      document.getElementById('vehicleYear').value = vehicle.year || '';
      document.getElementById('vehicleColor').value = vehicle.color || '';
      document.getElementById('vehiclePassengerCapacity').value = vehicle.passengerCapacity || '';
      document.getElementById('vehicleDescription').value = vehicle.description || '';
      document.querySelectorAll('.vehicle-feature-check').forEach(cb => cb.checked = (vehicle.features || []).includes(cb.value));
      document.getElementById('addVehicleBtn').textContent = 'Save Changes';
      document.getElementById('cancelVehicleEditBtn').classList.remove('hidden');
      const vehicleNameEl = document.getElementById('vehicleName'); if (vehicleNameEl.scrollIntoView) vehicleNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-vehicle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-vehicle-id]').dataset.vehicleId);
      setVendorData('vehicles', getVendorData('vehicles', []).filter(v => v.id !== id));
      if (editingVehicleId === id) cancelVehicleEdit();
      renderVehicleManagement();
    });
  });
  document.querySelectorAll('.vehicle-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-vehicle-id]').dataset.vehicleId);
      const vehicles = getVendorData('vehicles', []);
      const vehicle = vehicles.find(v => v.id === id);
      if (!vehicle) return;
      vehicle.media = vehicle.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          vehicle.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/vehicles`) });
        } else {
          vehicle.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/vehicles`) });
        }
      }
      setVendorData('vehicles', vehicles);
      renderVehicleManagement();
    });
  });
  document.querySelectorAll('.remove-vehicle-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-vehicle-id]').dataset.vehicleId);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const vehicles = getVendorData('vehicles', []);
      const vehicle = vehicles.find(v => v.id === id);
      if (vehicle) vehicle.media.splice(i, 1);
      setVendorData('vehicles', vehicles);
      renderVehicleManagement();
    });
  });
}

document.getElementById('vehicleFilterCategory').addEventListener('change', renderVehicleManagement);

document.getElementById('addVehicleBtn').addEventListener('click', () => {
  const name = document.getElementById('vehicleName').value.trim();
  if (!name) { alert('Please enter a vehicle name.'); return; }
  const fields = {
    category: document.getElementById('vehicleCategory').value,
    name,
    brandModel: document.getElementById('vehicleBrandModel').value.trim(),
    year: document.getElementById('vehicleYear').value,
    color: document.getElementById('vehicleColor').value.trim(),
    passengerCapacity: document.getElementById('vehiclePassengerCapacity').value,
    description: document.getElementById('vehicleDescription').value.trim(),
    features: Array.from(document.querySelectorAll('.vehicle-feature-check:checked')).map(c => c.value),
  };
  const vehicles = getVendorData('vehicles', []);
  if (editingVehicleId) {
    const vehicle = vehicles.find(v => v.id === editingVehicleId);
    if (vehicle) Object.assign(vehicle, fields);
  } else {
    vehicles.push({ id: Date.now(), ...fields, media: [] });
  }
  setVendorData('vehicles', vehicles);
  cancelVehicleEdit();
  renderVehicleManagement();
});

// ===================================================================
// DRIVER MANAGEMENT (Vehicle Rental only)
// ===================================================================
let editingDriverId = null;
function cancelDriverEdit() {
  editingDriverId = null;
  ['driverName', 'driverLicenseNumber', 'driverYearsExperience', 'driverSchedule', 'driverPhone', 'driverEmail'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addDriverBtn').textContent = 'Add Driver';
  document.getElementById('cancelDriverEditBtn').classList.add('hidden');
}
document.getElementById('cancelDriverEditBtn').addEventListener('click', cancelDriverEdit);

function renderDriverManagement() {
  if (currentVendor.category !== 'Vehicle Rental') return;

  const drivers = getVendorData('drivers', []);
  document.getElementById('driversList').innerHTML = drivers.map(d => `
    <div class="admin-card" data-driver-id="${d.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(d.name)}</h4>
        <span>
          <button type="button" class="admin-btn small outline edit-driver-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-driver-btn">Delete</button>
        </span>
      </div>
      ${d.licenseNumber ? `<p><strong>License Number:</strong> ${escapeHtml(d.licenseNumber)}</p>` : ''}
      ${d.yearsExperience ? `<p><strong>Years of Experience:</strong> ${escapeHtml(d.yearsExperience)}</p>` : ''}
      ${d.schedule ? `<p><strong>Schedule:</strong> ${escapeHtml(d.schedule)}</p>` : ''}
      ${d.phone || d.email ? `<p class="admin-hint" style="text-align:left;">${d.phone ? `📞 ${escapeHtml(d.phone)}` : ''}${d.phone && d.email ? ' · ' : ''}${d.email ? `✉️ ${escapeHtml(d.email)}` : ''}</p>` : ''}
    </div>
  `).join('') || '<p class="admin-empty">No drivers added yet — add one above.</p>';

  document.querySelectorAll('.edit-driver-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-driver-id]').dataset.driverId);
      const driver = getVendorData('drivers', []).find(d => d.id === id);
      if (!driver) return;
      editingDriverId = id;
      document.getElementById('driverName').value = driver.name || '';
      document.getElementById('driverLicenseNumber').value = driver.licenseNumber || '';
      document.getElementById('driverYearsExperience').value = driver.yearsExperience || '';
      document.getElementById('driverSchedule').value = driver.schedule || '';
      document.getElementById('driverPhone').value = driver.phone || '';
      document.getElementById('driverEmail').value = driver.email || '';
      document.getElementById('addDriverBtn').textContent = 'Save Changes';
      document.getElementById('cancelDriverEditBtn').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.delete-driver-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-driver-id]').dataset.driverId);
      setVendorData('drivers', getVendorData('drivers', []).filter(d => d.id !== id));
      if (editingDriverId === id) cancelDriverEdit();
      renderDriverManagement();
    });
  });
}

document.getElementById('addDriverBtn').addEventListener('click', () => {
  const name = document.getElementById('driverName').value.trim();
  if (!name) { alert('Please enter the driver\'s name.'); return; }
  const fields = {
    name,
    licenseNumber: document.getElementById('driverLicenseNumber').value.trim(),
    yearsExperience: document.getElementById('driverYearsExperience').value,
    schedule: document.getElementById('driverSchedule').value.trim(),
    phone: document.getElementById('driverPhone').value.trim(),
    email: document.getElementById('driverEmail').value.trim(),
  };
  const drivers = getVendorData('drivers', []);
  if (editingDriverId) {
    const driver = drivers.find(d => d.id === editingDriverId);
    if (driver) Object.assign(driver, fields);
  } else {
    drivers.push({ id: Date.now(), ...fields });
  }
  setVendorData('drivers', drivers);
  cancelDriverEdit();
  renderDriverManagement();
});

// ===================================================================
// CUSTOMER MANAGEMENT (Vehicle Rental only) — couple profiles with
// pickup/destination and timeline details for the wedding-day transport.
// ===================================================================
let editingVehicleClientId = null;
function cancelVehicleClientEdit() {
  editingVehicleClientId = null;
  [
    'vehicleClientCoupleName', 'vehicleClientWeddingDate', 'vehicleClientContact',
    'vehicleClientPickupLocation', 'vehicleClientDestination', 'vehicleClientTimelineNotes', 'vehicleClientSpecialRequests',
  ].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addVehicleClientBtn').textContent = 'Add Couple Profile';
  document.getElementById('cancelVehicleClientEditBtn').classList.add('hidden');
}
document.getElementById('cancelVehicleClientEditBtn').addEventListener('click', cancelVehicleClientEdit);

function renderVehicleClientManagement() {
  if (currentVendor.category !== 'Vehicle Rental') return;

  const clients = getVendorData('vehicleClients', []);
  document.getElementById('vehicleClientsList').innerHTML = clients.map(c => `
    <div class="admin-card" data-vehicle-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.coupleName)}</h4>
        <span>
          <button type="button" class="admin-btn small outline edit-vehicle-client-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-vehicle-client-btn">Delete</button>
        </span>
      </div>
      ${c.weddingDate || c.contact ? `<p class="admin-hint" style="text-align:left;">${c.weddingDate ? `💍 ${escapeHtml(c.weddingDate)}` : ''} ${c.contact ? `· ${escapeHtml(c.contact)}` : ''}</p>` : ''}
      ${c.pickupLocation ? `<p><strong>Pickup Location:</strong> ${escapeHtml(c.pickupLocation)}</p>` : ''}
      ${c.destination ? `<p><strong>Destination:</strong> ${escapeHtml(c.destination)}</p>` : ''}
      ${c.timelineNotes ? `<p><strong>Timeline Notes:</strong> ${escapeHtml(c.timelineNotes)}</p>` : ''}
      ${c.specialRequests ? `<p><strong>Special Requests:</strong> ${escapeHtml(c.specialRequests)}</p>` : ''}
    </div>
  `).join('') || '<p class="admin-empty">No couple profiles yet — add one above.</p>';

  document.querySelectorAll('.edit-vehicle-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-vehicle-client-id]').dataset.vehicleClientId);
      const client = getVendorData('vehicleClients', []).find(c => c.id === id);
      if (!client) return;
      editingVehicleClientId = id;
      document.getElementById('vehicleClientCoupleName').value = client.coupleName || '';
      document.getElementById('vehicleClientWeddingDate').value = client.weddingDate || '';
      document.getElementById('vehicleClientContact').value = client.contact || '';
      document.getElementById('vehicleClientPickupLocation').value = client.pickupLocation || '';
      document.getElementById('vehicleClientDestination').value = client.destination || '';
      document.getElementById('vehicleClientTimelineNotes').value = client.timelineNotes || '';
      document.getElementById('vehicleClientSpecialRequests').value = client.specialRequests || '';
      document.getElementById('addVehicleClientBtn').textContent = 'Save Changes';
      document.getElementById('cancelVehicleClientEditBtn').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.delete-vehicle-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-vehicle-client-id]').dataset.vehicleClientId);
      setVendorData('vehicleClients', getVendorData('vehicleClients', []).filter(c => c.id !== id));
      if (editingVehicleClientId === id) cancelVehicleClientEdit();
      renderVehicleClientManagement();
    });
  });
}

document.getElementById('addVehicleClientBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('vehicleClientCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const fields = {
    coupleName,
    weddingDate: document.getElementById('vehicleClientWeddingDate').value,
    contact: document.getElementById('vehicleClientContact').value.trim(),
    pickupLocation: document.getElementById('vehicleClientPickupLocation').value.trim(),
    destination: document.getElementById('vehicleClientDestination').value.trim(),
    timelineNotes: document.getElementById('vehicleClientTimelineNotes').value.trim(),
    specialRequests: document.getElementById('vehicleClientSpecialRequests').value.trim(),
  };
  const clients = getVendorData('vehicleClients', []);
  if (editingVehicleClientId) {
    const client = clients.find(c => c.id === editingVehicleClientId);
    if (client) Object.assign(client, fields);
  } else {
    clients.push({ id: Date.now(), ...fields });
  }
  setVendorData('vehicleClients', clients);
  cancelVehicleClientEdit();
  renderVehicleClientManagement();
});

// ===================================================================
// MENU MANAGEMENT (Catering only) — Food Categories carry their own
// showcase photos (separate from individual menu items), while Menu Items
// are the actual dishes/drinks, each with their own photo gallery.
// ===================================================================
function renderMenuManagement() {
  renderFoodCategories();
  renderMenuItems();
}

function renderFoodCategories() {
  if (currentVendor.category !== 'Catering') return;

  const categoryPhotos = getVendorData('foodCategoryPhotos', {});
  document.getElementById('foodCategoriesList').innerHTML = FOOD_CATEGORIES.map(cat => {
    const photos = categoryPhotos[cat] || [];
    return `
    <div class="admin-card" data-food-category="${escapeHtml(cat)}" style="background:var(--bg);">
      <h4 style="margin:0 0 0.6rem;">${escapeHtml(cat)}</h4>
      <input type="file" class="food-category-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${photos.map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-food-category-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos yet.</p>'}
      </div>
    </div>`;
  }).join('');

  document.querySelectorAll('.food-category-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const cat = input.closest('[data-food-category]').dataset.foodCategory;
      const categoryPhotos = getVendorData('foodCategoryPhotos', {});
      categoryPhotos[cat] = categoryPhotos[cat] || [];
      for (const file of Array.from(e.target.files)) {
        categoryPhotos[cat].push(await uploadMedia(file, `vendors/${currentVendor.username}/foodCategoryPhotos`));
      }
      setVendorData('foodCategoryPhotos', categoryPhotos);
      renderFoodCategories();
    });
  });
  document.querySelectorAll('.remove-food-category-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.closest('[data-food-category]').dataset.foodCategory;
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const categoryPhotos = getVendorData('foodCategoryPhotos', {});
      if (categoryPhotos[cat]) categoryPhotos[cat].splice(i, 1);
      setVendorData('foodCategoryPhotos', categoryPhotos);
      renderFoodCategories();
    });
  });
}

let editingMenuItemId = null;
function cancelMenuItemEdit() {
  editingMenuItemId = null;
  ['menuItemName', 'menuItemDescription', 'menuItemIngredients', 'menuItemPrice'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addMenuItemBtn').textContent = 'Add Menu Item';
  document.getElementById('cancelMenuItemEditBtn').classList.add('hidden');
}
document.getElementById('cancelMenuItemEditBtn').addEventListener('click', cancelMenuItemEdit);

function renderMenuItems() {
  if (currentVendor.category !== 'Catering') return;

  document.getElementById('menuItemCategory').innerHTML = FOOD_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  const filterSelect = document.getElementById('menuItemFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + FOOD_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const items = getVendorData('menuItems', []);
  const filter = filterSelect.value;
  const filtered = filter ? items.filter(i => i.category === filter) : items;

  document.getElementById('menuItemsList').innerHTML = filtered.slice().reverse().map(item => `
    <div class="admin-card" data-menu-item-id="${item.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(item.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(item.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-menu-item-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-menu-item-btn">Delete</button>
        </span>
      </div>
      <div class="amenity-tags">
        <span class="status-pill ${item.availability === 'Available' ? 'approved' : 'rejected'}">${escapeHtml(item.availability)}</span>
        ${item.price ? `<span class="amenity-tag">$${escapeHtml(item.price)}</span>` : ''}
      </div>
      ${item.description ? `<p>${escapeHtml(item.description)}</p>` : ''}
      ${item.ingredients && item.ingredients.length ? `<p><strong>Ingredients:</strong> ${item.ingredients.map(escapeHtml).join(', ')}</p>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos</strong></p>
      <input type="file" class="menu-item-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(item.photos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-menu-item-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No menu items yet — add one above.</p>';

  document.querySelectorAll('.edit-menu-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-menu-item-id]').dataset.menuItemId);
      const item = getVendorData('menuItems', []).find(i => i.id === id);
      if (!item) return;
      editingMenuItemId = id;
      document.getElementById('menuItemName').value = item.name || '';
      document.getElementById('menuItemCategory').value = item.category || '';
      document.getElementById('menuItemDescription').value = item.description || '';
      document.getElementById('menuItemIngredients').value = (item.ingredients || []).join(', ');
      document.getElementById('menuItemPrice').value = item.price || '';
      document.getElementById('menuItemAvailability').value = item.availability || '';
      document.getElementById('addMenuItemBtn').textContent = 'Save Changes';
      document.getElementById('cancelMenuItemEditBtn').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.delete-menu-item-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-menu-item-id]').dataset.menuItemId);
      setVendorData('menuItems', getVendorData('menuItems', []).filter(i => i.id !== id));
      if (editingMenuItemId === id) cancelMenuItemEdit();
      renderMenuItems();
    });
  });
  document.querySelectorAll('.menu-item-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-menu-item-id]').dataset.menuItemId);
      const items = getVendorData('menuItems', []);
      const item = items.find(i => i.id === id);
      if (!item) return;
      item.photos = item.photos || [];
      for (const file of Array.from(e.target.files)) {
        item.photos.push(await uploadMedia(file, `vendors/${currentVendor.username}/menuItems`));
      }
      setVendorData('menuItems', items);
      renderMenuItems();
    });
  });
  document.querySelectorAll('.remove-menu-item-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-menu-item-id]').dataset.menuItemId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const items = getVendorData('menuItems', []);
      const item = items.find(x => x.id === id);
      if (item) item.photos.splice(i, 1);
      setVendorData('menuItems', items);
      renderMenuItems();
    });
  });
}

document.getElementById('menuItemFilterCategory').addEventListener('change', renderMenuItems);

document.getElementById('addMenuItemBtn').addEventListener('click', () => {
  const name = document.getElementById('menuItemName').value.trim();
  if (!name) { alert('Please enter a food name.'); return; }
  const fields = {
    category: document.getElementById('menuItemCategory').value,
    name,
    description: document.getElementById('menuItemDescription').value.trim(),
    ingredients: splitList(document.getElementById('menuItemIngredients').value),
    price: document.getElementById('menuItemPrice').value,
    availability: document.getElementById('menuItemAvailability').value,
  };
  const items = getVendorData('menuItems', []);
  if (editingMenuItemId) {
    const item = items.find(i => i.id === editingMenuItemId);
    if (item) Object.assign(item, fields);
  } else {
    items.push({ id: Date.now(), ...fields, photos: [] });
  }
  setVendorData('menuItems', items);
  cancelMenuItemEdit();
  renderMenuItems();
});

// ===================================================================
// EVENT MANAGEMENT (Catering only)
// ===================================================================
let editingEventId = null;
function cancelEventEdit() {
  editingEventId = null;
  [
    'eventCoupleName', 'eventWeddingDate', 'eventVenueLocation', 'eventGuestCount',
    'eventTimeline', 'eventSetupSchedule', 'eventStaffAssignment', 'eventSpecialRequests',
  ].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addEventBtn').textContent = 'Add Event';
  document.getElementById('cancelEventEditBtn').classList.add('hidden');
}
document.getElementById('cancelEventEditBtn').addEventListener('click', cancelEventEdit);

function renderEventManagement() {
  if (currentVendor.category !== 'Catering') return;

  const events = getVendorData('cateringEvents', []);
  document.getElementById('eventsList').innerHTML = events.slice().reverse().map(ev => `
    <div class="admin-card" data-event-id="${ev.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(ev.coupleName)}</h4>
        <span>
          <button type="button" class="admin-btn small outline edit-event-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-event-btn">Delete</button>
        </span>
      </div>
      ${ev.weddingDate || ev.guestCount ? `<p class="admin-hint" style="text-align:left;">${ev.weddingDate ? `💍 ${escapeHtml(ev.weddingDate)}` : ''}${ev.guestCount ? ` · ${escapeHtml(ev.guestCount)} guests` : ''}</p>` : ''}
      ${ev.venueLocation ? `<p><strong>Venue Location:</strong> ${escapeHtml(ev.venueLocation)}</p>` : ''}
      ${ev.eventTimeline ? `<p><strong>Event Timeline:</strong> ${escapeHtml(ev.eventTimeline)}</p>` : ''}
      ${ev.setupSchedule ? `<p><strong>Setup Schedule:</strong> ${escapeHtml(ev.setupSchedule)}</p>` : ''}
      ${ev.staffAssignment ? `<p><strong>Staff Assignment:</strong> ${escapeHtml(ev.staffAssignment)}</p>` : ''}
      ${ev.specialRequests ? `<p><strong>Special Requests:</strong> ${escapeHtml(ev.specialRequests)}</p>` : ''}
    </div>
  `).join('') || '<p class="admin-empty">No events yet — add one above.</p>';

  document.querySelectorAll('.edit-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-event-id]').dataset.eventId);
      const event = getVendorData('cateringEvents', []).find(ev => ev.id === id);
      if (!event) return;
      editingEventId = id;
      document.getElementById('eventCoupleName').value = event.coupleName || '';
      document.getElementById('eventWeddingDate').value = event.weddingDate || '';
      document.getElementById('eventVenueLocation').value = event.venueLocation || '';
      document.getElementById('eventGuestCount').value = event.guestCount || '';
      document.getElementById('eventTimeline').value = event.eventTimeline || '';
      document.getElementById('eventSetupSchedule').value = event.setupSchedule || '';
      document.getElementById('eventStaffAssignment').value = event.staffAssignment || '';
      document.getElementById('eventSpecialRequests').value = event.specialRequests || '';
      document.getElementById('addEventBtn').textContent = 'Save Changes';
      document.getElementById('cancelEventEditBtn').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.delete-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-event-id]').dataset.eventId);
      setVendorData('cateringEvents', getVendorData('cateringEvents', []).filter(ev => ev.id !== id));
      if (editingEventId === id) cancelEventEdit();
      renderEventManagement();
    });
  });
}

document.getElementById('addEventBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('eventCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const fields = {
    coupleName,
    weddingDate: document.getElementById('eventWeddingDate').value,
    venueLocation: document.getElementById('eventVenueLocation').value.trim(),
    guestCount: document.getElementById('eventGuestCount').value,
    eventTimeline: document.getElementById('eventTimeline').value.trim(),
    setupSchedule: document.getElementById('eventSetupSchedule').value.trim(),
    staffAssignment: document.getElementById('eventStaffAssignment').value.trim(),
    specialRequests: document.getElementById('eventSpecialRequests').value.trim(),
  };
  const events = getVendorData('cateringEvents', []);
  if (editingEventId) {
    const event = events.find(ev => ev.id === editingEventId);
    if (event) Object.assign(event, fields);
  } else {
    events.push({ id: Date.now(), ...fields });
  }
  setVendorData('cateringEvents', events);
  cancelEventEdit();
  renderEventManagement();
});

// ===================================================================
// CUSTOMER MANAGEMENT (Catering only)
// ===================================================================
function renderCateringClientManagement() {
  if (currentVendor.category !== 'Catering') return;

  const clients = getVendorData('cateringClients', []);
  const search = document.getElementById('cateringClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.coupleName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('cateringClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-catering-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.coupleName)}</h4>
        <button type="button" class="admin-btn small danger delete-catering-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Couple Name</label><input type="text" class="catering-client-edit-field" data-field="coupleName" value="${escapeHtml(c.coupleName || '')}"></div>
        <div class="admin-form-group"><label>Guest Number</label><input type="number" class="catering-client-edit-field" data-field="guestNumber" min="0" value="${escapeHtml(c.guestNumber || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Menu Preferences</label><input type="text" class="catering-client-edit-field" data-field="menuPreferences" value="${escapeHtml(c.menuPreferences || '')}"></div>
      <div class="admin-form-group"><label>Allergies &amp; Dietary Requirements</label><textarea class="catering-client-edit-field" data-field="allergiesDietary" rows="2">${escapeHtml(c.allergiesDietary || '')}</textarea></div>
      <div class="admin-form-group"><label>Special Requests</label><textarea class="catering-client-edit-field" data-field="specialRequests" rows="2">${escapeHtml(c.specialRequests || '')}</textarea></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="catering-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-catering-client-btn">Save</button>
      <span class="admin-note save-catering-client-note"></span>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No couple profiles match that search.' : 'No couple profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-catering-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-catering-client-id]').dataset.cateringClientId);
      setVendorData('cateringClients', getVendorData('cateringClients', []).filter(c => c.id !== id));
      renderCateringClientManagement();
    });
  });
  document.querySelectorAll('.save-catering-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-catering-client-id]');
      const id = Number(card.dataset.cateringClientId);
      const clients = getVendorData('cateringClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.catering-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('cateringClients', clients);
      const note = card.querySelector('.save-catering-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('cateringClientSearchInput').addEventListener('input', renderCateringClientManagement);

document.getElementById('addCateringClientBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('cateringClientCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const clients = getVendorData('cateringClients', []);
  clients.push({
    id: Date.now(),
    coupleName,
    guestNumber: document.getElementById('cateringClientGuestNumber').value,
    menuPreferences: document.getElementById('cateringClientMenuPreferences').value.trim(),
    allergiesDietary: document.getElementById('cateringClientAllergiesDietary').value.trim(),
    specialRequests: document.getElementById('cateringClientSpecialRequests').value.trim(),
    notes: document.getElementById('cateringClientNotes').value.trim(),
  });
  setVendorData('cateringClients', clients);
  [
    'cateringClientCoupleName', 'cateringClientGuestNumber', 'cateringClientMenuPreferences',
    'cateringClientAllergiesDietary', 'cateringClientSpecialRequests', 'cateringClientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  renderCateringClientManagement();
});

// ===================================================================
// CUSTOM HONEYMOON PLANNING (Honeymoon Agency only) — a couple's
// unstructured, tailor-made trip request (as opposed to a pre-built
// package). Each request carries its own custom quote, entered once the
// agency has priced the trip out.
// ===================================================================
function renderCustomHoneymoonPlanning() {
  if (currentVendor.category !== 'Honeymoon Agency') return;

  const requests = getVendorData('customHoneymoonRequests', []);
  document.getElementById('customHoneymoonRequestsList').innerHTML = requests.slice().reverse().map(r => `
    <div class="admin-card" data-request-id="${r.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(r.coupleName)}</h4>
        <button type="button" class="admin-btn small danger delete-custom-honeymoon-request-btn">Delete</button>
      </div>
      ${r.budget ? `<p><strong>Budget:</strong> $${escapeHtml(r.budget)}</p>` : ''}
      ${r.couplePreference ? `<p><strong>Couple Preference:</strong> ${escapeHtml(r.couplePreference)}</p>` : ''}
      ${r.travelStartDate || r.travelEndDate ? `<p><strong>Travel Dates:</strong> ${escapeHtml(r.travelStartDate || '?')} – ${escapeHtml(r.travelEndDate || '?')}</p>` : ''}
      ${r.preferredDestination ? `<p><strong>Preferred Destination:</strong> ${escapeHtml(r.preferredDestination)}</p>` : ''}
      ${r.hotelType ? `<p><strong>Hotel Type:</strong> ${escapeHtml(r.hotelType)}</p>` : ''}
      ${r.activities && r.activities.length ? `<p><strong>Activities:</strong> ${r.activities.map(escapeHtml).join(', ')}</p>` : ''}
      ${r.specialRequests ? `<p><strong>Special Requests:</strong> ${escapeHtml(r.specialRequests)}</p>` : ''}
      <div class="admin-card" style="background:var(--card-bg, #fff);margin-top:0.6rem;">
        <h4 style="margin:0 0 0.6rem;">${r.quoteCreated ? 'Custom Quote' : 'Create a Custom Quote'}</h4>
        ${r.quoteCreated ? `<p class="status-pill approved" style="display:inline-block;">Quote Sent: $${escapeHtml(r.quotePrice)}</p>${r.quoteNotes ? `<p>${escapeHtml(r.quoteNotes)}</p>` : ''}` : ''}
        <div class="form-row-2">
          <div class="admin-form-group"><label>Quote Price ($)</label><input type="number" class="custom-quote-price-input" min="0" value="${escapeHtml(r.quotePrice || '')}"></div>
        </div>
        <div class="admin-form-group"><label>Quote Notes</label><textarea class="custom-quote-notes-input" rows="2">${escapeHtml(r.quoteNotes || '')}</textarea></div>
        <button type="button" class="admin-btn small create-custom-quote-btn">${r.quoteCreated ? 'Update Custom Quote' : 'Create Custom Quote'}</button>
        <span class="admin-note create-custom-quote-note"></span>
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No custom honeymoon requests yet — add one above.</p>';

  document.querySelectorAll('.delete-custom-honeymoon-request-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-request-id]').dataset.requestId);
      setVendorData('customHoneymoonRequests', getVendorData('customHoneymoonRequests', []).filter(r => r.id !== id));
      renderCustomHoneymoonPlanning();
    });
  });
  document.querySelectorAll('.create-custom-quote-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-request-id]');
      const id = Number(card.dataset.requestId);
      const requests = getVendorData('customHoneymoonRequests', []);
      const request = requests.find(r => r.id === id);
      if (!request) return;
      const price = card.querySelector('.custom-quote-price-input').value;
      if (!price) { alert('Please enter a quote price.'); return; }
      request.quotePrice = price;
      request.quoteNotes = card.querySelector('.custom-quote-notes-input').value.trim();
      request.quoteCreated = true;
      request.quoteTime = Date.now();
      setVendorData('customHoneymoonRequests', requests);
      const note = card.querySelector('.create-custom-quote-note');
      note.textContent = 'Saved.';
      setTimeout(() => { renderCustomHoneymoonPlanning(); }, 900);
    });
  });
}

document.getElementById('addCustomHoneymoonRequestBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('chpCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const requests = getVendorData('customHoneymoonRequests', []);
  requests.push({
    id: Date.now(),
    coupleName,
    budget: document.getElementById('chpBudget').value,
    couplePreference: document.getElementById('chpCouplePreference').value.trim(),
    travelStartDate: document.getElementById('chpTravelStartDate').value,
    travelEndDate: document.getElementById('chpTravelEndDate').value,
    preferredDestination: document.getElementById('chpPreferredDestination').value.trim(),
    hotelType: document.getElementById('chpHotelType').value.trim(),
    activities: splitList(document.getElementById('chpActivities').value),
    specialRequests: document.getElementById('chpSpecialRequests').value.trim(),
    quotePrice: '',
    quoteNotes: '',
    quoteCreated: false,
  });
  setVendorData('customHoneymoonRequests', requests);
  [
    'chpCoupleName', 'chpBudget', 'chpCouplePreference', 'chpTravelStartDate', 'chpTravelEndDate',
    'chpPreferredDestination', 'chpHotelType', 'chpActivities', 'chpSpecialRequests',
  ].forEach(id => document.getElementById(id).value = '');
  renderCustomHoneymoonPlanning();
});

// ===================================================================
// CUSTOMER MANAGEMENT (Honeymoon Agency only)
// ===================================================================
function renderHoneymoonClientManagement() {
  if (currentVendor.category !== 'Honeymoon Agency') return;

  const clients = getVendorData('honeymoonClients', []);
  const search = document.getElementById('honeymoonClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.coupleName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('honeymoonClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-honeymoon-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.coupleName)}</h4>
        <button type="button" class="admin-btn small danger delete-honeymoon-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Couple Name</label><input type="text" class="honeymoon-client-edit-field" data-field="coupleName" value="${escapeHtml(c.coupleName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="honeymoon-client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Travel Date</label><input type="date" class="honeymoon-client-edit-field" data-field="travelDate" value="${escapeHtml(c.travelDate || '')}"></div>
      <div class="admin-form-group"><label>Passport Information <span class="admin-hint" style="display:inline;">(optional — stored securely)</span></label><input type="text" class="honeymoon-client-edit-field" data-field="passportInfo" value="${escapeHtml(c.passportInfo || '')}"></div>
      <div class="admin-form-group"><label>Preferences &amp; Previous Trips</label><textarea class="honeymoon-client-edit-field" data-field="preferences" rows="2">${escapeHtml(c.preferences || '')}</textarea></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="honeymoon-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-honeymoon-client-btn">Save</button>
      <span class="admin-note save-honeymoon-client-note"></span>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No couple profiles match that search.' : 'No couple profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-honeymoon-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-honeymoon-client-id]').dataset.honeymoonClientId);
      setVendorData('honeymoonClients', getVendorData('honeymoonClients', []).filter(c => c.id !== id));
      renderHoneymoonClientManagement();
    });
  });
  document.querySelectorAll('.save-honeymoon-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-honeymoon-client-id]');
      const id = Number(card.dataset.honeymoonClientId);
      const clients = getVendorData('honeymoonClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.honeymoon-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('honeymoonClients', clients);
      const note = card.querySelector('.save-honeymoon-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('honeymoonClientSearchInput').addEventListener('input', renderHoneymoonClientManagement);

document.getElementById('addHoneymoonClientBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('honeymoonClientCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const clients = getVendorData('honeymoonClients', []);
  clients.push({
    id: Date.now(),
    coupleName,
    weddingDate: document.getElementById('honeymoonClientWeddingDate').value,
    travelDate: document.getElementById('honeymoonClientTravelDate').value,
    passportInfo: document.getElementById('honeymoonClientPassportInfo').value.trim(),
    preferences: document.getElementById('honeymoonClientPreferences').value.trim(),
    notes: document.getElementById('honeymoonClientNotes').value.trim(),
  });
  setVendorData('honeymoonClients', clients);
  [
    'honeymoonClientCoupleName', 'honeymoonClientWeddingDate', 'honeymoonClientTravelDate',
    'honeymoonClientPassportInfo', 'honeymoonClientPreferences', 'honeymoonClientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  renderHoneymoonClientManagement();
});

// ===================================================================
// DESIGN COLLECTION (Invitation Cards only)
// ===================================================================
let editingDesignId = null;
function cancelDesignEdit() {
  editingDesignId = null;
  ['designName', 'designAvailableFormats', 'designPaperType', 'designSizeOptions', 'designColorOptions', 'designCustomizationOptions'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addDesignBtn').textContent = 'Add Design';
  document.getElementById('cancelDesignEditBtn').classList.add('hidden');
}
document.getElementById('cancelDesignEditBtn').addEventListener('click', cancelDesignEdit);

function renderDesignCollection() {
  if (currentVendor.category !== 'Invitation Cards') return;

  document.getElementById('designCategory').innerHTML = DESIGN_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('designStyle').innerHTML = DESIGN_STYLES.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  const filterSelect = document.getElementById('designFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + DESIGN_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const designs = getVendorData('designs', []);
  const filter = filterSelect.value;
  const filtered = filter ? designs.filter(d => d.category === filter) : designs;

  document.getElementById('designCollectionList').innerHTML = filtered.slice().reverse().map(d => `
    <div class="admin-card" data-design-id="${d.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(d.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(d.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-design-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-design-btn">Delete</button>
        </span>
      </div>
      ${d.style ? `<p><strong>Style:</strong> ${escapeHtml(d.style)}</p>` : ''}
      ${d.availableFormats ? `<p><strong>Available Formats:</strong> ${escapeHtml(d.availableFormats)}</p>` : ''}
      ${d.paperType ? `<p><strong>Paper Type:</strong> ${escapeHtml(d.paperType)}</p>` : ''}
      ${d.sizeOptions ? `<p><strong>Size Options:</strong> ${escapeHtml(d.sizeOptions)}</p>` : ''}
      ${d.colorOptions ? `<p><strong>Color Options:</strong> ${escapeHtml(d.colorOptions)}</p>` : ''}
      ${d.customizationOptions ? `<p><strong>Customization Options:</strong> ${escapeHtml(d.customizationOptions)}</p>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos &amp; Videos</strong></p>
      <input type="file" class="design-media-input" accept="image/*,video/*" multiple>
      <div class="gallery-grid-vendor">
        ${(d.media || []).map((m, i) => `
          <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-design-media-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos or videos yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No designs in your collection yet — add one above.</p>';

  document.querySelectorAll('.edit-design-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-design-id]').dataset.designId);
      const design = getVendorData('designs', []).find(d => d.id === id);
      if (!design) return;
      editingDesignId = id;
      document.getElementById('designName').value = design.name || '';
      document.getElementById('designCategory').value = design.category || '';
      document.getElementById('designStyle').value = design.style || '';
      document.getElementById('designAvailableFormats').value = design.availableFormats || '';
      document.getElementById('designPaperType').value = design.paperType || '';
      document.getElementById('designSizeOptions').value = design.sizeOptions || '';
      document.getElementById('designColorOptions').value = design.colorOptions || '';
      document.getElementById('designCustomizationOptions').value = design.customizationOptions || '';
      document.getElementById('addDesignBtn').textContent = 'Save Changes';
      document.getElementById('cancelDesignEditBtn').classList.remove('hidden');
      const designNameEl = document.getElementById('designName'); if (designNameEl.scrollIntoView) designNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-design-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-design-id]').dataset.designId);
      setVendorData('designs', getVendorData('designs', []).filter(d => d.id !== id));
      if (editingDesignId === id) cancelDesignEdit();
      renderDesignCollection();
    });
  });
  document.querySelectorAll('.design-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-design-id]').dataset.designId);
      const designs = getVendorData('designs', []);
      const design = designs.find(d => d.id === id);
      if (!design) return;
      design.media = design.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          design.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/designs`) });
        } else {
          design.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/designs`) });
        }
      }
      setVendorData('designs', designs);
      renderDesignCollection();
    });
  });
  document.querySelectorAll('.remove-design-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-design-id]').dataset.designId);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const designs = getVendorData('designs', []);
      const design = designs.find(d => d.id === id);
      if (design) design.media.splice(i, 1);
      setVendorData('designs', designs);
      renderDesignCollection();
    });
  });
}

document.getElementById('designFilterCategory').addEventListener('change', renderDesignCollection);

document.getElementById('addDesignBtn').addEventListener('click', () => {
  const name = document.getElementById('designName').value.trim();
  if (!name) { alert('Please enter a design name.'); return; }
  const fields = {
    category: document.getElementById('designCategory').value,
    name,
    style: document.getElementById('designStyle').value,
    availableFormats: document.getElementById('designAvailableFormats').value.trim(),
    paperType: document.getElementById('designPaperType').value.trim(),
    sizeOptions: document.getElementById('designSizeOptions').value.trim(),
    colorOptions: document.getElementById('designColorOptions').value.trim(),
    customizationOptions: document.getElementById('designCustomizationOptions').value.trim(),
  };
  const designs = getVendorData('designs', []);
  if (editingDesignId) {
    const design = designs.find(d => d.id === editingDesignId);
    if (design) Object.assign(design, fields);
  } else {
    designs.push({ id: Date.now(), ...fields, media: [] });
  }
  setVendorData('designs', designs);
  cancelDesignEdit();
  renderDesignCollection();
});

// ===================================================================
// CUSTOMER MANAGEMENT (Invitation Cards only)
// ===================================================================
function renderInvitationClientManagement() {
  if (currentVendor.category !== 'Invitation Cards') return;

  const clients = getVendorData('invitationClients', []);
  const search = document.getElementById('invitationClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.coupleName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('invitationClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-invitation-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.coupleName)}</h4>
        <button type="button" class="admin-btn small danger delete-invitation-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Couple Name</label><input type="text" class="invitation-client-edit-field" data-field="coupleName" value="${escapeHtml(c.coupleName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="invitation-client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Guest Names</label><textarea class="invitation-client-edit-field" data-field="guestNames" rows="2">${escapeHtml(c.guestNames || '')}</textarea></div>
      <div class="admin-form-group"><label>Invitation Quantities</label><input type="text" class="invitation-client-edit-field" data-field="quantities" value="${escapeHtml(c.quantities || '')}"></div>
      <div class="admin-form-group"><label>Design Preferences</label><textarea class="invitation-client-edit-field" data-field="designPreferences" rows="2">${escapeHtml(c.designPreferences || '')}</textarea></div>
      <div class="admin-form-group"><label>Previous Orders</label><textarea class="invitation-client-edit-field" data-field="previousOrders" rows="2">${escapeHtml(c.previousOrders || '')}</textarea></div>
      <button type="button" class="admin-btn small save-invitation-client-btn">Save</button>
      <span class="admin-note save-invitation-client-note"></span>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No couple profiles match that search.' : 'No couple profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-invitation-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-invitation-client-id]').dataset.invitationClientId);
      setVendorData('invitationClients', getVendorData('invitationClients', []).filter(c => c.id !== id));
      renderInvitationClientManagement();
    });
  });
  document.querySelectorAll('.save-invitation-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-invitation-client-id]');
      const id = Number(card.dataset.invitationClientId);
      const clients = getVendorData('invitationClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.invitation-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('invitationClients', clients);
      const note = card.querySelector('.save-invitation-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('invitationClientSearchInput').addEventListener('input', renderInvitationClientManagement);

document.getElementById('addInvitationClientBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('invitationClientCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const clients = getVendorData('invitationClients', []);
  clients.push({
    id: Date.now(),
    coupleName,
    weddingDate: document.getElementById('invitationClientWeddingDate').value,
    guestNames: document.getElementById('invitationClientGuestNames').value.trim(),
    quantities: document.getElementById('invitationClientQuantities').value.trim(),
    designPreferences: document.getElementById('invitationClientDesignPreferences').value.trim(),
    previousOrders: document.getElementById('invitationClientPreviousOrders').value.trim(),
  });
  setVendorData('invitationClients', clients);
  [
    'invitationClientCoupleName', 'invitationClientWeddingDate', 'invitationClientGuestNames',
    'invitationClientQuantities', 'invitationClientDesignPreferences', 'invitationClientPreviousOrders',
  ].forEach(id => document.getElementById(id).value = '');
  renderInvitationClientManagement();
});

// ===================================================================
// DELIVERY MANAGEMENT (Invitation Cards only)
// ===================================================================
function renderDeliveryManagement() {
  if (currentVendor.category !== 'Invitation Cards') return;

  const deliveries = getVendorData('deliveries', []);
  document.getElementById('deliveriesList').innerHTML = deliveries.slice().reverse().map(d => `
    <div class="admin-card" data-delivery-id="${d.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(d.coupleName)} <span class="status-pill ${d.trackingStatus === 'Delivered' ? 'approved' : 'pending'}">${escapeHtml(d.trackingStatus)}</span></h4>
        <button type="button" class="admin-btn small danger delete-delivery-btn">Delete</button>
      </div>
      ${d.deliveryDate ? `<p><strong>Delivery Date:</strong> ${escapeHtml(d.deliveryDate)}</p>` : ''}
      ${d.deliveryAddress ? `<p><strong>Delivery Address:</strong> ${escapeHtml(d.deliveryAddress)}</p>` : ''}
      ${d.courierInfo ? `<p><strong>Courier Information:</strong> ${escapeHtml(d.courierInfo)}</p>` : ''}
      <div class="admin-form-group" style="margin-top:0.6rem;max-width:220px;">
        <label>Order Tracking</label>
        <select class="delivery-tracking-select">
          <option${d.trackingStatus === 'Preparing' ? ' selected' : ''}>Preparing</option>
          <option${d.trackingStatus === 'Out for Delivery' ? ' selected' : ''}>Out for Delivery</option>
          <option${d.trackingStatus === 'Delivered' ? ' selected' : ''}>Delivered</option>
        </select>
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No deliveries yet — add one above.</p>';

  document.querySelectorAll('.delete-delivery-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-delivery-id]').dataset.deliveryId);
      setVendorData('deliveries', getVendorData('deliveries', []).filter(d => d.id !== id));
      renderDeliveryManagement();
    });
  });
  document.querySelectorAll('.delivery-tracking-select').forEach(select => {
    select.addEventListener('change', () => {
      const id = Number(select.closest('[data-delivery-id]').dataset.deliveryId);
      const deliveries = getVendorData('deliveries', []);
      const delivery = deliveries.find(d => d.id === id);
      if (delivery) delivery.trackingStatus = select.value;
      setVendorData('deliveries', deliveries);
      renderDeliveryManagement();
    });
  });
}

document.getElementById('addDeliveryBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('deliveryCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple/order reference.'); return; }
  const deliveries = getVendorData('deliveries', []);
  deliveries.push({
    id: Date.now(),
    coupleName,
    deliveryDate: document.getElementById('deliveryDate').value,
    deliveryAddress: document.getElementById('deliveryAddress').value.trim(),
    courierInfo: document.getElementById('deliveryCourierInfo').value.trim(),
    trackingStatus: document.getElementById('deliveryTrackingStatus').value,
  });
  setVendorData('deliveries', deliveries);
  ['deliveryCoupleName', 'deliveryDate', 'deliveryAddress', 'deliveryCourierInfo'].forEach(id => document.getElementById(id).value = '');
  renderDeliveryManagement();
});

// ===================================================================
// SERVICE MANAGEMENT (Bridal Stylist only)
// ===================================================================
function renderServiceManagement() {
  if (currentVendor.category !== 'Bridal Stylist') return;

  const services = getVendorData('stylistServices', []);
  document.getElementById('stylistServicesList').innerHTML = services.map(s => `
    <div class="admin-card" data-service-id="${s.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(s.name)}</h4>
        <button type="button" class="admin-btn small danger delete-stylist-service-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Service Name</label><input type="text" class="stylist-service-edit-field" data-field="name" value="${escapeHtml(s.name || '')}"></div>
        <div class="admin-form-group"><label>Service Category</label><input type="text" class="stylist-service-edit-field" data-field="category" value="${escapeHtml(s.category || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Description</label><textarea class="stylist-service-edit-field" data-field="description" rows="2">${escapeHtml(s.description || '')}</textarea></div>
      <label class="amenity-item"><input type="checkbox" class="stylist-service-edit-home-available" ${s.homeAvailable ? 'checked' : ''}> Available as Home Service</label>
      <button type="button" class="admin-btn small save-stylist-service-btn" style="margin-top:0.6rem;">Save</button>
      <span class="admin-note save-stylist-service-note"></span>
    </div>
  `).join('') || '<p class="admin-empty">No services yet — add one above.</p>';

  document.querySelectorAll('.delete-stylist-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-service-id]').dataset.serviceId);
      setVendorData('stylistServices', getVendorData('stylistServices', []).filter(s => s.id !== id));
      renderServiceManagement();
    });
  });
  document.querySelectorAll('.save-stylist-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-service-id]');
      const id = Number(card.dataset.serviceId);
      const services = getVendorData('stylistServices', []);
      const service = services.find(s => s.id === id);
      if (!service) return;
      card.querySelectorAll('.stylist-service-edit-field').forEach(input => { service[input.dataset.field] = input.value.trim(); });
      service.homeAvailable = card.querySelector('.stylist-service-edit-home-available').checked;
      setVendorData('stylistServices', services);
      const note = card.querySelector('.save-stylist-service-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('addStylistServiceBtn').addEventListener('click', () => {
  const name = document.getElementById('stylistServiceName').value.trim();
  if (!name) { alert('Please enter a service name.'); return; }
  const services = getVendorData('stylistServices', []);
  services.push({
    id: Date.now(),
    name,
    category: document.getElementById('stylistServiceCategory').value.trim(),
    description: document.getElementById('stylistServiceDescription').value.trim(),
    homeAvailable: document.getElementById('stylistServiceHomeAvailable').checked,
  });
  setVendorData('stylistServices', services);
  ['stylistServiceName', 'stylistServiceCategory', 'stylistServiceDescription'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('stylistServiceHomeAvailable').checked = false;
  renderServiceManagement();
});

// ===================================================================
// PORTFOLIO (Bridal Stylist only): albums grouped by look category, a
// featured-work grid drawn from starred album photos, before/after
// transformation photos, and highlight-reel videos.
// ===================================================================
function renderBridalStylistPortfolio() {
  if (currentVendor.category !== 'Bridal Stylist') return;

  const albums = getVendorData('stylistAlbums', []);
  document.getElementById('stylistAlbumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-stylist-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(al.category)}</span></h4>
        <button type="button" class="admin-btn small danger delete-stylist-album-btn">Delete Album</button>
      </div>
      <input type="file" class="stylist-album-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((p, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${p.src}"><button type="button" class="toggle-stylist-featured-btn" title="${p.featured ? 'Remove from Featured Work' : 'Add to Featured Work'}">${p.featured ? '★' : '☆'}</button><button type="button" class="remove-stylist-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No albums yet — create one above.</p>';

  document.querySelectorAll('.delete-stylist-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-stylist-album-id]').dataset.stylistAlbumId);
      setVendorData('stylistAlbums', getVendorData('stylistAlbums', []).filter(a => a.id !== id));
      renderBridalStylistPortfolio();
    });
  });
  document.querySelectorAll('.stylist-album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-stylist-album-id]').dataset.stylistAlbumId);
      const albums = getVendorData('stylistAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        album.photos.push({ src: await uploadMedia(file, `vendors/${currentVendor.username}/stylistAlbums`), featured: false });
      }
      setVendorData('stylistAlbums', albums);
      renderBridalStylistPortfolio();
    });
  });
  document.querySelectorAll('.remove-stylist-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-stylist-album-id]').dataset.stylistAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('stylistAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('stylistAlbums', albums);
      renderBridalStylistPortfolio();
    });
  });
  document.querySelectorAll('.toggle-stylist-featured-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-stylist-album-id]').dataset.stylistAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('stylistAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album && album.photos[i]) album.photos[i].featured = !album.photos[i].featured;
      setVendorData('stylistAlbums', albums);
      renderBridalStylistPortfolio();
    });
  });

  const featured = albums.flatMap(al => (al.photos || []).filter(p => p.featured));
  document.getElementById('stylistFeaturedGrid').innerHTML = featured.map(p => `
    <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${p.src}"></div>
  `).join('') || '<p class="admin-empty">No featured work yet — star a photo in an album above.</p>';

  const beforeAfter = getVendorData('stylistBeforeAfter', []);
  document.getElementById('stylistBeforeAfterList').innerHTML = beforeAfter.length ? beforeAfter.map((ba, i) => `
    <div class="admin-card" data-i="${i}" style="background:var(--bg);">
      <div class="form-row-2">
        <div><p class="admin-hint" style="text-align:left;">Before</p><img loading="lazy" decoding="async" src="${ba.before}" style="width:100%;border-radius:8px;"></div>
        <div><p class="admin-hint" style="text-align:left;">After</p><img loading="lazy" decoding="async" src="${ba.after}" style="width:100%;border-radius:8px;"></div>
      </div>
      ${ba.label ? `<p style="margin-top:0.5rem;">${escapeHtml(ba.label)}</p>` : ''}
      <button type="button" class="admin-btn small danger remove-stylist-before-after-btn" style="margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') : '<p class="admin-empty">No before/after pairs yet.</p>';
  document.querySelectorAll('.remove-stylist-before-after-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = getVendorData('stylistBeforeAfter', []);
      list.splice(Number(btn.closest('[data-i]').dataset.i), 1);
      setVendorData('stylistBeforeAfter', list);
      renderBridalStylistPortfolio();
    });
  });

  const stylistVideos = getVendorData('stylistVideos', []);
  document.getElementById('stylistVideosGrid').innerHTML = stylistVideos.map((v, i) => `
    <div class="gallery-thumb"><video src="${v.src}" muted></video><button data-i="${i}" class="remove-stylist-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No videos yet.</p>';
  document.querySelectorAll('.remove-stylist-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const videos = getVendorData('stylistVideos', []);
      videos.splice(Number(btn.dataset.i), 1);
      setVendorData('stylistVideos', videos);
      renderBridalStylistPortfolio();
    });
  });
}

document.getElementById('createStylistAlbumBtn').addEventListener('click', () => {
  const input = document.getElementById('newStylistAlbumName');
  const name = input.value.trim();
  if (!name) { alert('Please enter an album name.'); return; }
  const albums = getVendorData('stylistAlbums', []);
  albums.push({ id: Date.now(), name, category: document.getElementById('newStylistAlbumCategory').value, photos: [] });
  setVendorData('stylistAlbums', albums);
  input.value = '';
  renderBridalStylistPortfolio();
});

document.getElementById('addStylistBeforeAfterBtn').addEventListener('click', async () => {
  const beforeFile = document.getElementById('stylistBeforeImageInput').files[0];
  const afterFile = document.getElementById('stylistAfterImageInput').files[0];
  if (!beforeFile || !afterFile) { alert('Please choose both a before and an after photo.'); return; }
  const list = getVendorData('stylistBeforeAfter', []);
  list.push({
    id: Date.now(),
    before: await uploadMedia(beforeFile, `vendors/${currentVendor.username}/stylistBeforeAfter`),
    after: await uploadMedia(afterFile, `vendors/${currentVendor.username}/stylistBeforeAfter`),
    label: document.getElementById('stylistBeforeAfterLabel').value.trim(),
  });
  setVendorData('stylistBeforeAfter', list);
  ['stylistBeforeImageInput', 'stylistAfterImageInput', 'stylistBeforeAfterLabel'].forEach(id => document.getElementById(id).value = '');
  renderBridalStylistPortfolio();
});

document.getElementById('stylistVideosInput').addEventListener('change', async (e) => {
  const videos = getVendorData('stylistVideos', []);
  for (const file of Array.from(e.target.files)) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
    videos.push({ id: Date.now() + Math.random(), src: await uploadMedia(file, `vendors/${currentVendor.username}/stylistVideos`) });
  }
  setVendorData('stylistVideos', videos);
  renderBridalStylistPortfolio();
});

// ===================================================================
// BRIDE PROFILES (Bridal Stylist only) — rich client profiles covering
// the couple's wedding-day look, with an inspiration-photo gallery per
// bride, uploaded after the profile exists.
// ===================================================================
function renderBrideProfiles() {
  if (currentVendor.category !== 'Bridal Stylist') return;

  const brides = getVendorData('brideProfiles', []);
  const search = document.getElementById('brideProfileSearchInput').value.trim().toLowerCase();
  const filtered = search ? brides.filter(b => (b.name || '').toLowerCase().includes(search)) : brides;

  document.getElementById('brideProfilesList').innerHTML = filtered.map(b => `
    <div class="admin-card" data-bride-id="${b.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(b.name)}</h4>
        <button type="button" class="admin-btn small danger delete-bride-profile-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Bride Info (Name)</label><input type="text" class="bride-profile-edit-field" data-field="name" value="${escapeHtml(b.name || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="bride-profile-edit-field" data-field="weddingDate" value="${escapeHtml(b.weddingDate || '')}"></div>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Venue</label><input type="text" class="bride-profile-edit-field" data-field="venue" value="${escapeHtml(b.venue || '')}"></div>
        <div class="admin-form-group"><label>Wedding Theme</label><input type="text" class="bride-profile-edit-field" data-field="theme" value="${escapeHtml(b.theme || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Dress Details</label><textarea class="bride-profile-edit-field" data-field="dressDetails" rows="2">${escapeHtml(b.dressDetails || '')}</textarea></div>
      <div class="admin-form-group"><label>Body Measurements</label><input type="text" class="bride-profile-edit-field" data-field="measurements" value="${escapeHtml(b.measurements || '')}"></div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Preferred Style</label><input type="text" class="bride-profile-edit-field" data-field="preferredStyle" value="${escapeHtml(b.preferredStyle || '')}"></div>
        <div class="admin-form-group"><label>Color Palette</label><input type="text" class="bride-profile-edit-field" data-field="colorPalette" value="${escapeHtml(b.colorPalette || '')}"></div>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Hair Preferences</label><input type="text" class="bride-profile-edit-field" data-field="hairPreferences" value="${escapeHtml(b.hairPreferences || '')}"></div>
        <div class="admin-form-group"><label>Makeup Preferences</label><input type="text" class="bride-profile-edit-field" data-field="makeupPreferences" value="${escapeHtml(b.makeupPreferences || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Accessories</label><input type="text" class="bride-profile-edit-field" data-field="accessories" value="${escapeHtml(b.accessories || '')}"></div>
      <div class="admin-form-group"><label>Budget</label><input type="text" class="bride-profile-edit-field" data-field="budget" value="${escapeHtml(b.budget || '')}"></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="bride-profile-edit-field" data-field="notes" rows="2">${escapeHtml(b.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-bride-profile-btn">Save</button>
      <span class="admin-note save-bride-profile-note"></span>
      <p style="margin-top:0.6rem;"><strong>Inspiration Photos</strong></p>
      <input type="file" class="bride-profile-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(b.inspirationPhotos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-bride-profile-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No inspiration photos yet.</p>'}
      </div>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No bride profiles match that search.' : 'No bride profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-bride-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-bride-id]').dataset.brideId);
      setVendorData('brideProfiles', getVendorData('brideProfiles', []).filter(b => b.id !== id));
      renderBrideProfiles();
    });
  });
  document.querySelectorAll('.save-bride-profile-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-bride-id]');
      const id = Number(card.dataset.brideId);
      const brides = getVendorData('brideProfiles', []);
      const bride = brides.find(b => b.id === id);
      if (!bride) return;
      card.querySelectorAll('.bride-profile-edit-field').forEach(input => { bride[input.dataset.field] = input.value.trim(); });
      setVendorData('brideProfiles', brides);
      const note = card.querySelector('.save-bride-profile-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
  document.querySelectorAll('.bride-profile-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-bride-id]').dataset.brideId);
      const brides = getVendorData('brideProfiles', []);
      const bride = brides.find(b => b.id === id);
      if (!bride) return;
      bride.inspirationPhotos = bride.inspirationPhotos || [];
      for (const file of Array.from(e.target.files)) {
        bride.inspirationPhotos.push(await uploadMedia(file, `vendors/${currentVendor.username}/brideProfiles`));
      }
      setVendorData('brideProfiles', brides);
      renderBrideProfiles();
    });
  });
  document.querySelectorAll('.remove-bride-profile-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-bride-id]').dataset.brideId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const brides = getVendorData('brideProfiles', []);
      const bride = brides.find(b => b.id === id);
      if (bride) bride.inspirationPhotos.splice(i, 1);
      setVendorData('brideProfiles', brides);
      renderBrideProfiles();
    });
  });
}

document.getElementById('brideProfileSearchInput').addEventListener('input', renderBrideProfiles);

document.getElementById('addBrideProfileBtn').addEventListener('click', () => {
  const name = document.getElementById('brideProfileName').value.trim();
  if (!name) { alert('Please enter the bride\'s name.'); return; }
  const brides = getVendorData('brideProfiles', []);
  brides.push({
    id: Date.now(),
    name,
    weddingDate: document.getElementById('brideProfileWeddingDate').value,
    venue: document.getElementById('brideProfileVenue').value.trim(),
    theme: document.getElementById('brideProfileTheme').value.trim(),
    dressDetails: document.getElementById('brideProfileDressDetails').value.trim(),
    measurements: document.getElementById('brideProfileMeasurements').value.trim(),
    preferredStyle: document.getElementById('brideProfilePreferredStyle').value.trim(),
    colorPalette: document.getElementById('brideProfileColorPalette').value.trim(),
    hairPreferences: document.getElementById('brideProfileHairPreferences').value.trim(),
    makeupPreferences: document.getElementById('brideProfileMakeupPreferences').value.trim(),
    accessories: document.getElementById('brideProfileAccessories').value.trim(),
    budget: document.getElementById('brideProfileBudget').value.trim(),
    notes: document.getElementById('brideProfileNotes').value.trim(),
    inspirationPhotos: [],
  });
  setVendorData('brideProfiles', brides);
  [
    'brideProfileName', 'brideProfileWeddingDate', 'brideProfileVenue', 'brideProfileTheme',
    'brideProfileDressDetails', 'brideProfileMeasurements', 'brideProfilePreferredStyle', 'brideProfileColorPalette',
    'brideProfileHairPreferences', 'brideProfileMakeupPreferences', 'brideProfileAccessories', 'brideProfileBudget', 'brideProfileNotes',
  ].forEach(id => document.getElementById(id).value = '');
  renderBrideProfiles();
});

// ===================================================================
// PERFORMANCE GALLERY (Zaffeh only) — past wedding performances grouped
// into albums, a starred "Customer Highlights" grid derived from those
// albums, and a general performance-video reel.
// ===================================================================
let editingZaffehAlbumId = null;
function cancelZaffehAlbumEdit() {
  editingZaffehAlbumId = null;
  document.getElementById('newZaffehAlbumName').value = '';
  document.getElementById('createZaffehAlbumBtn').textContent = 'Create Album';
  document.getElementById('cancelZaffehAlbumEditBtn').classList.add('hidden');
}
document.getElementById('cancelZaffehAlbumEditBtn').addEventListener('click', cancelZaffehAlbumEdit);

function renderZaffehGallery() {
  if (currentVendor.category !== 'Zaffeh') return;

  document.getElementById('newZaffehAlbumType').innerHTML = ZAFFEH_SERVICES.map(s => `<option>${escapeHtml(s)}</option>`).join('');

  const albums = getVendorData('zaffehAlbums', []);
  document.getElementById('zaffehAlbumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-zaffeh-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(al.type)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-zaffeh-album-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-zaffeh-album-btn">Delete Album</button>
        </span>
      </div>
      <input type="file" class="zaffeh-album-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((p, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${p.src}"><button type="button" class="toggle-zaffeh-highlight-btn" title="${p.featured ? 'Remove from Customer Highlights' : 'Add to Customer Highlights'}">${p.featured ? '★' : '☆'}</button><button type="button" class="remove-zaffeh-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos in this performance yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No previous performances yet — add one above.</p>';

  document.querySelectorAll('.edit-zaffeh-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-zaffeh-album-id]').dataset.zaffehAlbumId);
      const album = getVendorData('zaffehAlbums', []).find(a => a.id === id);
      if (!album) return;
      editingZaffehAlbumId = id;
      document.getElementById('newZaffehAlbumName').value = album.name || '';
      document.getElementById('newZaffehAlbumType').value = album.type || '';
      document.getElementById('createZaffehAlbumBtn').textContent = 'Save Changes';
      document.getElementById('cancelZaffehAlbumEditBtn').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.delete-zaffeh-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-zaffeh-album-id]').dataset.zaffehAlbumId);
      setVendorData('zaffehAlbums', getVendorData('zaffehAlbums', []).filter(a => a.id !== id));
      if (editingZaffehAlbumId === id) cancelZaffehAlbumEdit();
      renderZaffehGallery();
    });
  });
  document.querySelectorAll('.zaffeh-album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-zaffeh-album-id]').dataset.zaffehAlbumId);
      const albums = getVendorData('zaffehAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        album.photos.push({ src: await uploadMedia(file, `vendors/${currentVendor.username}/zaffehAlbums`), featured: false });
      }
      setVendorData('zaffehAlbums', albums);
      renderZaffehGallery();
    });
  });
  document.querySelectorAll('.remove-zaffeh-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-zaffeh-album-id]').dataset.zaffehAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('zaffehAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('zaffehAlbums', albums);
      renderZaffehGallery();
    });
  });
  document.querySelectorAll('.toggle-zaffeh-highlight-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-zaffeh-album-id]').dataset.zaffehAlbumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('zaffehAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album && album.photos[i]) album.photos[i].featured = !album.photos[i].featured;
      setVendorData('zaffehAlbums', albums);
      renderZaffehGallery();
    });
  });

  const highlights = albums.flatMap(al => (al.photos || []).filter(p => p.featured));
  document.getElementById('zaffehHighlightsGrid').innerHTML = highlights.map(p => `
    <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${p.src}"></div>
  `).join('') || '<p class="admin-empty">No customer highlights yet — star a photo in a performance above.</p>';

  const zaffehVideos = getVendorData('zaffehVideos', []);
  document.getElementById('zaffehVideosGrid').innerHTML = zaffehVideos.map((v, i) => `
    <div class="gallery-thumb"><video src="${v.src}" muted></video><button data-i="${i}" class="remove-zaffeh-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No videos yet.</p>';
  document.querySelectorAll('.remove-zaffeh-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const videos = getVendorData('zaffehVideos', []);
      videos.splice(Number(btn.dataset.i), 1);
      setVendorData('zaffehVideos', videos);
      renderZaffehGallery();
    });
  });
}

document.getElementById('createZaffehAlbumBtn').addEventListener('click', () => {
  const input = document.getElementById('newZaffehAlbumName');
  const name = input.value.trim();
  if (!name) { alert('Please enter an event or couple name.'); return; }
  const type = document.getElementById('newZaffehAlbumType').value;
  const albums = getVendorData('zaffehAlbums', []);
  if (editingZaffehAlbumId) {
    const album = albums.find(a => a.id === editingZaffehAlbumId);
    if (album) { album.name = name; album.type = type; }
  } else {
    albums.push({ id: Date.now(), name, type, photos: [] });
  }
  setVendorData('zaffehAlbums', albums);
  cancelZaffehAlbumEdit();
  renderZaffehGallery();
});

document.getElementById('zaffehVideosInput').addEventListener('change', async (e) => {
  const videos = getVendorData('zaffehVideos', []);
  for (const file of Array.from(e.target.files)) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
    videos.push({ id: Date.now() + Math.random(), src: await uploadMedia(file, `vendors/${currentVendor.username}/zaffehVideos`) });
  }
  setVendorData('zaffehVideos', videos);
  renderZaffehGallery();
});

// ===================================================================
// TEAM MANAGEMENT (Zaffeh only) — the performer roster (with an
// available/unavailable toggle for team availability) and an assignment
// view over upcoming confirmed bookings, doubling as the performance
// schedule.
// ===================================================================
let editingZaffehPerformerId = null;
function cancelZaffehPerformerEdit() {
  editingZaffehPerformerId = null;
  ['zaffehPerformerName', 'zaffehPerformerPhone'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addZaffehPerformerBtn').textContent = 'Add Performer';
  document.getElementById('cancelZaffehPerformerEditBtn').classList.add('hidden');
}
document.getElementById('cancelZaffehPerformerEditBtn').addEventListener('click', cancelZaffehPerformerEdit);

function renderZaffehTeam() {
  if (currentVendor.category !== 'Zaffeh') return;

  const performers = getVendorData('zaffehPerformers', []);
  document.getElementById('zaffehPerformersList').innerHTML = performers.map(p => `
    <div class="admin-card" data-performer-id="${p.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(p.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(p.role)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-zaffeh-performer-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-zaffeh-performer-btn">Delete</button>
        </span>
      </div>
      ${p.phone ? `<p class="admin-hint" style="text-align:left;">📞 ${escapeHtml(p.phone)}</p>` : ''}
      <label class="amenity-item"><input type="checkbox" class="zaffeh-performer-availability-check" ${p.available !== false ? 'checked' : ''}> Available</label>
    </div>
  `).join('') || '<p class="admin-empty">No performers added yet — add one above.</p>';

  document.querySelectorAll('.edit-zaffeh-performer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-performer-id]').dataset.performerId);
      const performer = getVendorData('zaffehPerformers', []).find(p => p.id === id);
      if (!performer) return;
      editingZaffehPerformerId = id;
      document.getElementById('zaffehPerformerName').value = performer.name || '';
      document.getElementById('zaffehPerformerRole').value = performer.role || '';
      document.getElementById('zaffehPerformerPhone').value = performer.phone || '';
      document.getElementById('addZaffehPerformerBtn').textContent = 'Save Changes';
      document.getElementById('cancelZaffehPerformerEditBtn').classList.remove('hidden');
    });
  });
  document.querySelectorAll('.delete-zaffeh-performer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-performer-id]').dataset.performerId);
      setVendorData('zaffehPerformers', getVendorData('zaffehPerformers', []).filter(p => p.id !== id));
      if (editingZaffehPerformerId === id) cancelZaffehPerformerEdit();
      renderZaffehTeam();
    });
  });
  document.querySelectorAll('.zaffeh-performer-availability-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = Number(cb.closest('[data-performer-id]').dataset.performerId);
      const list = getVendorData('zaffehPerformers', []);
      const p = list.find(x => x.id === id);
      if (p) p.available = cb.checked;
      setVendorData('zaffehPerformers', list);
    });
  });

  // Performance Schedule: upcoming confirmed bookings, each with a
  // performer-assignment checklist.
  const now = Date.now();
  const bookings = getVendorData('bookings', [])
    .filter(b => b.status === 'Confirmed' && b.date && new Date(b.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  document.getElementById('zaffehPerformanceScheduleList').innerHTML = bookings.map(b => `
    <div class="admin-card" data-booking-id="${b.id}" style="background:var(--bg);">
      <h4 style="margin:0 0 0.6rem;">${escapeHtml(b.coupleName)} — ${escapeHtml(b.date)}</h4>
      ${performers.length ? `
        <div class="amenity-grid">
          ${performers.map(p => `<label class="amenity-item"><input type="checkbox" value="${p.id}" class="zaffeh-assign-performer-check" ${(b.assignedPerformerIds || []).includes(p.id) ? 'checked' : ''}> ${escapeHtml(p.name)} (${escapeHtml(p.role)})</label>`).join('')}
        </div>
        <button type="button" class="admin-btn small save-zaffeh-assignment-btn" style="margin-top:0.6rem;">Save Assignment</button>
      ` : '<p class="admin-empty">Add performers above before assigning a team.</p>'}
    </div>
  `).join('') || '<p class="admin-empty">No upcoming confirmed bookings yet.</p>';

  document.querySelectorAll('.save-zaffeh-assignment-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-booking-id]');
      const id = Number(card.dataset.bookingId);
      const assignedIds = Array.from(card.querySelectorAll('.zaffeh-assign-performer-check:checked')).map(c => Number(c.value));
      const allBookings = getVendorData('bookings', []);
      const booking = allBookings.find(b => b.id === id);
      if (booking) booking.assignedPerformerIds = assignedIds;
      setVendorData('bookings', allBookings);
      btn.textContent = 'Saved!';
      setTimeout(() => { btn.textContent = 'Save Assignment'; }, 1500);
    });
  });
}

document.getElementById('addZaffehPerformerBtn').addEventListener('click', () => {
  const name = document.getElementById('zaffehPerformerName').value.trim();
  if (!name) { alert('Please enter the performer\'s name.'); return; }
  const fields = {
    name,
    role: document.getElementById('zaffehPerformerRole').value,
    phone: document.getElementById('zaffehPerformerPhone').value.trim(),
  };
  const performers = getVendorData('zaffehPerformers', []);
  if (editingZaffehPerformerId) {
    const performer = performers.find(p => p.id === editingZaffehPerformerId);
    if (performer) Object.assign(performer, fields);
  } else {
    performers.push({ id: Date.now(), ...fields, available: true });
  }
  setVendorData('zaffehPerformers', performers);
  cancelZaffehPerformerEdit();
  renderZaffehTeam();
});

// ===================================================================
// CAKE COLLECTION (Cake Designers only) — the product catalog: wedding
// cakes, cupcake towers, dessert tables and other designs, each with
// flavor/filling/decoration checklists and a price + availability status.
// ===================================================================
let editingCakeId = null;
function cancelCakeEdit() {
  editingCakeId = null;
  ['cakeName', 'cakeDescription', 'cakeTiers', 'cakeServes', 'cakePrice'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.cake-flavor-check, .cake-filling-check, .cake-decoration-style-check').forEach(cb => cb.checked = false);
  document.getElementById('addCakeBtn').textContent = 'Add Cake';
  document.getElementById('cancelCakeEditBtn').classList.add('hidden');
}
document.getElementById('cancelCakeEditBtn').addEventListener('click', cancelCakeEdit);

function renderCakeCollection() {
  if (currentVendor.category !== 'Cake Designers') return;

  document.getElementById('cakeCategory').innerHTML = CAKE_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('cakeAvailability').innerHTML = CAKE_AVAILABILITY_STATUSES.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  document.getElementById('cakeFlavorsGrid').innerHTML = CAKE_FLAVORS.map(f => `
    <label class="amenity-item"><input type="checkbox" value="${f}" class="cake-flavor-check"> ${f}</label>
  `).join('');
  document.getElementById('cakeFillingsGrid').innerHTML = CAKE_FILLINGS.map(f => `
    <label class="amenity-item"><input type="checkbox" value="${f}" class="cake-filling-check"> ${f}</label>
  `).join('');
  document.getElementById('cakeDecorationStylesGrid').innerHTML = CAKE_DECORATION_STYLES.map(s => `
    <label class="amenity-item"><input type="checkbox" value="${s}" class="cake-decoration-style-check"> ${s}</label>
  `).join('');

  const filterSelect = document.getElementById('cakeFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + CAKE_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const cakes = getVendorData('cakes', []);
  const filter = filterSelect.value;
  const filtered = filter ? cakes.filter(c => c.category === filter) : cakes;

  document.getElementById('cakeCollectionList').innerHTML = filtered.slice().reverse().map(c => `
    <div class="admin-card" data-cake-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(c.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-cake-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-cake-btn">Delete</button>
        </span>
      </div>
      ${c.description ? `<p>${escapeHtml(c.description)}</p>` : ''}
      <div class="amenity-tags">
        <span class="status-pill ${itemStatusPillClass(c.availability)}">${escapeHtml(c.availability)}</span>
        ${c.price ? `<span class="amenity-tag">$${escapeHtml(c.price)}</span>` : ''}
      </div>
      ${c.tiers ? `<p><strong>Tiers:</strong> ${escapeHtml(c.tiers)}</p>` : ''}
      ${c.serves ? `<p><strong>Serves:</strong> ${escapeHtml(c.serves)} guests</p>` : ''}
      ${c.flavors && c.flavors.length ? `<p><strong>Flavors:</strong> ${c.flavors.map(escapeHtml).join(', ')}</p>` : ''}
      ${c.fillings && c.fillings.length ? `<p><strong>Fillings:</strong> ${c.fillings.map(escapeHtml).join(', ')}</p>` : ''}
      ${c.decorationStyles && c.decorationStyles.length ? `<p><strong>Decoration Style:</strong> ${c.decorationStyles.map(escapeHtml).join(', ')}</p>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos &amp; Videos</strong></p>
      <input type="file" class="cake-media-input" accept="image/*,video/*" multiple>
      <div class="gallery-grid-vendor">
        ${(c.media || []).map((m, i) => `
          <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-cake-media-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos or videos yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No cakes in the collection yet — add one above.</p>';

  document.querySelectorAll('.edit-cake-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-cake-id]').dataset.cakeId);
      const cake = getVendorData('cakes', []).find(c => c.id === id);
      if (!cake) return;
      editingCakeId = id;
      document.getElementById('cakeName').value = cake.name || '';
      document.getElementById('cakeCategory').value = cake.category || '';
      document.getElementById('cakeDescription').value = cake.description || '';
      document.getElementById('cakeTiers').value = cake.tiers || '';
      document.getElementById('cakeServes').value = cake.serves || '';
      document.getElementById('cakePrice').value = cake.price || '';
      document.getElementById('cakeAvailability').value = cake.availability || '';
      document.querySelectorAll('.cake-flavor-check').forEach(cb => cb.checked = (cake.flavors || []).includes(cb.value));
      document.querySelectorAll('.cake-filling-check').forEach(cb => cb.checked = (cake.fillings || []).includes(cb.value));
      document.querySelectorAll('.cake-decoration-style-check').forEach(cb => cb.checked = (cake.decorationStyles || []).includes(cb.value));
      document.getElementById('addCakeBtn').textContent = 'Save Changes';
      document.getElementById('cancelCakeEditBtn').classList.remove('hidden');
      const cakeNameEl = document.getElementById('cakeName'); if (cakeNameEl.scrollIntoView) cakeNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-cake-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-cake-id]').dataset.cakeId);
      setVendorData('cakes', getVendorData('cakes', []).filter(c => c.id !== id));
      if (editingCakeId === id) cancelCakeEdit();
      renderCakeCollection();
    });
  });
  document.querySelectorAll('.cake-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-cake-id]').dataset.cakeId);
      const cakes = getVendorData('cakes', []);
      const cake = cakes.find(c => c.id === id);
      if (!cake) return;
      cake.media = cake.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          cake.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/cakes`) });
        } else {
          cake.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/cakes`) });
        }
      }
      setVendorData('cakes', cakes);
      renderCakeCollection();
    });
  });
  document.querySelectorAll('.remove-cake-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-cake-id]').dataset.cakeId);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const cakes = getVendorData('cakes', []);
      const cake = cakes.find(c => c.id === id);
      if (cake) cake.media.splice(i, 1);
      setVendorData('cakes', cakes);
      renderCakeCollection();
    });
  });
}

document.getElementById('cakeFilterCategory').addEventListener('change', renderCakeCollection);

document.getElementById('addCakeBtn').addEventListener('click', () => {
  const name = document.getElementById('cakeName').value.trim();
  if (!name) { alert('Please enter a cake name.'); return; }
  const fields = {
    name,
    category: document.getElementById('cakeCategory').value,
    description: document.getElementById('cakeDescription').value.trim(),
    tiers: document.getElementById('cakeTiers').value,
    serves: document.getElementById('cakeServes').value,
    flavors: Array.from(document.querySelectorAll('.cake-flavor-check:checked')).map(c => c.value),
    fillings: Array.from(document.querySelectorAll('.cake-filling-check:checked')).map(c => c.value),
    decorationStyles: Array.from(document.querySelectorAll('.cake-decoration-style-check:checked')).map(c => c.value),
    price: document.getElementById('cakePrice').value,
    availability: document.getElementById('cakeAvailability').value,
  };
  const cakes = getVendorData('cakes', []);
  if (editingCakeId) {
    const cake = cakes.find(c => c.id === editingCakeId);
    if (cake) Object.assign(cake, fields);
  } else {
    cakes.push({ id: Date.now(), ...fields, media: [] });
  }
  setVendorData('cakes', cakes);
  cancelCakeEdit();
  renderCakeCollection();
});

// ===================================================================
// FOOD & BEVERAGE MENU (Restaurants only) — a dish catalog grouped by
// category (appetizers, mains, desserts, drinks, couple/vegetarian/kids
// menus), each with its own picture and ingredients list.
// ===================================================================
let editingDishId = null;
function cancelDishEdit() {
  editingDishId = null;
  ['dishName', 'dishIngredients'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addDishBtn').textContent = 'Add Dish';
  document.getElementById('cancelDishEditBtn').classList.add('hidden');
}
document.getElementById('cancelDishEditBtn').addEventListener('click', cancelDishEdit);

function renderRestaurantMenu() {
  if (currentVendor.category !== 'Restaurants') return;

  document.getElementById('restaurantMenuCategory').innerHTML = RESTAURANT_MENU_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  const filterSelect = document.getElementById('restaurantMenuFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + RESTAURANT_MENU_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const dishes = getVendorData('restaurantMenu', []);
  const filter = filterSelect.value;
  const filtered = filter ? dishes.filter(d => d.category === filter) : dishes;

  document.getElementById('restaurantMenuList').innerHTML = filtered.slice().reverse().map(d => `
    <div class="admin-card" data-dish-id="${d.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(d.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(d.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-dish-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-dish-btn">Delete</button>
        </span>
      </div>
      ${d.picture ? `<img loading="lazy" decoding="async" src="${d.picture}" style="max-width:160px;border-radius:8px;display:block;margin-bottom:0.5rem;">` : ''}
      ${d.ingredients ? `<p><strong>Ingredients:</strong> ${escapeHtml(d.ingredients)}</p>` : ''}
      <p style="margin-top:0.4rem;"><strong>Picture</strong></p>
      <input type="file" class="dish-picture-input" accept="image/*">
    </div>
  `).join('') || '<p class="admin-empty">No dishes on the menu yet — add one above.</p>';

  document.querySelectorAll('.edit-dish-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-dish-id]').dataset.dishId);
      const dish = getVendorData('restaurantMenu', []).find(d => d.id === id);
      if (!dish) return;
      editingDishId = id;
      document.getElementById('dishName').value = dish.name || '';
      document.getElementById('restaurantMenuCategory').value = dish.category || '';
      document.getElementById('dishIngredients').value = dish.ingredients || '';
      document.getElementById('addDishBtn').textContent = 'Save Changes';
      document.getElementById('cancelDishEditBtn').classList.remove('hidden');
      const dishNameEl = document.getElementById('dishName'); if (dishNameEl.scrollIntoView) dishNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-dish-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-dish-id]').dataset.dishId);
      setVendorData('restaurantMenu', getVendorData('restaurantMenu', []).filter(d => d.id !== id));
      if (editingDishId === id) cancelDishEdit();
      renderRestaurantMenu();
    });
  });
  document.querySelectorAll('.dish-picture-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-dish-id]').dataset.dishId);
      const file = e.target.files[0];
      if (!file) return;
      const dishes = getVendorData('restaurantMenu', []);
      const dish = dishes.find(d => d.id === id);
      if (!dish) return;
      dish.picture = await uploadMedia(file, `vendors/${currentVendor.username}/restaurantMenu`);
      setVendorData('restaurantMenu', dishes);
      renderRestaurantMenu();
    });
  });
}

document.getElementById('restaurantMenuFilterCategory').addEventListener('change', renderRestaurantMenu);

document.getElementById('addDishBtn').addEventListener('click', () => {
  const name = document.getElementById('dishName').value.trim();
  if (!name) { alert('Please enter a dish name.'); return; }
  const fields = {
    name,
    category: document.getElementById('restaurantMenuCategory').value,
    ingredients: document.getElementById('dishIngredients').value.trim(),
  };
  const dishes = getVendorData('restaurantMenu', []);
  if (editingDishId) {
    const dish = dishes.find(d => d.id === editingDishId);
    if (dish) Object.assign(dish, fields);
  } else {
    dishes.push({ id: Date.now(), ...fields, picture: '' });
  }
  setVendorData('restaurantMenu', dishes);
  cancelDishEdit();
  renderRestaurantMenu();
});

// ===================================================================
// ENTERTAINMENT SERVICES CATALOG (Wedding Entertainment only) — individual
// bookable acts/activities (Face Painting, Magic Show, Photo Booth, etc.)
// with the structured details couples need to decide: duration, age group,
// how many performers show up, and what equipment is included.
// ===================================================================
let editingEntServiceId = null;
function cancelEntServiceEdit() {
  editingEntServiceId = null;
  ['entServiceName', 'entServiceDescription', 'entServiceDuration', 'entServiceNumPerformers', 'entServiceEquipment'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('addEntServiceBtn').textContent = 'Add Service';
  document.getElementById('cancelEntServiceEditBtn').classList.add('hidden');
}
document.getElementById('cancelEntServiceEditBtn').addEventListener('click', cancelEntServiceEdit);

function renderEntertainmentServices() {
  if (currentVendor.category !== 'Wedding Entertainment') return;

  document.getElementById('entServiceType').innerHTML = ENTERTAINMENT_SERVICE_TYPES.map(t => `<option>${escapeHtml(t)}</option>`).join('');
  document.getElementById('entServiceAgeGroup').innerHTML = ENTERTAINMENT_AGE_GROUPS.map(a => `<option>${escapeHtml(a)}</option>`).join('');

  const filterSelect = document.getElementById('entertainmentServicesFilterType');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Types</option>' + ENTERTAINMENT_SERVICE_TYPES.map(t => `<option>${escapeHtml(t)}</option>`).join('');
  filterSelect.value = previousFilter;

  const services = getVendorData('entertainmentServices', []);
  const filter = filterSelect.value;
  const filtered = filter ? services.filter(s => s.type === filter) : services;

  document.getElementById('entertainmentServicesList').innerHTML = filtered.slice().reverse().map(s => `
    <div class="admin-card" data-ent-service-id="${s.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(s.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(s.type)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-ent-service-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-ent-service-btn">Delete</button>
        </span>
      </div>
      ${s.picture ? `<img loading="lazy" decoding="async" src="${s.picture}" style="max-width:160px;border-radius:8px;display:block;margin-bottom:0.5rem;">` : ''}
      ${s.description ? `<p>${escapeHtml(s.description)}</p>` : ''}
      <p class="admin-hint" style="text-align:left;">
        ${s.duration ? `⏱️ ${escapeHtml(s.duration)}` : ''} ${s.ageGroup ? `· 👪 ${escapeHtml(s.ageGroup)}` : ''} ${s.numberOfPerformers ? `· 🧑‍🎤 ${escapeHtml(s.numberOfPerformers)} performer${Number(s.numberOfPerformers) === 1 ? '' : 's'}` : ''}
      </p>
      ${s.equipmentIncluded ? `<p><strong>Equipment Included:</strong> ${escapeHtml(s.equipmentIncluded)}</p>` : ''}
      <p style="margin-top:0.4rem;"><strong>Picture</strong></p>
      <input type="file" class="ent-service-picture-input" accept="image/*">
    </div>
  `).join('') || '<p class="admin-empty">No entertainment services added yet — add one above.</p>';

  document.querySelectorAll('.edit-ent-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-ent-service-id]').dataset.entServiceId);
      const service = getVendorData('entertainmentServices', []).find(s => s.id === id);
      if (!service) return;
      editingEntServiceId = id;
      document.getElementById('entServiceName').value = service.name || '';
      document.getElementById('entServiceType').value = service.type || '';
      document.getElementById('entServiceDescription').value = service.description || '';
      document.getElementById('entServiceDuration').value = service.duration || '';
      document.getElementById('entServiceAgeGroup').value = service.ageGroup || '';
      document.getElementById('entServiceNumPerformers').value = service.numberOfPerformers || '';
      document.getElementById('entServiceEquipment').value = service.equipmentIncluded || '';
      document.getElementById('addEntServiceBtn').textContent = 'Save Changes';
      document.getElementById('cancelEntServiceEditBtn').classList.remove('hidden');
      const entServiceNameEl = document.getElementById('entServiceName'); if (entServiceNameEl.scrollIntoView) entServiceNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-ent-service-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-ent-service-id]').dataset.entServiceId);
      setVendorData('entertainmentServices', getVendorData('entertainmentServices', []).filter(s => s.id !== id));
      if (editingEntServiceId === id) cancelEntServiceEdit();
      renderEntertainmentServices();
    });
  });
  document.querySelectorAll('.ent-service-picture-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-ent-service-id]').dataset.entServiceId);
      const file = e.target.files[0];
      if (!file) return;
      const services = getVendorData('entertainmentServices', []);
      const service = services.find(s => s.id === id);
      if (!service) return;
      service.picture = await uploadMedia(file, `vendors/${currentVendor.username}/entertainmentServices`);
      setVendorData('entertainmentServices', services);
      renderEntertainmentServices();
    });
  });
}

document.getElementById('entertainmentServicesFilterType').addEventListener('change', renderEntertainmentServices);

document.getElementById('addEntServiceBtn').addEventListener('click', () => {
  const name = document.getElementById('entServiceName').value.trim();
  if (!name) { alert('Please enter a service name.'); return; }
  const fields = {
    name,
    type: document.getElementById('entServiceType').value,
    description: document.getElementById('entServiceDescription').value.trim(),
    duration: document.getElementById('entServiceDuration').value.trim(),
    ageGroup: document.getElementById('entServiceAgeGroup').value,
    numberOfPerformers: document.getElementById('entServiceNumPerformers').value,
    equipmentIncluded: document.getElementById('entServiceEquipment').value.trim(),
  };
  const services = getVendorData('entertainmentServices', []);
  if (editingEntServiceId) {
    const service = services.find(s => s.id === editingEntServiceId);
    if (service) Object.assign(service, fields);
  } else {
    services.push({ id: Date.now(), ...fields, picture: '' });
  }
  setVendorData('entertainmentServices', services);
  cancelEntServiceEdit();
  renderEntertainmentServices();
});

// ===================================================================
// GALLERY (Wedding Entertainment only) — photo albums, highlight-reel &
// customer-reaction videos, and a showcase of previous events performed.
// ===================================================================
document.getElementById('createEntertainmentAlbumBtn').addEventListener('click', () => {
  const name = document.getElementById('newEntertainmentAlbumName').value.trim();
  if (!name) { alert('Please enter an album name.'); return; }
  const albums = getVendorData('entertainmentAlbums', []);
  albums.push({ id: Date.now(), name, photos: [] });
  setVendorData('entertainmentAlbums', albums);
  document.getElementById('newEntertainmentAlbumName').value = '';
  renderEntertainmentGallery();
});

function renderEntertainmentGallery() {
  if (currentVendor.category !== 'Wedding Entertainment') return;

  const albums = getVendorData('entertainmentAlbums', []);
  document.getElementById('entertainmentAlbumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)}</h4>
        <button type="button" class="admin-btn small danger delete-entertainment-album-btn">Delete Album</button>
      </div>
      <input type="file" class="entertainment-album-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((p, i) => `
          <div class="gallery-thumb" data-photo-i="${i}">
            <img loading="lazy" decoding="async" src="${p.src}">
            <label style="display:block;font-size:0.7rem;"><input type="checkbox" class="entertainment-featured-check" ${p.featured ? 'checked' : ''}> Featured</label>
            <button type="button" class="remove-entertainment-photo-btn">✕</button>
          </div>
        `).join('') || '<p class="admin-empty">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No albums yet — create one above.</p>';

  document.querySelectorAll('.delete-entertainment-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-album-id]').dataset.albumId);
      setVendorData('entertainmentAlbums', getVendorData('entertainmentAlbums', []).filter(a => a.id !== id));
      renderEntertainmentGallery();
    });
  });
  document.querySelectorAll('.entertainment-album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-album-id]').dataset.albumId);
      const albums = getVendorData('entertainmentAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        album.photos.push({ src: await uploadMedia(file, `vendors/${currentVendor.username}/entertainmentAlbums`), featured: false });
      }
      setVendorData('entertainmentAlbums', albums);
      renderEntertainmentGallery();
    });
  });
  document.querySelectorAll('.remove-entertainment-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-album-id]').dataset.albumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('entertainmentAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('entertainmentAlbums', albums);
      renderEntertainmentGallery();
    });
  });
  document.querySelectorAll('.entertainment-featured-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = Number(cb.closest('[data-album-id]').dataset.albumId);
      const i = Number(cb.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('entertainmentAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album && album.photos[i]) album.photos[i].featured = cb.checked;
      setVendorData('entertainmentAlbums', albums);
    });
  });

  const videos = getVendorData('entertainmentVideos', []);
  document.getElementById('entertainmentVideosGrid').innerHTML = videos.map((v, i) => `
    <div class="gallery-thumb" data-video-i="${i}"><video src="${v.src}" muted></video><button type="button" class="remove-entertainment-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No videos yet.</p>';
  document.querySelectorAll('.remove-entertainment-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const i = Number(btn.closest('[data-video-i]').dataset.videoI);
      const videos = getVendorData('entertainmentVideos', []);
      videos.splice(i, 1);
      setVendorData('entertainmentVideos', videos);
      renderEntertainmentGallery();
    });
  });

  renderEntertainmentPreviousEvents();
}

document.getElementById('entertainmentVideosInput').addEventListener('change', async (e) => {
  const videos = getVendorData('entertainmentVideos', []);
  for (const file of Array.from(e.target.files)) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
    videos.push({ src: await uploadMedia(file, `vendors/${currentVendor.username}/entertainmentVideos`) });
  }
  setVendorData('entertainmentVideos', videos);
  e.target.value = '';
  renderEntertainmentGallery();
});

// Previous Events — a showcase of parties/weddings this vendor has
// performed at, mirroring the Florist "Previous Wedding Projects" tool.
function renderEntertainmentPreviousEvents() {
  const events = getVendorData('entertainmentPreviousEvents', []);
  document.getElementById('entertainmentPreviousEventsList').innerHTML = events.map(ev => `
    <div class="admin-card" data-event-id="${ev.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(ev.title)}</h4>
        <button type="button" class="admin-btn small danger delete-entertainment-event-btn">Delete Event</button>
      </div>
      <p class="admin-hint" style="text-align:left;">
        ${ev.venue ? `📍 ${escapeHtml(ev.venue)}` : ''} ${ev.date ? `· ${escapeHtml(ev.date)}` : ''}
      </p>
      ${ev.description ? `<p style="color:#555;">${escapeHtml(ev.description)}</p>` : ''}
      <input type="file" class="entertainment-event-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(ev.photos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-entertainment-event-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos added yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No previous events yet — add one above.</p>';

  document.querySelectorAll('.delete-entertainment-event-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-event-id]').dataset.eventId);
      setVendorData('entertainmentPreviousEvents', getVendorData('entertainmentPreviousEvents', []).filter(ev => ev.id !== id));
      renderEntertainmentPreviousEvents();
    });
  });
  document.querySelectorAll('.entertainment-event-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-event-id]').dataset.eventId);
      const events = getVendorData('entertainmentPreviousEvents', []);
      const event = events.find(ev => ev.id === id);
      if (!event) return;
      event.photos = event.photos || [];
      for (const file of Array.from(e.target.files)) {
        event.photos.push(await uploadMedia(file, `vendors/${currentVendor.username}/entertainmentPreviousEvents`));
      }
      setVendorData('entertainmentPreviousEvents', events);
      renderEntertainmentPreviousEvents();
    });
  });
  document.querySelectorAll('.remove-entertainment-event-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-event-id]').dataset.eventId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const events = getVendorData('entertainmentPreviousEvents', []);
      const event = events.find(ev => ev.id === id);
      if (event) event.photos.splice(i, 1);
      setVendorData('entertainmentPreviousEvents', events);
      renderEntertainmentPreviousEvents();
    });
  });
}

document.getElementById('addEntertainmentEventBtn').addEventListener('click', () => {
  const title = document.getElementById('entertainmentEventTitle').value.trim();
  if (!title) { alert('Please enter an event title.'); return; }
  const events = getVendorData('entertainmentPreviousEvents', []);
  events.push({
    id: Date.now(),
    title,
    venue: document.getElementById('entertainmentEventVenue').value.trim(),
    date: document.getElementById('entertainmentEventDate').value,
    description: document.getElementById('entertainmentEventDescription').value.trim(),
    photos: [],
  });
  setVendorData('entertainmentPreviousEvents', events);
  ['entertainmentEventTitle', 'entertainmentEventVenue', 'entertainmentEventDate', 'entertainmentEventDescription'].forEach(id => document.getElementById(id).value = '');
  renderEntertainmentPreviousEvents();
});

// ===================================================================
// CUSTOMER MANAGEMENT (Wedding Entertainment only)
// ===================================================================
function renderEntertainmentClientManagement() {
  if (currentVendor.category !== 'Wedding Entertainment') return;

  const clients = getVendorData('entertainmentClients', []);
  const search = document.getElementById('entertainmentClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.coupleName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('entertainmentClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-ent-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.coupleName)}</h4>
        <button type="button" class="admin-btn small danger delete-ent-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Couple / Host Name</label><input type="text" class="ent-client-edit-field" data-field="coupleName" value="${escapeHtml(c.coupleName || '')}"></div>
        <div class="admin-form-group"><label>Event Date</label><input type="date" class="ent-client-edit-field" data-field="eventDate" value="${escapeHtml(c.eventDate || '')}"></div>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Event Location</label><input type="text" class="ent-client-edit-field" data-field="eventLocation" value="${escapeHtml(c.eventLocation || '')}"></div>
        <div class="admin-form-group"><label>Service Booked</label><input type="text" class="ent-client-edit-field" data-field="serviceBooked" value="${escapeHtml(c.serviceBooked || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Notes</label><textarea class="ent-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-ent-client-btn">Save</button>
      <span class="admin-note save-ent-client-note"></span>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No customers match that search.' : 'No customers yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-ent-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-ent-client-id]').dataset.entClientId);
      setVendorData('entertainmentClients', getVendorData('entertainmentClients', []).filter(c => c.id !== id));
      renderEntertainmentClientManagement();
    });
  });
  document.querySelectorAll('.save-ent-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-ent-client-id]');
      const id = Number(card.dataset.entClientId);
      const clients = getVendorData('entertainmentClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.ent-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('entertainmentClients', clients);
      const note = card.querySelector('.save-ent-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('entertainmentClientSearchInput').addEventListener('input', renderEntertainmentClientManagement);

document.getElementById('addEntClientBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('entClientCoupleName').value.trim();
  if (!coupleName) { alert('Please enter a name.'); return; }
  const clients = getVendorData('entertainmentClients', []);
  clients.push({
    id: Date.now(),
    coupleName,
    eventDate: document.getElementById('entClientEventDate').value,
    eventLocation: document.getElementById('entClientEventLocation').value.trim(),
    serviceBooked: document.getElementById('entClientServiceBooked').value.trim(),
    notes: '',
  });
  setVendorData('entertainmentClients', clients);
  ['entClientCoupleName', 'entClientEventDate', 'entClientEventLocation', 'entClientServiceBooked'].forEach(id => document.getElementById(id).value = '');
  renderEntertainmentClientManagement();
});

// ===================================================================
// CUSTOMER MANAGEMENT (Cake Designers only) — couple profiles with wedding
// details and cake preferences, plus a per-couple inspiration-photo
// gallery uploaded after the profile exists.
// ===================================================================
function renderCakeClientManagement() {
  if (currentVendor.category !== 'Cake Designers') return;

  const clients = getVendorData('cakeClients', []);
  const search = document.getElementById('cakeClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.coupleName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('cakeClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-cake-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.coupleName)}</h4>
        <button type="button" class="admin-btn small danger delete-cake-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Couple Name</label><input type="text" class="cake-client-edit-field" data-field="coupleName" value="${escapeHtml(c.coupleName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="cake-client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Venue Location</label><input type="text" class="cake-client-edit-field" data-field="venueLocation" value="${escapeHtml(c.venueLocation || '')}"></div>
        <div class="admin-form-group"><label>Guest Count</label><input type="number" class="cake-client-edit-field" data-field="guestCount" value="${escapeHtml(c.guestCount || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Cake Preferences</label><textarea class="cake-client-edit-field" data-field="preferences" rows="2">${escapeHtml(c.preferences || '')}</textarea></div>
      <div class="admin-form-group"><label>Allergies &amp; Dietary Requirements</label><input type="text" class="cake-client-edit-field" data-field="allergies" value="${escapeHtml(c.allergies || '')}"></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="cake-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-cake-client-btn">Save</button>
      <span class="admin-note save-cake-client-note"></span>
      <p style="margin-top:0.6rem;"><strong>Inspiration Photos</strong></p>
      <input type="file" class="cake-client-photo-input" accept="image/*" multiple>
      <div class="gallery-grid-vendor">
        ${(c.inspirationPhotos || []).map((src, i) => `
          <div class="gallery-thumb" data-photo-i="${i}"><img loading="lazy" decoding="async" src="${src}"><button type="button" class="remove-cake-client-photo-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No inspiration photos yet.</p>'}
      </div>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No couple profiles match that search.' : 'No couple profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-cake-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-cake-client-id]').dataset.cakeClientId);
      setVendorData('cakeClients', getVendorData('cakeClients', []).filter(c => c.id !== id));
      renderCakeClientManagement();
    });
  });
  document.querySelectorAll('.save-cake-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-cake-client-id]');
      const id = Number(card.dataset.cakeClientId);
      const clients = getVendorData('cakeClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.cake-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('cakeClients', clients);
      const note = card.querySelector('.save-cake-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
  document.querySelectorAll('.cake-client-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-cake-client-id]').dataset.cakeClientId);
      const clients = getVendorData('cakeClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      client.inspirationPhotos = client.inspirationPhotos || [];
      for (const file of Array.from(e.target.files)) {
        client.inspirationPhotos.push(await uploadMedia(file, `vendors/${currentVendor.username}/cakeClients`));
      }
      setVendorData('cakeClients', clients);
      renderCakeClientManagement();
    });
  });
  document.querySelectorAll('.remove-cake-client-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-cake-client-id]').dataset.cakeClientId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const clients = getVendorData('cakeClients', []);
      const client = clients.find(c => c.id === id);
      if (client) client.inspirationPhotos.splice(i, 1);
      setVendorData('cakeClients', clients);
      renderCakeClientManagement();
    });
  });
}

document.getElementById('cakeClientSearchInput').addEventListener('input', renderCakeClientManagement);

document.getElementById('addCakeClientBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('cakeClientCoupleName').value.trim();
  if (!coupleName) { alert('Please enter the couple\'s name.'); return; }
  const clients = getVendorData('cakeClients', []);
  clients.push({
    id: Date.now(),
    coupleName,
    weddingDate: document.getElementById('cakeClientWeddingDate').value,
    venueLocation: document.getElementById('cakeClientVenueLocation').value.trim(),
    guestCount: document.getElementById('cakeClientGuestCount').value,
    preferences: document.getElementById('cakeClientPreferences').value.trim(),
    allergies: document.getElementById('cakeClientAllergies').value.trim(),
    notes: document.getElementById('cakeClientNotes').value.trim(),
    inspirationPhotos: [],
  });
  setVendorData('cakeClients', clients);
  [
    'cakeClientCoupleName', 'cakeClientWeddingDate', 'cakeClientVenueLocation', 'cakeClientGuestCount',
    'cakeClientPreferences', 'cakeClientAllergies', 'cakeClientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  renderCakeClientManagement();
});

// ===================================================================
// JEWELRY COLLECTION (Jewelry only) — the product catalog: rings,
// necklaces, earrings and other pieces, each available to buy and/or
// rent, tracked by an item number/barcode for quick lookup.
// ===================================================================
let editingJewelryId = null;
function cancelJewelryEdit() {
  editingJewelryId = null;
  ['jewelryName', 'jewelryCollectionName', 'jewelryItemNumber', 'jewelryDescription', 'jewelryWeight', 'jewelrySizes', 'jewelryStoneDetails', 'jewelryBuyPrice', 'jewelryRentPrice'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.jewelry-material-check').forEach(c => c.checked = false);
  document.getElementById('jewelryBuyCheck').checked = false;
  document.getElementById('jewelryRentCheck').checked = false;
  document.getElementById('jewelryBuyPriceGroup').classList.add('hidden');
  document.getElementById('jewelryRentPriceGroup').classList.add('hidden');
  document.getElementById('addJewelryBtn').textContent = 'Add Jewelry Item';
  document.getElementById('cancelJewelryEditBtn').classList.add('hidden');
}
document.getElementById('cancelJewelryEditBtn').addEventListener('click', cancelJewelryEdit);

function renderJewelryCollection() {
  if (currentVendor.category !== 'Jewelry') return;

  document.getElementById('jewelryCategory').innerHTML = JEWELRY_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  document.getElementById('jewelryAvailability').innerHTML = JEWELRY_AVAILABILITY_STATUSES.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  document.getElementById('jewelryMaterialsGrid').innerHTML = JEWELRY_MATERIALS.map(m => `
    <label class="amenity-item"><input type="checkbox" value="${m}" class="jewelry-material-check"> ${m}</label>
  `).join('');

  const filterSelect = document.getElementById('jewelryFilterCategory');
  const previousFilter = filterSelect.value;
  filterSelect.innerHTML = '<option value="">All Categories</option>' + JEWELRY_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');
  filterSelect.value = previousFilter;

  const items = getVendorData('jewelryItems', []);
  const filter = filterSelect.value;
  const barcodeSearch = document.getElementById('jewelryBarcodeSearch').value.trim().toLowerCase();
  let filtered = filter ? items.filter(j => j.category === filter) : items;
  if (barcodeSearch) filtered = filtered.filter(j => (j.itemNumber || '').toLowerCase().includes(barcodeSearch));

  document.getElementById('jewelryCollectionList').innerHTML = filtered.slice().reverse().map(j => `
    <div class="admin-card" data-jewelry-id="${j.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(j.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(j.category)}</span></h4>
        <span>
          <button type="button" class="admin-btn small outline edit-jewelry-btn">Edit</button>
          <button type="button" class="admin-btn small danger delete-jewelry-btn">Delete</button>
        </span>
      </div>
      ${j.collectionName ? `<p class="admin-hint" style="text-align:left;">Collection: ${escapeHtml(j.collectionName)}</p>` : ''}
      ${j.description ? `<p>${escapeHtml(j.description)}</p>` : ''}
      <div class="amenity-tags">
        ${(j.materials || []).map(m => `<span class="amenity-tag">${escapeHtml(m)}</span>`).join('')}
        <span class="status-pill ${itemStatusPillClass(j.availability)}">${escapeHtml(j.availability)}</span>
        ${j.buy ? `<span class="amenity-tag">Buy${j.buyPrice ? ` — $${escapeHtml(j.buyPrice)}` : ''}</span>` : ''}
        ${j.rent ? `<span class="amenity-tag">Rent${j.rentPrice ? ` — $${escapeHtml(j.rentPrice)}` : ''}</span>` : ''}
      </div>
      ${j.weight ? `<p><strong>Weight:</strong> ${escapeHtml(j.weight)}</p>` : ''}
      ${j.stoneDetails ? `<p><strong>Stone Details:</strong> ${escapeHtml(j.stoneDetails)}</p>` : ''}
      ${j.sizes ? `<p><strong>Available Sizes:</strong> ${escapeHtml(j.sizes)}</p>` : ''}
      ${j.itemNumber ? `<p><strong>Item Number:</strong> ${escapeHtml(j.itemNumber)}</p>` : ''}
      <p style="margin-top:0.6rem;"><strong>Photos &amp; Videos</strong></p>
      <input type="file" class="jewelry-media-input" accept="image/*,video/*" multiple>
      <div class="gallery-grid-vendor">
        ${(j.media || []).map((m, i) => `
          <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-jewelry-media-btn">✕</button></div>
        `).join('') || '<p class="admin-empty">No photos or videos yet.</p>'}
      </div>
    </div>
  `).join('') || `<p class="admin-empty">${barcodeSearch ? 'No jewelry items match that item number.' : 'No jewelry in the collection yet — add one above.'}</p>`;

  document.querySelectorAll('.edit-jewelry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-jewelry-id]').dataset.jewelryId);
      const item = getVendorData('jewelryItems', []).find(j => j.id === id);
      if (!item) return;
      editingJewelryId = id;
      document.getElementById('jewelryName').value = item.name || '';
      document.getElementById('jewelryCollectionName').value = item.collectionName || '';
      document.getElementById('jewelryCategory').value = item.category || '';
      document.getElementById('jewelryItemNumber').value = item.itemNumber || '';
      document.getElementById('jewelryDescription').value = item.description || '';
      document.getElementById('jewelryWeight').value = item.weight || '';
      document.getElementById('jewelrySizes').value = item.sizes || '';
      document.getElementById('jewelryStoneDetails').value = item.stoneDetails || '';
      document.getElementById('jewelryAvailability').value = item.availability || '';
      document.querySelectorAll('.jewelry-material-check').forEach(cb => cb.checked = (item.materials || []).includes(cb.value));
      document.getElementById('jewelryBuyCheck').checked = !!item.buy;
      document.getElementById('jewelryBuyPriceGroup').classList.toggle('hidden', !item.buy);
      document.getElementById('jewelryBuyPrice').value = item.buyPrice || '';
      document.getElementById('jewelryRentCheck').checked = !!item.rent;
      document.getElementById('jewelryRentPriceGroup').classList.toggle('hidden', !item.rent);
      document.getElementById('jewelryRentPrice').value = item.rentPrice || '';
      document.getElementById('addJewelryBtn').textContent = 'Save Changes';
      document.getElementById('cancelJewelryEditBtn').classList.remove('hidden');
      const jewelryNameEl = document.getElementById('jewelryName'); if (jewelryNameEl.scrollIntoView) jewelryNameEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  });
  document.querySelectorAll('.delete-jewelry-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-jewelry-id]').dataset.jewelryId);
      setVendorData('jewelryItems', getVendorData('jewelryItems', []).filter(j => j.id !== id));
      if (editingJewelryId === id) cancelJewelryEdit();
      renderJewelryCollection();
    });
  });
  document.querySelectorAll('.jewelry-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-jewelry-id]').dataset.jewelryId);
      const items = getVendorData('jewelryItems', []);
      const item = items.find(j => j.id === id);
      if (!item) return;
      item.media = item.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          item.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/jewelryItems`) });
        } else {
          item.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/jewelryItems`) });
        }
      }
      setVendorData('jewelryItems', items);
      renderJewelryCollection();
    });
  });
  document.querySelectorAll('.remove-jewelry-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-jewelry-id]').dataset.jewelryId);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const items = getVendorData('jewelryItems', []);
      const item = items.find(j => j.id === id);
      if (item) item.media.splice(i, 1);
      setVendorData('jewelryItems', items);
      renderJewelryCollection();
    });
  });
}

document.getElementById('jewelryFilterCategory').addEventListener('change', renderJewelryCollection);
document.getElementById('jewelryBarcodeSearch').addEventListener('input', renderJewelryCollection);

document.getElementById('jewelryBuyCheck').addEventListener('change', (e) => {
  document.getElementById('jewelryBuyPriceGroup').classList.toggle('hidden', !e.target.checked);
});
document.getElementById('jewelryRentCheck').addEventListener('change', (e) => {
  document.getElementById('jewelryRentPriceGroup').classList.toggle('hidden', !e.target.checked);
});

document.getElementById('addJewelryBtn').addEventListener('click', () => {
  const name = document.getElementById('jewelryName').value.trim();
  if (!name) { alert('Please enter a product name.'); return; }
  const fields = {
    name,
    collectionName: document.getElementById('jewelryCollectionName').value.trim(),
    category: document.getElementById('jewelryCategory').value,
    itemNumber: document.getElementById('jewelryItemNumber').value.trim(),
    description: document.getElementById('jewelryDescription').value.trim(),
    materials: Array.from(document.querySelectorAll('.jewelry-material-check:checked')).map(c => c.value),
    weight: document.getElementById('jewelryWeight').value.trim(),
    sizes: document.getElementById('jewelrySizes').value.trim(),
    stoneDetails: document.getElementById('jewelryStoneDetails').value.trim(),
    availability: document.getElementById('jewelryAvailability').value,
    buy: document.getElementById('jewelryBuyCheck').checked,
    buyPrice: document.getElementById('jewelryBuyCheck').checked ? document.getElementById('jewelryBuyPrice').value : '',
    rent: document.getElementById('jewelryRentCheck').checked,
    rentPrice: document.getElementById('jewelryRentCheck').checked ? document.getElementById('jewelryRentPrice').value : '',
  };
  const items = getVendorData('jewelryItems', []);
  if (editingJewelryId) {
    const item = items.find(j => j.id === editingJewelryId);
    if (item) Object.assign(item, fields);
  } else {
    items.push({ id: Date.now(), ...fields, stockQuantity: 1, views: 0, media: [] });
  }
  setVendorData('jewelryItems', items);
  cancelJewelryEdit();
  renderJewelryCollection();
});

// ===================================================================
// RESERVATION MANAGEMENT (Jewelry only) — tracks reservations against
// specific Jewelry Collection items (by item number/barcode) through
// their lifecycle: New → Reserved (deposit taken) → Completed
// (picked up/returned or sale finalized).
// ===================================================================
const JEWELRY_RESERVATION_STATUSES = ['New', 'Reserved', 'Completed'];

function renderJewelryReservations() {
  if (currentVendor.category !== 'Jewelry') return;

  const items = getVendorData('jewelryItems', []);
  const itemSelect = document.getElementById('jewelryResItem');
  itemSelect.innerHTML = items.length
    ? items.map(j => `<option value="${j.id}">${escapeHtml(j.name)}${j.itemNumber ? ` (#${escapeHtml(j.itemNumber)})` : ''}</option>`).join('')
    : '<option value="">No jewelry items yet — add one in Jewelry Collection first</option>';

  const reservations = getVendorData('jewelryReservations', []);
  const statusFilter = document.getElementById('jewelryResStatusFilter').value;
  const search = document.getElementById('jewelryResSearch').value.trim().toLowerCase();
  let filtered = statusFilter ? reservations.filter(r => r.status === statusFilter) : reservations;
  if (search) {
    filtered = filtered.filter(r => {
      const item = items.find(j => j.id === r.itemId);
      return item && (item.itemNumber || '').toLowerCase().includes(search);
    });
  }

  document.getElementById('jewelryReservationsList').innerHTML = filtered.slice().reverse().map(r => {
    const item = items.find(j => j.id === r.itemId);
    return `
    <div class="admin-card" data-reservation-id="${r.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(r.customerName)} <span class="status-pill ${r.status === 'Completed' ? 'approved' : r.status === 'Reserved' ? 'pending' : 'pending'}">${escapeHtml(r.status)}</span></h4>
        <button type="button" class="admin-btn small danger delete-jewelry-reservation-btn">Delete</button>
      </div>
      <p><strong>Item:</strong> ${item ? `${escapeHtml(item.name)}${item.itemNumber ? ` (#${escapeHtml(item.itemNumber)})` : ''}` : 'Item no longer in collection'}</p>
      <p><strong>Deposit:</strong> ${r.deposit ? `$${escapeHtml(r.deposit)} — ` : ''}${escapeHtml(r.depositStatus)}</p>
      ${r.pickupDate ? `<p><strong>Pickup Date:</strong> ${escapeHtml(r.pickupDate)}</p>` : ''}
      ${r.returnDate ? `<p><strong>Return Date:</strong> ${escapeHtml(r.returnDate)}</p>` : ''}
      <div class="action-btns" style="margin-top:0.5rem;">
        ${r.status !== 'Reserved' ? `<button type="button" class="admin-btn small outline mark-jewelry-reservation-btn" data-status="Reserved">Mark Reserved</button>` : ''}
        ${r.status !== 'Completed' ? `<button type="button" class="admin-btn small mark-jewelry-reservation-btn" data-status="Completed">Complete Reservation</button>` : ''}
      </div>
    </div>`;
  }).join('') || `<p class="admin-empty">${search || statusFilter ? 'No reservations match this filter.' : 'No reservations yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-jewelry-reservation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-reservation-id]').dataset.reservationId);
      setVendorData('jewelryReservations', getVendorData('jewelryReservations', []).filter(r => r.id !== id));
      renderJewelryReservations();
    });
  });
  document.querySelectorAll('.mark-jewelry-reservation-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-reservation-id]').dataset.reservationId);
      const reservations = getVendorData('jewelryReservations', []);
      const r = reservations.find(x => x.id === id);
      if (r) r.status = btn.dataset.status;
      setVendorData('jewelryReservations', reservations);
      renderJewelryReservations();
    });
  });
}

document.getElementById('jewelryResStatusFilter').addEventListener('change', renderJewelryReservations);
document.getElementById('jewelryResSearch').addEventListener('input', renderJewelryReservations);

document.getElementById('addJewelryReservationBtn').addEventListener('click', () => {
  const customerName = document.getElementById('jewelryResCustomerName').value.trim();
  const itemId = Number(document.getElementById('jewelryResItem').value);
  if (!customerName || !itemId) { alert('Please enter a customer name and choose an item.'); return; }
  const reservations = getVendorData('jewelryReservations', []);
  reservations.push({
    id: Date.now(),
    customerName,
    itemId,
    deposit: document.getElementById('jewelryResDeposit').value,
    depositStatus: document.getElementById('jewelryResDepositStatus').value,
    pickupDate: document.getElementById('jewelryResPickupDate').value,
    returnDate: document.getElementById('jewelryResReturnDate').value,
    status: 'New',
  });
  setVendorData('jewelryReservations', reservations);
  ['jewelryResCustomerName', 'jewelryResDeposit', 'jewelryResPickupDate', 'jewelryResReturnDate'].forEach(id => document.getElementById(id).value = '');
  renderJewelryReservations();
});

// ===================================================================
// INVENTORY MANAGEMENT (Jewelry only) — an operational view over the same
// `jewelryItems` records created in Jewelry Collection: update status and
// quantity on hand here without re-opening the full catalog form.
// ===================================================================
function renderJewelryInventoryManagement() {
  if (currentVendor.category !== 'Jewelry') return;

  const items = getVendorData('jewelryItems', []);
  const counts = JEWELRY_AVAILABILITY_STATUSES.map(status => ({
    num: items.filter(j => j.availability === status).length,
    label: status,
  }));
  const totalStock = items.reduce((sum, j) => sum + (Number(j.stockQuantity) || 0), 0);
  document.getElementById('jewelryInventoryStats').innerHTML = [...counts, { num: totalStock, label: 'Total Units in Stock' }].map(s => `
    <div class="stat-card"><div class="num">${s.num}</div><div class="label">${escapeHtml(s.label)}</div></div>
  `).join('');

  const body = document.getElementById('jewelryInventoryTableBody');
  if (!items.length) { body.innerHTML = `<tr><td colspan="4" class="admin-empty">No jewelry yet — add one in Jewelry Collection first.</td></tr>`; return; }

  body.innerHTML = items.slice().reverse().map(j => `
    <tr data-jewelry-id="${j.id}">
      <td>${escapeHtml(j.name)}</td>
      <td>${escapeHtml(j.category)}</td>
      <td>
        <select class="jewelry-inventory-status-select">
          ${JEWELRY_AVAILABILITY_STATUSES.map(s => `<option ${j.availability === s ? 'selected' : ''}>${s}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" class="jewelry-inventory-quantity-input" min="0" value="${escapeHtml(j.stockQuantity != null ? j.stockQuantity : 1)}"></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.jewelryId);
    function update(patch) {
      const items = getVendorData('jewelryItems', []);
      const j = items.find(x => x.id === id);
      if (j) Object.assign(j, patch);
      setVendorData('jewelryItems', items);
      renderJewelryInventoryManagement();
    }
    row.querySelector('.jewelry-inventory-status-select').addEventListener('change', (e) => update({ availability: e.target.value }));
    row.querySelector('.jewelry-inventory-quantity-input').addEventListener('change', (e) => update({ stockQuantity: e.target.value }));
  });
}

// ===================================================================
// CUSTOMER MANAGEMENT (Jewelry only) — bride profiles with ring size,
// style preferences and budget range, plus a "Favorite Designs" wishlist
// referencing the shop's own Jewelry Collection records by id.
// ===================================================================
function renderJewelryClientManagement() {
  if (currentVendor.category !== 'Jewelry') return;

  document.getElementById('jewelryClientStylePreferencesGrid').innerHTML = JEWELRY_STYLE_PREFERENCES.map(s => `
    <label class="amenity-item"><input type="checkbox" value="${s}" class="jewelry-client-style-preference-check"> ${s}</label>
  `).join('');

  const clients = getVendorData('jewelryClients', []);
  const items = getVendorData('jewelryItems', []);
  const search = document.getElementById('jewelryClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.brideName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('jewelryClientsList').innerHTML = filtered.map(c => {
    const favoriteDesigns = (c.favoriteItemIds || []).map(id => items.find(j => j.id === id));
    return `
    <div class="admin-card" data-jewelry-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.brideName)}</h4>
        <button type="button" class="admin-btn small danger delete-jewelry-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Bride Name</label><input type="text" class="jewelry-client-edit-field" data-field="brideName" value="${escapeHtml(c.brideName || '')}"></div>
        <div class="admin-form-group"><label>Ring Size</label><input type="text" class="jewelry-client-edit-field" data-field="ringSize" value="${escapeHtml(c.ringSize || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Budget Range</label><input type="text" class="jewelry-client-edit-field" data-field="budgetRange" value="${escapeHtml(c.budgetRange || '')}"></div>
      <p style="margin-top:0.6rem;"><strong>Style Preferences</strong></p>
      <div class="amenity-grid">
        ${JEWELRY_STYLE_PREFERENCES.map(s => `<label class="amenity-item"><input type="checkbox" value="${s}" class="jewelry-client-edit-style-preference-check" ${(c.stylePreferences || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
      </div>
      <div class="admin-form-group" style="margin-top:0.6rem;"><label>Notes</label><textarea class="jewelry-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-jewelry-client-btn">Save</button>
      <span class="admin-note save-jewelry-client-note"></span>
      <p style="margin-top:0.6rem;"><strong>Favorite Designs</strong></p>
      <div class="admin-inline-form" style="margin-bottom:0.5rem;">
        <select class="jewelry-client-item-select">
          ${items.length ? items.map(j => `<option value="${j.id}">${escapeHtml(j.name)} (${escapeHtml(j.category)})</option>`).join('') : '<option value="">No jewelry in your collection yet</option>'}
        </select>
        <button type="button" class="admin-btn small outline save-jewelry-client-favorite-btn" ${items.length ? '' : 'disabled'}>Save to Favorites</button>
      </div>
      <div>
        ${favoriteDesigns.length ? favoriteDesigns.map((j, i) => `
          <span class="category-chip">${j ? escapeHtml(j.name) : '(item no longer available)'} <button type="button" data-i="${i}" class="remove-jewelry-client-favorite-btn">✕</button></span>
        `).join('') : '<p class="admin-empty">No favorite designs yet.</p>'}
      </div>
    </div>
  `;
  }).join('') || `<p class="admin-empty">${search ? 'No bride profiles match that search.' : 'No bride profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-jewelry-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-jewelry-client-id]').dataset.jewelryClientId);
      setVendorData('jewelryClients', getVendorData('jewelryClients', []).filter(c => c.id !== id));
      renderJewelryClientManagement();
    });
  });
  document.querySelectorAll('.save-jewelry-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-jewelry-client-id]');
      const id = Number(card.dataset.jewelryClientId);
      const clients = getVendorData('jewelryClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.jewelry-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      client.stylePreferences = Array.from(card.querySelectorAll('.jewelry-client-edit-style-preference-check:checked')).map(cb => cb.value);
      setVendorData('jewelryClients', clients);
      const note = card.querySelector('.save-jewelry-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
  document.querySelectorAll('.save-jewelry-client-favorite-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-jewelry-client-id]');
      const id = Number(card.dataset.jewelryClientId);
      const itemId = Number(card.querySelector('.jewelry-client-item-select').value);
      if (!itemId) return;
      const clients = getVendorData('jewelryClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      client.favoriteItemIds = client.favoriteItemIds || [];
      if (!client.favoriteItemIds.includes(itemId)) client.favoriteItemIds.push(itemId);
      setVendorData('jewelryClients', clients);
      renderJewelryClientManagement();
    });
  });
  document.querySelectorAll('.remove-jewelry-client-favorite-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-jewelry-client-id]');
      const id = Number(card.dataset.jewelryClientId);
      const i = Number(btn.dataset.i);
      const clients = getVendorData('jewelryClients', []);
      const client = clients.find(c => c.id === id);
      if (client) client.favoriteItemIds.splice(i, 1);
      setVendorData('jewelryClients', clients);
      renderJewelryClientManagement();
    });
  });
}

document.getElementById('jewelryClientSearchInput').addEventListener('input', renderJewelryClientManagement);

document.getElementById('addJewelryClientBtn').addEventListener('click', () => {
  const brideName = document.getElementById('jewelryClientName').value.trim();
  if (!brideName) { alert('Please enter the bride\'s name.'); return; }
  const clients = getVendorData('jewelryClients', []);
  clients.push({
    id: Date.now(),
    brideName,
    ringSize: document.getElementById('jewelryClientRingSize').value.trim(),
    budgetRange: document.getElementById('jewelryClientBudgetRange').value.trim(),
    stylePreferences: Array.from(document.querySelectorAll('.jewelry-client-style-preference-check:checked')).map(c => c.value),
    notes: document.getElementById('jewelryClientNotes').value.trim(),
    favoriteItemIds: [],
  });
  setVendorData('jewelryClients', clients);
  ['jewelryClientName', 'jewelryClientRingSize', 'jewelryClientBudgetRange', 'jewelryClientNotes'].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.jewelry-client-style-preference-check').forEach(cb => cb.checked = false);
  renderJewelryClientManagement();
});

// ===================================================================
// INVENTORY MANAGEMENT (Suit Rental only) — an operational view over the
// same `suits` records created in Suit Collection: update status and
// quantity on hand here, or look a suit up by barcode, without re-opening
// the full catalog form.
// ===================================================================
function renderSuitInventoryManagement() {
  if (currentVendor.category !== 'Suit Rental') return;

  const suits = getVendorData('suits', []);
  const counts = SUIT_STOCK_STATUSES.map(status => ({
    num: suits.filter(s => s.availability === status).length,
    label: status,
  }));
  const totalStock = suits.reduce((sum, s) => sum + (Number(s.stockQuantity) || 0), 0);
  document.getElementById('suitInventoryStats').innerHTML = [...counts, { num: totalStock, label: 'Total Units in Stock' }].map(s => `
    <div class="stat-card"><div class="num">${s.num}</div><div class="label">${escapeHtml(s.label)}</div></div>
  `).join('');

  const search = document.getElementById('suitInventoryBarcodeSearch').value.trim().toLowerCase();
  const filtered = search ? suits.filter(s => (s.barcode || '').toLowerCase().includes(search)) : suits;

  const body = document.getElementById('suitInventoryTableBody');
  if (!suits.length) { body.innerHTML = `<tr><td colspan="5" class="admin-empty">No suits yet — add one in Suit Collection first.</td></tr>`; return; }
  if (!filtered.length) { body.innerHTML = `<tr><td colspan="5" class="admin-empty">No suits match that barcode.</td></tr>`; return; }

  body.innerHTML = filtered.slice().reverse().map(s => `
    <tr data-suit-id="${s.id}">
      <td>${escapeHtml(s.name)}</td>
      <td>${escapeHtml(s.category)}</td>
      <td>${escapeHtml(s.barcode || '—')}</td>
      <td>
        <select class="suit-inventory-status-select">
          ${SUIT_STOCK_STATUSES.map(st => `<option ${s.availability === st ? 'selected' : ''}>${st}</option>`).join('')}
        </select>
      </td>
      <td><input type="number" class="suit-inventory-quantity-input" min="0" value="${escapeHtml(s.stockQuantity != null ? s.stockQuantity : 1)}"></td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.suitId);
    function update(patch) {
      const suits = getVendorData('suits', []);
      const s = suits.find(x => x.id === id);
      if (s) Object.assign(s, patch);
      setVendorData('suits', suits);
      renderSuitInventoryManagement();
    }
    row.querySelector('.suit-inventory-status-select').addEventListener('change', (e) => update({ availability: e.target.value }));
    row.querySelector('.suit-inventory-quantity-input').addEventListener('change', (e) => update({ stockQuantity: e.target.value }));
  });
}

document.getElementById('suitInventoryBarcodeSearch').addEventListener('input', renderSuitInventoryManagement);

// ===================================================================
// CUSTOMER MANAGEMENT (Suit Rental only) — groom profiles with
// measurements/preferences, mirroring the Bridal Dress Shops equivalent.
// ===================================================================
function renderSuitClientManagement() {
  if (currentVendor.category !== 'Suit Rental') return;

  document.getElementById('suitClientPreferredStyleGrid').innerHTML = SUIT_STYLES.map(s => `
    <label class="amenity-item"><input type="checkbox" value="${s}" class="suit-client-preferred-style-check"> ${s}</label>
  `).join('');

  const clients = getVendorData('suitClients', []);
  const search = document.getElementById('suitClientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.groomName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('suitClientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-suit-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.groomName)}</h4>
        <button type="button" class="admin-btn small danger delete-suit-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Groom Name</label><input type="text" class="suit-client-edit-field" data-field="groomName" value="${escapeHtml(c.groomName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="suit-client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Contact</label><input type="text" class="suit-client-edit-field" data-field="contact" value="${escapeHtml(c.contact || '')}"></div>
      <div class="admin-form-group"><label>Measurements</label><textarea class="suit-client-edit-field" data-field="measurements" rows="2">${escapeHtml(c.measurements || '')}</textarea></div>
      <div class="admin-form-group"><label>Color Preferences</label><input type="text" class="suit-client-edit-field" data-field="colorPreferences" value="${escapeHtml(c.colorPreferences || '')}"></div>
      <p style="margin-top:0.6rem;"><strong>Preferred Style</strong></p>
      <div class="amenity-grid">
        ${SUIT_STYLES.map(s => `<label class="amenity-item"><input type="checkbox" value="${s}" class="suit-client-edit-preferred-style-check" ${(c.preferredStyle || []).includes(s) ? 'checked' : ''}> ${s}</label>`).join('')}
      </div>
      <div class="admin-form-group" style="margin-top:0.6rem;"><label>Previous Rentals</label><input type="text" class="suit-client-edit-field" data-field="previousRentals" value="${escapeHtml(c.previousRentals || '')}"></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="suit-client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-suit-client-btn">Save</button>
      <span class="admin-note save-suit-client-note"></span>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No groom profiles match that search.' : 'No groom profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-suit-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-suit-client-id]').dataset.suitClientId);
      setVendorData('suitClients', getVendorData('suitClients', []).filter(c => c.id !== id));
      renderSuitClientManagement();
    });
  });
  document.querySelectorAll('.save-suit-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-suit-client-id]');
      const id = Number(card.dataset.suitClientId);
      const clients = getVendorData('suitClients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.suit-client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      client.preferredStyle = Array.from(card.querySelectorAll('.suit-client-edit-preferred-style-check:checked')).map(cb => cb.value);
      setVendorData('suitClients', clients);
      const note = card.querySelector('.save-suit-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('suitClientSearchInput').addEventListener('input', renderSuitClientManagement);

document.getElementById('addSuitClientBtn').addEventListener('click', () => {
  const groomName = document.getElementById('suitClientGroomName').value.trim();
  if (!groomName) { alert('Please enter the groom\'s name.'); return; }
  const clients = getVendorData('suitClients', []);
  clients.push({
    id: Date.now(),
    groomName,
    weddingDate: document.getElementById('suitClientWeddingDate').value,
    contact: document.getElementById('suitClientContact').value.trim(),
    measurements: document.getElementById('suitClientMeasurements').value.trim(),
    colorPreferences: document.getElementById('suitClientColorPreferences').value.trim(),
    preferredStyle: Array.from(document.querySelectorAll('.suit-client-preferred-style-check:checked')).map(c => c.value),
    previousRentals: document.getElementById('suitClientPreviousRentals').value.trim(),
    notes: document.getElementById('suitClientNotes').value.trim(),
  });
  setVendorData('suitClients', clients);
  [
    'suitClientGroomName', 'suitClientWeddingDate', 'suitClientContact',
    'suitClientMeasurements', 'suitClientColorPreferences', 'suitClientPreviousRentals', 'suitClientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  document.querySelectorAll('.suit-client-preferred-style-check').forEach(cb => cb.checked = false);
  renderSuitClientManagement();
});

// ===================================================================
// CLIENT MANAGEMENT (Makeup Artists only)
// ===================================================================
function renderClientManagement() {
  if (currentVendor.category !== 'Makeup Artists') return;

  const clients = getVendorData('clients', []);
  const search = document.getElementById('clientSearchInput').value.trim().toLowerCase();
  const filtered = search ? clients.filter(c => (c.brideName || '').toLowerCase().includes(search)) : clients;

  document.getElementById('clientsList').innerHTML = filtered.map(c => `
    <div class="admin-card" data-client-id="${c.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(c.brideName)}</h4>
        <button type="button" class="admin-btn small danger delete-client-btn">Delete</button>
      </div>
      <div class="form-row-2">
        <div class="admin-form-group"><label>Bride Name</label><input type="text" class="client-edit-field" data-field="brideName" value="${escapeHtml(c.brideName || '')}"></div>
        <div class="admin-form-group"><label>Wedding Date</label><input type="date" class="client-edit-field" data-field="weddingDate" value="${escapeHtml(c.weddingDate || '')}"></div>
      </div>
      <div class="admin-form-group"><label>Contact</label><input type="text" class="client-edit-field" data-field="contact" value="${escapeHtml(c.contact || '')}"></div>
      <div class="admin-form-group"><label>Skin Type Notes</label><input type="text" class="client-edit-field" data-field="skinType" value="${escapeHtml(c.skinType || '')}"></div>
      <div class="admin-form-group"><label>Makeup References</label><input type="text" class="client-edit-field" data-field="references" value="${escapeHtml(c.references || '')}"></div>
      <div class="admin-form-group"><label>Allergies</label><input type="text" class="client-edit-field" data-field="allergies" value="${escapeHtml(c.allergies || '')}"></div>
      <div class="admin-form-group"><label>Previous Appointments</label><input type="text" class="client-edit-field" data-field="previousAppointments" value="${escapeHtml(c.previousAppointments || '')}"></div>
      <div class="admin-form-group"><label>Notes</label><textarea class="client-edit-field" data-field="notes" rows="2">${escapeHtml(c.notes || '')}</textarea></div>
      <button type="button" class="admin-btn small save-client-btn">Save</button>
      <span class="admin-note save-client-note"></span>
    </div>
  `).join('') || `<p class="admin-empty">${search ? 'No bride profiles match that search.' : 'No bride profiles yet — add one above.'}</p>`;

  document.querySelectorAll('.delete-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-client-id]').dataset.clientId);
      setVendorData('clients', getVendorData('clients', []).filter(c => c.id !== id));
      renderClientManagement();
    });
  });
  document.querySelectorAll('.save-client-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-client-id]');
      const id = Number(card.dataset.clientId);
      const clients = getVendorData('clients', []);
      const client = clients.find(c => c.id === id);
      if (!client) return;
      card.querySelectorAll('.client-edit-field').forEach(input => { client[input.dataset.field] = input.value.trim(); });
      setVendorData('clients', clients);
      const note = card.querySelector('.save-client-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('clientSearchInput').addEventListener('input', renderClientManagement);

document.getElementById('addClientBtn').addEventListener('click', () => {
  const brideName = document.getElementById('clientBrideName').value.trim();
  if (!brideName) { alert('Please enter the bride\'s name.'); return; }
  const clients = getVendorData('clients', []);
  clients.push({
    id: Date.now(),
    brideName,
    weddingDate: document.getElementById('clientWeddingDate').value,
    contact: document.getElementById('clientContact').value.trim(),
    skinType: document.getElementById('clientSkinType').value.trim(),
    references: document.getElementById('clientReferences').value.trim(),
    allergies: document.getElementById('clientAllergies').value.trim(),
    previousAppointments: document.getElementById('clientPreviousAppointments').value.trim(),
    notes: document.getElementById('clientNotes').value.trim(),
  });
  setVendorData('clients', clients);
  [
    'clientBrideName', 'clientWeddingDate', 'clientContact', 'clientSkinType',
    'clientReferences', 'clientAllergies', 'clientPreviousAppointments', 'clientNotes',
  ].forEach(id => document.getElementById(id).value = '');
  renderClientManagement();
});

// ===================================================================
// PORTFOLIO (Photographers & Videographers only)
// ===================================================================
function totalPortfolioPhotos(albums) {
  return albums.reduce((s, al) => s + (al.photos || []).length, 0);
}

function renderPortfolio() {
  if (currentVendor.category !== 'Photographers & Videographers') return;

  const albums = getVendorData('portfolioAlbums', []);
  const photoCount = totalPortfolioPhotos(albums);
  const limitNote = document.getElementById('portfolioLimitNote');
  const basicLimited = planLevel() < 2;
  limitNote.textContent = basicLimited
    ? `(${photoCount}/10 photos — upgrade to Professional for unlimited)`
    : `(${photoCount} photos uploaded — unlimited on your plan)`;

  document.getElementById('albumsList').innerHTML = albums.map(al => `
    <div class="admin-card" data-album-id="${al.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(al.name)}</h4>
        <button type="button" class="admin-btn small danger delete-album-btn">Delete Album</button>
      </div>
      <input type="file" class="album-photo-input" accept="image/*" multiple ${basicLimited && photoCount >= 10 ? 'disabled' : ''}>
      <div class="gallery-grid-vendor">
        ${(al.photos || []).map((p, i) => `
          <div class="gallery-thumb" data-photo-i="${i}">
            <img loading="lazy" decoding="async" src="${p.src}">
            ${planLevel() >= 2 ? `<button type="button" class="feature-photo-btn" title="Feature this photo" style="left:4px;right:auto;">${p.featured ? '★' : '☆'}</button>` : ''}
            <button type="button" class="remove-album-photo-btn">✕</button>
          </div>
        `).join('') || '<p class="admin-empty">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') || '<p class="admin-empty">No albums yet — create one above.</p>';

  document.querySelectorAll('.delete-album-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-album-id]').dataset.albumId);
      setVendorData('portfolioAlbums', getVendorData('portfolioAlbums', []).filter(a => a.id !== id));
      renderPortfolio();
    });
  });
  document.querySelectorAll('.album-photo-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('[data-album-id]').dataset.albumId);
      const albums = getVendorData('portfolioAlbums', []);
      const album = albums.find(a => a.id === id);
      if (!album) return;
      album.photos = album.photos || [];
      for (const file of Array.from(e.target.files)) {
        if (planLevel() < 2 && totalPortfolioPhotos(albums) >= 10) break;
        album.photos.push({ id: Date.now() + Math.random(), src: await uploadMedia(file, `vendors/${currentVendor.username}/portfolioAlbums`), featured: false });
      }
      setVendorData('portfolioAlbums', albums);
      renderPortfolio();
    });
  });
  document.querySelectorAll('.remove-album-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-album-id]').dataset.albumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('portfolioAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos.splice(i, 1);
      setVendorData('portfolioAlbums', albums);
      renderPortfolio();
    });
  });
  document.querySelectorAll('.feature-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-album-id]').dataset.albumId);
      const i = Number(btn.closest('[data-photo-i]').dataset.photoI);
      const albums = getVendorData('portfolioAlbums', []);
      const album = albums.find(a => a.id === id);
      if (album) album.photos[i].featured = !album.photos[i].featured;
      setVendorData('portfolioAlbums', albums);
      renderPortfolio();
    });
  });

  // Videos — Professional+
  const videosLocked = planLevel() < 2;
  document.getElementById('portfolioVideosLockNote').innerHTML = videosLocked
    ? `<p class="admin-hint" style="text-align:left;">Upgrade to the Professional plan to upload highlight reels.</p>` : '';
  document.getElementById('portfolioVideosInput').disabled = videosLocked;
  const portfolioVideos = getVendorData('portfolioVideos', []);
  document.getElementById('portfolioVideosGrid').innerHTML = portfolioVideos.map((v, i) => `
    <div class="gallery-thumb"><video src="${v.src}" muted></video><button data-i="${i}" class="remove-portfolio-video-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No highlight reels yet.</p>';
  document.querySelectorAll('.remove-portfolio-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const videos = getVendorData('portfolioVideos', []);
      videos.splice(Number(btn.dataset.i), 1);
      setVendorData('portfolioVideos', videos);
      renderPortfolio();
    });
  });

  // Featured Portfolio — Professional+
  const featuredLocked = planLevel() < 2;
  document.getElementById('featuredPortfolioLockNote').innerHTML = featuredLocked
    ? `<p class="admin-hint" style="text-align:left;">Upgrade to the Professional plan to feature your best shots.</p>` : '';
  const featuredPhotos = albums.flatMap(al => (al.photos || []).filter(p => p.featured));
  document.getElementById('featuredPortfolioGrid').innerHTML = featuredLocked ? '' : (featuredPhotos.map(p => `
    <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${p.src}"></div>
  `).join('') || '<p class="admin-empty">No featured photos yet — star a photo in an album above.</p>');

  // Before & After — Premium Featured only
  const beforeAfterLocked = planLevel() < 3;
  document.getElementById('beforeAfterLockNote').innerHTML = beforeAfterLocked
    ? `<p class="admin-hint" style="text-align:left;">Before &amp; After editing showcases are available on the Premium Featured plan.</p>` : '';
  ['beforeImageInput', 'afterImageInput', 'beforeAfterLabel', 'addBeforeAfterBtn'].forEach(id => document.getElementById(id).disabled = beforeAfterLocked);
  const beforeAfter = beforeAfterLocked ? [] : getVendorData('beforeAfter', []);
  document.getElementById('beforeAfterList').innerHTML = beforeAfterLocked ? '' : (beforeAfter.map((ba, i) => `
    <div class="admin-card" data-i="${i}" style="background:var(--bg);">
      <div class="form-row-2">
        <div><p class="admin-hint" style="text-align:left;">Before</p><img loading="lazy" decoding="async" src="${ba.before}" style="width:100%;border-radius:8px;"></div>
        <div><p class="admin-hint" style="text-align:left;">After</p><img loading="lazy" decoding="async" src="${ba.after}" style="width:100%;border-radius:8px;"></div>
      </div>
      ${ba.label ? `<p style="margin-top:0.5rem;">${escapeHtml(ba.label)}</p>` : ''}
      <button type="button" class="admin-btn small danger remove-before-after-btn" style="margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') || '<p class="admin-empty">No before/after pairs yet.</p>');
  document.querySelectorAll('.remove-before-after-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const list = getVendorData('beforeAfter', []);
      list.splice(Number(btn.closest('[data-i]').dataset.i), 1);
      setVendorData('beforeAfter', list);
      renderPortfolio();
    });
  });
}

document.getElementById('createAlbumBtn').addEventListener('click', () => {
  const input = document.getElementById('newAlbumName');
  const name = input.value.trim();
  if (!name) { alert('Please enter an album name.'); return; }
  const albums = getVendorData('portfolioAlbums', []);
  albums.push({ id: Date.now(), name, photos: [] });
  setVendorData('portfolioAlbums', albums);
  input.value = '';
  renderPortfolio();
});

document.getElementById('portfolioVideosInput').addEventListener('change', async (e) => {
  if (planLevel() < 2) return;
  const videos = getVendorData('portfolioVideos', []);
  for (const file of Array.from(e.target.files)) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
    videos.push({ id: Date.now() + Math.random(), src: await uploadMedia(file, `vendors/${currentVendor.username}/portfolioVideos`) });
  }
  setVendorData('portfolioVideos', videos);
  renderPortfolio();
});

document.getElementById('addBeforeAfterBtn').addEventListener('click', async () => {
  if (planLevel() < 3) return;
  const beforeFile = document.getElementById('beforeImageInput').files[0];
  const afterFile = document.getElementById('afterImageInput').files[0];
  if (!beforeFile || !afterFile) { alert('Please choose both a before and an after photo.'); return; }
  const list = getVendorData('beforeAfter', []);
  list.push({
    id: Date.now(),
    before: await uploadMedia(beforeFile, `vendors/${currentVendor.username}/beforeAfter`),
    after: await uploadMedia(afterFile, `vendors/${currentVendor.username}/beforeAfter`),
    label: document.getElementById('beforeAfterLabel').value.trim(),
  });
  setVendorData('beforeAfter', list);
  ['beforeImageInput', 'afterImageInput', 'beforeAfterLabel'].forEach(id => document.getElementById(id).value = '');
  renderPortfolio();
});

document.getElementById('saveVenueInfoBtn').addEventListener('click', () => {
  currentVendor.businessName = document.getElementById('venueBusinessName').value.trim();
  currentVendor.phone = document.getElementById('venuePhone').value.trim();
  currentVendor.email = document.getElementById('venueEmail').value.trim();
  currentVendor.location = document.getElementById('venueLocation').value.trim();
  currentVendor.mapsLink = document.getElementById('venueMapsLink').value.trim();
  currentVendor.website = document.getElementById('venueWebsite').value.trim();
  currentVendor.instagram = document.getElementById('venueInstagram').value.trim();
  currentVendor.facebook = document.getElementById('venueFacebook').value.trim();
  currentVendor.tiktok = document.getElementById('venueTiktok').value.trim();
  currentVendor.whatsapp = document.getElementById('venueWhatsapp').value.trim();
  saveCurrentVendorToApplications();
  const profile = getVendorData('profile', {});
  profile.description = document.getElementById('venueDescription').value.trim();
  setVendorData('profile', profile);
  document.getElementById('overviewBusinessName').textContent = currentVendor.businessName;
  const note = document.getElementById('venueInfoNote');
  note.textContent = 'Saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('coverPhotoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const profile = getVendorData('profile', {});
  if (file.type.startsWith('video/')) {
    if (file.size > MAX_VIDEO_BYTES) { alert('That video is too large (max 8MB).'); e.target.value = ''; return; }
    profile.coverPhoto = { type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/cover`) };
  } else {
    profile.coverPhoto = { type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/cover`) };
  }
  setVendorData('profile', profile);
  renderVenuePanel();
});

document.getElementById('logoInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const profile = getVendorData('profile', {});
  profile.logo = await uploadMedia(file, `vendors/${currentVendor.username}/logo`);
  setVendorData('profile', profile);
  renderVenuePanel();
});

document.getElementById('galleryPhotoInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const profile = getVendorData('profile', {});
  profile.gallery = profile.gallery || [];
  const room = planLevel() < 2 ? Math.max(0, 10 - profile.gallery.length) : files.length;
  for (const file of files.slice(0, room)) {
    profile.gallery.push(await uploadMedia(file, `vendors/${currentVendor.username}/gallery`));
  }
  setVendorData('profile', profile);
  renderVenuePanel();
});

document.getElementById('videosInput').addEventListener('change', async (e) => {
  if (planLevel() < 2) return;
  const files = Array.from(e.target.files);
  const profile = getVendorData('profile', {});
  profile.videos = profile.videos || [];
  for (const file of files) {
    if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is too large (max 8MB).`); continue; }
    profile.videos.push(await uploadMedia(file, `vendors/${currentVendor.username}/videos`));
  }
  setVendorData('profile', profile);
  renderVenuePanel();
});

// Catering shops get a dedicated "Kitchen Photos" gallery separate from the
// shared Event Photos gallery above — one showcases the vendor's own
// facility/hygiene, the other showcases actual client events.
function renderKitchenPhotos(photos) {
  document.getElementById('kitchenPhotosGridVendor').innerHTML = photos.map((src, i) => `
    <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${src}"><button data-i="${i}" class="remove-kitchen-photo-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No kitchen photos yet.</p>';
  document.querySelectorAll('.remove-kitchen-photo-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.kitchenPhotos.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderVenuePanel();
    });
  });
}

document.getElementById('kitchenPhotoInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const profile = getVendorData('profile', {});
  profile.kitchenPhotos = profile.kitchenPhotos || [];
  for (const file of files) {
    profile.kitchenPhotos.push(await uploadMedia(file, `vendors/${currentVendor.username}/kitchenPhotos`));
  }
  setVendorData('profile', profile);
  renderVenuePanel();
});

function renderPreviousDesigns(photos) {
  document.getElementById('previousDesignsGridVendor').innerHTML = photos.map((src, i) => `
    <div class="gallery-thumb"><img loading="lazy" decoding="async" src="${src}"><button data-i="${i}" class="remove-previous-design-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No previous designs yet.</p>';
  document.querySelectorAll('.remove-previous-design-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const profile = getVendorData('profile', {});
      profile.previousDesigns.splice(Number(btn.dataset.i), 1);
      setVendorData('profile', profile);
      renderVenuePanel();
    });
  });
}

document.getElementById('previousDesignsPhotoInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const profile = getVendorData('profile', {});
  profile.previousDesigns = profile.previousDesigns || [];
  for (const file of files) {
    profile.previousDesigns.push(await uploadMedia(file, `vendors/${currentVendor.username}/previousDesigns`));
  }
  setVendorData('profile', profile);
  renderVenuePanel();
});

document.getElementById('saveTourBtn').addEventListener('click', () => {
  if (planLevel() < 2) return;
  const profile = getVendorData('profile', {});
  profile.tourLink = document.getElementById('tourLinkInput').value.trim();
  setVendorData('profile', profile);
  renderVenuePanel();
});

document.getElementById('saveVenueDetailsBtn').addEventListener('click', () => {
  const profile = getVendorData('profile', {});
  profile.capacity = document.getElementById('venueCapacity').value;
  profile.indoorOutdoor = document.getElementById('venueIndoorOutdoor').value;
  profile.parkingInfo = document.getElementById('venueParking').value.trim();
  profile.accessibility = document.getElementById('venueAccessibility').value.trim();
  profile.amenities = Array.from(document.querySelectorAll('.amenity-check:checked')).map(c => c.value);
  setVendorData('profile', profile);
  const note = document.getElementById('venueDetailsNote');
  note.textContent = 'Venue details saved.';
  setTimeout(() => note.textContent = '', 2000);
});

// ===================================================================
// PACKAGES & PRICING
// ===================================================================
function suggestAiPrice() {
  // Simple rule-based estimator (not a live AI/ML model) using the venue's
  // own capacity, amenities and season to suggest a starting price.
  const profile = getVendorData('profile', {});
  const minGuests = Number(document.getElementById('pkgMinGuests').value) || 50;
  const maxGuests = Number(document.getElementById('pkgMaxGuests').value) || Number(profile.capacity) || 150;
  const avgGuests = (minGuests + maxGuests) / 2;
  let basePerGuest = 35;
  if (profile.indoorOutdoor === 'Both') basePerGuest += 5;
  if ((profile.amenities || []).length >= 5) basePerGuest += 5;
  const month = new Date().getMonth();
  const peakSeason = month >= 5 && month <= 8;
  let price = avgGuests * basePerGuest;
  if (peakSeason) price *= 1.15;
  price = Math.round(price / 50) * 50;
  document.getElementById('aiSuggestionResult').textContent =
    `Suggested price: $${price} (based on ~${Math.round(avgGuests)} guests${peakSeason ? ', peak-season adjustment applied' : ''}).`;
}

function addonDisplay(a) {
  // Supports the new structured {name, price} shape, the Catering
  // {name, image} shape (image may be an empty string if no file was
  // selected — presence of the key, not its truthiness, marks the shape),
  // and the older plain-string shape from before add-ons had prices.
  if (a && typeof a === 'object') {
    if ('image' in a) return `${a.image ? `<img loading="lazy" decoding="async" src="${a.image}" style="width:20px;height:20px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:4px;">` : ''}${escapeHtml(a.name)}`;
    return `${escapeHtml(a.name)} (+$${escapeHtml(a.price || 0)})`;
  }
  return escapeHtml(a);
}

let packageAddonsDraft = [];
function renderPkgAddonsDraft() {
  document.getElementById('pkgAddonsDraftList').innerHTML = packageAddonsDraft.map((a, i) => `
    <span class="category-chip">${addonDisplay(a)} <button type="button" data-i="${i}" class="remove-pkg-addon-btn">✕</button></span>
  `).join('');
  document.querySelectorAll('.remove-pkg-addon-btn').forEach(btn => {
    btn.addEventListener('click', () => { packageAddonsDraft.splice(Number(btn.dataset.i), 1); renderPkgAddonsDraft(); });
  });
}
document.getElementById('addPkgAddonBtn').addEventListener('click', async () => {
  const name = document.getElementById('pkgAddonName').value.trim();
  const price = document.getElementById('pkgAddonPrice').value;
  if (!name) return;
  const isCatering = currentVendor.category === 'Catering';
  if (isCatering) {
    const file = document.getElementById('pkgAddonImage').files[0];
    packageAddonsDraft.push({ name, image: file ? await uploadMedia(file, `vendors/${currentVendor.username}/packageAddons`) : '' });
  } else {
    packageAddonsDraft.push({ name, price: price || 0 });
  }
  document.getElementById('pkgAddonName').value = '';
  document.getElementById('pkgAddonPrice').value = '';
  document.getElementById('pkgAddonImage').value = '';
  renderPkgAddonsDraft();
});

// ===================================================================
// BUDGET MANAGEMENT (Wedding Planner only)
// ===================================================================
function renderBudgetManagement() {
  if (currentVendor.category !== 'Wedding Planner') return;
  const budgets = getVendorData('budgets', []);

  document.getElementById('budgetsList').innerHTML = budgets.map(b => {
    const totalExpenses = (b.expenses || []).reduce((s, e) => s + Number(e.amount || 0), 0);
    const remaining = Number(b.totalBudget || 0) - totalExpenses;
    return `
    <div class="admin-card" data-budget-id="${b.id}" style="border-top:3px solid var(--secondary);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h3 style="margin:0;">${escapeHtml(b.coupleName)}</h3>
        <button type="button" class="admin-btn small danger delete-budget-btn">Delete Budget</button>
      </div>
      <div class="stat-grid">
        <div class="stat-card"><div class="num">$${escapeHtml(b.totalBudget)}</div><div class="label">Total Budget</div></div>
        <div class="stat-card"><div class="num">$${totalExpenses}</div><div class="label">Total Expenses</div></div>
        <div class="stat-card"><div class="num">$${remaining}</div><div class="label">Remaining Budget</div></div>
      </div>

      <h4>Budget Breakdown</h4>
      <div class="admin-inline-form">
        <input type="text" class="budget-cat-name" placeholder="Category (e.g. Venue)">
        <input type="number" class="budget-cat-amount" placeholder="Allocated ($)" min="0">
        <button type="button" class="admin-btn small outline add-budget-cat-btn">Add</button>
      </div>
      <div>
        ${(b.categories || []).map((c, i) => `
          <div class="budget-row" data-i="${i}" style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid #eee;">
            <span>${escapeHtml(c.name)}</span>
            <span>$${escapeHtml(c.amount)} <button type="button" class="admin-btn small danger remove-budget-cat-btn">✕</button></span>
          </div>
        `).join('') || '<p class="admin-empty">No budget categories yet.</p>'}
      </div>

      <h4>Expense Tracking</h4>
      <div class="admin-inline-form">
        <input type="text" class="expense-desc" placeholder="Description">
        <input type="number" class="expense-amount" placeholder="Amount ($)" min="0">
        <input type="date" class="expense-date">
        <button type="button" class="admin-btn small outline add-expense-btn">Add</button>
      </div>
      <div>
        ${(b.expenses || []).map((e, i) => `
          <div class="budget-row" data-i="${i}" style="display:flex;justify-content:space-between;padding:0.4rem 0;border-bottom:1px solid #eee;">
            <span>${escapeHtml(e.description)} ${e.date ? `<span style="color:#999;">(${escapeHtml(e.date)})</span>` : ''}</span>
            <span>$${escapeHtml(e.amount)} <button type="button" class="admin-btn small danger remove-expense-btn">✕</button></span>
          </div>
        `).join('') || '<p class="admin-empty">No expenses logged yet.</p>'}
      </div>

      <h4>Payment Schedule</h4>
      <div class="admin-inline-form">
        <input type="text" class="payment-schedule-desc" placeholder="Payment description">
        <input type="number" class="payment-schedule-amount" placeholder="Amount ($)" min="0">
        <input type="date" class="payment-schedule-duedate">
        <button type="button" class="admin-btn small outline add-payment-schedule-btn">Add</button>
      </div>
      <div>
        ${(b.schedule || []).map((p, i) => `
          <div class="budget-row" data-i="${i}" style="display:flex;justify-content:space-between;align-items:center;padding:0.4rem 0;border-bottom:1px solid #eee;flex-wrap:wrap;gap:0.4rem;">
            <span>${escapeHtml(p.description)} ${p.dueDate ? `<span style="color:#999;">due ${escapeHtml(p.dueDate)}</span>` : ''}</span>
            <span>
              $${escapeHtml(p.amount)}
              <span class="status-pill ${p.paid ? 'approved' : 'pending'}">${p.paid ? 'Paid' : 'Unpaid'}</span>
              <button type="button" class="admin-btn small outline toggle-payment-schedule-btn">${p.paid ? 'Mark Unpaid' : 'Mark Paid'}</button>
              <button type="button" class="admin-btn small danger remove-payment-schedule-btn">✕</button>
            </span>
          </div>
        `).join('') || '<p class="admin-empty">No scheduled payments yet.</p>'}
      </div>
    </div>
  `;
  }).join('') || '<p class="admin-empty">No wedding budgets yet — create one above.</p>';

  document.querySelectorAll('.delete-budget-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-budget-id]').dataset.budgetId);
      setVendorData('budgets', getVendorData('budgets', []).filter(b => b.id !== id));
      renderBudgetManagement();
    });
  });

  document.querySelectorAll('.add-budget-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const name = card.querySelector('.budget-cat-name').value.trim();
      const amount = card.querySelector('.budget-cat-amount').value;
      if (!name) return;
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.categories = b.categories || [];
      b.categories.push({ name, amount: amount || 0 });
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });
  document.querySelectorAll('.remove-budget-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const i = Number(btn.closest('.budget-row').dataset.i);
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.categories.splice(i, 1);
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });

  document.querySelectorAll('.add-expense-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const description = card.querySelector('.expense-desc').value.trim();
      const amount = card.querySelector('.expense-amount').value;
      const date = card.querySelector('.expense-date').value;
      if (!description || !amount) return;
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.expenses = b.expenses || [];
      b.expenses.push({ description, amount, date });
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });
  document.querySelectorAll('.remove-expense-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const i = Number(btn.closest('.budget-row').dataset.i);
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.expenses.splice(i, 1);
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });

  document.querySelectorAll('.add-payment-schedule-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const description = card.querySelector('.payment-schedule-desc').value.trim();
      const amount = card.querySelector('.payment-schedule-amount').value;
      const dueDate = card.querySelector('.payment-schedule-duedate').value;
      if (!description || !amount) return;
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.schedule = b.schedule || [];
      b.schedule.push({ description, amount, dueDate, paid: false });
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });
  document.querySelectorAll('.toggle-payment-schedule-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const i = Number(btn.closest('.budget-row').dataset.i);
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.schedule[i].paid = !b.schedule[i].paid;
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });
  document.querySelectorAll('.remove-payment-schedule-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const card = btn.closest('[data-budget-id]');
      const id = Number(card.dataset.budgetId);
      const i = Number(btn.closest('.budget-row').dataset.i);
      const budgets = getVendorData('budgets', []);
      const b = budgets.find(x => x.id === id);
      b.schedule.splice(i, 1);
      setVendorData('budgets', budgets);
      renderBudgetManagement();
    });
  });
}

document.getElementById('addBudgetBtn').addEventListener('click', () => {
  const coupleName = document.getElementById('budgetCoupleName').value.trim();
  const totalBudget = document.getElementById('budgetTotal').value;
  if (!coupleName || !totalBudget) { alert('Please enter a couple name and total budget.'); return; }
  const budgets = getVendorData('budgets', []);
  budgets.push({ id: Date.now(), coupleName, totalBudget, categories: [], expenses: [], schedule: [] });
  setVendorData('budgets', budgets);
  document.getElementById('budgetCoupleName').value = '';
  document.getElementById('budgetTotal').value = '';
  renderBudgetManagement();
});

// ===================================================================
// WEDDING TIMELINE (Wedding Planner only)
// ===================================================================
function renderWeddingTimeline() {
  if (currentVendor.category !== 'Wedding Planner') return;

  // --- Planning Schedule ---
  const schedule = getVendorData('planningSchedule', []).slice().sort((a, b) => new Date(a.date) - new Date(b.date));
  document.getElementById('scheduleList').innerHTML = schedule.map(s => `
    <div class="admin-card" data-id="${s.id}" style="background:var(--bg);padding:0.8rem 1rem;margin-bottom:0.6rem;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <strong>${escapeHtml(s.title)}</strong><span style="color:#777;">${escapeHtml(s.date || '')}</span>
      </div>
      ${s.notes ? `<p style="margin:0.4rem 0 0;color:#555;font-size:0.88rem;">${escapeHtml(s.notes)}</p>` : ''}
      <button type="button" class="admin-btn small danger remove-schedule-btn" style="margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') || '<p class="admin-empty">No milestones yet — add one above.</p>';
  document.querySelectorAll('.remove-schedule-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]').dataset.id);
      setVendorData('planningSchedule', getVendorData('planningSchedule', []).filter(s => s.id !== id));
      renderWeddingTimeline();
    });
  });

  // --- Task Management ---
  const tasks = getVendorData('tasks', []);
  document.getElementById('taskList').innerHTML = tasks.map(t => `
    <div class="admin-card" data-id="${t.id}" style="background:var(--bg);padding:0.7rem 1rem;margin-bottom:0.5rem;display:flex;justify-content:space-between;align-items:center;gap:0.6rem;">
      <label style="display:flex;align-items:center;gap:0.6rem;flex:1;">
        <input type="checkbox" class="task-check" ${t.done ? 'checked' : ''}>
        <span style="${t.done ? 'text-decoration:line-through;color:#999;' : ''}">${escapeHtml(t.text)}</span>
      </label>
      ${t.dueDate ? `<span style="color:#777;font-size:0.82rem;">${escapeHtml(t.dueDate)}</span>` : ''}
      <button type="button" class="admin-btn small danger remove-task-btn">✕</button>
    </div>
  `).join('') || '<p class="admin-empty">No tasks yet — add one above.</p>';
  document.querySelectorAll('.task-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const id = Number(cb.closest('[data-id]').dataset.id);
      const tasks = getVendorData('tasks', []);
      const t = tasks.find(x => x.id === id);
      if (t) t.done = cb.checked;
      setVendorData('tasks', tasks);
      renderWeddingTimeline();
    });
  });
  document.querySelectorAll('.remove-task-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]').dataset.id);
      setVendorData('tasks', getVendorData('tasks', []).filter(t => t.id !== id));
      renderWeddingTimeline();
    });
  });

  // --- Vendor Coordination ---
  const coordVendors = getVendorData('vendorCoordination', []);
  document.getElementById('coordList').innerHTML = coordVendors.map(v => `
    <div class="admin-card" data-id="${v.id}" style="background:var(--bg);padding:0.8rem 1rem;margin-bottom:0.6rem;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <strong>${escapeHtml(v.vendorName)}</strong><span class="status-pill ${v.status.toLowerCase()}">${escapeHtml(v.status)}</span>
      </div>
      <p style="margin:0.3rem 0 0;color:#777;font-size:0.85rem;">${escapeHtml(v.category || '')}${v.contact ? ` · ${escapeHtml(v.contact)}` : ''}</p>
      <button type="button" class="admin-btn small danger remove-coord-btn" style="margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') || '<p class="admin-empty">No vendors tracked yet — add one above.</p>';
  document.querySelectorAll('.remove-coord-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]').dataset.id);
      setVendorData('vendorCoordination', getVendorData('vendorCoordination', []).filter(v => v.id !== id));
      renderWeddingTimeline();
    });
  });

  // --- Wedding Day Timeline ---
  const dayTimeline = getVendorData('weddingDayTimeline', []).slice().sort((a, b) => a.time.localeCompare(b.time));
  document.getElementById('dayTimelineList').innerHTML = dayTimeline.map(d => `
    <div class="admin-card" data-id="${d.id}" style="background:var(--bg);padding:0.6rem 1rem;margin-bottom:0.4rem;display:flex;justify-content:space-between;align-items:center;gap:0.6rem;">
      <span><strong>${escapeHtml(d.time)}</strong> — ${escapeHtml(d.activity)}</span>
      <button type="button" class="admin-btn small danger remove-daytimeline-btn">✕</button>
    </div>
  `).join('') || '<p class="admin-empty">No timeline entries yet — add one above.</p>';
  document.querySelectorAll('.remove-daytimeline-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]').dataset.id);
      setVendorData('weddingDayTimeline', getVendorData('weddingDayTimeline', []).filter(d => d.id !== id));
      renderWeddingTimeline();
    });
  });

  // --- Special Offers & Discounts ---
  const offers = getVendorData('vendorOffers', []);
  document.getElementById('offerList').innerHTML = offers.map(o => `
    <div class="admin-card" data-id="${o.id}" style="background:var(--bg);padding:0.8rem 1rem;margin-bottom:0.6rem;">
      <strong>${escapeHtml(o.vendorName)}</strong>
      <p style="margin:0.3rem 0;color:#555;font-size:0.88rem;">${escapeHtml(o.description)}</p>
      ${o.code ? `<span class="plan-tag" style="background:var(--primary);">${escapeHtml(o.code)}</span>` : ''}
      ${o.expiry ? `<span style="color:#777;font-size:0.8rem;margin-left:0.5rem;">Expires ${escapeHtml(o.expiry)}</span>` : ''}
      <button type="button" class="admin-btn small danger remove-offer-btn" style="display:block;margin-top:0.5rem;">Remove</button>
    </div>
  `).join('') || '<p class="admin-empty">No offers logged yet — add one above.</p>';
  document.querySelectorAll('.remove-offer-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-id]').dataset.id);
      setVendorData('vendorOffers', getVendorData('vendorOffers', []).filter(o => o.id !== id));
      renderWeddingTimeline();
    });
  });
}

document.getElementById('addScheduleBtn').addEventListener('click', () => {
  const title = document.getElementById('scheduleTitle').value.trim();
  const date = document.getElementById('scheduleDate').value;
  if (!title) { alert('Please enter a milestone name.'); return; }
  const schedule = getVendorData('planningSchedule', []);
  schedule.push({ id: Date.now(), title, date, notes: document.getElementById('scheduleNotes').value.trim() });
  setVendorData('planningSchedule', schedule);
  ['scheduleTitle', 'scheduleDate', 'scheduleNotes'].forEach(id => document.getElementById(id).value = '');
  renderWeddingTimeline();
});

document.getElementById('addTaskBtn').addEventListener('click', () => {
  const text = document.getElementById('taskText').value.trim();
  if (!text) return;
  const tasks = getVendorData('tasks', []);
  tasks.push({ id: Date.now(), text, dueDate: document.getElementById('taskDueDate').value, done: false });
  setVendorData('tasks', tasks);
  document.getElementById('taskText').value = '';
  document.getElementById('taskDueDate').value = '';
  renderWeddingTimeline();
});

document.getElementById('addCoordBtn').addEventListener('click', () => {
  const vendorName = document.getElementById('coordVendorName').value.trim();
  if (!vendorName) { alert('Please enter a vendor name.'); return; }
  const coordVendors = getVendorData('vendorCoordination', []);
  coordVendors.push({
    id: Date.now(), vendorName,
    category: document.getElementById('coordCategory').value.trim(),
    contact: document.getElementById('coordContact').value.trim(),
    status: document.getElementById('coordStatus').value,
  });
  setVendorData('vendorCoordination', coordVendors);
  ['coordVendorName', 'coordCategory', 'coordContact'].forEach(id => document.getElementById(id).value = '');
  renderWeddingTimeline();
});

document.getElementById('addDayTimelineBtn').addEventListener('click', () => {
  const time = document.getElementById('dayTimelineTime').value;
  const activity = document.getElementById('dayTimelineActivity').value.trim();
  if (!time || !activity) { alert('Please enter both a time and an activity.'); return; }
  const dayTimeline = getVendorData('weddingDayTimeline', []);
  dayTimeline.push({ id: Date.now(), time, activity });
  setVendorData('weddingDayTimeline', dayTimeline);
  document.getElementById('dayTimelineTime').value = '';
  document.getElementById('dayTimelineActivity').value = '';
  renderWeddingTimeline();
});

document.getElementById('printDayTimelineBtn').addEventListener('click', () => {
  const dayTimeline = getVendorData('weddingDayTimeline', []).slice().sort((a, b) => a.time.localeCompare(b.time));
  openPrintableHtml(`<html><head><title>Wedding Day Timeline — ${escapeHtml(currentVendor.businessName)}</title></head>
    <body style="font-family:Georgia, serif; padding:2rem; color:#2E2E2E;">
      <h2 style="color:#0F6A5B;">Wedding Day Timeline</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:1rem;">
        <thead><tr style="text-align:left;border-bottom:2px solid #0F6A5B;"><th>Time</th><th>Activity</th></tr></thead>
        <tbody>
          ${dayTimeline.map(d => `<tr style="border-bottom:1px solid #eee;"><td>${escapeHtml(d.time)}</td><td>${escapeHtml(d.activity)}</td></tr>`).join('')}
        </tbody>
      </table>
    </body></html>`);
});

document.getElementById('addOfferBtn').addEventListener('click', () => {
  const vendorName = document.getElementById('offerVendorName').value.trim();
  const description = document.getElementById('offerDescription').value.trim();
  if (!vendorName || !description) { alert('Please enter a vendor name and offer description.'); return; }
  const offers = getVendorData('vendorOffers', []);
  offers.push({
    id: Date.now(), vendorName, description,
    code: document.getElementById('offerCode').value.trim(),
    expiry: document.getElementById('offerExpiry').value,
  });
  setVendorData('vendorOffers', offers);
  ['offerVendorName', 'offerDescription', 'offerCode', 'offerExpiry'].forEach(id => document.getElementById(id).value = '');
  renderWeddingTimeline();
});

// Categories whose packages are priced per-person (bride + bridesmaids,
// clients getting styled, etc.) rather than by a wedding guest-count range.
const PERSON_COUNT_CATEGORIES = ['Makeup Artists', 'Hair Stylists', 'Bridal Stylist', 'Zaffeh'];

function renderPackages() {
  // Photographers price purely by service type (no guest range); makeup
  // artists and hair stylists price by service type plus a person count;
  // venues price purely by guest-count range; DJs/bands and florists use
  // both (a package tier plus a guest range); florists get their own extra
  // decor-specific fields on top.
  const isFlorist = currentVendor.category === 'Florists & Decor';
  const isBridalShop = currentVendor.category === 'Bridal Dress Shops';
  const isSuitRental = currentVendor.category === 'Suit Rental';
  const isVehicleRental = currentVendor.category === 'Vehicle Rental';
  const isCatering = currentVendor.category === 'Catering';
  const isHoneymoonAgency = currentVendor.category === 'Honeymoon Agency';
  const isInvitationCards = currentVendor.category === 'Invitation Cards';
  const isJewelry = currentVendor.category === 'Jewelry';
  const isZaffeh = currentVendor.category === 'Zaffeh';
  const isCakeDesigner = currentVendor.category === 'Cake Designers';
  const isRestaurant = currentVendor.category === 'Restaurants';
  const isEntertainment = currentVendor.category === 'Wedding Entertainment';
  const isPersonCountCategory = PERSON_COUNT_CATEGORIES.includes(currentVendor.category);
  const typeOptions = PACKAGE_TYPE_OPTIONS[currentVendor.category];
  const useGuestsFields = currentVendor.category !== 'Photographers & Videographers' && !isPersonCountCategory && !isBridalShop && !isSuitRental && !isVehicleRental && !isHoneymoonAgency && !isInvitationCards && !isJewelry && !isCakeDesigner;
  document.getElementById('pkgGuestsGroup').classList.toggle('hidden', !useGuestsFields);
  document.getElementById('pkgTypeGroup').classList.toggle('hidden', !typeOptions);
  document.getElementById('pkgTypeLabel').textContent = (currentVendor.category === 'DJs & Bands' || isPersonCountCategory || isBridalShop || isSuitRental || isVehicleRental || isCatering || isHoneymoonAgency || isInvitationCards || isJewelry) ? 'Package Type' : 'Service Type';
  document.getElementById('pkgFloristFieldsGroup').classList.toggle('hidden', !isFlorist);
  document.getElementById('pkgMakeupFieldsGroup').classList.toggle('hidden', !isPersonCountCategory);
  document.getElementById('pkgBridalFieldsGroup').classList.toggle('hidden', !isBridalShop);
  document.getElementById('pkgSuitFieldsGroup').classList.toggle('hidden', !isSuitRental);
  document.getElementById('pkgVehicleFieldsGroup').classList.toggle('hidden', !isVehicleRental);
  document.getElementById('pkgCateringFieldsGroup').classList.toggle('hidden', !isCatering);
  document.getElementById('pkgHoneymoonFieldsGroup').classList.toggle('hidden', !isHoneymoonAgency);
  document.getElementById('pkgInvitationFieldsGroup').classList.toggle('hidden', !isInvitationCards);
  document.getElementById('pkgJewelryFieldsGroup').classList.toggle('hidden', !isJewelry);
  document.getElementById('pkgZaffehFieldsGroup').classList.toggle('hidden', !isZaffeh);
  document.getElementById('pkgCakeFieldsGroup').classList.toggle('hidden', !isCakeDesigner);
  document.getElementById('pkgRestaurantFieldsGroup').classList.toggle('hidden', !isRestaurant);
  document.getElementById('pkgEntertainmentFieldsGroup').classList.toggle('hidden', !isEntertainment);
  if (isZaffeh) {
    document.getElementById('pkgZaffehEntranceStylesGrid').innerHTML = ZAFFEH_SERVICES.map(s => `
      <label class="amenity-item"><input type="checkbox" value="${s}" class="pkg-zaffeh-entrance-style-check"> ${s}</label>
    `).join('');
  }
  document.getElementById('pkgAddonPrice').classList.toggle('hidden', isCatering);
  document.getElementById('pkgAddonImage').classList.toggle('hidden', !isCatering);
  document.getElementById('pkgPriceLabel').textContent = isFlorist || isJewelry ? 'Price From ($)' : isCatering ? 'Price Per Person ($)' : isHoneymoonAgency ? 'Price per Couple ($)' : (isZaffeh || isCakeDesigner) ? 'Starting Price ($)' : 'Price ($)';
  if (typeOptions) {
    document.getElementById('pkgType').innerHTML = typeOptions.map(t => `<option>${escapeHtml(t)}</option>`).join('');
  }

  const aiWrap = document.getElementById('aiPriceSuggestionWrap');
  if (planLevel() >= 3) {
    aiWrap.innerHTML = `
      <div class="admin-card" style="background:var(--bg);box-shadow:none;border:1px dashed var(--secondary);">
        <h3 style="margin-bottom:0.5rem;">✨ AI Pricing Suggestion <span class="plan-tag">Premium</span></h3>
        <p class="admin-hint" style="text-align:left;">Estimates a competitive price from your venue's capacity, indoor/outdoor type and the guest range you enter above.</p>
        <button type="button" class="admin-btn small outline" id="aiSuggestPriceBtn">Suggest a Price</button>
        <p id="aiSuggestionResult" style="margin-top:0.6rem;font-weight:700;color:var(--primary);"></p>
      </div>`;
    document.getElementById('aiSuggestPriceBtn').addEventListener('click', suggestAiPrice);
  } else {
    aiWrap.innerHTML = `<p class="admin-hint" style="text-align:left;">✨ AI Pricing Suggestions are available on the Premium Featured plan.</p>`;
  }

  const packages = getVendorData('packages', []);
  document.getElementById('packageGrid').innerHTML = packages.map(p => `
    <div class="package-card" data-id="${p.id}">
      <h4>${escapeHtml(p.name)} ${p.type ? `<span class="plan-tag" style="background:var(--primary);">${escapeHtml(p.type)}</span>` : ''}</h4>
      <div class="price">$${escapeHtml(p.price)}${p.priceMax ? `–$${escapeHtml(p.priceMax)}` : ''}${isCatering ? ` <span style="font-size:0.75rem;font-weight:400;color:#777;">/ person</span>` : isHoneymoonAgency ? ` <span style="font-size:0.75rem;font-weight:400;color:#777;">/ couple</span>` : ''}</div>
      ${useGuestsFields ? `<div class="meta">${escapeHtml(p.minGuests || 0)}–${escapeHtml(p.maxGuests || '∞')} guests</div>` : ''}
      ${p.description ? `<div class="note">${escapeHtml(p.description)}</div>` : ''}
      ${p.includedItems && p.includedItems.length ? `<div class="note"><strong>Included:</strong> ${p.includedItems.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.numberOfTables ? `<div class="note"><strong>Tables:</strong> ${escapeHtml(p.numberOfTables)}</div>` : ''}
      ${p.flowerTypes && p.flowerTypes.length ? `<div class="note"><strong>Flowers:</strong> ${p.flowerTypes.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.decorationStyle ? `<div class="note"><strong>Style:</strong> ${escapeHtml(p.decorationStyle)}</div>` : ''}
      ${p.includedServices && p.includedServices.length ? `<div class="note"><strong>Included:</strong> ${p.includedServices.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.setup ? `<div class="note"><strong>Setup:</strong> ${escapeHtml(p.setup)}</div>` : ''}
      ${p.duration ? `<div class="note"><strong>Duration:</strong> ${escapeHtml(p.duration)}</div>` : ''}
      ${p.customizationOptions && p.customizationOptions.length ? `<div class="note"><strong>Customization Options:</strong> ${p.customizationOptions.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.numberOfPeople ? `<div class="note"><strong>People Included:</strong> ${escapeHtml(p.numberOfPeople)}</div>` : ''}
      ${p.depositRequired ? `<div class="note"><strong>Deposit Required:</strong> ${escapeHtml(p.depositRequired)}</div>` : ''}
      ${p.extraHourPrice ? `<div class="note"><strong>Extra Hour Price:</strong> $${escapeHtml(p.extraHourPrice)}</div>` : ''}
      ${p.purchaseAvailable ? `<div class="note"><strong>Available for Purchase</strong> (not just rental)</div>` : ''}
      ${p.termsConditions ? `<div class="note"><strong>Terms &amp; Conditions:</strong> ${escapeHtml(p.termsConditions)}</div>` : ''}
      ${p.addons && p.addons.length ? `<div class="note"><strong>Add-ons:</strong> ${p.addons.map(addonDisplay).join(', ')}</div>` : ''}
      ${p.seasonal ? `<div class="note"><strong>Seasonal:</strong> ${escapeHtml(p.seasonal)}</div>` : ''}
      ${p.discount ? `<div class="note"><strong>Promo:</strong> ${escapeHtml(p.discount)}</div>` : ''}
      ${p.destination ? `<div class="note"><strong>Destination:</strong> ${escapeHtml(p.destination)}</div>` : ''}
      ${p.hotelInfo ? `<div class="note"><strong>Hotel Information:</strong> ${escapeHtml(p.hotelInfo)}</div>` : ''}
      ${p.flightDetails ? `<div class="note"><strong>Flight Details:</strong> ${escapeHtml(p.flightDetails)}</div>` : ''}
      ${p.transportation ? `<div class="note"><strong>Transportation:</strong> ${escapeHtml(p.transportation)}</div>` : ''}
      ${p.insurance ? `<div class="note"><strong>Insurance:</strong> ${escapeHtml(p.insurance)}</div>` : ''}
      ${p.availability ? `<div class="note"><strong>Availability:</strong> ${escapeHtml(p.availability)}</div>` : ''}
      ${p.minimumQuantity ? `<div class="note"><strong>Minimum Quantity:</strong> ${escapeHtml(p.minimumQuantity)}</div>` : ''}
      ${p.entranceStyles && p.entranceStyles.length ? `<div class="note"><strong>Entrance Styles:</strong> ${p.entranceStyles.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.musicOptions && p.musicOptions.length ? `<div class="note"><strong>Music Selection:</strong> ${p.musicOptions.map(escapeHtml).join(', ')}</div>` : ''}
      ${isHoneymoonAgency || isZaffeh || isCakeDesigner || isRestaurant || isEntertainment ? `
        <p style="margin-top:0.6rem;"><strong>${isZaffeh ? 'Performers Outfit Photos' : isCakeDesigner ? 'Cake Photos (360° Preview)' : 'Photos &amp; Videos'}</strong></p>
        ${isCakeDesigner ? '<p class="admin-hint" style="text-align:left;">Upload a few angles of this cake — couples can rotate through them before booking.</p>' : ''}
        <input type="file" class="honeymoon-package-media-input" accept="${(isZaffeh || isCakeDesigner) ? 'image/*' : 'image/*,video/*'}" multiple>
        <div class="gallery-grid-vendor">
          ${(p.media || []).map((m, i) => `
            <div class="gallery-thumb" data-media-i="${i}">${m.type === 'video' ? `<video src="${m.src}" muted></video>` : `<img loading="lazy" decoding="async" src="${m.src}">`}<button type="button" class="remove-honeymoon-package-media-btn">✕</button></div>
          `).join('') || `<p class="admin-empty">${(isZaffeh || isCakeDesigner) ? 'No photos yet.' : 'No photos or videos yet.'}</p>`}
        </div>` : ''}
      ${isZaffeh ? `
        <p style="margin-top:0.6rem;"><strong>Video Showcase</strong></p>
        <p class="admin-hint" style="text-align:left;">Upload clips of this package's performance so couples can watch before booking.</p>
        <input type="file" class="zaffeh-showcase-video-input" accept="video/*" multiple>
        <div class="gallery-grid-vendor">
          ${(p.showcaseVideos || []).map((v, i) => `
            <div class="gallery-thumb" data-video-i="${i}"><video src="${v.src}" muted></video><button type="button" class="remove-zaffeh-showcase-video-btn">✕</button></div>
          `).join('') || '<p class="admin-empty">No showcase videos yet.</p>'}
        </div>` : ''}
      <button class="admin-btn small danger delete-package-btn" style="margin-top:0.6rem;">Delete</button>
    </div>
  `).join('') || '<p class="admin-empty">No packages yet — create your first one above.</p>';

  document.querySelectorAll('.honeymoon-package-media-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('.package-card').dataset.id);
      const packages = getVendorData('packages', []);
      const pkg = packages.find(x => x.id === id);
      if (!pkg) return;
      pkg.media = pkg.media || [];
      for (const file of Array.from(e.target.files)) {
        if (file.type.startsWith('video/')) {
          if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
          pkg.media.push({ type: 'video', src: await uploadMedia(file, `vendors/${currentVendor.username}/packages`) });
        } else {
          pkg.media.push({ type: 'image', src: await uploadMedia(file, `vendors/${currentVendor.username}/packages`) });
        }
      }
      setVendorData('packages', packages);
      renderPackages();
    });
  });
  document.querySelectorAll('.remove-honeymoon-package-media-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('.package-card').dataset.id);
      const i = Number(btn.closest('[data-media-i]').dataset.mediaI);
      const packages = getVendorData('packages', []);
      const pkg = packages.find(x => x.id === id);
      if (pkg) pkg.media.splice(i, 1);
      setVendorData('packages', packages);
      renderPackages();
    });
  });

  document.querySelectorAll('.zaffeh-showcase-video-input').forEach(input => {
    input.addEventListener('change', async (e) => {
      const id = Number(input.closest('.package-card').dataset.id);
      const packages = getVendorData('packages', []);
      const pkg = packages.find(x => x.id === id);
      if (!pkg) return;
      pkg.showcaseVideos = pkg.showcaseVideos || [];
      for (const file of Array.from(e.target.files)) {
        if (file.size > MAX_VIDEO_BYTES) { alert(`"${file.name}" is larger than 8MB and was skipped.`); continue; }
        pkg.showcaseVideos.push({ src: await uploadMedia(file, `vendors/${currentVendor.username}/packages`) });
      }
      setVendorData('packages', packages);
      renderPackages();
    });
  });
  document.querySelectorAll('.remove-zaffeh-showcase-video-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('.package-card').dataset.id);
      const i = Number(btn.closest('[data-video-i]').dataset.videoI);
      const packages = getVendorData('packages', []);
      const pkg = packages.find(x => x.id === id);
      if (pkg) pkg.showcaseVideos.splice(i, 1);
      setVendorData('packages', packages);
      renderPackages();
    });
  });

  document.querySelectorAll('.delete-package-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('.package-card').dataset.id);
      setVendorData('packages', getVendorData('packages', []).filter(p => p.id !== id));
      renderPackages();
      populatePaymentBookingSelect();
    });
  });
}

document.getElementById('addPackageBtn').addEventListener('click', () => {
  const name = document.getElementById('pkgName').value.trim();
  const price = document.getElementById('pkgPrice').value;
  if (!name || !price) { alert('Please enter at least a package name and price.'); return; }
  const isFlorist = currentVendor.category === 'Florists & Decor';
  const isBridalShop = currentVendor.category === 'Bridal Dress Shops';
  const isSuitRental = currentVendor.category === 'Suit Rental';
  const isVehicleRental = currentVendor.category === 'Vehicle Rental';
  const isCatering = currentVendor.category === 'Catering';
  const isHoneymoonAgency = currentVendor.category === 'Honeymoon Agency';
  const isInvitationCards = currentVendor.category === 'Invitation Cards';
  const isJewelry = currentVendor.category === 'Jewelry';
  const isZaffeh = currentVendor.category === 'Zaffeh';
  const isCakeDesigner = currentVendor.category === 'Cake Designers';
  const isRestaurant = currentVendor.category === 'Restaurants';
  const isEntertainment = currentVendor.category === 'Wedding Entertainment';
  const isPersonCountCategory = PERSON_COUNT_CATEGORIES.includes(currentVendor.category);
  const useGuestsFields = currentVendor.category !== 'Photographers & Videographers' && !isPersonCountCategory && !isBridalShop && !isSuitRental && !isVehicleRental && !isHoneymoonAgency && !isInvitationCards && !isJewelry && !isCakeDesigner;
  const usesTypeField = !!PACKAGE_TYPE_OPTIONS[currentVendor.category];
  const packages = getVendorData('packages', []);
  packages.push({
    id: Date.now(),
    name, price,
    entranceStyles: isZaffeh ? Array.from(document.querySelectorAll('.pkg-zaffeh-entrance-style-check:checked')).map(c => c.value) : [],
    musicOptions: isZaffeh ? splitList(document.getElementById('pkgZaffehMusicOptions').value) : [],
    showcaseVideos: [],
    minGuests: useGuestsFields ? document.getElementById('pkgMinGuests').value : '',
    maxGuests: useGuestsFields ? document.getElementById('pkgMaxGuests').value : '',
    type: usesTypeField ? document.getElementById('pkgType').value : '',
    description: isFlorist ? document.getElementById('pkgDescription').value.trim() : isCakeDesigner ? document.getElementById('pkgCakeDescription').value.trim() : isRestaurant ? document.getElementById('pkgRestaurantDescription').value.trim() : isEntertainment ? document.getElementById('pkgEntertainmentDescription').value.trim() : '',
    setup: isRestaurant ? document.getElementById('pkgRestaurantSetup').value.trim() : '',
    includedItems: isFlorist ? splitList(document.getElementById('pkgIncludedItems').value)
      : isSuitRental ? splitList(document.getElementById('pkgSuitIncludedItems').value)
      : isCatering ? splitList(document.getElementById('pkgCateringIncludedDishes').value)
      : isHoneymoonAgency ? splitList(document.getElementById('pkgHoneymoonActivitiesIncluded').value)
      : isJewelry ? splitList(document.getElementById('pkgJewelryIncludedItems').value) : [],
    minimumQuantity: isInvitationCards ? document.getElementById('pkgInvitationMinQuantity').value : '',
    numberOfTables: isFlorist ? document.getElementById('pkgNumberOfTables').value : '',
    priceMax: isFlorist ? document.getElementById('pkgPriceMax').value : isJewelry ? document.getElementById('pkgJewelryPriceMax').value : '',
    flowerTypes: isFlorist ? splitList(document.getElementById('pkgFlowerTypes').value) : [],
    decorationStyle: isFlorist ? document.getElementById('pkgDecorationStyle').value.trim() : '',
    includedServices: isPersonCountCategory ? splitList(document.getElementById('pkgIncludedServices').value)
      : isBridalShop ? splitList(document.getElementById('pkgBridalIncludedServices').value)
      : isVehicleRental ? splitList(document.getElementById('pkgVehicleIncludedServices').value)
      : isHoneymoonAgency ? splitList(document.getElementById('pkgHoneymoonMealsIncluded').value)
      : isInvitationCards ? splitList(document.getElementById('pkgInvitationIncludedServices').value)
      : isCakeDesigner ? splitList(document.getElementById('pkgCakeIncludedServices').value)
      : isRestaurant ? splitList(document.getElementById('pkgRestaurantIncludedServices').value)
      : isEntertainment ? splitList(document.getElementById('pkgEntertainmentIncludedServices').value) : [],
    customizationOptions: isJewelry ? splitList(document.getElementById('pkgJewelryCustomizationOptions').value) : [],
    duration: isPersonCountCategory ? document.getElementById('pkgDuration').value.trim()
      : isBridalShop ? document.getElementById('pkgRentalDuration').value.trim()
      : isSuitRental ? document.getElementById('pkgSuitRentalDuration').value.trim()
      : isVehicleRental ? document.getElementById('pkgVehicleIncludedHours').value.trim()
      : isHoneymoonAgency ? document.getElementById('pkgHoneymoonDuration').value.trim()
      : isInvitationCards ? document.getElementById('pkgInvitationDeliveryTime').value.trim()
      : isJewelry ? document.getElementById('pkgJewelryDeliveryTime').value.trim() : '',
    numberOfPeople: isPersonCountCategory ? document.getElementById('pkgNumberOfPeople').value
      : isCakeDesigner ? document.getElementById('pkgCakeNumberOfServings').value : '',
    depositRequired: isBridalShop ? document.getElementById('pkgDepositRequired').value.trim()
      : isSuitRental ? document.getElementById('pkgSuitDepositRequired').value.trim()
      : isVehicleRental ? document.getElementById('pkgVehicleDepositRequired').value.trim() : '',
    termsConditions: isBridalShop ? document.getElementById('pkgTermsConditions').value.trim()
      : isSuitRental ? document.getElementById('pkgSuitTermsConditions').value.trim() : '',
    purchaseAvailable: isSuitRental ? document.getElementById('pkgSuitPurchaseCheck').checked : false,
    extraHourPrice: isVehicleRental ? document.getElementById('pkgVehicleExtraHourPrice').value : '',
    destination: isHoneymoonAgency ? document.getElementById('pkgHoneymoonDestination').value.trim() : '',
    hotelInfo: isHoneymoonAgency ? document.getElementById('pkgHoneymoonHotelInfo').value.trim() : '',
    flightDetails: isHoneymoonAgency ? document.getElementById('pkgHoneymoonFlightDetails').value.trim() : '',
    transportation: isHoneymoonAgency ? document.getElementById('pkgHoneymoonTransportation').value.trim() : '',
    insurance: isHoneymoonAgency ? document.getElementById('pkgHoneymoonInsurance').value.trim() : '',
    availability: isHoneymoonAgency ? document.getElementById('pkgHoneymoonAvailability').value : '',
    media: [],
    addons: packageAddonsDraft.slice(),
    seasonal: document.getElementById('pkgSeasonal').value.trim(),
    discount: document.getElementById('pkgDiscount').value.trim(),
  });
  setVendorData('packages', packages);
  [
    'pkgName', 'pkgPrice', 'pkgMinGuests', 'pkgMaxGuests', 'pkgSeasonal', 'pkgDiscount',
    'pkgDescription', 'pkgIncludedItems', 'pkgNumberOfTables', 'pkgPriceMax', 'pkgFlowerTypes', 'pkgDecorationStyle',
    'pkgIncludedServices', 'pkgDuration', 'pkgNumberOfPeople',
    'pkgBridalIncludedServices', 'pkgRentalDuration', 'pkgDepositRequired', 'pkgTermsConditions',
    'pkgSuitIncludedItems', 'pkgSuitRentalDuration', 'pkgSuitDepositRequired', 'pkgSuitTermsConditions',
    'pkgVehicleIncludedServices', 'pkgVehicleIncludedHours', 'pkgVehicleExtraHourPrice', 'pkgVehicleDepositRequired',
    'pkgCateringIncludedDishes',
    'pkgHoneymoonDestination', 'pkgHoneymoonDuration', 'pkgHoneymoonHotelInfo', 'pkgHoneymoonFlightDetails',
    'pkgHoneymoonActivitiesIncluded', 'pkgHoneymoonMealsIncluded', 'pkgHoneymoonTransportation', 'pkgHoneymoonInsurance',
    'pkgInvitationMinQuantity', 'pkgInvitationDeliveryTime', 'pkgInvitationIncludedServices',
    'pkgJewelryPriceMax', 'pkgJewelryIncludedItems', 'pkgJewelryCustomizationOptions', 'pkgJewelryDeliveryTime',
    'pkgZaffehMusicOptions', 'pkgCakeDescription', 'pkgCakeIncludedServices', 'pkgCakeNumberOfServings',
    'pkgRestaurantDescription', 'pkgRestaurantSetup', 'pkgRestaurantIncludedServices',
    'pkgEntertainmentDescription', 'pkgEntertainmentIncludedServices',
  ].forEach(id => document.getElementById(id).value = '');
  document.getElementById('pkgSuitPurchaseCheck').checked = false;
  document.querySelectorAll('.pkg-zaffeh-entrance-style-check').forEach(cb => cb.checked = false);
  packageAddonsDraft = [];
  renderPkgAddonsDraft();
  renderPackages();
});

// ===================================================================
// FOOD MENU
// ===================================================================
const DIETARY_OPTIONS = ['Vegetarian', 'Vegan', 'Gluten-Free', 'Halal', 'Kosher', 'Nut-Free', 'Dairy-Free'];

function renderFoodMenu() {
  document.getElementById('dietaryGrid').innerHTML = DIETARY_OPTIONS.map(d => `
    <label class="amenity-item"><input type="checkbox" value="${d}" class="dietary-check"> ${d}</label>
  `).join('');

  const menus = getVendorData('foodmenu', []);
  document.getElementById('foodMenuGrid').innerHTML = menus.map(m => `
    <div class="package-card" data-id="${m.id}">
      <h4>${escapeHtml(m.name)} <span class="plan-tag" style="background:var(--primary);">${escapeHtml(m.type)}</span></h4>
      <div class="price">$${escapeHtml(m.pricePerPerson)}<span style="font-size:0.8rem;font-weight:400;color:#777;"> / person</span></div>
      <div class="meta">${escapeHtml(m.minGuests || 0)}–${escapeHtml(m.maxGuests || '∞')} guests</div>
      ${m.appetizers && m.appetizers.length ? `<div class="note"><strong>Appetizers:</strong> ${m.appetizers.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.mains && m.mains.length ? `<div class="note"><strong>Main Course:</strong> ${m.mains.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.stations && m.stations.length ? `<div class="note"><strong>Live Stations:</strong> ${m.stations.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.sides && m.sides.length ? `<div class="note"><strong>Sides:</strong> ${m.sides.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.desserts && m.desserts.length ? `<div class="note"><strong>Desserts:</strong> ${m.desserts.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.beverages && m.beverages.length ? `<div class="note"><strong>Beverages:</strong> ${m.beverages.map(escapeHtml).join(', ')}${m.includesAlcohol ? ' (includes alcohol)' : ''}</div>` : ''}
      ${m.dietary && m.dietary.length ? `<div class="note"><strong>Dietary:</strong> ${m.dietary.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.childrenPrice ? `<div class="note"><strong>Children:</strong> ${escapeHtml(m.childrenPrice)}</div>` : ''}
      ${m.serviceChargeEnabled ? `<div class="note"><strong>Service Charge:</strong> ${escapeHtml(m.serviceChargePercent || 0)}%</div>` : ''}
      ${m.extras && m.extras.length ? `<div class="note"><strong>Extras:</strong> ${m.extras.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.customization ? `<div class="note"><strong>Customization:</strong> ${escapeHtml(m.customization)}</div>` : ''}
      <button class="admin-btn small danger delete-foodmenu-btn" style="margin-top:0.6rem;">Delete</button>
    </div>
  `).join('') || '<p class="admin-empty">No menu packages yet — create your first one above.</p>';

  document.querySelectorAll('.delete-foodmenu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('.package-card').dataset.id);
      setVendorData('foodmenu', getVendorData('foodmenu', []).filter(m => m.id !== id));
      renderFoodMenu();
    });
  });
}

function splitList(str) { return str.split(',').map(s => s.trim()).filter(Boolean); }

document.getElementById('addFoodMenuBtn').addEventListener('click', () => {
  const name = document.getElementById('fmName').value.trim();
  const pricePerPerson = document.getElementById('fmPricePerPerson').value;
  if (!name || !pricePerPerson) { alert('Please enter at least a menu name and price per person.'); return; }
  const menus = getVendorData('foodmenu', []);
  menus.push({
    id: Date.now(),
    name,
    type: document.getElementById('fmType').value,
    appetizers: splitList(document.getElementById('fmAppetizers').value),
    mains: splitList(document.getElementById('fmMains').value),
    stations: splitList(document.getElementById('fmStations').value),
    sides: splitList(document.getElementById('fmSides').value),
    desserts: splitList(document.getElementById('fmDesserts').value),
    beverages: splitList(document.getElementById('fmBeverages').value),
    includesAlcohol: document.getElementById('fmIncludesAlcohol').checked,
    dietary: Array.from(document.querySelectorAll('.dietary-check:checked')).map(c => c.value),
    pricePerPerson,
    childrenPrice: document.getElementById('fmChildrenPrice').value.trim(),
    minGuests: document.getElementById('fmMinGuests').value,
    maxGuests: document.getElementById('fmMaxGuests').value,
    serviceChargeEnabled: document.getElementById('fmServiceChargeEnabled').checked,
    serviceChargePercent: document.getElementById('fmServiceChargePercent').value,
    extras: splitList(document.getElementById('fmExtras').value),
    customization: document.getElementById('fmCustomization').value.trim(),
  });
  setVendorData('foodmenu', menus);

  ['fmName', 'fmAppetizers', 'fmMains', 'fmStations', 'fmSides', 'fmDesserts', 'fmBeverages',
    'fmPricePerPerson', 'fmChildrenPrice', 'fmMinGuests', 'fmMaxGuests', 'fmServiceChargePercent',
    'fmExtras', 'fmCustomization'].forEach(id => document.getElementById(id).value = '');
  document.getElementById('fmIncludesAlcohol').checked = false;
  document.getElementById('fmServiceChargeEnabled').checked = false;
  document.querySelectorAll('.dietary-check').forEach(c => c.checked = false);
  renderFoodMenu();
});

// ===================================================================
// TABLE SEATING PLANNER (Wedding Venues only) — floor layout by table,
// labeled by group/party since a venue has no access to a specific
// couple's private guest list (that lives only in the couple's own
// planning dashboard, a separate account with no cross-account sharing).
// ===================================================================
const VENUE_TABLE_SHAPES = {
  round: { w: 90, h: 90, radius: '50%', label: 'Round' },
  square: { w: 80, h: 80, radius: '8px', label: 'Square' },
  rectangle: { w: 120, h: 70, radius: '8px', label: 'Rectangle' },
  long: { w: 160, h: 50, radius: '8px', label: 'Long' },
};

function renderVenueSeating() {
  if (currentVendor.category !== 'Wedding Venues') return;

  const tables = getVendorData('venueTables', []);
  document.getElementById('venueSeatingLayout').innerHTML = tables.map(t => {
    const shape = VENUE_TABLE_SHAPES[t.shape] || VENUE_TABLE_SHAPES.round;
    return `
    <div class="admin-card" data-table-id="${t.id}" style="width:180px;text-align:center;background:var(--bg);">
      <div style="width:${shape.w}px;height:${shape.h}px;border-radius:${shape.radius};background:var(--primary);color:var(--accent);display:flex;align-items:center;justify-content:center;margin:0 auto 0.6rem;font-size:0.8rem;font-weight:700;">${escapeHtml(t.seats)} seats</div>
      <p style="margin:0 0 0.4rem;font-weight:700;">${escapeHtml(t.label)}</p>
      <span class="amenity-tag">${escapeHtml(shape.label)}</span>
      <button type="button" class="admin-btn small danger delete-venue-table-btn" style="margin-top:0.6rem;display:block;width:100%;">Delete</button>
    </div>`;
  }).join('') || '<p class="admin-empty">No tables yet — add one above.</p>';

  document.querySelectorAll('.delete-venue-table-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-table-id]').dataset.tableId);
      setVendorData('venueTables', getVendorData('venueTables', []).filter(t => t.id !== id));
      renderVenueSeating();
    });
  });
}

document.getElementById('addVenueTableBtn').addEventListener('click', () => {
  const label = document.getElementById('venueTableLabel').value.trim();
  if (!label) { alert('Please enter a table label.'); return; }
  const tables = getVendorData('venueTables', []);
  tables.push({
    id: Date.now(),
    label,
    shape: document.getElementById('venueTableShape').value,
    seats: document.getElementById('venueTableSeats').value || 8,
  });
  setVendorData('venueTables', tables);
  document.getElementById('venueTableLabel').value = '';
  document.getElementById('venueTableSeats').value = '8';
  renderVenueSeating();
});

// ===================================================================
// INTERACTIVE VENUE MAP (Wedding Venues only) — a floor-plan background
// with draggable markers (table/stage/bar/dance floor/entrance), saved as
// percentage-based positions so the layout stays correct at any screen
// size. Couples see a read-only version on the public profile.
// ===================================================================
const VENUE_MAP_MARKER_ICONS = { table: '🍽️', stage: '🎤', bar: '🍸', dancefloor: '💃', entrance: '🚪' };

function renderVenueMap() {
  if (currentVendor.category !== 'Wedding Venues') return;

  const mapData = getVendorData('venueMap', { background: '', markers: [] });
  const canvas = document.getElementById('venueMapCanvas');
  canvas.style.backgroundImage = mapData.background ? `url(${mapData.background})` : '';

  canvas.innerHTML = mapData.markers.length ? mapData.markers.map(m => `
    <div class="venue-map-marker" data-marker-id="${m.id}" style="position:absolute;left:${m.x}%;top:${m.y}%;transform:translate(-50%,-50%);cursor:move;text-align:center;user-select:none;">
      <div style="font-size:1.8rem;line-height:1;">${VENUE_MAP_MARKER_ICONS[m.type] || '📍'}</div>
      ${m.label ? `<div style="font-size:0.7rem;background:rgba(255,255,255,0.85);border-radius:4px;padding:1px 4px;">${escapeHtml(m.label)}</div>` : ''}
      <button type="button" class="remove-venue-map-marker-btn" style="position:absolute;top:-8px;right:-8px;width:18px;height:18px;border-radius:50%;border:none;background:#c0392b;color:#fff;font-size:0.7rem;line-height:1;cursor:pointer;">✕</button>
    </div>
  `).join('') : '<p class="admin-empty" style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%);">Upload a floor plan above, then add markers — drag them into place.</p>';

  document.querySelectorAll('.remove-venue-map-marker-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const id = Number(btn.closest('[data-marker-id]').dataset.markerId);
      const data = getVendorData('venueMap', { background: '', markers: [] });
      data.markers = data.markers.filter(m => m.id !== id);
      setVendorData('venueMap', data);
      renderVenueMap();
    });
  });

  document.querySelectorAll('.venue-map-marker').forEach(marker => {
    marker.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const id = Number(marker.dataset.markerId);
      function onMove(moveEvent) {
        const rect = canvas.getBoundingClientRect();
        let x = ((moveEvent.clientX - rect.left) / rect.width) * 100;
        let y = ((moveEvent.clientY - rect.top) / rect.height) * 100;
        x = Math.max(0, Math.min(100, x));
        y = Math.max(0, Math.min(100, y));
        marker.style.left = `${x}%`;
        marker.style.top = `${y}%`;
        marker.dataset.pendingX = x;
        marker.dataset.pendingY = y;
      }
      function onUp() {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (marker.dataset.pendingX == null) return;
        const data = getVendorData('venueMap', { background: '', markers: [] });
        const m = data.markers.find(x => x.id === id);
        if (m) {
          m.x = Number(marker.dataset.pendingX);
          m.y = Number(marker.dataset.pendingY);
        }
        setVendorData('venueMap', data);
      }
      document.addEventListener('mousemove', onMove);
      document.addEventListener('mouseup', onUp);
    });
  });
}

document.getElementById('venueMapBackgroundInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  const data = getVendorData('venueMap', { background: '', markers: [] });
  data.background = await uploadMedia(file, `vendors/${currentVendor.username}/venueMap`, 1400, 0.85);
  setVendorData('venueMap', data);
  renderVenueMap();
});

document.getElementById('addVenueMapMarkerBtn').addEventListener('click', () => {
  const data = getVendorData('venueMap', { background: '', markers: [] });
  data.markers = data.markers || [];
  data.markers.push({
    id: Date.now(),
    type: document.getElementById('venueMapMarkerType').value,
    label: document.getElementById('venueMapMarkerLabel').value.trim(),
    x: 50,
    y: 50,
  });
  setVendorData('venueMap', data);
  document.getElementById('venueMapMarkerLabel').value = '';
  renderVenueMap();
});

// ===================================================================
// AVAILABILITY CALENDAR (Professional+)
// ===================================================================
let calendarViewDate = new Date();
// Hair stylists and makeup artists book trial sessions ahead of the wedding
// day itself, distinct from the actual booked appointment — worth its own
// calendar state rather than lumping it in with "Booked".
const TRIAL_SESSION_CATEGORIES = ['Hair Stylists', 'Makeup Artists'];
const WEDDING_DATE_CATEGORIES = ['Bridal Dress Shops', 'Vehicle Rental', 'Zaffeh', 'Cake Designers'];
const SUIT_PICKUP_RETURN_CATEGORIES = ['Suit Rental'];
const DRIVER_AVAILABILITY_CATEGORIES = ['Vehicle Rental'];
const STAFF_AVAILABILITY_CATEGORIES = ['Catering'];
const SEASONAL_OFFER_CATEGORIES = ['Honeymoon Agency'];

function renderAvailability() {
  const container = document.getElementById('availabilityContent');
  if (planLevel() < 2) {
    container.innerHTML = `
      <div class="locked-panel">
        <div class="lock-icon">🔒</div>
        <h3>Availability Calendar is a Professional feature</h3>
        <p>Upgrade your subscription plan to block dates, mark reservations and manage maintenance days.</p>
        <span class="upgrade-note">Upgrade in "List Your Business" → Choose a Subscription Plan</span>
      </div>`;
    return;
  }
  const usesTrialState = TRIAL_SESSION_CATEGORIES.includes(currentVendor.category);
  const usesWeddingState = WEDDING_DATE_CATEGORIES.includes(currentVendor.category);
  const usesPickupReturnState = SUIT_PICKUP_RETURN_CATEGORIES.includes(currentVendor.category);
  const usesDriverAvailabilityState = DRIVER_AVAILABILITY_CATEGORIES.includes(currentVendor.category);
  const usesStaffAvailabilityState = STAFF_AVAILABILITY_CATEGORIES.includes(currentVendor.category);
  const usesSeasonalOfferState = SEASONAL_OFFER_CATEGORIES.includes(currentVendor.category);
  const reservedLabel = usesDriverAvailabilityState ? 'Reserved (Vehicle Held)' : currentVendor.category === 'Zaffeh' ? 'Reserved (Performance Held)' : currentVendor.category === 'Cake Designers' ? 'Reserved (Order Held)' : currentVendor.category === 'Restaurants' ? 'Reserved (Event Booked)' : currentVendor.category === 'Wedding Entertainment' ? 'Reserved (Service Booked)' : usesWeddingState ? 'Reserved (Dress Held)' : usesPickupReturnState ? 'Reserved (Suit Held)' : usesStaffAvailabilityState ? 'Confirmed Event' : usesSeasonalOfferState ? 'Package Booked' : 'Booked';
  const calendar = getVendorData('calendar', {});
  const year = calendarViewDate.getFullYear();
  const month = calendarViewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const monthName = calendarViewDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += `<div class="calendar-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const status = calendar[dateStr] || 'available';
    cells += `<div class="calendar-day ${status}" data-date="${dateStr}">${d}</div>`;
  }

  container.innerHTML = `
    <div class="admin-card">
      <div class="calendar-header">
        <button class="admin-btn small outline" id="calPrevBtn">← Prev</button>
        <h3>${monthName}</h3>
        <button class="admin-btn small outline" id="calNextBtn">Next →</button>
      </div>
      <div class="calendar-grid">
        <div class="calendar-dow">Sun</div><div class="calendar-dow">Mon</div><div class="calendar-dow">Tue</div>
        <div class="calendar-dow">Wed</div><div class="calendar-dow">Thu</div><div class="calendar-dow">Fri</div><div class="calendar-dow">Sat</div>
        ${cells}
      </div>
      <div class="calendar-legend">
        <span><span class="legend-dot" style="background:var(--bg);border:1px solid #ddd;"></span> Available</span>
        <span><span class="legend-dot" style="background:#eee;"></span> Blocked</span>
        ${usesTrialState ? `<span><span class="legend-dot" style="background:#e8b4b8;"></span> Trial Session</span>` : ''}
        <span><span class="legend-dot" style="background:var(--primary);"></span> ${escapeHtml(reservedLabel)}</span>
        ${usesWeddingState ? `<span><span class="legend-dot" style="background:#c9a15a;"></span> Wedding Date</span>` : ''}
        ${usesPickupReturnState ? `<span><span class="legend-dot" style="background:#8fb996;"></span> Pickup Schedule</span><span><span class="legend-dot" style="background:#7fa8c9;"></span> Return Schedule</span>` : ''}
        ${usesDriverAvailabilityState ? `<span><span class="legend-dot" style="background:#c97b7b;"></span> Driver Unavailable</span>` : ''}
        ${usesStaffAvailabilityState ? `<span><span class="legend-dot" style="background:#c97b7b;"></span> Staff Unavailable</span>` : ''}
        ${usesSeasonalOfferState ? `<span><span class="legend-dot" style="background:#e8cf7a;"></span> Seasonal Offer</span>` : ''}
        <span><span class="legend-dot" style="background:var(--secondary);"></span> Vacation Day</span>
      </div>
      <p class="admin-hint" style="text-align:left;">Click a date to cycle: Available → Blocked${usesTrialState ? ' → Trial Session' : ''} → ${escapeHtml(reservedLabel)}${usesWeddingState ? ' → Wedding Date' : ''}${usesPickupReturnState ? ' → Pickup Schedule → Return Schedule' : ''}${usesDriverAvailabilityState ? ' → Driver Unavailable' : ''}${usesStaffAvailabilityState ? ' → Staff Unavailable' : ''}${usesSeasonalOfferState ? ' → Seasonal Offer' : ''} → Vacation Day.</p>
    </div>`;

  document.getElementById('calPrevBtn').addEventListener('click', () => { calendarViewDate.setMonth(calendarViewDate.getMonth() - 1); renderAvailability(); });
  document.getElementById('calNextBtn').addEventListener('click', () => { calendarViewDate.setMonth(calendarViewDate.getMonth() + 1); renderAvailability(); });

  const cycle = usesTrialState
    ? ['available', 'blocked', 'trial', 'reserved', 'maintenance']
    : usesWeddingState
    ? (usesDriverAvailabilityState
        ? ['available', 'blocked', 'reserved', 'wedding', 'driverunavailable', 'maintenance']
        : ['available', 'blocked', 'reserved', 'wedding', 'maintenance'])
    : usesPickupReturnState
    ? ['available', 'blocked', 'reserved', 'pickup', 'return', 'maintenance']
    : usesStaffAvailabilityState
    ? ['available', 'blocked', 'reserved', 'staffunavailable', 'maintenance']
    : usesSeasonalOfferState
    ? ['available', 'blocked', 'reserved', 'seasonaloffer', 'maintenance']
    : ['available', 'blocked', 'reserved', 'maintenance'];
  document.querySelectorAll('.calendar-day:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const calendar = getVendorData('calendar', {});
      const date = cell.dataset.date;
      const current = calendar[date] || 'available';
      const next = cycle[(cycle.indexOf(current) + 1) % cycle.length];
      if (next === 'available') delete calendar[date]; else calendar[date] = next;
      setVendorData('calendar', calendar);
      renderAvailability();
    });
  });
}

// ===================================================================
// APPOINTMENTS (free consultations — available on all plans)
// ===================================================================
// Suit Rental tracks appointments by fitting lifecycle stage rather than a
// generic new/confirmed/history split, since a "confirmed fitting" is
// meaningfully different from a routine pickup or return appointment.
const SUIT_APPOINTMENT_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'new-fitting', label: 'New Fitting Requests' },
  { value: 'consultation', label: 'Consultation Appointments' },
  { value: 'confirmed-fitting', label: 'Confirmed Fittings' },
  { value: 'pickup', label: 'Pickup Appointments' },
  { value: 'return', label: 'Return Appointments' },
  { value: 'history', label: 'Appointment History' },
];
const GENERIC_APPOINTMENT_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'new', label: 'New Requests' },
  { value: 'confirmed', label: 'Confirmed' },
  { value: 'history', label: 'History (Declined / Cancelled)' },
];
// Jewelry tracks appointments by what the visit is actually for (a
// consultation, picking a ring, a fitting, or a custom design meeting)
// rather than a plain new/confirmed split, since each purpose implies a
// different next step for the vendor.
const JEWELRY_APPOINTMENT_FILTER_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'consultation', label: 'New Consultation Requests' },
  { value: 'ring-selection', label: 'Ring Selection Appointments' },
  { value: 'fitting', label: 'Fitting Appointments' },
  { value: 'custom-design', label: 'Custom Design Meetings' },
  { value: 'confirmed', label: 'Confirmed Appointments' },
  { value: 'history', label: 'Appointment History' },
];

function renderAppointments() {
  const appts = getVendorData('appointments', []);
  const body = document.getElementById('appointmentsTableBody');
  if (!appts.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No appointment requests yet.</td></tr>`; return; }

  const filterSelect = document.getElementById('appointmentsFilter');
  const isSuitRental = currentVendor.category === 'Suit Rental';
  const isJewelry = currentVendor.category === 'Jewelry';
  const mode = isSuitRental ? 'suit' : isJewelry ? 'jewelry' : 'generic';
  if (filterSelect.dataset.mode !== mode) {
    const options = isSuitRental ? SUIT_APPOINTMENT_FILTER_OPTIONS : isJewelry ? JEWELRY_APPOINTMENT_FILTER_OPTIONS : GENERIC_APPOINTMENT_FILTER_OPTIONS;
    filterSelect.innerHTML = options.map(o => `<option value="${o.value}">${o.label}</option>`).join('');
    filterSelect.dataset.mode = mode;
  }

  const filter = filterSelect.value;
  const filtered = appts.filter(a => {
    if (isSuitRental) {
      if (filter === 'new-fitting') return a.purpose === 'New Fitting' && a.status === 'Pending';
      if (filter === 'consultation') return a.purpose === 'Consultation';
      if (filter === 'confirmed-fitting') return a.purpose === 'New Fitting' && a.status === 'Confirmed';
      if (filter === 'pickup') return a.purpose === 'Pickup';
      if (filter === 'return') return a.purpose === 'Return';
      if (filter === 'history') return a.status === 'Declined' || a.status === 'Cancelled';
      return true;
    }
    if (isJewelry) {
      if (filter === 'consultation') return a.purpose === 'Consultation' && a.status === 'Pending';
      if (filter === 'ring-selection') return a.purpose === 'Ring Selection';
      if (filter === 'fitting') return a.purpose === 'Fitting';
      if (filter === 'custom-design') return a.purpose === 'Custom Design';
      if (filter === 'confirmed') return a.status === 'Confirmed';
      if (filter === 'history') return a.status === 'Declined' || a.status === 'Cancelled';
      return true;
    }
    if (filter === 'new') return a.status === 'Pending';
    if (filter === 'confirmed') return a.status === 'Confirmed';
    if (filter === 'history') return a.status === 'Declined' || a.status === 'Cancelled';
    return true;
  });
  if (!filtered.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No appointments match this filter.</td></tr>`; return; }

  const isInvitationCards = currentVendor.category === 'Invitation Cards';
  body.innerHTML = filtered.slice().reverse().map(a => `
    <tr data-id="${a.id}">
      <td>${escapeHtml(a.fullName)}${a.purpose ? `<br><span style="color:#999;">📝 ${escapeHtml(a.purpose)}</span>` : ''}${a.dressName ? `<br><span style="color:#999;">👗 ${escapeHtml(a.dressName)}</span>` : ''}
        ${isInvitationCards ? `<br><textarea class="appt-notes-input" rows="2" placeholder="Client notes..." style="width:100%;margin-top:4px;">${escapeHtml(a.notes || '')}</textarea><button type="button" class="admin-btn small outline save-appt-notes-btn" style="margin-top:2px;">Save Notes</button><span class="admin-note save-appt-notes-note"></span>` : ''}
      </td>
      <td>${escapeHtml(a.email)}<br>${escapeHtml(a.phone)}</td>
      <td>${escapeHtml(a.weddingDate)}</td>
      <td>
        ${a.status === 'Pending' || a.status === 'Confirmed'
          ? `<input type="date" class="appt-date-input" value="${escapeHtml(a.apptDate)}" style="margin-bottom:4px;"><input type="time" class="appt-time-input" value="${escapeHtml(a.apptTime)}">`
          : `${escapeHtml(a.apptDate)} ${escapeHtml(a.apptTime)}`}
      </td>
      <td><span class="status-pill ${a.status.toLowerCase()}">${a.status}</span></td>
      <td class="action-btns">
        ${a.status === 'Pending' ? `<button class="admin-btn small confirm-appt-btn">Confirm</button><button class="admin-btn small danger decline-appt-btn">Decline</button>` : ''}
        ${a.status === 'Pending' || a.status === 'Confirmed' ? `<button class="admin-btn small outline reschedule-appt-btn">Reschedule</button><button class="admin-btn small danger cancel-appt-btn">Cancel</button>` : ''}
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.id);
    function update(patch) {
      const appts = getVendorData('appointments', []);
      const a = appts.find(x => x.id === id);
      if (a) Object.assign(a, patch);
      setVendorData('appointments', appts);
      renderAppointments(); renderOverview();
      return a;
    }
    const confirmBtn = row.querySelector('.confirm-appt-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => {
      const a = update({ status: 'Confirmed' });
      if (a) sendWhatsAppConfirmation(a);
    });
    const declineBtn = row.querySelector('.decline-appt-btn');
    if (declineBtn) declineBtn.addEventListener('click', () => update({ status: 'Declined' }));
    const cancelBtn = row.querySelector('.cancel-appt-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => update({ status: 'Cancelled' }));
    const rescheduleBtn = row.querySelector('.reschedule-appt-btn');
    if (rescheduleBtn) rescheduleBtn.addEventListener('click', () => {
      const newDate = row.querySelector('.appt-date-input').value;
      const newTime = row.querySelector('.appt-time-input').value;
      const a = update({ apptDate: newDate, apptTime: newTime, status: 'Pending' });
      if (a) pushNotification('booking', `Appointment with ${a.fullName} rescheduled — awaiting reconfirmation.`);
    });
    const saveNotesBtn = row.querySelector('.save-appt-notes-btn');
    if (saveNotesBtn) saveNotesBtn.addEventListener('click', () => {
      const notes = row.querySelector('.appt-notes-input').value.trim();
      const appts = getVendorData('appointments', []);
      const a = appts.find(x => x.id === id);
      if (a) a.notes = notes;
      setVendorData('appointments', appts);
      const note = row.querySelector('.save-appt-notes-note');
      note.textContent = 'Saved.';
      setTimeout(() => { note.textContent = ''; }, 2000);
    });
  });
}

document.getElementById('appointmentsFilter').addEventListener('change', renderAppointments);

// Opens a WhatsApp chat pre-filled with a confirmation message. There's no
// real WhatsApp Business API here — this just hands off to WhatsApp Web/App,
// which the vendor still has to hit "send" on.
function sendWhatsAppConfirmation(appt) {
  const phone = (appt.phone || '').replace(/\D/g, '');
  const msg = `Hi ${appt.fullName}, your appointment with ${currentVendor.businessName} on ${appt.apptDate} at ${appt.apptTime} is confirmed! Looking forward to meeting you.`;
  if (!phone) { pushNotification('booking', `Appointment with ${appt.fullName} confirmed (no phone number to message via WhatsApp).`); return; }
  window.open(`https://wa.me/${phone}?text=${encodeURIComponent(msg)}`, '_blank');
  pushNotification('booking', `Appointment with ${appt.fullName} confirmed — WhatsApp message opened.`);
}

// ===================================================================
// BOOKING MANAGEMENT (Professional+)
// ===================================================================
// Invitation Cards orders move through a print-production pipeline rather
// than a simple Pending/Confirmed split — this drives a status <select> in
// place of the generic Confirm/Cancel buttons, for that category only.
const ORDER_STATUS_OPTIONS = [
  'Pending', 'Design Approval', 'Editing Requested', 'Printing', 'Ready for Delivery', 'Completed', 'Cancelled',
];
// Cake orders move through design approval before they're confirmed, but
// skip the print-production stages Invitation Cards needs — a lighter
// pipeline than ORDER_STATUS_OPTIONS above.
const CAKE_ORDER_STATUS_OPTIONS = ['Pending', 'Design Approval', 'Confirmed', 'Completed', 'Cancelled'];
// Delivery tracking is vendor-managed only — there's no couple-account link
// back to a specific booking anywhere in this app, so there is no live
// customer-facing tracker, just a status the vendor updates as they go.
const CAKE_DELIVERY_STATUSES = ['Order Confirmed', 'Preparing', 'Out for Delivery', 'Delivered'];
// Restaurant reservations skip the design/delivery stages entirely — just a
// simple request → confirmed → completed lifecycle, plus a deposit status
// since events often require a deposit to hold the date.
const RESTAURANT_ORDER_STATUS_OPTIONS = ['Pending', 'Confirmed', 'Completed', 'Cancelled'];
const RESTAURANT_DEPOSIT_STATUSES = ['Not Paid', 'Partial', 'Paid in Full', 'Refunded'];
let bookingFilter = 'all';

function renderBookings() {
  const container = document.getElementById('bookingsContent');
  if (planLevel() < 2) {
    container.innerHTML = `
      <div class="locked-panel">
        <div class="lock-icon">🔒</div>
        <h3>Full Booking Management is a Professional feature</h3>
        <p>Your Basic plan still receives inquiries and appointment requests — check the "Customer Inquiries" tab. Upgrade to Professional for booking requests, deposits, cancellations and history.</p>
        <span class="upgrade-note">Upgrade in "List Your Business" → Choose a Subscription Plan</span>
      </div>`;
    return;
  }
  bookingFilter = 'all';
  const packages = getVendorData('packages', []);
  const bookings = getVendorData('bookings', []);
  const isPremium = planLevel() >= 3;
  const autoConfirm = getVendorData('auto_confirm', false);

  container.innerHTML = `
    <div class="admin-card">
      <h3>New Booking</h3>
      <div class="admin-inline-form">
        <input type="text" id="bkCoupleName" placeholder="Couple name">
        <input type="date" id="bkDate">
        <select id="bkPackage">${packages.map(p => `<option value="${escapeHtml(p.name)}">${escapeHtml(p.name)}</option>`).join('') || '<option value="">No packages yet</option>'}</select>
        <input type="number" id="bkDeposit" placeholder="Deposit ($)" min="0">
        <button class="admin-btn small" id="addBookingBtn">Add</button>
      </div>
      ${isPremium
        ? `<label style="display:flex;align-items:center;gap:0.5rem;margin-top:0.8rem;font-size:0.85rem;">
             <input type="checkbox" id="autoConfirmToggle" ${autoConfirm ? 'checked' : ''}>
             Automatically confirm new bookings <span class="plan-tag">Premium</span>
           </label>`
        : `<p class="admin-hint" style="text-align:left;">Automated booking confirmations are available on the Premium Featured plan.</p>`}
    </div>
    <div class="admin-card">
      <h3>Upcoming Event Schedule</h3>
      <div id="eventScheduleList"></div>
    </div>
    <div class="admin-card">
      <div class="admin-topbar" style="margin-bottom:0.8rem;">
        <h3 style="margin:0;">All Bookings</h3>
        ${isPremium
          ? `<span><button class="admin-btn small outline" id="exportCsvBtn">⬇ Export to Excel (CSV)</button>
               <button class="admin-btn small outline" id="exportPdfBtn">🖨 Print Report (PDF)</button></span>`
          : `<span class="admin-hint">Export/Print Report is a Premium Featured feature.</span>`}
      </div>
      <div class="admin-inline-form" style="margin-bottom:0.8rem;">
        ${(currentVendor.category === 'Vehicle Rental' ? [
          { filter: 'all', label: 'All' },
          { filter: 'Pending', label: 'New Booking Requests' },
          { filter: 'Confirmed', label: 'Confirmed Bookings' },
          { filter: 'wedding-schedule', label: 'Wedding Schedule' },
          { filter: 'history', label: 'Booking History' },
          { filter: 'cancelled', label: 'Cancellation Management' },
        ] : currentVendor.category === 'Catering' ? [
          { filter: 'all', label: 'All' },
          { filter: 'Pending', label: 'New Requests' },
          { filter: 'quote-requests', label: 'Quote Requests' },
          { filter: 'Confirmed', label: 'Confirmed Bookings' },
          { filter: 'history', label: 'Booking History' },
        ] : currentVendor.category === 'Invitation Cards' ? [
          { filter: 'all', label: 'All' },
          { filter: 'Pending', label: 'New Orders' },
          { filter: 'design-approval', label: 'Design Approval' },
          { filter: 'editing-requests', label: 'Editing Requests' },
          { filter: 'printing', label: 'Printing Status' },
          { filter: 'ready-delivery', label: 'Ready for Delivery' },
          { filter: 'completed', label: 'Completed Orders' },
          { filter: 'history', label: 'Order History' },
        ] : currentVendor.category === 'Cake Designers' ? [
          { filter: 'all', label: 'All' },
          { filter: 'Pending', label: 'New Order Requests' },
          { filter: 'design-approval', label: 'Design Approval' },
          { filter: 'Confirmed', label: 'Confirmed Orders' },
          { filter: 'completed', label: 'Completed Orders' },
          { filter: 'history', label: 'Order History' },
        ] : currentVendor.category === 'Restaurants' ? [
          { filter: 'all', label: 'All' },
          { filter: 'Pending', label: 'New Reservation Requests' },
          { filter: 'Confirmed', label: 'Confirmed Reservations' },
          { filter: 'history', label: 'Reservation History' },
        ] : [
          { filter: 'all', label: 'All' },
          { filter: 'Pending', label: 'New Requests' },
          { filter: 'Confirmed', label: 'Confirmed' },
          { filter: 'history', label: 'Booking History' },
        ]).map(f => `<button type="button" class="admin-btn small outline booking-filter${f.filter === 'all' ? ' active' : ''}" data-filter="${f.filter}">${f.label}</button>`).join('')}
      </div>
      <div class="admin-table-wrap">
        <table class="admin-table">
          <thead><tr><th>Couple</th><th>Date</th><th>Package</th><th>Deposit</th><th>Status</th><th>Contract</th><th>Actions</th></tr></thead>
          <tbody id="bookingsTableBody"></tbody>
        </table>
      </div>
    </div>`;

  if (isPremium) {
    document.getElementById('autoConfirmToggle').addEventListener('change', (e) => setVendorData('auto_confirm', e.target.checked));
    document.getElementById('exportCsvBtn').addEventListener('click', exportBookingsCsv);
    document.getElementById('exportPdfBtn').addEventListener('click', exportBookingsPdf);
  }

  document.querySelectorAll('.booking-filter').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.booking-filter').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bookingFilter = btn.dataset.filter;
      renderBookingsTable();
    });
  });

  document.getElementById('addBookingBtn').addEventListener('click', () => {
    const coupleName = document.getElementById('bkCoupleName').value.trim();
    const date = document.getElementById('bkDate').value;
    if (!coupleName || !date) { alert('Please enter a couple name and date.'); return; }
    const bookings = getVendorData('bookings', []);
    const autoConfirmNow = isPremium && getVendorData('auto_confirm', false);
    bookings.push({
      id: Date.now(), coupleName, date,
      package: document.getElementById('bkPackage').value,
      depositAmount: document.getElementById('bkDeposit').value || 0,
      depositPaid: false, status: autoConfirmNow ? 'Confirmed' : 'Pending', time: Date.now(),
      checkedIn: false,
    });
    setVendorData('bookings', bookings);
    pushNotification('booking', `New booking${autoConfirmNow ? ' (auto-confirmed)' : ' request'} from ${coupleName} on ${date}.`);
    renderBookings(); renderOverview(); populatePaymentBookingSelect();
  });

  renderEventSchedule();
  renderBookingsTable();
}

// Chronological view of upcoming confirmed events — separate from the "All
// Bookings" table below, which is filterable/status-oriented rather than
// date-sorted.
function renderEventSchedule() {
  const now = Date.now();
  const upcoming = getVendorData('bookings', [])
    .filter(b => b.status === 'Confirmed' && b.date && new Date(b.date).getTime() >= now)
    .sort((a, b) => new Date(a.date) - new Date(b.date));

  document.getElementById('eventScheduleList').innerHTML = upcoming.length ? upcoming.map(b => `
    <div class="schedule-row" style="display:flex;justify-content:space-between;gap:1rem;padding:0.6rem 0;border-bottom:1px solid #eee;">
      <span><strong>${escapeHtml(b.date)}</strong> — ${escapeHtml(b.coupleName)}</span>
      <span style="color:#777;">${escapeHtml(b.package || '')}</span>
    </div>
  `).join('') : '<p class="admin-empty">No upcoming confirmed events yet.</p>';
}

function exportBookingsCsv() {
  const bookings = getVendorData('bookings', []);
  const rows = [['Couple', 'Date', 'Package', 'Deposit', 'Status']];
  bookings.forEach(b => rows.push([b.coupleName, b.date, b.package, b.depositAmount, b.status]));
  const csv = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${currentVendor.businessName.replace(/\s+/g, '-')}-bookings.csv`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Opens self-contained HTML in a new tab via a Blob URL and prints it.
// (window.open('') + document.write() is blocked on file:// pages because
// Chromium treats every local file as its own security origin.)
function openPrintableHtml(html) {
  const blob = new Blob([html], { type: 'text/html' });
  const url = URL.createObjectURL(blob);
  const w = window.open(url, '_blank');
  if (!w) {
    alert('Please allow pop-ups for this page to print/export.');
    URL.revokeObjectURL(url);
    return;
  }
  w.addEventListener('load', () => {
    w.focus();
    w.print();
    URL.revokeObjectURL(url);
  });
}

function exportBookingsPdf() {
  const bookings = getVendorData('bookings', []);
  openPrintableHtml(`<html><head><title>Bookings — ${escapeHtml(currentVendor.businessName)}</title></head>
    <body style="font-family:Georgia, serif; padding:2rem; color:#2E2E2E;">
      <h2 style="color:#0F6A5B;">${escapeHtml(currentVendor.businessName)} — Bookings</h2>
      <table style="width:100%;border-collapse:collapse;margin-top:1rem;">
        <thead><tr style="text-align:left;border-bottom:2px solid #0F6A5B;"><th>Couple</th><th>Date</th><th>Package</th><th>Deposit</th><th>Status</th></tr></thead>
        <tbody>
          ${bookings.map(b => `<tr style="border-bottom:1px solid #eee;"><td>${escapeHtml(b.coupleName)}</td><td>${escapeHtml(b.date)}</td><td>${escapeHtml(b.package)}</td><td>$${escapeHtml(b.depositAmount)}</td><td>${escapeHtml(b.status)}</td></tr>`).join('')}
        </tbody>
      </table>
    </body></html>`);
}

function renderBookingsTable() {
  const allBookings = getVendorData('bookings', []);
  const body = document.getElementById('bookingsTableBody');
  const now = Date.now();
  let bookings = allBookings;
  if (bookingFilter === 'Pending' || bookingFilter === 'Confirmed') {
    bookings = allBookings.filter(b => b.status === bookingFilter);
  } else if (bookingFilter === 'history') {
    bookings = allBookings.filter(b => b.status === 'Cancelled' || b.status === 'Completed' || (b.status === 'Confirmed' && b.date && new Date(b.date).getTime() < now));
  } else if (bookingFilter === 'cancelled') {
    bookings = allBookings.filter(b => b.status === 'Cancelled');
  } else if (bookingFilter === 'wedding-schedule') {
    bookings = allBookings.filter(b => b.status === 'Confirmed').sort((a, b) => new Date(a.date) - new Date(b.date));
  } else if (bookingFilter === 'quote-requests') {
    bookings = allBookings.filter(b => b.status === 'Pending' && !b.package);
  } else if (bookingFilter === 'design-approval') {
    bookings = allBookings.filter(b => b.status === 'Design Approval');
  } else if (bookingFilter === 'editing-requests') {
    bookings = allBookings.filter(b => b.status === 'Editing Requested');
  } else if (bookingFilter === 'printing') {
    bookings = allBookings.filter(b => b.status === 'Printing');
  } else if (bookingFilter === 'ready-delivery') {
    bookings = allBookings.filter(b => b.status === 'Ready for Delivery');
  } else if (bookingFilter === 'completed') {
    bookings = allBookings.filter(b => b.status === 'Completed');
  }
  if (!bookings.length) { body.innerHTML = `<tr><td colspan="7" class="admin-empty">No bookings in this view yet.</td></tr>`; return; }
  const isPremium = planLevel() >= 3;
  // Wedding Schedule is already sorted chronologically above — reversing it
  // would undo that, so only the default views get newest-first ordering.
  const orderedBookings = bookingFilter === 'wedding-schedule' ? bookings : bookings.slice().reverse();
  body.innerHTML = orderedBookings.map(b => `
    <tr data-id="${b.id}">
      <td>${escapeHtml(b.coupleName)}${b.customerPhone ? `<br><span style="color:#999;">${escapeHtml(b.customerPhone)}</span>` : ''}</td>
      <td>${escapeHtml(b.date)}</td>
      <td>${escapeHtml(b.package)}
        ${b.purpose ? `<br><span style="color:#999;">📝 ${escapeHtml(b.purpose)}</span>` : ''}
        ${b.dressName ? `<br><span style="color:#999;">👗 ${escapeHtml(b.dressName)}</span>` : ''}
        ${b.vehicleName ? `<br><span style="color:#999;">🚗 ${escapeHtml(b.vehicleName)}</span>` : ''}
        ${b.jewelryItemName ? `<br><span style="color:#999;">💎 ${escapeHtml(b.jewelryItemName)}${b.jewelrySize ? ` — Size: ${escapeHtml(b.jewelrySize)}` : ''}</span>` : ''}
        ${b.entranceStyle ? `<br><span style="color:#999;">🥁 ${escapeHtml(b.entranceStyle)}${b.musicSelection ? ` — 🎵 ${escapeHtml(b.musicSelection)}` : ''}</span>` : ''}
        ${b.cakeItemName ? `<br><span style="color:#999;">🎂 ${escapeHtml(b.cakeItemName)}</span>` : ''}
        ${b.cakeServicesNeeded && b.cakeServicesNeeded.length ? `<br><span style="color:#999;">Services: ${b.cakeServicesNeeded.map(escapeHtml).join(', ')}</span>` : ''}
        ${b.cakeFlavors && b.cakeFlavors.length ? `<br><span style="color:#999;">Flavors: ${b.cakeFlavors.map(escapeHtml).join(', ')}</span>` : ''}
        ${b.cakeFillings && b.cakeFillings.length ? `<br><span style="color:#999;">Fillings: ${b.cakeFillings.map(escapeHtml).join(', ')}</span>` : ''}
        ${b.cakeDecorationStyle ? `<br><span style="color:#999;">Decoration: ${escapeHtml(b.cakeDecorationStyle)}</span>` : ''}
        ${b.decorationOptions && b.decorationOptions.length ? `<br><span style="color:#999;">Decoration: ${b.decorationOptions.map(escapeHtml).join(', ')}</span>` : ''}
        ${b.eventDetails ? `<br><span style="color:#999;">🗒️ Event Details: ${escapeHtml(b.eventDetails)}</span>` : ''}
        ${b.entertainmentServiceName ? `<br><span style="color:#999;">🎪 Service: ${escapeHtml(b.entertainmentServiceName)}</span>` : ''}
        ${b.purchaseType ? `<br><span style="color:#999;">🤵 ${escapeHtml(b.purchaseType)}${b.pickupDate ? ` — Pickup: ${escapeHtml(b.pickupDate)}` : ''}</span>` : ''}
        ${b.foodMenu ? `<br><span style="color:#999;">🍽️ ${escapeHtml(b.foodMenu)}${b.guests ? ` × ${escapeHtml(b.guests)} guests` : ''}</span>` : ''}
        ${b.addons && b.addons.length ? `<br><span style="color:#999;">+ ${b.addons.map(escapeHtml).join(', ')}</span>` : ''}
        ${b.orderTotal ? `<br><span style="color:#999;">Order total: $${escapeHtml(b.orderTotal)}</span>` : ''}
        ${b.spinDiscount ? `<br><span style="color:var(--secondary);font-weight:700;">🎉 Spin &amp; Win -${escapeHtml(b.spinDiscount.percent)}% (-$${escapeHtml(b.spinDiscount.amount)}) — locked in, cannot be removed</span>` : ''}
        ${b.spinFreebie ? `<br><span style="color:var(--secondary);font-weight:700;">🎁 ${escapeHtml(b.spinFreebie)} — must be honored</span>` : ''}
        ${b.couponDiscount ? `<br><span style="color:var(--secondary);font-weight:700;">🎗️ Sponsor coupon "${escapeHtml(b.couponDiscount.sponsorCoupon)}" -${escapeHtml(b.couponDiscount.percent)}% (-$${escapeHtml(b.couponDiscount.amount)})</span>` : ''}
        ${b.quantity ? `<br><span style="color:#999;">🔢 Quantity: ${escapeHtml(b.quantity)}</span>` : ''}
        ${b.designUpload ? `<br><img loading="lazy" decoding="async" src="${b.designUpload}" alt="Uploaded design" style="width:60px;height:60px;object-fit:cover;border-radius:6px;margin-top:4px;">` : ''}
        ${b.notes ? `<br><span style="color:#999;">🗒️ ${escapeHtml(b.notes)}</span>` : ''}
      </td>
      <td>$${escapeHtml(b.depositAmount)} ${b.depositPaid ? '<span class="status-pill approved">Paid</span>' : ''}${b.paymentMethod ? `<br><span style="color:#999;">${escapeHtml(b.paymentMethod)}${b.transactionRef ? ` — ${escapeHtml(b.transactionRef)}` : ''}</span>` : ''}</td>
      <td><span class="status-pill ${b.status.toLowerCase()}">${b.status}</span>${b.checkedIn ? ' <span class="status-pill approved">Checked In</span>' : ''}
        ${currentVendor.category === 'Cake Designers' && (b.status === 'Confirmed' || b.status === 'Completed') ? `
          <br><select class="delivery-status-select" style="margin-top:4px;font-size:0.8rem;">${CAKE_DELIVERY_STATUSES.map(s => `<option${s === (b.deliveryStatus || 'Order Confirmed') ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>` : ''}
        ${currentVendor.category === 'Restaurants' ? `
          <br><span style="color:#999;font-size:0.75rem;">Deposit Status</span>
          <br><select class="deposit-status-select" style="margin-top:2px;font-size:0.8rem;">${RESTAURANT_DEPOSIT_STATUSES.map(s => `<option${s === (b.depositStatus || 'Not Paid') ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>` : ''}
      </td>
      <td>
        ${b.contract
          ? `<a href="${b.contract.dataURL}" target="_blank" rel="noopener noreferrer">📄 ${escapeHtml(b.contract.name)}</a><br><button class="admin-btn small danger remove-contract-btn">Remove</button>`
          : `<input type="file" class="contract-input" accept="image/*,application/pdf" style="max-width:140px;">`}
      </td>
      <td class="action-btns">
        ${currentVendor.category === 'Invitation Cards'
          ? `<select class="order-status-select">${ORDER_STATUS_OPTIONS.map(s => `<option${s === b.status ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>`
          : currentVendor.category === 'Cake Designers'
          ? `<select class="order-status-select">${CAKE_ORDER_STATUS_OPTIONS.map(s => `<option${s === b.status ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>`
          : currentVendor.category === 'Restaurants'
          ? `<select class="order-status-select">${RESTAURANT_ORDER_STATUS_OPTIONS.map(s => `<option${s === b.status ? ' selected' : ''}>${escapeHtml(s)}</option>`).join('')}</select>`
          : `${b.status === 'Pending' ? `<button class="admin-btn small confirm-booking-btn">Confirm</button>` : ''}
             ${b.status !== 'Cancelled' ? `<button class="admin-btn small danger cancel-booking-btn">Cancel</button>` : ''}`}
        <button class="admin-btn small outline print-booking-btn">Print</button>
        ${isPremium && b.status === 'Confirmed' ? `<button class="admin-btn small outline qr-checkin-btn">QR Check-in</button>` : ''}
      </td>
    </tr>
    ${isPremium ? `<tr class="qr-row hidden" data-qr-for="${b.id}"><td colspan="7"><div class="qr-check-in-box" id="qrBox-${b.id}"></div></td></tr>` : ''}
  `).join('');

  body.querySelectorAll('tr[data-id]').forEach(row => {
    const id = Number(row.dataset.id);
    function update(patch) {
      const bookings = getVendorData('bookings', []);
      const b = bookings.find(x => x.id === id);
      if (b) Object.assign(b, patch);
      setVendorData('bookings', bookings);
      renderBookingsTable(); renderOverview(); renderEventSchedule();
    }
    const confirmBtn = row.querySelector('.confirm-booking-btn');
    if (confirmBtn) confirmBtn.addEventListener('click', () => update({ status: 'Confirmed' }));
    const cancelBtn = row.querySelector('.cancel-booking-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => update({ status: 'Cancelled' }));
    const orderStatusSelect = row.querySelector('.order-status-select');
    if (orderStatusSelect) orderStatusSelect.addEventListener('change', () => update({ status: orderStatusSelect.value }));
    const deliveryStatusSelect = row.querySelector('.delivery-status-select');
    if (deliveryStatusSelect) deliveryStatusSelect.addEventListener('change', () => update({ deliveryStatus: deliveryStatusSelect.value }));
    const depositStatusSelect = row.querySelector('.deposit-status-select');
    if (depositStatusSelect) depositStatusSelect.addEventListener('change', () => update({ depositStatus: depositStatusSelect.value }));
    const contractInput = row.querySelector('.contract-input');
    if (contractInput) contractInput.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      if (!isSafeDocumentFile(file)) { alert('Please upload a PDF or image file (JPG, PNG, WEBP) for the contract.'); contractInput.value = ''; return; }
      const dataURL = await uploadMedia(file, `vendors/${currentVendor.username}/contracts`);
      update({ contract: { name: file.name, dataURL } });
    });
    const removeContractBtn = row.querySelector('.remove-contract-btn');
    if (removeContractBtn) removeContractBtn.addEventListener('click', () => update({ contract: null }));
    row.querySelector('.print-booking-btn').addEventListener('click', () => {
      const b = getVendorData('bookings', []).find(x => x.id === id);
      printBookingDetails(b);
    });
    const qrBtn = row.querySelector('.qr-checkin-btn');
    if (qrBtn) qrBtn.addEventListener('click', () => {
      const qrRow = body.querySelector(`tr[data-qr-for="${id}"]`);
      qrRow.classList.toggle('hidden');
      if (!qrRow.classList.contains('hidden')) renderQrCheckIn(id);
    });
  });
}

function renderQrCheckIn(bookingId) {
  const bookings = getVendorData('bookings', []);
  const b = bookings.find(x => x.id === bookingId);
  const code = `FB-${currentVendor.username}-${bookingId}`;
  const qrImgUrl = `https://api.qrserver.com/v1/create-qr-code/?size=150x150&data=${encodeURIComponent(code)}`;
  const box = document.getElementById(`qrBox-${bookingId}`);
  box.innerHTML = `
    <img loading="lazy" decoding="async" src="${qrImgUrl}" alt="Check-in QR code" width="150" height="150">
    <p class="admin-hint">Code: ${escapeHtml(code)}<br>Requires internet to load (generated via a free external QR service).</p>
    <button class="admin-btn small ${b.checkedIn ? 'outline' : ''}" id="toggleCheckin-${bookingId}">${b.checkedIn ? 'Undo Check-in' : 'Mark Checked In'}</button>
  `;
  document.getElementById(`toggleCheckin-${bookingId}`).addEventListener('click', () => {
    const bookings = getVendorData('bookings', []);
    const b = bookings.find(x => x.id === bookingId);
    b.checkedIn = !b.checkedIn;
    setVendorData('bookings', bookings);
    renderBookingsTable();
  });
}

function printBookingDetails(b) {
  openPrintableHtml(`<html><head><title>Booking — ${escapeHtml(b.coupleName)}</title></head>
    <body style="font-family:Georgia, serif; padding:2rem; color:#2E2E2E;">
      <h2 style="color:#0F6A5B;">Booking Details</h2>
      <p><strong>Venue:</strong> ${escapeHtml(currentVendor.businessName)}</p>
      <p><strong>Couple:</strong> ${escapeHtml(b.coupleName)}</p>
      <p><strong>Date:</strong> ${escapeHtml(b.date)}</p>
      <p><strong>Package:</strong> ${escapeHtml(b.package)}</p>
      <p><strong>Deposit:</strong> $${escapeHtml(b.depositAmount)} ${b.depositPaid ? '(Paid)' : '(Unpaid)'}</p>
      <p><strong>Status:</strong> ${escapeHtml(b.status)}</p>
    </body></html>`);
}

// ===================================================================
// PAYMENTS
// ===================================================================
function populatePaymentBookingSelect() {
  const bookings = getVendorData('bookings', []);
  const select = document.getElementById('paymentBookingSelect');
  select.innerHTML = bookings.map(b => `<option value="${b.id}">${escapeHtml(b.coupleName)} — ${escapeHtml(b.date)}</option>`).join('') || '<option value="">No bookings yet</option>';
}

function renderPayments() {
  populatePaymentBookingSelect();

  const remindersWrap = document.getElementById('paymentRemindersWrap');
  if (planLevel() >= 3) {
    const enabled = getVendorData('auto_reminders', false);
    remindersWrap.innerHTML = `
      <div class="admin-card" style="border:1px dashed var(--secondary);">
        <h3 style="margin-bottom:0.5rem;">🔔 Automated Payment Reminders <span class="plan-tag">Premium</span></h3>
        <label style="display:flex;align-items:center;gap:0.5rem;font-size:0.88rem;">
          <input type="checkbox" id="autoRemindersToggle" ${enabled ? 'checked' : ''}> Enable automated reminders for pending payments
        </label>
        <p class="admin-hint" style="text-align:left;">No real emails/SMS are sent (no messaging service is connected) — "Send Reminders Now" simulates the reminder and logs it below.</p>
        <button class="admin-btn small outline" id="sendRemindersBtn">Send Reminders Now</button>
        <p class="admin-note" id="remindersNote"></p>
      </div>`;
    document.getElementById('autoRemindersToggle').addEventListener('change', (e) => setVendorData('auto_reminders', e.target.checked));
    document.getElementById('sendRemindersBtn').addEventListener('click', () => {
      const payments = getVendorData('payments', []);
      const pending = payments.filter(p => p.status === 'Pending');
      pending.forEach(p => { p.reminderSentAt = Date.now(); });
      setVendorData('payments', payments);
      if (pending.length) pushNotification('payment', `Sent ${pending.length} payment reminder(s).`);
      const note = document.getElementById('remindersNote');
      note.textContent = pending.length ? `${pending.length} reminder(s) simulated.` : 'No pending payments to remind.';
      setTimeout(() => note.textContent = '', 3000);
      renderPayments();
    });
  } else {
    remindersWrap.innerHTML = `<p class="admin-hint" style="text-align:left;">🔔 Automated payment reminders are available on the Premium Featured plan.</p>`;
  }

  const payments = getVendorData('payments', []);
  const deposits = payments.filter(p => p.isDeposit);
  const pending = payments.filter(p => p.status === 'Pending').reduce((s, p) => s + Number(p.amount || 0), 0);
  const completed = payments.filter(p => p.status === 'Completed').reduce((s, p) => s + Number(p.amount || 0), 0);
  const byMethod = (method) => payments.filter(p => p.method === method && p.status === 'Completed').reduce((s, p) => s + Number(p.amount || 0), 0);
  document.getElementById('paymentStats').innerHTML = [
    { num: deposits.length, label: 'Deposits Received' },
    { num: `$${pending}`, label: 'Pending Payments' },
    { num: `$${completed}`, label: 'Completed Payments' },
    { num: `$${byMethod('OMT')}`, label: 'OMT' },
    { num: `$${byMethod('Whish Money')}`, label: 'Whish Money' },
    { num: `$${byMethod('Western Union')}`, label: 'Western Union' },
    { num: `$${byMethod('Credit/Debit Card')}`, label: 'Credit/Debit Card' },
  ].map(s => `<div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>`).join('');

  const bookings = getVendorData('bookings', []);
  const body = document.getElementById('paymentsTableBody');
  if (!payments.length) { body.innerHTML = `<tr><td colspan="5" class="admin-empty">No payments logged yet.</td></tr>`; return; }
  body.innerHTML = payments.slice().reverse().map(p => {
    const booking = bookings.find(b => String(b.id) === String(p.bookingId));
    return `
    <tr data-id="${p.id}">
      <td>${booking ? escapeHtml(booking.coupleName) + ' — ' + escapeHtml(booking.date) : '—'}</td>
      <td>${escapeHtml(p.method)}</td>
      <td>$${escapeHtml(p.amount)}</td>
      <td><span class="status-pill ${p.status.toLowerCase()}">${p.status}</span>${p.reminderSentAt ? ' <span class="status-pill pending">Reminder Sent</span>' : ''}</td>
      <td class="action-btns">
        ${p.status === 'Pending' ? `<button class="admin-btn small mark-complete-btn">Mark Completed</button>` : ''}
        <button class="admin-btn small danger delete-payment-btn">Delete</button>
      </td>
    </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.id);
    const completeBtn = row.querySelector('.mark-complete-btn');
    if (completeBtn) completeBtn.addEventListener('click', () => {
      const payments = getVendorData('payments', []);
      const p = payments.find(x => x.id === id);
      if (p) p.status = 'Completed';
      setVendorData('payments', payments);
      if (p) pushNotification('payment', `Payment of $${p.amount} marked completed.`);
      renderPayments(); renderOverview();
      if (p) {
        const bookings = getVendorData('bookings', []);
        const b = bookings.find(x => String(x.id) === String(p.bookingId));
        if (b && p.isDeposit) {
          b.depositPaid = true;
          if (b.status === 'Pending') b.status = 'Confirmed';
          setVendorData('bookings', bookings);
          renderBookingsTable();
          pushNotification('booking', `Booking for ${b.coupleName} auto-confirmed after deposit payment.`);
        }
      }
    });
    row.querySelector('.delete-payment-btn').addEventListener('click', () => {
      setVendorData('payments', getVendorData('payments', []).filter(x => x.id !== id));
      renderPayments(); renderOverview();
    });
  });
}

document.getElementById('addPaymentBtn').addEventListener('click', () => {
  const bookingId = document.getElementById('paymentBookingSelect').value;
  const amount = document.getElementById('paymentAmountInput').value;
  if (!amount) { alert('Please enter an amount.'); return; }
  const payments = getVendorData('payments', []);
  payments.push({
    id: Date.now(), bookingId,
    method: document.getElementById('paymentMethodSelect').value,
    amount, status: document.getElementById('paymentStatusSelect').value,
    isDeposit: true, time: Date.now(),
  });
  setVendorData('payments', payments);
  document.getElementById('paymentAmountInput').value = '';
  renderPayments(); renderOverview();
});

document.getElementById('printPaymentsBtn').addEventListener('click', () => {
  const payments = getVendorData('payments', []);
  const methods = ['OMT', 'Whish Money', 'Western Union', 'Credit/Debit Card'];
  const byMethod = (method) => payments.filter(p => p.method === method && p.status === 'Completed').reduce((s, p) => s + Number(p.amount || 0), 0);
  openPrintableHtml(`<html><head><title>Payment Report — ${escapeHtml(currentVendor.businessName)}</title></head>
    <body style="font-family:Georgia, serif; padding:2rem; color:#2E2E2E;">
      <h2 style="color:#0F6A5B;">Payment Report</h2>
      <p><strong>Venue:</strong> ${escapeHtml(currentVendor.businessName)}</p>
      <h3 style="color:#0F6A5B;">Totals by Payment Method (Completed)</h3>
      <table style="width:100%;border-collapse:collapse;margin-bottom:1.5rem;">
        <thead><tr style="text-align:left;border-bottom:2px solid #0F6A5B;"><th>Method</th><th>Total</th></tr></thead>
        <tbody>
          ${methods.map(m => `<tr style="border-bottom:1px solid #eee;"><td>${escapeHtml(m)}</td><td>$${byMethod(m)}</td></tr>`).join('')}
        </tbody>
      </table>
      <h3 style="color:#0F6A5B;">All Payments</h3>
      <table style="width:100%;border-collapse:collapse;margin-top:1rem;">
        <thead><tr style="text-align:left;border-bottom:2px solid #0F6A5B;"><th>Method</th><th>Amount</th><th>Status</th></tr></thead>
        <tbody>
          ${payments.map(p => `<tr style="border-bottom:1px solid #eee;"><td>${escapeHtml(p.method)}</td><td>$${escapeHtml(p.amount)}</td><td>${escapeHtml(p.status)}</td></tr>`).join('')}
        </tbody>
      </table>
    </body></html>`);
});

// ===================================================================
// CUSTOMER INQUIRIES
// ===================================================================
function seedInquiriesIfNeeded() {
  if (localStorage.getItem(vKey('inquiries')) !== null) return;
  if (currentVendor.category === 'Honeymoon Agency') {
    setVendorData('inquiries', [
      { id: 1, from: 'Rania K.', channel: 'Inbox', message: 'Hi, do you have honeymoon packages for the Maldives in July?', quoteRequested: true, consultationRequested: false, status: 'Unread', reply: '', time: Date.now() - 86400000 * 2 },
      { id: 2, from: 'Tarek M.', channel: 'WhatsApp', phone: '96170123456', message: 'Can you send pricing for your Island Honeymoon package?', quoteRequested: true, consultationRequested: false, status: 'Unread', reply: '', time: Date.now() - 86400000 },
      { id: 3, from: 'Nadine H.', channel: 'Inbox', message: "We'd like to book a free travel consultation before deciding on a destination.", quoteRequested: false, consultationRequested: true, status: 'Unread', reply: '', time: Date.now() - 3600000 * 5 },
    ]);
    return;
  }
  setVendorData('inquiries', [
    { id: 1, from: 'Rania K.', channel: 'Inbox', message: 'Hi, is your venue available for a 200-guest wedding in June?', quoteRequested: true, status: 'Unread', reply: '', time: Date.now() - 86400000 * 2 },
    { id: 2, from: 'Tarek M.', channel: 'WhatsApp', phone: '96170123456', message: 'Can you send pricing for your Gold package?', quoteRequested: true, status: 'Unread', reply: '', time: Date.now() - 86400000 },
    { id: 3, from: 'Nadine H.', channel: 'Email', message: 'Do you allow outside catering?', quoteRequested: false, status: 'Replied', reply: 'Yes, outside catering is welcome with a small venue fee.', time: Date.now() - 3600000 * 5 },
  ]);
}

let inquiryFilter = 'all';
document.querySelectorAll('.inquiry-filter').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.inquiry-filter').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    inquiryFilter = btn.dataset.filter;
    renderInquiries();
  });
});

function renderInquiries() {
  seedInquiriesIfNeeded();
  const isHoneymoonAgency = currentVendor.category === 'Honeymoon Agency';
  document.getElementById('consultationFilterBtn').classList.toggle('hidden', !isHoneymoonAgency);
  let inquiries = getVendorData('inquiries', []);
  if (inquiryFilter === 'quote') inquiries = inquiries.filter(i => i.quoteRequested);
  else if (inquiryFilter === 'consultation') inquiries = inquiries.filter(i => i.consultationRequested);
  else if (inquiryFilter !== 'all') inquiries = inquiries.filter(i => i.channel === inquiryFilter);

  const list = document.getElementById('inquiriesList');
  if (!inquiries.length) { list.innerHTML = '<p class="admin-empty">No inquiries in this view.</p>'; return; }
  list.innerHTML = inquiries.slice().reverse().map(i => `
    <div class="admin-card" data-id="${i.id}">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <strong>${escapeHtml(i.from)}</strong>
        <span>
          <span class="status-pill ${i.channel === 'WhatsApp' ? 'approved' : 'pending'}">${escapeHtml(i.channel)}</span>
          ${i.quoteRequested ? '<span class="status-pill pending">Quote Requested</span>' : ''}
          ${i.consultationRequested ? '<span class="status-pill pending">Consultation Requested</span>' : ''}
          <span class="status-pill ${i.status === 'Replied' ? 'approved' : 'rejected'}">${escapeHtml(i.status)}</span>
        </span>
      </div>
      <p style="margin:0.6rem 0;">${escapeHtml(i.message)}</p>
      ${i.reply ? `<p style="color:#0F6A5B;"><strong>Your reply:</strong> ${escapeHtml(i.reply)}</p>` : ''}
      <textarea class="reply-input" rows="2" placeholder="Type a reply...">${escapeHtml(i.reply)}</textarea>
      <div class="action-btns" style="margin-top:0.5rem;">
        <button class="admin-btn small send-reply-btn">Send Reply</button>
        ${i.channel === 'WhatsApp' && i.phone ? `<a class="admin-btn small outline" target="_blank" rel="noopener noreferrer" href="https://wa.me/${escapeHtml(i.phone)}">Reply via WhatsApp</a>` : ''}
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.admin-card').forEach(card => {
    const id = Number(card.dataset.id);
    card.querySelector('.send-reply-btn').addEventListener('click', () => {
      const reply = card.querySelector('.reply-input').value.trim();
      const inquiries = getVendorData('inquiries', []);
      const i = inquiries.find(x => x.id === id);
      if (i) { i.reply = reply; i.status = 'Replied'; }
      setVendorData('inquiries', inquiries);
      renderInquiries(); renderOverview();
    });
  });
}

// ===================================================================
// REVIEWS
// ===================================================================
function seedReviewsIfNeeded() {
  if (localStorage.getItem(vKey('reviews')) !== null) return;
  if (currentVendor.category === 'Wedding Venues') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, foodRating: 5, ambianceRating: 5, text: 'Absolutely magical venue, the staff went above and beyond.', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, foodRating: 4, ambianceRating: 5, text: 'Beautiful space, parking was a little tight for our guest count.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Photographers & Videographers') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'Stunning photos, captured every moment beautifully and delivered ahead of schedule.', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Great videography, would have liked a few more drone shots.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'DJs & Bands') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'Amazing energy all night, kept everyone dancing until the very end!', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Great song selection, would have liked a bit more Arabic music.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Wedding Planner') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'Kept everything on track and stress-free — worth every penny.', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Great coordination on the day, would have liked more check-ins during planning.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Florists & Decor') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'The floral arrangements were breathtaking, exactly the garden theme we dreamed of.', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Beautiful centerpieces, delivery was a bit later than planned.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Makeup Artists') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'My makeup lasted the entire night and looked flawless in every photo!', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Loved the natural glam look, trial run took a bit longer than expected.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Hair Stylists') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'My hair held up perfectly all night, exactly the updo I dreamed of!', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Beautiful braided look, the trial appointment ran a bit late.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Bridal Dress Shops') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'My wedding dress was a dream — the fitting appointments were so attentive and it fit perfectly.', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Gorgeous collection, wish there were a few more plus-size options in stock.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Suit Rental') {
    setVendorData('reviews', [
      { id: 1, author: 'Karim & Tania', rating: 5, text: 'The groom\'s tuxedo fit perfectly and the whole groomsmen party looked sharp — great service!', reply: '', flagged: false },
      { id: 2, author: 'Elie B.', rating: 4, text: 'Nice suit selection, wish they had more sizes available for kids suits.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Vehicle Rental') {
    setVendorData('reviews', [
      { id: 1, author: 'Nour & Ziad', rating: 5, text: 'The Rolls-Royce was absolutely stunning and arrived right on time — made our entrance unforgettable!', reply: '', flagged: false },
      { id: 2, author: 'Sarah K.', rating: 4, text: 'Beautiful car, driver was great, just wish the decorations were included in the base price.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Honeymoon Agency') {
    setVendorData('reviews', [
      { id: 1, author: 'Maya & Elie', rating: 5, text: 'Our honeymoon in Santorini was flawless — every hotel and detail was exactly as promised, truly unforgettable!', reply: '', flagged: false },
      { id: 2, author: 'Nour & Ziad', rating: 4, text: 'Great trip overall, wish the flight details had been confirmed a bit earlier.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Invitation Cards') {
    setVendorData('reviews', [
      { id: 1, author: 'Maya & Elie', rating: 5, text: 'The invitations were stunning and the print quality was flawless — exactly the elegant design we wanted!', reply: '', flagged: false },
      { id: 2, author: 'Nour & Ziad', rating: 4, text: 'Beautiful designs, wish the first proof had arrived a bit sooner.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Bridal Stylist') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'My bridal look was absolutely stunning — hair, makeup, and styling all came together perfectly for the big day!', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Loved the final look, the trial session ran a bit longer than scheduled.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Jewelry') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'Our wedding bands were absolutely stunning — the craftsmanship and stone quality exceeded what we expected!', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Beautiful engagement ring, the resizing took a couple of days longer than quoted.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Zaffeh') {
    setVendorData('reviews', [
      { id: 1, author: 'Farah & Elie', rating: 5, text: 'The zaffeh entrance was absolutely electric — drums, dabke and the fire show had every guest on their feet!', reply: '', flagged: false },
      { id: 2, author: 'Diala S.', rating: 4, text: 'Amazing energy and great performers, wish they had arrived a bit earlier to set up.', reply: '', flagged: false },
    ]);
  } else if (currentVendor.category === 'Cake Designers') {
    setVendorData('reviews', [
      { id: 1, author: 'Maya & Fadi', rating: 5, text: 'Our wedding cake was a showstopper — exactly the design we dreamed of, and it tasted even better than it looked!', reply: '', flagged: false },
      { id: 2, author: 'Nour & Ziad', rating: 4, text: 'Beautiful cake, the tasting session ran a bit longer than scheduled but well worth it.', reply: '', flagged: false },
    ]);
  } else {
    setVendorData('reviews', [
      { id: 1, author: 'Maya & Fadi', rating: 5, text: 'The food was incredible and the kitchen looked spotless when we visited — guests are still talking about the mezze!', reply: '', flagged: false },
      { id: 2, author: 'Joe H.', rating: 4, text: 'Great catering, delivery was a bit later than the agreed time.', reply: '', flagged: false },
    ]);
  }
}

function avgOf(reviews, field) {
  const vals = reviews.map(r => Number(r[field])).filter(n => !isNaN(n));
  return vals.length ? (vals.reduce((s, n) => s + n, 0) / vals.length).toFixed(1) : '—';
}

function renderReviews() {
  seedReviewsIfNeeded();
  const isVenue = currentVendor.category === 'Wedding Venues';
  const reviews = getVendorData('reviews', []);
  const avg = avgOf(reviews, 'rating');
  const foodAvg = avgOf(reviews, 'foodRating');
  const ambianceAvg = avgOf(reviews, 'ambianceRating');
  document.getElementById('overallRatingDisplay').innerHTML = `
    <span class="star-display">⭐ ${avg}</span> <span style="font-size:0.9rem;color:#777;">(${reviews.length} review${reviews.length === 1 ? '' : 's'})</span>
    ${isVenue ? `<br><span style="font-size:0.95rem;color:#555;">🍽️ Food: ${foodAvg} &nbsp; 🎨 Ambiance: ${ambianceAvg}</span>` : ''}
  `;

  const list = document.getElementById('reviewsListVendor');
  if (!reviews.length) { list.innerHTML = '<p class="admin-empty">No reviews yet.</p>'; return; }
  list.innerHTML = reviews.map(r => `
    <div class="admin-card" data-id="${r.id}">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:0.5rem;">
        <strong>${escapeHtml(r.author)}</strong>
        <span class="star-display">⭐ ${escapeHtml(r.rating)} overall ${r.foodRating ? `· 🍽️ ${escapeHtml(r.foodRating)}` : ''} ${r.ambianceRating ? `· 🎨 ${escapeHtml(r.ambianceRating)}` : ''}</span>
      </div>
      <p style="margin:0.6rem 0;">${escapeHtml(r.text)} ${r.flagged ? '<span class="status-pill rejected">Reported</span>' : ''}</p>
      ${r.reply ? `<p style="color:#0F6A5B;"><strong>Your reply:</strong> ${escapeHtml(r.reply)}</p>` : ''}
      <textarea class="review-reply-input" rows="2" placeholder="Reply to this review...">${escapeHtml(r.reply)}</textarea>
      <div class="action-btns" style="margin-top:0.5rem;">
        <button class="admin-btn small send-review-reply-btn">Send Reply</button>
        <button class="admin-btn small danger flag-review-btn">${r.flagged ? 'Reported' : 'Report Fake Review'}</button>
      </div>
    </div>
  `).join('');

  list.querySelectorAll('.admin-card').forEach(card => {
    const id = Number(card.dataset.id);
    card.querySelector('.send-review-reply-btn').addEventListener('click', () => {
      const reply = card.querySelector('.review-reply-input').value.trim();
      const reviews = getVendorData('reviews', []);
      const r = reviews.find(x => x.id === id);
      if (r) r.reply = reply;
      setVendorData('reviews', reviews);
      renderReviews();
    });
    const flagBtn = card.querySelector('.flag-review-btn');
    if (!flagBtn.disabled) {
      flagBtn.addEventListener('click', () => {
        const reviews = getVendorData('reviews', []);
        const r = reviews.find(x => x.id === id);
        if (r) r.flagged = true;
        setVendorData('reviews', reviews);
        renderReviews();
      });
    }
  });
}

// ===================================================================
// BLOG (all categories) — vendors publish short articles with a single
// photo; couples browse the aggregated feed from every vendor on the
// homepage dashboard's Blog panel.
// ===================================================================
function renderBlog() {
  // Publishing articles is a Premium Featured perk — vendors on lower plans
  // see an upgrade prompt instead of the form and their existing articles,
  // matching how Before & After editing and other Premium-only sections
  // gate themselves off.
  const blogLocked = planLevel() < 3;
  document.getElementById('blogLockNote').innerHTML = blogLocked
    ? `<p class="admin-hint" style="text-align:left;">Publishing blog articles is available on the Premium Featured plan.</p>` : '';
  ['blogArticleTitle', 'blogArticleContent', 'blogArticleImage', 'addBlogArticleBtn'].forEach(id => document.getElementById(id).disabled = blogLocked);

  const articles = blogLocked ? [] : getVendorData('blogArticles', []);
  document.getElementById('blogArticlesList').innerHTML = blogLocked ? '' : (articles.slice().reverse().map(a => `
    <div class="admin-card" data-blog-id="${a.id}" style="background:var(--bg);">
      <div class="admin-topbar" style="margin-bottom:0.6rem;">
        <h4 style="margin:0;">${escapeHtml(a.title)}</h4>
        <button type="button" class="admin-btn small danger delete-blog-article-btn">Delete</button>
      </div>
      ${a.image ? `<img loading="lazy" decoding="async" src="${a.image}" style="max-width:260px;border-radius:8px;display:block;margin-bottom:0.6rem;">` : ''}
      <p>${escapeHtml(a.content)}</p>
    </div>
  `).join('') || '<p class="admin-empty">No articles yet — publish your first one above.</p>');

  document.querySelectorAll('.delete-blog-article-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('[data-blog-id]').dataset.blogId);
      setVendorData('blogArticles', getVendorData('blogArticles', []).filter(a => a.id !== id));
      renderBlog();
    });
  });
}

document.getElementById('addBlogArticleBtn').addEventListener('click', async () => {
  if (planLevel() < 3) { alert('Publishing blog articles is available on the Premium Featured plan.'); return; }
  const title = document.getElementById('blogArticleTitle').value.trim();
  const content = document.getElementById('blogArticleContent').value.trim();
  if (!title || !content) { alert('Please enter a title and content for your article.'); return; }
  const file = document.getElementById('blogArticleImage').files[0];
  const articles = getVendorData('blogArticles', []);
  articles.push({
    id: Date.now(),
    title,
    content,
    image: file ? await uploadMedia(file, `vendors/${currentVendor.username}/blogArticles`) : '',
    time: Date.now(),
  });
  setVendorData('blogArticles', articles);
  document.getElementById('blogArticleTitle').value = '';
  document.getElementById('blogArticleContent').value = '';
  document.getElementById('blogArticleImage').value = '';
  const note = document.getElementById('blogArticleNote');
  note.textContent = 'Published.';
  setTimeout(() => note.textContent = '', 2000);
  renderBlog();
});

// ===================================================================
// ANALYTICS (Photographers & Videographers only)
// ===================================================================
function renderAnalytics() {
  if (currentVendor.category === 'Wedding Venues') return;
  const isPhotographer = currentVendor.category === 'Photographers & Videographers';
  const isHoneymoonAgency = currentVendor.category === 'Honeymoon Agency';
  const isInvitationCards = currentVendor.category === 'Invitation Cards';
  const isJewelry = currentVendor.category === 'Jewelry';

  const profile = getVendorData('profile', {});
  const bookings = getVendorData('bookings', []);
  const payments = getVendorData('payments', []);
  const packages = getVendorData('packages', []);
  // Invitation Cards orders complete via 'Completed' rather than
  // 'Confirmed' (they move through a print-production pipeline instead),
  // so conversion has to be measured against that status for this category.
  const confirmedBookings = isInvitationCards ? bookings.filter(b => b.status === 'Completed').length : bookings.filter(b => b.status === 'Confirmed').length;
  const decidedBookings = isInvitationCards ? bookings.filter(b => b.status === 'Completed' || b.status === 'Cancelled').length : bookings.filter(b => b.status === 'Confirmed' || b.status === 'Cancelled').length;
  const conversionRate = decidedBookings ? Math.round((confirmedBookings / decidedBookings) * 100) : 0;
  // Jewelry tracks conversion off the Reservation Management pipeline
  // (New → Reserved → Completed) rather than the generic Reserve by
  // Booking bookings list, since that's where the vendor actually manages
  // reservation lifecycle and deposit status.
  const jewelryReservations = isJewelry ? getVendorData('jewelryReservations', []) : [];
  const completedReservations = jewelryReservations.filter(r => r.status === 'Completed').length;
  const decidedReservations = jewelryReservations.filter(r => r.status === 'Reserved' || r.status === 'Completed').length;
  const reservationConversionRate = decidedReservations ? Math.round((completedReservations / decidedReservations) * 100) : 0;

  const stats = [
    planLevel() >= 2
      ? { num: profile.viewsCount || 0, label: 'Profile Views' }
      : { num: '🔒', label: 'Profile Views (Professional+)' },
  ];
  if (isPhotographer) {
    stats.push(planLevel() >= 2
      ? { num: profile.portfolioViewsCount || 0, label: 'Portfolio Views' }
      : { num: '🔒', label: 'Portfolio Views (Professional+)' });
  }
  stats.push(isJewelry
    ? { num: jewelryReservations.length ? `${reservationConversionRate}%` : '—', label: 'Reservation Conversion' }
    : { num: bookings.length ? `${conversionRate}%` : '—', label: isInvitationCards ? 'Order Conversion' : 'Booking Conversion' });
  document.getElementById('analyticsStats').innerHTML = stats
    .map(s => `<div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>`).join('');

  const packageCounts = {};
  bookings.forEach(b => { if (b.package) packageCounts[b.package] = (packageCounts[b.package] || 0) + 1; });
  const ranked = Object.entries(packageCounts).sort((a, b) => b[1] - a[1]);
  const maxCount = ranked.length ? ranked[0][1] : 0;
  document.getElementById('popularPackagesList').innerHTML = ranked.map(([name, count]) => `
    <div style="margin-bottom:0.6rem;">
      <div style="display:flex;justify-content:space-between;font-size:0.9rem;"><span>${escapeHtml(name)}</span><span>${count} booking${count === 1 ? '' : 's'}</span></div>
      <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${maxCount ? (count / maxCount) * 100 : 0}%;"></div></div>
    </div>
  `).join('') || '<p class="admin-empty">No bookings yet — popular packages will appear here once you have bookings.</p>';

  document.getElementById('mostViewedDestinationsCard').classList.toggle('hidden', !isHoneymoonAgency);
  if (isHoneymoonAgency) {
    const destinationCounts = {};
    bookings.forEach(b => {
      const pkg = packages.find(p => p.name === b.package);
      if (pkg && pkg.destination) destinationCounts[pkg.destination] = (destinationCounts[pkg.destination] || 0) + 1;
    });
    const rankedDestinations = Object.entries(destinationCounts).sort((a, b) => b[1] - a[1]);
    const maxDestinationCount = rankedDestinations.length ? rankedDestinations[0][1] : 0;
    document.getElementById('mostViewedDestinationsList').innerHTML = rankedDestinations.map(([destination, count]) => `
      <div style="margin-bottom:0.6rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.9rem;"><span>${escapeHtml(destination)}</span><span>${count} booking${count === 1 ? '' : 's'}</span></div>
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${maxDestinationCount ? (count / maxDestinationCount) * 100 : 0}%;"></div></div>
      </div>
    `).join('') || '<p class="admin-empty">No bookings yet — most viewed destinations will appear here once you have bookings.</p>';
  }

  document.getElementById('mostViewedDesignsCard').classList.toggle('hidden', !isInvitationCards);
  document.getElementById('mostRequestedStylesCard').classList.toggle('hidden', !isInvitationCards);
  if (isInvitationCards) {
    const designs = getVendorData('designs', []);
    const rankedDesigns = designs.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).filter(d => d.views);
    const maxDesignViews = rankedDesigns.length ? (rankedDesigns[0].views || 0) : 0;
    document.getElementById('mostViewedDesignsList').innerHTML = rankedDesigns.map(d => `
      <div style="margin-bottom:0.6rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.9rem;"><span>${escapeHtml(d.name)}</span><span>${d.views} view${d.views === 1 ? '' : 's'}</span></div>
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${maxDesignViews ? (d.views / maxDesignViews) * 100 : 0}%;"></div></div>
      </div>
    `).join('') || '<p class="admin-empty">No design views yet — most viewed designs will appear here once couples browse your Design Collection.</p>';

    const styleViewCounts = {};
    designs.forEach(d => { if (d.style && d.views) styleViewCounts[d.style] = (styleViewCounts[d.style] || 0) + d.views; });
    const rankedStyles = Object.entries(styleViewCounts).sort((a, b) => b[1] - a[1]);
    const maxStyleViews = rankedStyles.length ? rankedStyles[0][1] : 0;
    document.getElementById('mostRequestedStylesList').innerHTML = rankedStyles.map(([style, views]) => `
      <div style="margin-bottom:0.6rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.9rem;"><span>${escapeHtml(style)}</span><span>${views} view${views === 1 ? '' : 's'}</span></div>
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${maxStyleViews ? (views / maxStyleViews) * 100 : 0}%;"></div></div>
      </div>
    `).join('') || '<p class="admin-empty">No design views yet — most requested styles will appear here once couples browse your Design Collection.</p>';
  }

  document.getElementById('mostViewedProductsCard').classList.toggle('hidden', !isJewelry);
  document.getElementById('mostRequestedCollectionsCard').classList.toggle('hidden', !isJewelry);
  if (isJewelry) {
    const items = getVendorData('jewelryItems', []);
    const rankedItems = items.slice().sort((a, b) => (b.views || 0) - (a.views || 0)).filter(j => j.views);
    const maxItemViews = rankedItems.length ? (rankedItems[0].views || 0) : 0;
    document.getElementById('mostViewedProductsList').innerHTML = rankedItems.map(j => `
      <div style="margin-bottom:0.6rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.9rem;"><span>${escapeHtml(j.name)}</span><span>${j.views} view${j.views === 1 ? '' : 's'}</span></div>
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${maxItemViews ? (j.views / maxItemViews) * 100 : 0}%;"></div></div>
      </div>
    `).join('') || '<p class="admin-empty">No product views yet — most viewed products will appear here once couples browse your Jewelry Collection.</p>';

    const collectionViewCounts = {};
    items.forEach(j => { if (j.collectionName && j.views) collectionViewCounts[j.collectionName] = (collectionViewCounts[j.collectionName] || 0) + j.views; });
    const rankedCollections = Object.entries(collectionViewCounts).sort((a, b) => b[1] - a[1]);
    const maxCollectionViews = rankedCollections.length ? rankedCollections[0][1] : 0;
    document.getElementById('mostRequestedCollectionsList').innerHTML = rankedCollections.map(([collection, views]) => `
      <div style="margin-bottom:0.6rem;">
        <div style="display:flex;justify-content:space-between;font-size:0.9rem;"><span>${escapeHtml(collection)}</span><span>${views} view${views === 1 ? '' : 's'}</span></div>
        <div style="background:#eee;border-radius:4px;height:8px;overflow:hidden;"><div style="background:var(--primary);height:100%;width:${maxCollectionViews ? (views / maxCollectionViews) * 100 : 0}%;"></div></div>
      </div>
    `).join('') || '<p class="admin-empty">No product views yet — most requested collections will appear here once couples browse your Jewelry Collection.</p>';
  }

  const revenueByMonth = {};
  payments.filter(p => p.status === 'Completed').forEach(p => {
    const d = new Date(p.time);
    const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    revenueByMonth[key] = (revenueByMonth[key] || 0) + Number(p.amount || 0);
  });
  const months = Object.keys(revenueByMonth);
  document.getElementById('revenueTableBody').innerHTML = months.map(m => `
    <tr><td>${escapeHtml(m)}</td><td>$${revenueByMonth[m]}</td></tr>
  `).join('') || '<tr><td colspan="2" class="admin-empty">No completed payments yet.</td></tr>';
}

document.getElementById('exportRevenueReportBtn').addEventListener('click', () => {
  const payments = getVendorData('payments', []);
  const revenueByMonth = {};
  payments.filter(p => p.status === 'Completed').forEach(p => {
    const d = new Date(p.time);
    const key = d.toLocaleString('default', { month: 'long', year: 'numeric' });
    revenueByMonth[key] = (revenueByMonth[key] || 0) + Number(p.amount || 0);
  });
  const total = Object.values(revenueByMonth).reduce((s, n) => s + n, 0);
  openPrintableHtml(`<html><head><title>Revenue Report — ${escapeHtml(currentVendor.businessName)}</title></head>
    <body style="font-family:Georgia, serif; padding:2rem; color:#2E2E2E;">
      <h2 style="color:#0F6A5B;">Revenue Report</h2>
      <p><strong>Business:</strong> ${escapeHtml(currentVendor.businessName)}</p>
      <p><strong>Total Revenue (Completed Payments):</strong> $${total}</p>
      <table style="width:100%;border-collapse:collapse;margin-top:1rem;">
        <thead><tr style="text-align:left;border-bottom:2px solid #0F6A5B;"><th>Month</th><th>Revenue</th></tr></thead>
        <tbody>
          ${Object.keys(revenueByMonth).map(m => `<tr style="border-bottom:1px solid #eee;"><td>${escapeHtml(m)}</td><td>$${revenueByMonth[m]}</td></tr>`).join('')}
        </tbody>
      </table>
    </body></html>`);
});

// ===================================================================
// DOCUMENTS
// ===================================================================
function renderDocuments() {
  const docs = getVendorData('documents', {});

  const status = currentVendor.status || 'Pending';
  document.getElementById('verificationStatusContent').innerHTML = `
    <p>Application Status: <span class="status-pill ${status.toLowerCase()}">${escapeHtml(status)}</span></p>
    <p style="margin-top:0.6rem;">Verified Badge: ${currentVendor.verified
      ? '<span class="status-pill approved">✔ Verified</span>'
      : '<span class="status-pill pending">Not yet verified</span>'}</p>
    ${!currentVendor.verified ? '<p class="admin-hint" style="text-align:left;margin-top:0.6rem;">Upload your business license and insurance documents below — our team reviews submissions and grants the Verified badge once approved.</p>' : ''}
  `;

  document.getElementById('licenseDocWrap').innerHTML = docs.license
    ? `<div class="doc-item">📄 <a href="${docs.license.dataURL}" target="_blank" rel="noopener noreferrer">${escapeHtml(docs.license.name)}</a><button id="removeLicenseBtn">✕</button></div>`
    : '<p class="admin-empty">No license uploaded yet.</p>';
  const removeLicenseBtn = document.getElementById('removeLicenseBtn');
  if (removeLicenseBtn) removeLicenseBtn.addEventListener('click', () => {
    const docs = getVendorData('documents', {});
    delete docs.license;
    setVendorData('documents', docs);
    renderDocuments();
  });

  const insurance = docs.insurance || [];
  document.getElementById('insuranceDocList').innerHTML = insurance.map((d, i) => `
    <div class="doc-item">📄 <a href="${d.dataURL}" target="_blank" rel="noopener noreferrer">${escapeHtml(d.name)}</a><button data-i="${i}" class="remove-insurance-btn">✕</button></div>
  `).join('') || '<p class="admin-empty">No insurance documents uploaded yet.</p>';
  document.querySelectorAll('.remove-insurance-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const docs = getVendorData('documents', {});
      docs.insurance.splice(Number(btn.dataset.i), 1);
      setVendorData('documents', docs);
      renderDocuments();
    });
  });
}

document.getElementById('licenseInput').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  if (!isSafeDocumentFile(file)) { alert('Please upload a PDF or image file (JPG, PNG, WEBP) for your license.'); e.target.value = ''; return; }
  const dataURL = await uploadMedia(file, `vendors/${currentVendor.username}/documents`);
  const docs = getVendorData('documents', {});
  docs.license = { name: file.name, dataURL };
  setVendorData('documents', docs);
  renderDocuments();
});

document.getElementById('insuranceInput').addEventListener('change', async (e) => {
  const files = Array.from(e.target.files);
  const docs = getVendorData('documents', {});
  docs.insurance = docs.insurance || [];
  for (const file of files) {
    if (!isSafeDocumentFile(file)) { alert(`"${file.name}" was skipped — please upload a PDF or image file (JPG, PNG, WEBP).`); continue; }
    docs.insurance.push({ name: file.name, dataURL: await uploadMedia(file, `vendors/${currentVendor.username}/documents`) });
  }
  setVendorData('documents', docs);
  renderDocuments();
});

// ===================================================================
// NOTIFICATIONS
// ===================================================================
function seedNotificationsIfNeeded() {
  if (localStorage.getItem(vKey('notifications')) !== null) return;
  const renewalDate = new Date(Date.now() + 30 * 86400000).toLocaleDateString();
  setVendorData('notifications', [
    { id: Date.now(), type: 'subscription', text: `Your ${currentVendor.plan} subscription renews on ${renewalDate}.`, time: Date.now(), read: false },
  ]);
}
function pushNotification(type, text) {
  const notifs = getVendorData('notifications', []);
  notifs.push({ id: Date.now() + Math.random(), type, text, time: Date.now(), read: false });
  setVendorData('notifications', notifs);
  updateNotifBadge();
}
function updateNotifBadge() {
  const notifs = getVendorData('notifications', []);
  const unread = notifs.filter(n => !n.read).length;
  const badge = document.getElementById('vendorNotifBadge');
  badge.textContent = unread > 0 ? unread : '';
}

function renderNotifications() {
  seedNotificationsIfNeeded();
  const prefs = getVendorData('notif_prefs', { bookingAlerts: true, subRenewal: true, customerMsgs: true, payments: true });
  document.getElementById('notifBookingAlerts').checked = prefs.bookingAlerts;
  document.getElementById('notifSubRenewal').checked = prefs.subRenewal;
  document.getElementById('notifCustomerMsgs').checked = prefs.customerMsgs;
  document.getElementById('notifPayments').checked = prefs.payments;

  const notifs = getVendorData('notifications', []);
  document.getElementById('notifFeed').innerHTML = notifs.slice().reverse().map(n => `
    <div class="notif-feed-item ${n.read ? '' : 'unread'}" data-id="${n.id}">
      ${escapeHtml(n.text)}
      <span class="notif-time">${new Date(n.time).toLocaleString()}</span>
    </div>
  `).join('') || '<p class="admin-empty">No notifications yet.</p>';

  document.querySelectorAll('.notif-feed-item').forEach(el => {
    el.addEventListener('click', () => {
      const notifs = getVendorData('notifications', []);
      const n = notifs.find(x => String(x.id) === el.dataset.id);
      if (n) n.read = true;
      setVendorData('notifications', notifs);
      renderNotifications();
    });
  });
  updateNotifBadge();
}

document.getElementById('saveNotifPrefsBtn').addEventListener('click', () => {
  setVendorData('notif_prefs', {
    bookingAlerts: document.getElementById('notifBookingAlerts').checked,
    subRenewal: document.getElementById('notifSubRenewal').checked,
    customerMsgs: document.getElementById('notifCustomerMsgs').checked,
    payments: document.getElementById('notifPayments').checked,
  });
  const note = document.getElementById('notifPrefsNote');
  note.textContent = 'Preferences saved.';
  setTimeout(() => note.textContent = '', 2000);
});

document.getElementById('markAllNotifReadBtn').addEventListener('click', () => {
  const notifs = getVendorData('notifications', []);
  notifs.forEach(n => n.read = true);
  setVendorData('notifications', notifs);
  renderNotifications();
});

// ===================================================================
// SETTINGS
// ===================================================================
const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const PAYMENT_METHODS_LIST = ['OMT', 'Whish Money', 'Western Union', 'Credit/Debit Card', 'Bank Transfer', 'Cash'];

function renderSettings() {
  const settings = getVendorData('settings', {});

  document.getElementById('businessHoursGrid').innerHTML = DAYS.map(day => {
    const d = (settings.hours || {})[day] || { open: true, from: '09:00', to: '18:00' };
    return `
    <div class="hours-row" data-day="${day}">
      <span>${day}</span>
      <label style="font-size:0.82rem;"><input type="checkbox" class="hours-open" ${d.open ? 'checked' : ''}> Open</label>
      <input type="time" class="hours-from" value="${d.from}" ${d.open ? '' : 'disabled'}>
      <input type="time" class="hours-to" value="${d.to}" ${d.open ? '' : 'disabled'}>
    </div>`;
  }).join('');
  document.querySelectorAll('.hours-open').forEach(cb => {
    cb.addEventListener('change', () => {
      const row = cb.closest('.hours-row');
      row.querySelector('.hours-from').disabled = !cb.checked;
      row.querySelector('.hours-to').disabled = !cb.checked;
    });
  });

  document.getElementById('bookingRulesInput').value = settings.bookingRules || '';
  document.getElementById('depositPercentInput').value = settings.depositPercent || '';
  document.getElementById('cancellationPolicyInput').value = settings.cancellationPolicy || '';
  document.getElementById('refundPolicyInput').value = settings.refundPolicy || '';

  document.getElementById('paymentMethodsGrid').innerHTML = PAYMENT_METHODS_LIST.map(m => `
    <label class="amenity-item"><input type="checkbox" value="${m}" class="payment-method-check" ${(settings.paymentMethods || []).includes(m) ? 'checked' : ''}> ${m}</label>
  `).join('');

  document.getElementById('omtNumberInput').value = settings.omtNumber || '';
  document.getElementById('whishNumberInput').value = settings.whishNumber || '';
  document.getElementById('westernUnionInfoInput').value = settings.westernUnionInfo || '';

  renderTeamList();
}

document.getElementById('savePoliciesBtn').addEventListener('click', () => {
  const settings = getVendorData('settings', {});
  const hours = {};
  document.querySelectorAll('.hours-row').forEach(row => {
    hours[row.dataset.day] = {
      open: row.querySelector('.hours-open').checked,
      from: row.querySelector('.hours-from').value,
      to: row.querySelector('.hours-to').value,
    };
  });
  settings.hours = hours;
  settings.bookingRules = document.getElementById('bookingRulesInput').value.trim();
  settings.depositPercent = document.getElementById('depositPercentInput').value;
  settings.cancellationPolicy = document.getElementById('cancellationPolicyInput').value.trim();
  settings.refundPolicy = document.getElementById('refundPolicyInput').value.trim();
  settings.paymentMethods = Array.from(document.querySelectorAll('.payment-method-check:checked')).map(c => c.value);
  settings.omtNumber = document.getElementById('omtNumberInput').value.trim();
  settings.whishNumber = document.getElementById('whishNumberInput').value.trim();
  settings.westernUnionInfo = document.getElementById('westernUnionInfoInput').value.trim();
  setVendorData('settings', settings);
  const note = document.getElementById('policiesNote');
  note.textContent = 'Settings saved.';
  setTimeout(() => note.textContent = '', 2000);
});

function renderTeamList() {
  const team = getVendorData('team', []);
  document.getElementById('teamList').innerHTML = team.map((m, i) => `
    <div class="team-member-row">
      <span>${escapeHtml(m.name)} — ${escapeHtml(m.role)} <span style="color:#999;">(${escapeHtml(m.email)})</span></span>
      <button data-i="${i}" class="remove-team-btn">✕</button>
    </div>
  `).join('') || '<p class="admin-empty">No team members added yet.</p>';
  document.querySelectorAll('.remove-team-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const team = getVendorData('team', []);
      team.splice(Number(btn.dataset.i), 1);
      setVendorData('team', team);
      renderTeamList();
    });
  });
}

document.getElementById('addTeamMemberBtn').addEventListener('click', () => {
  const name = document.getElementById('teamName').value.trim();
  const role = document.getElementById('teamRole').value.trim();
  const email = document.getElementById('teamEmail').value.trim();
  if (!name) { alert('Please enter a name.'); return; }
  const team = getVendorData('team', []);
  team.push({ name, role, email });
  setVendorData('team', team);
  ['teamName', 'teamRole', 'teamEmail'].forEach(id => document.getElementById(id).value = '');
  renderTeamList();
});

document.getElementById('vendorChangePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const newPassword = document.getElementById('vendorNewPassword').value;
  const note = document.getElementById('vendorPasswordNote');
  // The vendor is already signed in, so this can go straight through
  // Firebase Auth's own updatePassword — no email/identity-verification
  // dance needed (that's only required for Forgot Password, a separate,
  // still-open gap; see project memory).
  if (!window.fbAuth || !window.fbAuth.currentUser) {
    note.textContent = 'Password service unavailable right now. Please try again in a moment.';
    return;
  }
  try {
    await window.fbAuth.currentUser.updatePassword(newPassword);
  } catch (err) {
    note.textContent = err.code === 'auth/requires-recent-login'
      ? 'For security, please log out and log back in before changing your password.'
      : (err.message || 'Could not update your password.');
    return;
  }
  note.textContent = 'Password updated.';
  e.target.reset();
  setTimeout(() => note.textContent = '', 2500);
});

// ===================================================================
// MARKETING (upgrade subscription, sponsored/featured/homepage promos)
// ===================================================================
const PLAN_TIERS = [
  { name: 'Basic', price: 25, features: ['Vendor profile', 'Up to 10 images', 'Services & pricing', 'Inquiries & appointments', 'Reviews'] },
  { name: 'Professional', price: 50, features: ['Everything in Basic', 'Unlimited photos & videos', 'Booking requests', 'Availability calendar', 'Analytics', 'Verified badge'] },
  { name: 'Premium Featured', price: 100, features: ['Everything in Professional', 'Higher search ranking', 'Advanced analytics', 'Promotional campaigns', 'Banner exposure', 'AI pricing, auto-confirm, QR check-in, exports'] },
];
const MARKETING_PROMOS = [
  { key: 'Sponsored Service', price: 100, period: 'year', desc: 'get a personal 10% discount coupon to share — earn 10% commission whenever someone books using your code.' },
  { key: 'Featured Listing', price: 50, period: 'month', desc: 'Appears at the top of search results.' },
  { key: 'Homepage Advertisement', price: 200, period: 'month', desc: 'A picture or video featured as a top homepage banner ad.' },
  { key: 'Verified Badge', price: 50, period: 'year', desc: 'A verified badge on your profile for 1 year.' },
];

function renderMarketing() {
  document.getElementById('currentPlanLabel').textContent = currentVendor.plan;
  const currentIndex = PLAN_TIERS.findIndex(t => t.name === currentVendor.plan);

  document.getElementById('planComparisonWrap').innerHTML = PLAN_TIERS.map((t, i) => `
    <div class="plan-tier-row ${i === currentIndex ? 'current' : ''}">
      <span class="plan-tier-name">${escapeHtml(t.name)} ${i === currentIndex ? '(current)' : ''}</span>
      <span class="plan-tier-price">$${t.price}/month</span>
      <span class="plan-tier-features">${t.features.map(escapeHtml).join(', ')}</span>
    </div>
  `).join('');

  const upgradeWrap = document.getElementById('upgradeButtonsWrap');
  const higherTiers = PLAN_TIERS.filter((t, i) => i > currentIndex);
  if (!higherTiers.length) {
    upgradeWrap.innerHTML = `<p class="admin-hint" style="text-align:left;">You're on our highest plan. 🎉</p>`;
  } else {
    upgradeWrap.innerHTML = higherTiers.map(t => `
      <button class="admin-btn small outline upgrade-plan-btn" data-plan="${escapeHtml(t.name)}" data-price="${t.price}" style="margin-right:0.5rem;margin-bottom:0.5rem;">
        Upgrade to ${escapeHtml(t.name)} — $${t.price}/month
      </button>
    `).join('');
    document.querySelectorAll('.upgrade-plan-btn').forEach(btn => {
      btn.addEventListener('click', () => showUpgradeForm(btn.dataset.plan, btn.dataset.price));
    });
  }
  document.getElementById('upgradeFormWrap').innerHTML = '';

  renderMarketingPromos();
  updateMarketingTotal();
  refreshMarketingMediaVisibility();
}

function showUpgradeForm(planName, price) {
  document.getElementById('upgradeFormWrap').innerHTML = `
    <div class="admin-card" style="background:var(--bg);box-shadow:none;border:1px dashed var(--secondary);margin-top:1rem;">
      <h4>Confirm Upgrade to ${escapeHtml(planName)} — $${escapeHtml(price)}/month</h4>
      <p class="admin-hint" style="text-align:left;">Send your payment via Whish Money, OMT, or Western Union to <strong>+961 81 256 069</strong>, then confirm below.</p>
      <div class="form-row-2">
        <div class="admin-form-group">
          <label for="upgradePaymentMethod">Payment Method Used</label>
          <select id="upgradePaymentMethod"><option>Whish Money</option><option>OMT</option><option>Western Union</option></select>
        </div>
        <div class="admin-form-group">
          <label for="upgradeTransactionRef">Transaction Reference Number</label>
          <input type="text" id="upgradeTransactionRef" placeholder="e.g. WM123456">
        </div>
      </div>
      <button class="admin-btn small" id="confirmUpgradeBtn">Confirm Upgrade</button>
    </div>`;
  document.getElementById('confirmUpgradeBtn').addEventListener('click', () => {
    currentVendor.plan = planName;
    currentVendor.upgradeHistory = currentVendor.upgradeHistory || [];
    currentVendor.upgradeHistory.push({
      plan: planName,
      paymentMethod: document.getElementById('upgradePaymentMethod').value,
      transactionRef: document.getElementById('upgradeTransactionRef').value.trim(),
      time: Date.now(),
    });
    saveCurrentVendorToApplications();
    document.getElementById('vendorPlanLabel').textContent = `${currentVendor.plan} Plan`;
    const note = document.getElementById('upgradeNote');
    note.textContent = `Upgraded to ${planName}! New features are unlocked below.`;
    setTimeout(() => note.textContent = '', 4000);
    renderAll();
  });
}

let marketingSelections = new Set();
let marketingBundle = false;

function renderMarketingPromos() {
  document.getElementById('marketingPromoGrid').innerHTML = MARKETING_PROMOS.map(p => `
    <label class="plan-card" data-promo="${escapeHtml(p.key)}">
      <input type="checkbox" ${marketingSelections.has(p.key) ? 'checked' : ''} ${marketingBundle ? 'disabled' : ''} class="marketing-promo-check">
      <div class="plan-name">${escapeHtml(p.key)}</div>
      <div class="plan-price">$${p.price}<span style="font-size:0.8rem;font-weight:400;color:#777;">/${p.period}</span></div>
      <p class="promo-desc" style="font-size:0.82rem;color:#555;">${escapeHtml(p.desc)}</p>
    </label>
  `).join('') + `
    <label class="plan-card promo-bundle" data-promo="__bundle__">
      <input type="checkbox" id="marketingBundleCheck" ${marketingBundle ? 'checked' : ''}>
      <div class="plan-badge">Best Value</div>
      <div class="plan-name">All 4 Promotions</div>
      <div class="plan-price">$250<span style="font-size:0.8rem;font-weight:400;color:#777;">/month</span></div>
      <p class="promo-desc" style="font-size:0.82rem;color:#555;">Get all four promotions together for one flat monthly price.</p>
    </label>
  `;

  document.querySelectorAll('.marketing-promo-check').forEach(cb => {
    cb.addEventListener('change', () => {
      const key = cb.closest('.plan-card').dataset.promo;
      if (cb.checked) marketingSelections.add(key); else marketingSelections.delete(key);
      updateMarketingTotal();
      refreshMarketingMediaVisibility();
    });
  });
  document.getElementById('marketingBundleCheck').addEventListener('change', (e) => {
    marketingBundle = e.target.checked;
    if (marketingBundle) marketingSelections.clear();
    renderMarketingPromos();
    updateMarketingTotal();
    refreshMarketingMediaVisibility();
  });
  document.querySelectorAll('.plan-card').forEach(card => {
    const cb = card.querySelector('input');
    if (cb && cb.checked) card.classList.add('selected'); else if (cb) card.classList.remove('selected');
  });
}

function refreshMarketingMediaVisibility() {
  const show = marketingBundle || marketingSelections.has('Homepage Advertisement');
  document.getElementById('marketingHomepageAdMediaGroup').classList.toggle('hidden', !show);
}

function updateMarketingTotal() {
  const totalEl = document.getElementById('marketingPromoTotal');
  if (marketingBundle) { totalEl.textContent = 'Total: $250/month — all 4 promotions included.'; return; }
  if (!marketingSelections.size) { totalEl.textContent = ''; return; }
  let monthly = 0, yearly = 0;
  MARKETING_PROMOS.forEach(p => {
    if (marketingSelections.has(p.key)) { if (p.period === 'year') yearly += p.price; else monthly += p.price; }
  });
  const parts = [];
  if (monthly) parts.push(`$${monthly}/month`);
  if (yearly) parts.push(`$${yearly}/year`);
  totalEl.textContent = `Selected: ${Array.from(marketingSelections).join(', ')} — Total: ${parts.join(' + ')}`;
}

document.getElementById('copyMarketingNumberBtn').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText('+96181256069'); } catch (err) { /* ignore */ }
  const btn = document.getElementById('copyMarketingNumberBtn');
  const original = btn.textContent;
  btn.textContent = '✓';
  setTimeout(() => { btn.textContent = original; }, 1500);
});

document.getElementById('submitMarketingBtn').addEventListener('click', async () => {
  const note = document.getElementById('marketingNote');
  const selected = marketingBundle ? ['Sponsored Service', 'Featured Listing', 'Homepage Advertisement', 'Verified Badge (bundle)'] : Array.from(marketingSelections);
  if (!selected.length) {
    note.style.color = '#c0392b';
    note.textContent = 'Please select at least one promotion.';
    return;
  }
  let homepageAdMedia = null;
  const mediaInput = document.getElementById('marketingAdMedia');
  const mediaFile = mediaInput.files[0];
  if ((marketingBundle || marketingSelections.has('Homepage Advertisement')) && mediaFile) {
    if (mediaFile.type.startsWith('video/')) {
      if (mediaFile.size > MAX_VIDEO_BYTES) { note.style.color = '#c0392b'; note.textContent = 'That video is too large (max 8MB).'; return; }
      homepageAdMedia = { type: 'video', src: await uploadMedia(mediaFile, `vendors/${currentVendor.username}/homepageAds`) };
    } else {
      homepageAdMedia = { type: 'image', src: await uploadMedia(mediaFile, `vendors/${currentVendor.username}/homepageAds`) };
    }
  }

  createPromotion({
    businessName: currentVendor.businessName,
    phone: currentVendor.phone,
    email: currentVendor.email,
    promotions: selected,
    bundle: marketingBundle,
    paymentMethod: document.getElementById('marketingPaymentMethod').value,
    transactionRef: document.getElementById('marketingTransactionRef').value.trim(),
    homepageAdMedia,
    time: Date.now(),
  });

  if (selected.includes('Sponsored Service') || marketingBundle) {
    currentVendor.sponsorStatus = 'Pending';
    saveCurrentVendorToApplications();
  }

  note.style.color = '';
  note.textContent = `Thank you! Your promotion request (${selected.join(', ')}) was received. It'll be activated once your payment is confirmed.`;
  marketingSelections.clear();
  marketingBundle = false;
  document.getElementById('marketingTransactionRef').value = '';
  mediaInput.value = '';
  renderMarketingPromos();
  updateMarketingTotal();
  refreshMarketingMediaVisibility();
  setTimeout(() => note.textContent = '', 6000);
});

// ===================================================================
// HELP & SUPPORT
// ===================================================================
document.querySelectorAll('.faq-question').forEach(btn => {
  btn.addEventListener('click', () => {
    btn.closest('.faq-item').classList.toggle('open');
  });
});
