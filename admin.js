// ===================================================================
// Forever Begins — Admin Dashboard (demo)
// Reads/writes the same localStorage data the public site (index.html)
// writes to. IMPORTANT: for file:// pages, some browsers isolate
// localStorage per file path, so this may only see shared data when
// both pages are served from a real local web server (not double-clicked).
// ===================================================================

// getLS/setLS are now provided by data-shim.js (loaded before this file),
// backed by Firestore instead of plain localStorage.
ensureApplicationsListener();
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
// Vendors type mapsLink freely on their "List Your Business" form — reject
// non-http(s) schemes so a stray "javascript:" entry can't run script when
// an admin clicks the map link in the vendor table.
function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}

const DEFAULT_CATEGORIES = [
  { icon: '🏛️', name: 'Wedding Venues' }, { icon: '📷', name: 'Photographers & Videographers' },
  { icon: '🎧', name: 'DJs & Bands' }, { icon: '📋', name: 'Wedding Planner' },
  { icon: '🌸', name: 'Florists & Decor' }, { icon: '💄', name: 'Makeup Artists' },
  { icon: '💇‍♀️', name: 'Hair Stylists' }, { icon: '👗', name: 'Bridal Dress Shops' },
  { icon: '🥁', name: 'Zaffeh' }, { icon: '🤵', name: 'Suits Rentals' },
  { icon: '🚗', name: 'Car Rentals' }, { icon: '🍽️', name: 'Caterings' },
  { icon: '🎂', name: 'Cake Designers' }, { icon: '✈️', name: 'Honeymoon Agencies' },
  { icon: '💌', name: 'Invitation Cards' }, { icon: '💎', name: 'Jewelry' },
  { icon: '🍷', name: 'Restaurants' }, { icon: '🎪', name: 'Wedding Entertainment' },
];

const DEFAULT_REVIEWS = [
  { id: 1, vendor: 'Elegant Gardens Venue', author: 'Farah S.', rating: 5, text: 'Absolutely stunning venue, the team was so responsive.', status: 'Pending' },
  { id: 2, vendor: 'Bloom & Co. Florists', author: 'Karim H.', rating: 4, text: 'Beautiful arrangements, delivery was a little late.', status: 'Pending' },
  { id: 3, vendor: 'Cedar Sound DJs', author: 'Maya A.', rating: 5, text: 'Kept the dance floor full all night!', status: 'Approved' },
];

const PLAN_PRICES = { Basic: 25, Professional: 50, 'Premium Featured': 100 };

// ===== Seed defaults =====
// Admin credentials are now a real Firebase Auth account (provisioned via
// scripts/provision_admin.js) — no client-side fb_admin_creds seed anymore.
if (!localStorage.getItem('fb_categories')) setLS('fb_categories', DEFAULT_CATEGORIES);
if (!localStorage.getItem('fb_reviews')) setLS('fb_reviews', DEFAULT_REVIEWS);
if (!localStorage.getItem('fb_manual_banners')) setLS('fb_manual_banners', []);
if (!localStorage.getItem('fb_admin_email_settings')) setLS('fb_admin_email_settings', { notifyNewVendor: true, notifyNewPromo: true, notifyNewUser: false, autoConfirm: true });
if (!localStorage.getItem('fb_admin_system_settings')) setLS('fb_admin_system_settings', { siteName: 'Forever Begins', contactEmail: 'hello@foreverbegins.pro', paymentNumber: '+961 81 256 069', currency: 'USD', maintenance: false });

// ===== Elements =====
const loginWrap = document.getElementById('loginWrap');
const dashboardShell = document.getElementById('dashboardShell');
const loginForm = document.getElementById('adminLoginForm');
const loginNote = document.getElementById('loginNote');
const logoutBtn = document.getElementById('adminLogoutBtn');

function isLoggedIn() { return localStorage.getItem('fb_admin_session') === 'true'; }

function showDashboard() {
  loginWrap.classList.add('hidden');
  dashboardShell.classList.remove('hidden');
  ensureAdminVendorsListener();
  ensurePromotionsListener();
  ensureConfigListener('homepageHero', 'fb_homepage_hero');
  renderAll();
}
function showLogin() {
  dashboardShell.classList.add('hidden');
  loginWrap.classList.remove('hidden');
  loginForm.reset();
}

// The admin account is a real Firebase Auth user (provisioned once via
// scripts/provision_admin.js using the Admin SDK, which always bypasses
// rules — there's no in-app admin signup flow), identified by its real
// contact email under the hood. "Username" resolves to that email via the
// publicly-readable adminLoginLookup/{username} doc. Firebase Auth
// throttles repeated failed sign-ins server-side, real protection unlike
// the old client-side attempt counter this replaced.
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  const u = document.getElementById('adminUsername').value.trim();
  const p = document.getElementById('adminPassword').value;
  if (!window.fbAuth) {
    loginNote.textContent = 'Login service unavailable right now. Please try again in a moment.';
    return;
  }
  let realEmail;
  try {
    const lookup = await window.fbDb.collection('adminLoginLookup').doc(u).get();
    if (!lookup.exists) { loginNote.textContent = 'Incorrect username or password.'; return; }
    realEmail = lookup.data().email;
  } catch (err) {
    loginNote.textContent = 'Could not reach the login service. Please check your connection and try again.';
    return;
  }
  try {
    await window.fbAuth.signInWithEmailAndPassword(realEmail, p);
  } catch (err) {
    loginNote.textContent = err.code === 'auth/too-many-requests'
      ? 'Too many failed attempts. Please try again later.'
      : 'Incorrect username or password.';
    return;
  }
  localStorage.setItem('fb_admin_session', 'true');
  loginNote.textContent = '';
  showDashboard();
});

// ===== Forgot Password (Admin login) =====
// Real Firebase password-reset email — the admin account is keyed by its
// real contact email under the hood now (see provision_admin.js) — gated
// behind the same email/WhatsApp verification against the contact info on
// file in Settings (there's only one admin account, so no username lookup
// needed here — just resolving which email to actually send to).
function adminContactMatches(contact) {
  const normalized = contact.trim().toLowerCase();
  if (!normalized) return false;
  const settings = getLS('fb_admin_system_settings', {});
  const emailMatch = settings.contactEmail && settings.contactEmail.toLowerCase() === normalized;
  const digits = normalized.replace(/\D/g, '');
  const phoneMatch = digits.length >= 7 && settings.paymentNumber && settings.paymentNumber.replace(/\D/g, '').endsWith(digits);
  return !!(emailMatch || phoneMatch);
}

document.getElementById('adminForgotPasswordLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('adminForgotPasswordWrap').classList.toggle('hidden');
});

document.getElementById('adminSendCodeBtn').addEventListener('click', async () => {
  const contact = document.getElementById('adminForgotContact').value.trim();
  const note = document.getElementById('adminForgotNote1');
  note.style.color = '#c0392b';
  if (!adminContactMatches(contact)) { note.textContent = "That email/WhatsApp doesn't match the contact info on file."; return; }
  if (!window.fbAuth) { note.textContent = 'Service unavailable right now. Please try again in a moment.'; return; }
  const settings = getLS('fb_admin_system_settings', {});
  try {
    await window.fbAuth.sendPasswordResetEmail(settings.contactEmail);
  } catch (err) {
    note.textContent = err.message || 'Could not send the reset email. Please try again.';
    return;
  }
  note.style.color = 'var(--primary)';
  note.textContent = `📩 A password reset link has been sent to ${settings.contactEmail}. Check the inbox (and spam folder) and follow the link to set a new password.`;
  setTimeout(() => {
    document.getElementById('adminForgotPasswordWrap').classList.add('hidden');
    document.getElementById('adminForgotContact').value = '';
    note.textContent = '';
  }, 6000);
});

logoutBtn.addEventListener('click', () => {
  localStorage.removeItem('fb_admin_session');
  showLogin();
});

// Waits for Firebase Auth's own (async) session restoration before
// resuming — same race condition as vendor.js's session resume: calling
// showDashboard() (and its Firestore listener) immediately on a bare page
// reload would run ahead of Auth restoring its session, and get rejected
// by security rules as unauthenticated.
let __adminSessionResumeAttempted = false;
if (window.fbAuth) window.fbAuth.onAuthStateChanged((user) => {
  if (__adminSessionResumeAttempted) return;
  __adminSessionResumeAttempted = true;
  if (isLoggedIn() && user) {
    try { showDashboard(); } catch (err) { console.error('Admin dashboard: failed to resume session:', err); }
  }
});

// ===== Sidebar nav =====
document.querySelectorAll('#adminNav button').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('#adminNav button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.admin-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('panel-' + btn.dataset.panel).classList.add('active');
  });
});

// ===== Render everything =====
function renderAll() {
  // Guards against being invoked by a Firestore listener callback that
  // fires before login (e.g. the shared vendor-applications listener,
  // which is active from page load) — nothing to render yet.
  if (localStorage.getItem('fb_admin_session') !== 'true') return;
  // Each section renders independently so one failure (e.g. from an older
  // data shape in localStorage) can't stop the rest of this script from
  // running, which would otherwise leave every button on the page dead.
  const renderers = [
    renderOverview, renderVendors, renderContactMessages, renderSubscriptions, renderHomepageFeatures,
    renderBanners, renderSponsors, renderCategories, renderUsers, renderReviews, renderStories,
    renderSpinWins, loadNotificationSettings, loadSystemSettings,
  ];
  renderers.forEach(fn => {
    try { fn(); } catch (err) { console.error(`Admin dashboard: ${fn.name} failed to render:`, err); }
  });
}

// ===== Overview =====
function renderOverview() {
  const vendors = getLS('fb_vendor_applications', []);
  const promos = getLS('fb_promotions', []);
  const users = getLS('fb_users', {});
  const stories = getLS('fb_success_stories', []);

  const approved = vendors.filter(v => (v.status || 'Pending') === 'Approved');
  const pending = vendors.filter(v => (v.status || 'Pending') === 'Pending');
  const rejected = vendors.filter(v => v.status === 'Rejected');
  const mrr = approved.reduce((sum, v) => sum + (PLAN_PRICES[v.plan] || 0), 0);

  const stats = [
    { num: vendors.length, label: 'Vendor Applications' },
    { num: approved.length, label: 'Approved Vendors' },
    { num: pending.length, label: 'Pending Review' },
    { num: `$${mrr}`, label: 'Est. Monthly Revenue' },
    { num: promos.length, label: 'Promotion Requests' },
    { num: Object.keys(users).length, label: 'Registered Couples' },
    { num: stories.length, label: 'Success Stories Shared' },
  ];
  document.getElementById('overviewStats').innerHTML = stats.map(s => `
    <div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>
  `).join('');

  document.getElementById('overviewVendorBreakdown').innerHTML = `
    <span class="status-pill pending">Pending: ${pending.length}</span> &nbsp;
    <span class="status-pill approved">Approved: ${approved.length}</span> &nbsp;
    <span class="status-pill rejected">Rejected: ${rejected.length}</span>
  `;
  const promoPending = promos.filter(p => (p.status || 'Pending') === 'Pending').length;
  const promoApproved = promos.filter(p => p.status === 'Approved').length;
  const promoRejected = promos.filter(p => p.status === 'Rejected').length;
  document.getElementById('overviewPromoBreakdown').innerHTML = `
    <span class="status-pill pending">Pending: ${promoPending}</span> &nbsp;
    <span class="status-pill approved">Approved: ${promoApproved}</span> &nbsp;
    <span class="status-pill rejected">Rejected: ${promoRejected}</span>
  `;
}

// ===== Vendor Applications =====
// Admin needs to see EVERY vendor regardless of status (to approve pending
// ones), unlike vendor.js/venue.js's shared listener in data-shim.js which
// only queries Approved vendors (the only query Firestore's list-safety
// rules provably allow for an anonymous/vendor reader). An authenticated
// admin's unfiltered read is covered by the isAdmin() branch of the same
// vendors/{vendorId} rule, so this listener is intentionally separate
// from — not a replacement for — ensureApplicationsListener.
let __adminVendorsListenerAttached = false;
function ensureAdminVendorsListener() {
  if (__adminVendorsListenerAttached || !window.fbDb) return;
  __adminVendorsListenerAttached = true;
  window.fbDb.collection('vendors').onSnapshot(
    snap => { setLS('fb_admin_all_vendors', snap.docs.map(d => d.data())); renderVendors(); renderSubscriptions(); renderHomepageFeatures(); renderSponsors(); renderOverview(); },
    err => console.error('Admin dashboard: vendors listener error:', err)
  );
}

function updateVendor(time, patch) {
  const vendors = getLS('fb_admin_all_vendors', []);
  const v = vendors.find(x => String(x.time) === String(time));
  if (!v) return;
  if (window.fbDb) {
    window.fbDb.collection('vendors').doc(v.username).update(patch)
      .catch(err => console.error('Admin dashboard: failed to update vendor:', err));
  }
  Object.assign(v, patch);
  setLS('fb_admin_all_vendors', vendors);
  renderVendors(); renderSubscriptions(); renderHomepageFeatures(); renderSponsors(); renderOverview();
}

function renderVendors() {
  const vendors = getLS('fb_admin_all_vendors', []);
  const body = document.getElementById('vendorTableBody');
  if (!vendors.length) { body.innerHTML = `<tr><td colspan="8" class="admin-empty">No vendor applications yet.</td></tr>`; return; }
  body.innerHTML = vendors.slice().reverse().map(v => {
    const status = v.status || 'Pending';
    return `
    <tr data-time="${v.time}">
      <td>${escapeHtml(v.businessName)}${safeUrl(v.mapsLink) ? ` <a href="${escapeHtml(safeUrl(v.mapsLink))}" target="_blank" rel="noopener noreferrer" class="receipt-link">map</a>` : ''}<br><span style="color:#999;">@${escapeHtml(v.username || '—')}</span></td>
      <td>${escapeHtml(v.category)}</td>
      <td>${escapeHtml(v.phone)}<br>${escapeHtml(v.email)}<br><span style="color:#999;">${escapeHtml(v.location)}</span></td>
      <td>${escapeHtml(v.plan)}</td>
      <td>${escapeHtml(v.paymentMethod)}<br><span style="color:#999;">Ref: ${escapeHtml(v.transactionRef)}</span>${v.receiptImage ? `<br><a href="${v.receiptImage}" target="_blank" rel="noopener noreferrer" class="receipt-link">view receipt</a>` : ''}</td>
      <td><span class="status-pill ${status.toLowerCase()}">${status}</span></td>
      <td><input type="checkbox" class="verify-toggle" ${v.verified ? 'checked' : ''}></td>
      <td class="action-btns">
        <button class="admin-btn small approve-btn">Approve</button>
        <button class="admin-btn small danger reject-btn">Reject</button>
      </td>
    </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach(row => {
    const time = row.dataset.time;
    row.querySelector('.approve-btn').addEventListener('click', () => updateVendor(time, { status: 'Approved' }));
    row.querySelector('.reject-btn').addEventListener('click', () => updateVendor(time, { status: 'Rejected' }));
    row.querySelector('.verify-toggle').addEventListener('change', (e) => updateVendor(time, { verified: e.target.checked }));
  });
}

// ===== Contact Messages (homepage "Contact Us" form) =====
function renderContactMessages() {
  const messages = getLS('fb_contact_messages', []);
  const body = document.getElementById('contactMessagesTableBody');
  const badge = document.getElementById('contactMessagesBadge');
  const unreadCount = messages.filter(m => m.status === 'Unread').length;
  badge.textContent = unreadCount ? String(unreadCount) : '';

  if (!messages.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No contact messages yet.</td></tr>`; return; }
  body.innerHTML = messages.slice().reverse().map(m => `
    <tr data-id="${m.id}">
      <td>${escapeHtml(m.name)}</td>
      <td>${escapeHtml(m.email)}</td>
      <td>${escapeHtml(m.message)}</td>
      <td>${new Date(m.time).toLocaleString()}</td>
      <td><span class="status-pill ${m.status === 'Unread' ? 'pending' : 'approved'}">${escapeHtml(m.status)}</span></td>
      <td class="action-btns">
        ${m.status === 'Unread' ? '<button class="admin-btn small mark-contact-read-btn">Mark Read</button>' : ''}
        <a class="admin-btn small outline" target="_blank" rel="noopener" href="https://wa.me/96176346074?text=${encodeURIComponent(`Re: message from ${m.name} (${m.email}): ${m.message}`)}">Reply on WhatsApp</a>
        <button class="admin-btn small danger delete-contact-btn">Delete</button>
      </td>
    </tr>
  `).join('');

  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.id);
    const markBtn = row.querySelector('.mark-contact-read-btn');
    if (markBtn) {
      markBtn.addEventListener('click', () => {
        const messages = getLS('fb_contact_messages', []);
        const m = messages.find(x => x.id === id);
        if (m) m.status = 'Read';
        setLS('fb_contact_messages', messages);
        renderContactMessages();
      });
    }
    row.querySelector('.delete-contact-btn').addEventListener('click', () => {
      setLS('fb_contact_messages', getLS('fb_contact_messages', []).filter(x => x.id !== id));
      renderContactMessages();
    });
  });
}

// ===== Subscriptions =====
// Each subscription renews every 30 days from approval (or from the last
// manual renewal). There's no real payment gateway here, so "renewal" is
// just the admin confirming payment was received and pushing the date out.
const SUBSCRIPTION_PERIOD_DAYS = 30;
function subscriptionRenewalTime(v) {
  return v.subscriptionRenewalDate ? new Date(v.subscriptionRenewalDate).getTime() : v.time + SUBSCRIPTION_PERIOD_DAYS * 86400000;
}
function renderSubscriptions() {
  const vendors = getLS('fb_vendor_applications', []).filter(v => (v.status || 'Pending') === 'Approved');
  const body = document.getElementById('subsTableBody');
  if (!vendors.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No approved subscriptions yet.</td></tr>`; return; }
  body.innerHTML = vendors.slice().reverse().map(v => {
    const subStatus = v.subscriptionStatus || 'Active';
    const renewalTime = subscriptionRenewalTime(v);
    const daysLeft = Math.ceil((renewalTime - Date.now()) / 86400000);
    const renewalDateStr = new Date(renewalTime).toLocaleDateString();
    const renewalPillClass = daysLeft < 0 ? 'rejected' : daysLeft <= 3 ? 'pending' : 'approved';
    const renewalLabel = daysLeft < 0 ? `⚠️ Overdue by ${Math.abs(daysLeft)}d` : daysLeft <= 3 ? `⚠️ Renews in ${daysLeft}d` : `Renews in ${daysLeft}d`;
    return `
    <tr data-time="${v.time}">
      <td>${escapeHtml(v.businessName)}</td>
      <td>${escapeHtml(v.plan)} — $${PLAN_PRICES[v.plan] || 0}/month</td>
      <td><span class="status-pill approved">Approved</span></td>
      <td>
        ${v.frozen ? '<span class="status-pill rejected">🧊 Frozen</span>' : `<span class="status-pill ${subStatus.toLowerCase()}">${subStatus}</span>`}
      </td>
      <td>${escapeHtml(renewalDateStr)}<br><span class="status-pill ${renewalPillClass}">${renewalLabel}</span></td>
      <td class="action-btns">
        ${subStatus === 'Active'
          ? `<button class="admin-btn small danger cancel-sub-btn">Cancel</button>`
          : `<button class="admin-btn small reactivate-sub-btn">Reactivate</button>`}
        <button class="admin-btn small outline renew-sub-btn">Renew</button>
        ${v.frozen
          ? `<button class="admin-btn small unfreeze-sub-btn">Unfreeze</button>`
          : `<button class="admin-btn small danger freeze-sub-btn">Freeze</button>`}
      </td>
    </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach(row => {
    const time = row.dataset.time;
    const cancelBtn = row.querySelector('.cancel-sub-btn');
    const reactivateBtn = row.querySelector('.reactivate-sub-btn');
    const renewBtn = row.querySelector('.renew-sub-btn');
    const freezeBtn = row.querySelector('.freeze-sub-btn');
    const unfreezeBtn = row.querySelector('.unfreeze-sub-btn');
    if (cancelBtn) cancelBtn.addEventListener('click', () => updateVendor(time, { subscriptionStatus: 'Cancelled' }));
    if (reactivateBtn) reactivateBtn.addEventListener('click', () => updateVendor(time, { subscriptionStatus: 'Active' }));
    if (renewBtn) renewBtn.addEventListener('click', () => {
      const nextRenewal = new Date(Date.now() + SUBSCRIPTION_PERIOD_DAYS * 86400000);
      updateVendor(time, { subscriptionRenewalDate: nextRenewal.toISOString().slice(0, 10), frozen: false, subscriptionStatus: 'Active' });
    });
    if (freezeBtn) freezeBtn.addEventListener('click', () => {
      if (confirm('Freeze this vendor? They will be locked out of their dashboard and hidden from the public site until unfrozen.')) {
        updateVendor(time, { frozen: true });
      }
    });
    if (unfreezeBtn) unfreezeBtn.addEventListener('click', () => updateVendor(time, { frozen: false }));
  });
}

// ===== Homepage Features =====
function renderHomepageFeatures() {
  const vendors = getLS('fb_vendor_applications', []).filter(v => (v.status || 'Pending') === 'Approved');
  const body = document.getElementById('featureTableBody');
  if (!vendors.length) { body.innerHTML = `<tr><td colspan="5" class="admin-empty">No approved vendors to feature yet.</td></tr>`; return; }
  body.innerHTML = vendors.slice().reverse().map(v => {
    const sponsorLabel = v.sponsored ? 'Active' : v.sponsorStatus === 'Pending' ? 'Pending' : v.sponsorStatus === 'Declined' ? 'Declined' : '—';
    const sponsorClass = v.sponsored ? 'approved' : v.sponsorStatus === 'Pending' ? 'pending' : v.sponsorStatus === 'Declined' ? 'rejected' : '';
    return `
    <tr data-time="${v.time}">
      <td>${escapeHtml(v.businessName)}</td>
      <td>${escapeHtml(v.category)}</td>
      <td><input type="checkbox" class="feat-home" ${v.featuredHomepage ? 'checked' : ''}></td>
      <td><input type="checkbox" class="feat-listing" ${v.featuredListing ? 'checked' : ''}></td>
      <td>${sponsorClass ? `<span class="status-pill ${sponsorClass}">${sponsorLabel}</span>` : sponsorLabel}</td>
    </tr>`;
  }).join('');

  body.querySelectorAll('tr').forEach(row => {
    const time = row.dataset.time;
    row.querySelector('.feat-home').addEventListener('change', (e) => updateVendor(time, { featuredHomepage: e.target.checked }));
    row.querySelector('.feat-listing').addEventListener('change', (e) => updateVendor(time, { featuredListing: e.target.checked }));
  });
}

// ===== Sponsors (vendors who bought the Sponsored Service promotion) =====
function generateSponsorCoupon(businessName, vendors) {
  const base = (businessName || 'SPONSOR').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'SPONSOR';
  const taken = new Set(vendors.filter(v => v.sponsorCoupon).map(v => v.sponsorCoupon));
  let code = base + '10';
  let suffix = 2;
  while (taken.has(code)) { code = base + '10' + suffix; suffix++; }
  return code;
}

function renderSponsors() {
  const vendors = getLS('fb_vendor_applications', []);

  // ----- Pending requests -----
  const pending = vendors.filter(v => v.sponsorStatus === 'Pending');
  const pendingBody = document.getElementById('sponsorPendingTableBody');
  if (!pending.length) {
    pendingBody.innerHTML = `<tr><td colspan="4" class="admin-empty">No pending sponsor requests.</td></tr>`;
  } else {
    pendingBody.innerHTML = pending.slice().reverse().map(v => `
      <tr data-time="${v.time}">
        <td>${escapeHtml(v.businessName)}</td>
        <td>${escapeHtml(v.phone)}</td>
        <td>${escapeHtml(v.category)}</td>
        <td class="action-btns">
          <button class="admin-btn small approve-sponsor-btn">Approve</button>
          <button class="admin-btn small danger decline-sponsor-btn">Decline</button>
        </td>
      </tr>`).join('');
    pendingBody.querySelectorAll('tr').forEach(row => {
      const time = row.dataset.time;
      row.querySelector('.approve-sponsor-btn').addEventListener('click', () => {
        const vendorsNow = getLS('fb_vendor_applications', []);
        const v = vendorsNow.find(x => String(x.time) === String(time));
        const patch = { sponsored: true, sponsorStatus: 'Approved' };
        if (v && !v.sponsorCoupon) patch.sponsorCoupon = generateSponsorCoupon(v.businessName, vendorsNow);
        updateVendor(time, patch);
      });
      row.querySelector('.decline-sponsor-btn').addEventListener('click', () => {
        updateVendor(time, { sponsored: false, sponsorStatus: 'Declined' });
      });
    });
  }

  // ----- Active sponsors -----
  const active = vendors.filter(v => v.sponsored && v.sponsorCoupon);
  const body = document.getElementById('sponsorsTableBody');
  if (!active.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No active sponsors yet.</td></tr>`; return; }

  // Commission earned is 10% of every booking placed anywhere on the site
  // using this sponsor's coupon code — tallied by scanning every vendor's
  // own bookings storage, since bookings live per-vendor, not in one place.
  const usage = {};
  Object.keys(localStorage).filter(k => k.startsWith('fb_venue_bookings_')).forEach(key => {
    let bookings = [];
    try { bookings = JSON.parse(localStorage.getItem(key)) || []; } catch (err) { bookings = []; }
    bookings.forEach(b => {
      if (b.couponDiscount && b.couponDiscount.sponsorCoupon) {
        const code = b.couponDiscount.sponsorCoupon;
        usage[code] = usage[code] || { count: 0, total: 0 };
        usage[code].count += 1;
        usage[code].total += Number(b.couponDiscount.amount) || 0;
      }
    });
  });

  body.innerHTML = active.slice().reverse().map(v => {
    const stats = usage[v.sponsorCoupon] || { count: 0, total: 0 };
    return `
    <tr data-time="${v.time}">
      <td>${escapeHtml(v.businessName)}</td>
      <td>${escapeHtml(v.phone)}</td>
      <td><strong>${escapeHtml(v.sponsorCoupon)}</strong></td>
      <td>${stats.count}</td>
      <td>$${stats.total.toFixed(2)}</td>
      <td class="action-btns"><button class="admin-btn small danger deactivate-sponsor-btn">Deactivate</button></td>
    </tr>`;
  }).join('');
  body.querySelectorAll('tr').forEach(row => {
    const time = row.dataset.time;
    row.querySelector('.deactivate-sponsor-btn').addEventListener('click', () => updateVendor(time, { sponsored: false }));
  });
}

// ===== Banner Ads (from Promote Your Service submissions) =====
function updatePromo(id, patch) {
  updatePromotion(id, patch);
  renderBanners(); renderOverview();
}

function mediaThumbHtml(media) {
  if (!media || !media.src) return '<span style="color:#bbb;">No media</span>';
  return media.type === 'video'
    ? `<video src="${media.src}" style="width:70px;height:50px;object-fit:cover;border-radius:6px;" muted></video>`
    : `<img loading="lazy" decoding="async" src="${media.src}" style="width:70px;height:50px;object-fit:cover;border-radius:6px;">`;
}


function renderCurrentHero() {
  const hero = getLS('fb_homepage_hero', null);
  const preview = document.getElementById('currentHeroPreview');
  if (!hero || !hero.src) { preview.innerHTML = '<span style="color:#999;font-size:0.85rem;">Using the default homepage photo (1.jpg).</span>'; return; }
  preview.innerHTML = hero.type === 'video'
    ? `<video src="${hero.src}" style="width:160px;height:100px;object-fit:cover;border-radius:8px;" controls muted></video>`
    : `<img loading="lazy" decoding="async" src="${hero.src}" style="width:160px;height:100px;object-fit:cover;border-radius:8px;">`;
}
document.getElementById('clearHeroBtn').addEventListener('click', () => {
  writeConfig('homepageHero', 'fb_homepage_hero', null);
  renderCurrentHero();
});

function renderBanners() {
  const promos = getLS('fb_promotions', []).filter(p => p.bundle || (p.promotions || []).includes('Homepage Advertisement'));
  const body = document.getElementById('bannerTableBody');
  if (!promos.length) { body.innerHTML = `<tr><td colspan="5" class="admin-empty">No banner ad requests yet.</td></tr>`; }
  else {
    body.innerHTML = promos.slice().reverse().map(p => {
      const status = p.status || 'Pending';
      return `
      <tr data-id="${p.id}">
        <td>${escapeHtml(p.businessName)}</td>
        <td>${escapeHtml(p.phone)}<br>${escapeHtml(p.email)}</td>
        <td>
          ${mediaThumbHtml(p.homepageAdMedia)}
          <input type="file" class="banner-media-input" accept="image/*,video/*" style="display:block;margin-top:4px;font-size:0.72rem;max-width:140px;">
        </td>
        <td><span class="status-pill ${status.toLowerCase()}">${status}</span></td>
        <td class="action-btns">
          <button class="admin-btn small approve-btn">Approve</button>
          <button class="admin-btn small danger reject-btn">Reject</button>
          <button class="admin-btn small outline set-hero-btn" ${status !== 'Approved' || !p.homepageAdMedia ? 'disabled' : ''}>Set as Hero</button>
        </td>
      </tr>`;
    }).join('');
    body.querySelectorAll('tr').forEach(row => {
      const id = row.dataset.id;
      row.querySelector('.approve-btn').addEventListener('click', () => updatePromo(id, { status: 'Approved' }));
      row.querySelector('.reject-btn').addEventListener('click', () => updatePromo(id, { status: 'Rejected' }));
      const setHeroBtn = row.querySelector('.set-hero-btn');
      if (!setHeroBtn.disabled) {
        setHeroBtn.addEventListener('click', () => {
          const promos = getLS('fb_promotions', []);
          const p = promos.find(x => x.id === id);
          if (p && p.homepageAdMedia) {
            writeConfig('homepageHero', 'fb_homepage_hero', p.homepageAdMedia);
            renderCurrentHero();
            alert('Homepage hero updated. Reload the public site to see it.');
          }
        });
      }
      row.querySelector('.banner-media-input').addEventListener('change', async (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const media = { type: file.type.startsWith('video/') ? 'video' : 'image', src: await uploadMedia(file, 'siteContent/banners') };
        updatePromo(id, { homepageAdMedia: media });
      });
    });
  }

  const manualBanners = getLS('fb_manual_banners', []);
  document.getElementById('manualBannerList').innerHTML = manualBanners.map(b => `
    <div class="admin-card" data-id="${b.id}" style="background:var(--bg);display:flex;align-items:center;gap:0.8rem;padding:0.6rem 1rem;margin-bottom:0.6rem;">
      ${mediaThumbHtml(b.media)}
      <strong style="flex:1;">${escapeHtml(b.title)}</strong>
      <button type="button" class="admin-btn small outline set-manual-hero-btn" ${b.media ? '' : 'disabled'}>Set as Hero</button>
      <button type="button" class="admin-btn small danger remove-banner-btn">✕</button>
    </div>
  `).join('') || '<p class="admin-empty">No manual banners added.</p>';

  document.querySelectorAll('.remove-banner-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-id]').dataset.id;
      const banners = getLS('fb_manual_banners', []).filter(b => String(b.id) !== id);
      setLS('fb_manual_banners', banners);
      renderBanners();
    });
  });
  document.querySelectorAll('.set-manual-hero-btn').forEach(btn => {
    if (btn.disabled) return;
    btn.addEventListener('click', () => {
      const id = btn.closest('[data-id]').dataset.id;
      const b = getLS('fb_manual_banners', []).find(x => String(x.id) === id);
      if (b && b.media) {
        writeConfig('homepageHero', 'fb_homepage_hero', b.media);
        renderCurrentHero();
        alert('Homepage hero updated. Reload the public site to see it.');
      }
    });
  });

  renderCurrentHero();
}

document.getElementById('manualBannerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const title = document.getElementById('manualBannerTitle').value.trim();
  if (!title) return;
  const file = document.getElementById('manualBannerMedia').files[0];
  let media = null;
  if (file) {
    media = { type: file.type.startsWith('video/') ? 'video' : 'image', src: await uploadMedia(file, 'siteContent/banners') };
  }
  const banners = getLS('fb_manual_banners', []);
  banners.push({ id: Date.now(), title, media });
  setLS('fb_manual_banners', banners);
  e.target.reset();
  renderBanners();
});

// ===== Categories =====
function renderCategories() {
  const categories = getLS('fb_categories', []);
  document.getElementById('categoryList').innerHTML = categories.map((c, i) => `
    <span class="category-chip">${escapeHtml(c.icon)} ${escapeHtml(c.name)} <button data-i="${i}" class="remove-cat-btn">✕</button></span>
  `).join('');
  document.querySelectorAll('.remove-cat-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const cats = getLS('fb_categories', []);
      cats.splice(Number(btn.dataset.i), 1);
      setLS('fb_categories', cats);
      renderCategories();
    });
  });
}
document.getElementById('categoryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const icon = document.getElementById('categoryIcon').value.trim() || '🏷️';
  const name = document.getElementById('categoryName').value.trim();
  if (!name) return;
  const cats = getLS('fb_categories', []);
  cats.push({ icon, name });
  setLS('fb_categories', cats);
  e.target.reset();
  renderCategories();
});

// ===== Users =====
function renderUsers() {
  const users = getLS('fb_users', {});
  const body = document.getElementById('usersTableBody');
  const entries = Object.entries(users);
  if (!entries.length) { body.innerHTML = `<tr><td colspan="5" class="admin-empty">No registered couples yet.</td></tr>`; return; }
  body.innerHTML = entries.map(([username, profile]) => `
    <tr data-username="${escapeHtml(username)}">
      <td>${escapeHtml(username)}</td>
      <td>${escapeHtml(profile.bride || '—')} &amp; ${escapeHtml(profile.groom || '—')}</td>
      <td>${escapeHtml(profile.email || '—')}</td>
      <td>${escapeHtml(profile.phone || '—')}</td>
      <td><button class="admin-btn small danger delete-user-btn">Delete</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('.delete-user-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const username = btn.closest('tr').dataset.username;
      if (!confirm(`Delete account "${username}"? This also removes their saved planning data.`)) return;
      const users = getLS('fb_users', {});
      delete users[username];
      setLS('fb_users', users);
      localStorage.removeItem('fb_data_' + username);
      renderUsers(); renderOverview();
    });
  });
}

// ===== Reviews =====
function renderReviews() {
  const reviews = getLS('fb_reviews', []);
  const body = document.getElementById('reviewsTableBody');
  if (!reviews.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No reviews yet.</td></tr>`; return; }
  body.innerHTML = reviews.map(r => `
    <tr data-id="${r.id}">
      <td>${escapeHtml(r.vendor)}</td>
      <td>${escapeHtml(r.author)}</td>
      <td>⭐ ${escapeHtml(r.rating)}</td>
      <td style="max-width:280px;">${escapeHtml(r.text)}</td>
      <td><span class="status-pill ${r.status.toLowerCase()}">${r.status}</span></td>
      <td class="action-btns">
        <button class="admin-btn small approve-review-btn">Approve</button>
        <button class="admin-btn small danger reject-review-btn">Reject</button>
        <button class="admin-btn small outline delete-review-btn">Delete</button>
      </td>
    </tr>
  `).join('');
  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.id);
    function update(patch) {
      const reviews = getLS('fb_reviews', []);
      const r = reviews.find(x => x.id === id);
      if (r) Object.assign(r, patch);
      setLS('fb_reviews', reviews);
      renderReviews();
    }
    row.querySelector('.approve-review-btn').addEventListener('click', () => update({ status: 'Approved' }));
    row.querySelector('.reject-review-btn').addEventListener('click', () => update({ status: 'Rejected' }));
    row.querySelector('.delete-review-btn').addEventListener('click', () => {
      setLS('fb_reviews', getLS('fb_reviews', []).filter(x => x.id !== id));
      renderReviews();
    });
  });
}

// ===== Success Stories moderation =====
function renderStories() {
  const stories = getLS('fb_success_stories', []);
  const body = document.getElementById('storiesTableBody');
  if (!stories.length) { body.innerHTML = `<tr><td colspan="4" class="admin-empty">No submitted stories yet.</td></tr>`; return; }
  body.innerHTML = stories.map(s => `
    <tr data-id="${s.id}">
      <td>${escapeHtml(s.names)}</td>
      <td style="max-width:280px;">${escapeHtml(s.quote)}</td>
      <td>${(s.images || []).map(img => `<img loading="lazy" decoding="async" src="${img}" style="width:48px;height:48px;object-fit:cover;border-radius:6px;margin-right:4px;">`).join('')}</td>
      <td><button class="admin-btn small danger delete-story-btn">Delete</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('.delete-story-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = Number(btn.closest('tr').dataset.id);
      setLS('fb_success_stories', getLS('fb_success_stories', []).filter(s => s.id !== id));
      renderStories(); renderOverview();
    });
  });
}

// ===== Spin & Win =====
function renderSpinWins() {
  const wins = getLS('fb_spin_wins', []);
  const claimed = wins.filter(w => w.used).length;
  const pending = wins.length - claimed;
  document.getElementById('spinWinStats').innerHTML = [
    { num: wins.length, label: 'Total Prizes Won' },
    { num: pending, label: 'Pending Claim' },
    { num: claimed, label: 'Claimed' },
  ].map(s => `<div class="stat-card"><div class="num">${s.num}</div><div class="label">${s.label}</div></div>`).join('');

  const body = document.getElementById('spinWinTableBody');
  if (!wins.length) { body.innerHTML = `<tr><td colspan="6" class="admin-empty">No spins won yet.</td></tr>`; return; }
  body.innerHTML = wins.slice().reverse().map(w => `
    <tr data-id="${w.id}">
      <td>${escapeHtml(w.phone)}</td>
      <td>${escapeHtml(w.prizeLabel)}${w.code ? `<br><span style="color:#999;">${escapeHtml(w.code)}</span>` : ''}</td>
      <td>${escapeHtml(w.category || '—')}</td>
      <td>${w.time ? new Date(w.time).toLocaleDateString() : '—'}</td>
      <td><span class="status-pill ${w.used ? 'approved' : 'pending'}">${w.used ? 'Claimed' : 'Pending'}</span></td>
      <td><button class="admin-btn small ${w.used ? 'outline' : ''} toggle-claim-btn">${w.used ? 'Mark Unclaimed' : 'Mark Claimed'}</button></td>
    </tr>
  `).join('');
  body.querySelectorAll('tr').forEach(row => {
    const id = Number(row.dataset.id);
    row.querySelector('.toggle-claim-btn').addEventListener('click', () => {
      const wins = getLS('fb_spin_wins', []);
      const w = wins.find(x => x.id === id);
      if (w) w.used = !w.used;
      setLS('fb_spin_wins', wins);
      renderSpinWins();
    });
  });
}

// ===== Email Notification Settings =====
function loadNotificationSettings() {
  const s = getLS('fb_admin_email_settings', {});
  document.getElementById('notifNewVendor').checked = !!s.notifyNewVendor;
  document.getElementById('notifNewPromo').checked = !!s.notifyNewPromo;
  document.getElementById('notifNewUser').checked = !!s.notifyNewUser;
  document.getElementById('notifAutoConfirm').checked = !!s.autoConfirm;
}
document.getElementById('saveNotifBtn').addEventListener('click', () => {
  setLS('fb_admin_email_settings', {
    notifyNewVendor: document.getElementById('notifNewVendor').checked,
    notifyNewPromo: document.getElementById('notifNewPromo').checked,
    notifyNewUser: document.getElementById('notifNewUser').checked,
    autoConfirm: document.getElementById('notifAutoConfirm').checked,
  });
  const note = document.getElementById('notifNote');
  note.textContent = 'Preferences saved.';
  setTimeout(() => note.textContent = '', 2500);
});

// ===== System Settings =====
function loadSystemSettings() {
  const s = getLS('fb_admin_system_settings', {});
  document.getElementById('settingSiteName').value = s.siteName || '';
  document.getElementById('settingContactEmail').value = s.contactEmail || '';
  document.getElementById('settingPaymentNumber').value = s.paymentNumber || '';
  document.getElementById('settingCurrency').value = s.currency || '';
  document.getElementById('settingMaintenance').checked = !!s.maintenance;
}
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  setLS('fb_admin_system_settings', {
    siteName: document.getElementById('settingSiteName').value.trim(),
    contactEmail: document.getElementById('settingContactEmail').value.trim(),
    paymentNumber: document.getElementById('settingPaymentNumber').value.trim(),
    currency: document.getElementById('settingCurrency').value.trim(),
    maintenance: document.getElementById('settingMaintenance').checked,
  });
  const note = document.getElementById('settingsNote');
  note.textContent = 'Settings saved. (Note: the public site reads its own fixed content — these values are for admin records unless wired into the site.)';
  setTimeout(() => note.textContent = '', 5000);
});

document.getElementById('changePasswordForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('newAdminUsername').value.trim();
  const password = document.getElementById('newAdminPassword').value;
  const note = document.getElementById('credsNote');
  // The admin's real email stays the actual Firebase Auth identity
  // (needed for Forgot Password to work); changing "username" here just
  // repoints adminLoginLookup/{username} -> that same real email, it
  // doesn't touch the Auth account itself. Password change goes straight
  // through Firebase Auth's own updatePassword since the admin is already
  // signed in.
  if (!window.fbAuth || !window.fbAuth.currentUser) {
    note.textContent = 'Service unavailable right now. Please try again in a moment.';
    return;
  }
  try {
    if (username) {
      await window.fbDb.collection('adminLoginLookup').doc(username).set({ email: window.fbAuth.currentUser.email });
      await window.fbDb.collection('admins').doc(window.fbAuth.currentUser.uid).set({ username }, { merge: true });
    }
    if (password) {
      await window.fbAuth.currentUser.updatePassword(password);
    }
  } catch (err) {
    note.textContent = err.code === 'auth/requires-recent-login'
      ? 'For security, please log out and log back in before changing your credentials.'
      : (err.message || 'Could not update your credentials.');
    return;
  }
  note.textContent = 'Admin credentials updated.';
  e.target.reset();
  setTimeout(() => note.textContent = '', 3000);
});

// ===== Backup Management =====
document.getElementById('exportDataBtn').addEventListener('click', () => {
  const backup = {};
  Object.keys(localStorage).forEach(key => {
    if (key.startsWith('fb_')) backup[key] = localStorage.getItem(key);
  });
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `forever-begins-backup-${new Date().toISOString().slice(0, 10)}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
});

document.getElementById('importDataBtn').addEventListener('click', () => {
  const fileInput = document.getElementById('importDataInput');
  const note = document.getElementById('backupNote');
  const file = fileInput.files[0];
  if (!file) { note.style.color = '#c0392b'; note.textContent = 'Please choose a backup file first.'; return; }
  if (!confirm('This will overwrite current data in this browser with the backup file. Continue?')) return;

  const reader = new FileReader();
  reader.onload = () => {
    try {
      const data = JSON.parse(reader.result);
      Object.keys(data).forEach(key => localStorage.setItem(key, data[key]));
      note.style.color = 'var(--primary)';
      note.textContent = 'Backup restored. Reloading...';
      setTimeout(() => location.reload(), 1200);
    } catch (err) {
      note.style.color = '#c0392b';
      note.textContent = 'Invalid backup file.';
    }
  };
  reader.readAsText(file);
});
