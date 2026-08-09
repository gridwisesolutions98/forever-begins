// ===== Deferred brand logo video =====
// logo.mp4 is ~2MB but only ever renders at 42x42px — fetching it eagerly
// on every pageview competes with the hero image and other critical
// resources. Deferring it to the window "load" event (or a short fallback
// timer, in case "load" already fired before this script ran) keeps it out
// of the critical rendering path without changing how it looks once playing.
(function () {
  const video = document.getElementById('brandLogoVideo');
  if (!video) return;
  function startLogoVideo() {
    const source = video.querySelector('source[data-src]');
    if (source) {
      source.src = source.dataset.src;
      video.load();
    }
    const playResult = video.play();
    if (playResult && typeof playResult.catch === 'function') playResult.catch(() => {});
  }
  if (document.readyState === 'complete') {
    startLogoVideo();
  } else {
    window.addEventListener('load', startLogoVideo, { once: true });
  }
})();

// ===== Spin & Win =====
(function () {
  const wheel = document.getElementById('spinWheel');
  const spinBtn = document.getElementById('spinBtn');
  const whatsappInput = document.getElementById('spinWhatsapp');
  const note = document.getElementById('spinNote');
  const controls = document.getElementById('spinControls');
  const resultBox = document.getElementById('spinResult');
  const resultTitle = document.getElementById('spinResultTitle');
  const resultText = document.getElementById('spinResultText');
  const whatsappBtn = document.getElementById('spinWhatsappBtn');
  if (!wheel) return;

  const SEGMENTS = [
    { key: 'spin.seg_tryagain', type: 'none' },
    { key: 'spin.seg_10', type: 'discount', percent: 10, category: null },
    { key: 'spin.seg_tryagain', type: 'none' },
    { key: 'spin.seg_15', type: 'discount', percent: 15, category: null },
    { key: 'spin.seg_20cakes', type: 'discount', percent: 20, category: 'Cake Designers' },
    { key: 'spin.seg_freeinvite', type: 'freebie', category: 'Invitation Cards' },
    { key: 'spin.seg_10dress', type: 'discount', percent: 10, category: 'Bridal Dress Shops' },
    { key: 'spin.seg_turkey', type: 'sweepstakes', category: null },
  ];
  const SEGMENT_DEG = 360 / SEGMENTS.length;

  // Fan the labels out into their slices, keeping the text upright.
  document.querySelectorAll('.spin-label').forEach(label => {
    const i = Number(label.dataset.i);
    const angle = i * SEGMENT_DEG + SEGMENT_DEG / 2;
    label.style.transform = `rotate(${angle}deg) translateY(-95px) rotate(${-angle}deg)`;
  });

  let spinning = false;
  let currentRotation = 0;

  spinBtn.addEventListener('click', () => {
    if (spinning) return;
    const t = window.FBI18N.t;
    if (localStorage.getItem('fb_spin_used')) {
      note.style.color = '#c0392b';
      note.textContent = t('spin.already_used');
      return;
    }
    const phone = whatsappInput.value.trim();
    if (!phone) {
      note.style.color = '#c0392b';
      note.textContent = t('spin.enter_whatsapp');
      return;
    }

    spinning = true;
    note.textContent = '';
    const index = Math.floor(Math.random() * SEGMENTS.length);
    const targetCenter = index * SEGMENT_DEG + SEGMENT_DEG / 2;
    const extraSpins = 6 * 360;
    const finalRotation = currentRotation + extraSpins + (360 - targetCenter);
    currentRotation = finalRotation % 360;
    wheel.style.transform = `rotate(${finalRotation}deg)`;

    setTimeout(() => {
      spinning = false;
      showSpinResult(SEGMENTS[index], phone);
      localStorage.setItem('fb_spin_used', 'true');
    }, 4300);
  });

  function showSpinResult(prize, phone) {
    const t = window.FBI18N.t;
    controls.classList.add('hidden');
    resultBox.classList.remove('hidden');
    const prizeLabel = t(prize.key);

    if (prize.type === 'none') {
      resultTitle.textContent = t('spin.try_again_title');
      resultText.textContent = t('spin.try_again_text');
      whatsappBtn.classList.add('hidden');
      return;
    }

    const win = {
      id: Date.now(),
      phone,
      prizeLabel,
      type: prize.type,
      percent: prize.percent || null,
      category: prize.category || null,
      used: false,
      time: Date.now(),
    };
    win.code = `SPIN-${String(win.id).slice(-6)}`;
    const wins = JSON.parse(localStorage.getItem('fb_spin_wins') || '[]');
    wins.push(win);
    localStorage.setItem('fb_spin_wins', JSON.stringify(wins));

    resultTitle.textContent = t('spin.win_title');
    resultText.textContent = t('spin.win_text', { prize: prizeLabel });

    const msg = `Hi! I just won "${prizeLabel}" on the Forever Begins Spin & Win wheel. My WhatsApp number is ${phone}. My prize code is ${win.code}.`;
    whatsappBtn.href = `https://wa.me/96176346074?text=${encodeURIComponent(msg)}`;
    whatsappBtn.classList.remove('hidden');
  }
})();

// ===== Donation popup =====
(function () {
  const overlay = document.getElementById('donationOverlay');
  const closeBtn = document.getElementById('donationCloseBtn');
  const dismissBtn = document.getElementById('donationDismissBtn');
  const copyBtn = document.getElementById('donationCopyBtn');
  if (!overlay) return;
  const DISMISS_KEY = 'fb_donation_popup_dismissed';

  if (!localStorage.getItem(DISMISS_KEY)) {
    setTimeout(() => overlay.classList.remove('hidden'), 1500);
  }

  function dismiss() {
    overlay.classList.add('hidden');
    localStorage.setItem(DISMISS_KEY, 'true');
  }
  closeBtn.addEventListener('click', dismiss);
  dismissBtn.addEventListener('click', dismiss);
  overlay.addEventListener('click', (e) => { if (e.target === overlay) dismiss(); });

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText('+96181335905'); } catch (err) { /* ignore */ }
    const original = copyBtn.textContent;
    copyBtn.textContent = '✓';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  });
})();

// ===== Homepage hero media (can be replaced by admin via a Homepage Advertisement) =====
// Firestore-backed (config/homepageHero) so a real admin's change reaches
// every visitor's own browser, not just the admin's — window.__heroDataChanged
// is data-shim.js's hook for pages with no renderAll/renderProfile/etc. of
// their own, fired whenever the live listener below gets a fresh value.
(function () {
  const heroImg = document.getElementById('heroImg');
  const heroVideo = document.getElementById('heroVideo');
  const heroOverlay = document.querySelector('.hero-overlay');
  const heroContent = document.querySelector('.hero-content');
  if (!heroImg || !heroVideo) return;

  function applyHero() {
    const hero = getLS('fb_homepage_hero', null);
    if (!hero || !hero.src) return;

    if (hero.type === 'video') {
      heroVideo.src = hero.src;
      heroVideo.classList.remove('hidden');
      heroImg.classList.add('hidden');
    } else {
      heroImg.src = hero.src;
      heroImg.classList.remove('hidden');
      heroVideo.classList.add('hidden');
    }

    // Advertisement mode: no green overlay, and the headline text
    // shows briefly then fades out so only the ad remains visible.
    if (heroOverlay) heroOverlay.classList.add('hidden');
    if (heroContent) {
      setTimeout(() => heroContent.classList.add('fade-out'), 3500);
    }
  }

  window.__heroDataChanged = applyHero;
  ensureConfigListener('homepageHero', 'fb_homepage_hero');
  applyHero();
})();

// ===== Sponsored vendors (marked sponsored + approved by admin) =====
(function () {
  const section = document.getElementById('sponsored');
  const grid = document.getElementById('sponsoredGrid');
  if (!section || !grid) return;

  const categoryIcons = {
    'Wedding Venues': '🏛️', 'Photographers & Videographers': '📷', 'DJs & Bands': '🎧',
    'Wedding Planner': '📋', 'Florists & Decor': '🌸', 'Makeup Artists': '💄',
    'Hair Stylists': '💇‍♀️', 'Bridal Dress Shops': '👗', 'Zaffeh': '🥁',
    'Suits Rentals': '🤵', 'Car Rentals': '🚗', 'Caterings': '🍽️',
    'Cake Designers': '🎂', 'Honeymoon Agencies': '✈️', 'Invitation Cards': '💌',
    'Jewelry': '💎', 'Restaurants': '🍷', 'Wedding Entertainment': '🎪',
  };

  function escapeHtml(str) {
    return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  const vendors = JSON.parse(localStorage.getItem('fb_vendor_applications') || '[]')
    .filter(v => v.sponsored && (v.status || 'Pending') === 'Approved' && !v.frozen);

  if (!vendors.length) return;

  section.classList.remove('hidden');
  grid.innerHTML = vendors.map(v => `
    <div class="sponsored-card" data-username="${escapeHtml(v.username)}" style="cursor:pointer;">
      <div class="sponsored-badge">${window.FBI18N ? window.FBI18N.t('sponsored.badge') : 'Sponsored'}</div>
      <div class="sponsored-icon">${categoryIcons[v.category] || '⭐'}</div>
      <h3>${escapeHtml(v.businessName)}</h3>
      <div class="sponsored-category">${escapeHtml(v.category)}</div>
      ${v.verified ? `<div class="sponsored-verified">✔ ${window.FBI18N ? window.FBI18N.t('sponsored.verified') : 'Verified'}</div>` : ''}
    </div>
  `).join('');

  grid.querySelectorAll('.sponsored-card').forEach(card => {
    card.addEventListener('click', () => {
      location.href = `venue.html?v=${encodeURIComponent(card.dataset.username)}`;
    });
  });
})();

// ===== Hamburger nav =====
const hamburger = document.getElementById('hamburger');
const navMenu = document.getElementById('navMenu');
const navOverlay = document.getElementById('navOverlay');

function closeNav() {
  hamburger.classList.remove('open');
  navMenu.classList.remove('open');
  navOverlay.classList.remove('open');
  hamburger.setAttribute('aria-expanded', 'false');
}

function toggleNav() {
  const isOpen = navMenu.classList.toggle('open');
  hamburger.classList.toggle('open', isOpen);
  navOverlay.classList.toggle('open', isOpen);
  hamburger.setAttribute('aria-expanded', String(isOpen));
}

hamburger.addEventListener('click', toggleNav);
navOverlay.addEventListener('click', closeNav);
document.querySelectorAll('.nav-link').forEach(link => {
  link.addEventListener('click', closeNav);
});

// ===== Service cards link to the vendor listing page =====
document.querySelectorAll('#serviceGrid .service-card').forEach(card => {
  card.style.cursor = 'pointer';
  card.addEventListener('click', () => {
    location.href = `venue.html?category=${encodeURIComponent(card.dataset.category)}`;
  });
});

// ===== Find Services search =====
(function () {
  const form = document.getElementById('serviceSearchForm');
  const categorySelect = document.getElementById('searchCategory');
  const locationInput = document.getElementById('searchLocation');
  const budgetSelect = document.getElementById('searchBudget');
  const availabilityInput = document.getElementById('searchAvailability');
  const ratingSelect = document.getElementById('searchRating');
  const note = document.getElementById('searchResultNote');
  const cards = document.querySelectorAll('#serviceGrid .service-card');
  if (!form) return;

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const category = categorySelect.value;
    const location = locationInput.value.trim();
    const budget = budgetSelect.value;
    const availability = availabilityInput.value;
    const minRating = Number(ratingSelect.value) || 0;

    let visibleCount = 0;
    cards.forEach(card => {
      const matchesCategory = !category || card.dataset.category === category;
      const matchesRating = !minRating || Number(card.dataset.rating) >= minRating;
      const matches = matchesCategory && matchesRating;
      card.classList.toggle('hidden', !matches);
      if (matches) visibleCount++;
    });

    const t = window.FBI18N.t;
    const parts = [];
    if (category) parts.push(categorySelect.options[categorySelect.selectedIndex].textContent);
    if (location) parts.push(t('dynamic.search_near', { location }));
    if (budget) parts.push(t('dynamic.search_within', { budget: budgetSelect.options[budgetSelect.selectedIndex].textContent }));
    if (availability) parts.push(t('dynamic.search_available', { date: availability }));
    if (minRating) parts.push(t('dynamic.search_rating', { rating: ratingSelect.value }));
    note.textContent = parts.length
      ? t('dynamic.search_filtered', { count: visibleCount, details: parts.join(', ') })
      : t('dynamic.search_all', { count: visibleCount });
  });
})();

// ===== FAQ accordion =====
document.querySelectorAll('.accordion-trigger').forEach(trigger => {
  trigger.addEventListener('click', () => {
    const item = trigger.parentElement;
    const panel = trigger.nextElementSibling;
    const isOpen = item.classList.contains('open');

    document.querySelectorAll('.accordion-item.open').forEach(openItem => {
      if (openItem !== item) {
        openItem.classList.remove('open');
        openItem.querySelector('.accordion-panel').style.maxHeight = null;
      }
    });

    if (isOpen) {
      item.classList.remove('open');
      panel.style.maxHeight = null;
    } else {
      item.classList.add('open');
      panel.style.maxHeight = panel.scrollHeight + 'px';
    }
  });
});

// ===== Register form =====
// Register for Service is now purely a planner-routing form: a couple picks
// either instant AI guidance or a specific human Wedding Planner to message
// directly — there is no general vendor-matching option anymore.
const registerForm = document.getElementById('registerForm');
const registerNote = document.getElementById('registerNote');
const serviceTypeSelect = document.getElementById('serviceType');
const plannerSelectGroup = document.getElementById('plannerSelectGroup');
const plannerSelect = document.getElementById('plannerSelect');

function populatePlannerSelect() {
  const planners = JSON.parse(localStorage.getItem('fb_vendor_applications') || '[]')
    .filter(v => v.category === 'Wedding Planner' && (v.status || 'Pending') === 'Approved' && !v.frozen);
  plannerSelect.innerHTML = '';
  if (!planners.length) {
    const opt = document.createElement('option');
    opt.value = '';
    opt.textContent = 'No wedding planners are listed yet';
    plannerSelect.appendChild(opt);
    return;
  }
  planners.forEach(v => {
    const opt = document.createElement('option');
    opt.value = v.username;
    opt.textContent = v.businessName;
    plannerSelect.appendChild(opt);
  });
}

function updatePlannerFields() {
  const wantsHuman = serviceTypeSelect.value === 'Wedding Planner';
  plannerSelectGroup.classList.toggle('hidden', !wantsHuman);
  if (wantsHuman) populatePlannerSelect();
}
serviceTypeSelect.addEventListener('change', updatePlannerFields);
updatePlannerFields();

registerForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const messageText = document.getElementById('message').value.trim();

  if (serviceTypeSelect.value === 'AI Planner') {
    const text = messageText || "Hi! I'd like some help planning my wedding.";
    openChat();
    addMessage(text, 'user');
    botReply(text);
    registerNote.textContent = 'Your message was sent to the AI Wedding Planner — check the chat window!';
  } else {
    const username = plannerSelect.value;
    if (!username) {
      registerNote.textContent = 'No wedding planners are listed yet — please try again later.';
    } else {
      const planners = JSON.parse(localStorage.getItem('fb_vendor_applications') || '[]');
      const planner = planners.find(v => v.username === username);
      const fullName = document.getElementById('fullName').value.trim();
      const inquiriesKey = `fb_venue_inquiries_${username}`;
      const inquiries = JSON.parse(localStorage.getItem(inquiriesKey) || '[]');
      inquiries.push({
        id: Date.now(),
        from: fullName,
        channel: 'Inbox',
        message: messageText,
        phone: document.getElementById('phone').value.trim(),
        email: document.getElementById('email').value.trim(),
        quoteRequested: false,
        status: 'Unread',
        reply: '',
        time: Date.now(),
      });
      localStorage.setItem(inquiriesKey, JSON.stringify(inquiries));
      const notifsKey = `fb_venue_notifications_${username}`;
      const notifs = JSON.parse(localStorage.getItem(notifsKey) || '[]');
      notifs.push({ id: Date.now() + Math.random(), type: 'message', text: `New message from ${fullName}.`, time: Date.now(), read: false });
      localStorage.setItem(notifsKey, JSON.stringify(notifs));
      registerNote.textContent = `Your message was sent directly to ${planner ? planner.businessName : 'the wedding planner'}.`;
    }
  }
  registerForm.reset();
  updatePlannerFields();
});

// ===== Vendor registration & subscription (demo — saved only in this browser) =====
(function () {
  const form = document.getElementById('vendorForm');
  if (!form) return;
  const note = document.getElementById('vendorNote');
  // Scoped to this form only — the page-wide ".plan-card" class is also
  // reused by the checkbox-based promo cards in "Promote Your Service",
  // which have no radio input and would make querySelector() return null.
  const planCards = form.querySelectorAll('.plan-card');
  const copyBtn = document.getElementById('copyPaymentNumberBtn');
  const paymentNumber = '+96181256069';
  const receiptInput = document.getElementById('vReceiptPhoto');

  planCards.forEach(card => {
    const radio = card.querySelector('input[type="radio"]');
    radio.addEventListener('change', () => {
      planCards.forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
    });
  });

  copyBtn.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText(paymentNumber);
    } catch (err) {
      // clipboard API unavailable — ignore, number is already visible to copy manually
    }
    const original = copyBtn.textContent;
    copyBtn.textContent = '✓';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  });

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
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const plan = form.querySelector('input[name="plan"]:checked');
    if (!plan) return;

    const username = document.getElementById('vUsername').value.trim();
    const password = document.getElementById('vPassword').value;
    const realEmail = document.getElementById('vEmail').value.trim();
    const realPhone = document.getElementById('vPhone').value.trim();
    // Vendor accounts are real Firebase Auth users, identified by their
    // REAL email (not a synthetic one) so Forgot Password can use Firebase's
    // own sendPasswordResetEmail — it only ever emails an account's actual
    // registered address. "Username" stays what the login form asks for;
    // vendors/{username}/authLookup/contact (publicly readable, email+phone
    // only) is what resolves username -> real email before sign-in.
    if (!window.fbAuth) {
      note.style.color = '#c0392b';
      note.textContent = 'Signup service unavailable right now. Please try again in a moment.';
      return;
    }

    let receiptImage = null;
    if (receiptInput.files[0]) {
      try { receiptImage = await resizeImage(receiptInput.files[0]); } catch (err) { /* skip receipt if unreadable */ }
    }

    let userCredential;
    try {
      userCredential = await window.fbAuth.createUserWithEmailAndPassword(realEmail, password);
    } catch (err) {
      note.style.color = '#c0392b';
      note.textContent = err.code === 'auth/email-already-in-use'
        ? 'That username or email is already registered.'
        : (err.message || 'Could not create your account. Please try again.');
      return;
    }

    // The main vendors/{username} doc must exist before authLookup/contact
    // can be created — its create rule calls isOwner(vendorId), which does
    // a get() on this doc; get() on a not-yet-existing document errors out
    // rather than returning a usable empty result.
    try {
      await window.fbDb.collection('vendors').doc(username).set({
        businessName: document.getElementById('vBusinessName').value.trim(),
        category: document.getElementById('vCategory').value,
        username,
        uid: userCredential.user.uid,
        phone: realPhone,
        email: realEmail,
        location: document.getElementById('vLocation').value.trim(),
        mapsLink: document.getElementById('vMapsLink').value.trim(),
        plan: plan.value,
        paymentMethod: document.getElementById('vPaymentMethod').value,
        transactionRef: document.getElementById('vTransactionRef').value.trim(),
        receiptImage,
        time: Date.now(),
      });
    } catch (err) {
      note.style.color = '#c0392b';
      note.textContent = 'Your account was created, but the application could not be saved. Please contact support.';
      return;
    }

    try {
      await window.fbDb.collection('vendors').doc(username).collection('authLookup').doc('contact').set({ email: realEmail, phone: realPhone });
    } catch (err) {
      note.style.color = '#c0392b';
      note.textContent = 'Your account was created, but setup could not finish. Please contact support.';
      return;
    }

    note.style.color = '';
    note.textContent = window.FBI18N.t('vendor.success', { plan: plan.value });
    form.reset();
    planCards.forEach(c => c.classList.remove('selected'));
    setTimeout(() => note.textContent = '', 6000);
  });
})();

// ===== Promote Your Service (demo — saved only in this browser) =====
(function () {
  const form = document.getElementById('promoteForm');
  if (!form) return;
  const note = document.getElementById('promoteNote');
  const promoCheckboxes = document.querySelectorAll('input[name="promo"]');
  const bundleCheckbox = document.getElementById('promoBundle');
  const promoTotal = document.getElementById('promoTotal');
  const copyBtn = document.getElementById('copyPromoNumberBtn');
  const paymentNumber = '76346074';
  const mediaGroup = document.getElementById('homepageAdMediaGroup');
  const mediaInput = document.getElementById('pHomepageAdMedia');
  const MAX_VIDEO_BYTES = 12 * 1024 * 1024;

  copyBtn.addEventListener('click', async () => {
    try { await navigator.clipboard.writeText(paymentNumber); } catch (err) { /* ignore */ }
    const original = copyBtn.textContent;
    copyBtn.textContent = '✓';
    setTimeout(() => { copyBtn.textContent = original; }, 1500);
  });

  function homepageAdSelected() {
    return bundleCheckbox.checked || Array.from(promoCheckboxes).some(cb => cb.value === 'Homepage Advertisement' && cb.checked);
  }
  function refreshMediaVisibility() {
    mediaGroup.classList.toggle('hidden', !homepageAdSelected());
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
        canvas.width = width;
        canvas.height = height;
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

  function updateTotal() {
    const t = window.FBI18N.t;
    if (bundleCheckbox.checked) {
      promoTotal.textContent = t('promote.total_bundle');
      return;
    }
    const names = [];
    promoCheckboxes.forEach(cb => { if (cb.checked) names.push(cb.value); });
    if (!names.length) { promoTotal.textContent = ''; return; }
    promoTotal.textContent = t('promote.total_summary', { items: names.join(', ') });
  }

  bundleCheckbox.addEventListener('change', () => {
    promoCheckboxes.forEach(cb => {
      cb.disabled = bundleCheckbox.checked;
      cb.checked = bundleCheckbox.checked;
    });
    updateTotal();
    refreshMediaVisibility();
  });
  promoCheckboxes.forEach(cb => cb.addEventListener('change', () => { updateTotal(); refreshMediaVisibility(); }));

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const selected = bundleCheckbox.checked
      ? ['Sponsored Service', 'Featured Listing', 'Homepage Advertisement', 'Verified Badge (bundle)']
      : Array.from(promoCheckboxes).filter(cb => cb.checked).map(cb => cb.value);

    if (!selected.length) {
      note.style.color = '#c0392b';
      note.textContent = window.FBI18N.t('promote.choose_one');
      return;
    }

    let homepageAdMedia = null;
    const mediaFile = mediaInput.files[0];
    if (homepageAdSelected() && mediaFile) {
      if (mediaFile.type.startsWith('video/')) {
        if (mediaFile.size > MAX_VIDEO_BYTES) {
          note.style.color = '#c0392b';
          note.textContent = window.FBI18N.t('promote.media_too_large');
          return;
        }
        try { homepageAdMedia = { type: 'video', src: await readFileAsDataURL(mediaFile) }; } catch (err) { /* skip if unreadable */ }
      } else {
        try { homepageAdMedia = { type: 'image', src: await resizeImage(mediaFile) }; } catch (err) { /* skip if unreadable */ }
      }
    }

    const promotions = JSON.parse(localStorage.getItem('fb_promotions') || '[]');
    promotions.push({
      businessName: document.getElementById('pBusinessName').value.trim(),
      phone: document.getElementById('pPhone').value.trim(),
      email: document.getElementById('pEmail').value.trim(),
      promotions: selected,
      bundle: bundleCheckbox.checked,
      homepageAdMedia,
      time: Date.now(),
    });
    localStorage.setItem('fb_promotions', JSON.stringify(promotions));

    if (selected.includes('Sponsored Service') || bundleCheckbox.checked) {
      const vendors = JSON.parse(localStorage.getItem('fb_vendor_applications') || '[]');
      const bName = document.getElementById('pBusinessName').value.trim().toLowerCase();
      const matchedVendor = vendors.find(v => (v.businessName || '').trim().toLowerCase() === bName);
      if (matchedVendor) {
        matchedVendor.sponsorStatus = 'Pending';
        localStorage.setItem('fb_vendor_applications', JSON.stringify(vendors));
      }
    }

    note.style.color = '';
    note.textContent = window.FBI18N.t('promote.success', { items: selected.join(', ') });
    form.reset();
    promoCheckboxes.forEach(cb => { cb.disabled = false; });
    promoTotal.textContent = '';
    refreshMediaVisibility();
    setTimeout(() => note.textContent = '', 6000);
  });
})();

// ===== Contact form =====
// Every submission is saved for the admin dashboard's Contact Messages panel
// AND opened as a pre-filled WhatsApp message to the business number, so it
// reaches us both ways even though this is a static site with no backend.
const contactForm = document.getElementById('contactForm');
const contactNote = document.getElementById('contactNote');
contactForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const name = document.getElementById('cName').value.trim();
  const email = document.getElementById('cEmail').value.trim();
  const message = document.getElementById('cMessage').value.trim();

  const messages = JSON.parse(localStorage.getItem('fb_contact_messages') || '[]');
  messages.push({ id: Date.now(), name, email, message, status: 'Unread', time: Date.now() });
  localStorage.setItem('fb_contact_messages', JSON.stringify(messages));

  const whatsappText = `New contact message from ${name} (${email}): ${message}`;
  window.open(`https://wa.me/96176346074?text=${encodeURIComponent(whatsappText)}`, '_blank');

  contactNote.textContent = window.FBI18N.t('dynamic.contact_success');
  contactForm.reset();
});

// ===== Vendor Login (hamburger nav) =====
// Mirrors vendor.html's own login check exactly, then hands off to it via
// fb_vendor_session — vendor.js resumes that session on load and routes each
// vendor to the dashboard for their own registered category (or the pending-
// approval gate first, if the admin hasn't approved them yet).
document.getElementById('navVendorLoginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const username = document.getElementById('navVendorUsername').value.trim();
  const password = document.getElementById('navVendorPassword').value;
  const note = document.getElementById('navVendorLoginNote');
  if (!window.fbAuth) {
    note.textContent = 'Login service unavailable right now. Please try again in a moment.';
    return;
  }
  let realEmail;
  try {
    const lookup = await window.fbDb.collection('vendors').doc(username).collection('authLookup').doc('contact').get();
    if (!lookup.exists) { note.textContent = window.FBI18N.t('nav.vendor_login_error_credentials'); return; }
    realEmail = lookup.data().email;
  } catch (err) {
    note.textContent = window.FBI18N.t('nav.vendor_login_error_credentials');
    return;
  }
  let userCredential;
  try {
    userCredential = await window.fbAuth.signInWithEmailAndPassword(realEmail, password);
  } catch (err) {
    note.textContent = window.FBI18N.t('nav.vendor_login_error_credentials');
    return;
  }
  let app;
  try {
    const doc = await window.fbDb.collection('vendors').doc(username).get();
    app = doc.exists ? doc.data() : null;
  } catch (err) {
    note.textContent = window.FBI18N.t('nav.vendor_login_error_no_app');
    return;
  }
  if (!app || app.uid !== userCredential.user.uid) {
    note.textContent = window.FBI18N.t('nav.vendor_login_error_no_app');
    return;
  }
  note.textContent = '';
  localStorage.setItem('fb_vendor_session', username);
  window.location.href = 'vendor.html';
});

// ===== Forgot Password (nav Vendor Login) =====
// Real Firebase password-reset email now (accounts are keyed by real email
// under the hood — see the signup/login changes above) — verify the
// claimed contact against vendors/{username}/authLookup/contact (readable
// pre-auth by design), then let Firebase actually send the reset link.
// There's no "enter the code" second step anymore: the emailed link takes
// the vendor to Firebase's own password-reset page directly.
function vendorContactMatches(contactOnFile, contact) {
  const normalized = contact.trim().toLowerCase();
  if (!normalized) return false;
  const emailMatch = contactOnFile.email && contactOnFile.email.toLowerCase() === normalized;
  const digits = normalized.replace(/\D/g, '');
  const phoneMatch = digits.length >= 7 && contactOnFile.phone && contactOnFile.phone.replace(/\D/g, '').endsWith(digits);
  return !!(emailMatch || phoneMatch);
}

document.getElementById('navForgotPasswordLink').addEventListener('click', (e) => {
  e.preventDefault();
  document.getElementById('navForgotPasswordWrap').classList.toggle('hidden');
});

document.getElementById('navSendCodeBtn').addEventListener('click', async () => {
  const username = document.getElementById('navForgotUsername').value.trim();
  const contact = document.getElementById('navForgotContact').value.trim();
  const note = document.getElementById('navForgotNote1');
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
  if (!vendorContactMatches(contactOnFile, contact)) { note.textContent = "That email/WhatsApp doesn't match our records for this account."; return; }
  try {
    await window.fbAuth.sendPasswordResetEmail(contactOnFile.email);
  } catch (err) {
    note.textContent = err.message || 'Could not send the reset email. Please try again.';
    return;
  }
  note.style.color = 'var(--primary)';
  note.textContent = `📩 A password reset link has been sent to ${contactOnFile.email}. Check your inbox (and spam folder) and follow the link to set a new password.`;
  setTimeout(() => {
    document.getElementById('navForgotPasswordWrap').classList.add('hidden');
    ['navForgotUsername', 'navForgotContact'].forEach(id => document.getElementById(id).value = '');
    note.textContent = '';
  }, 6000);
});

// ===== AI Chat widget =====
const chatFab = document.getElementById('chatFab');
const chatPanel = document.getElementById('chatPanel');
const closeChatBtn = document.getElementById('closeChatBtn');
const chatForm = document.getElementById('chatForm');
const chatInput = document.getElementById('chatInput');
const chatBody = document.getElementById('chatBody');
const openChatBtn = document.getElementById('openChatBtn');

function openChat() {
  chatPanel.classList.add('open');
  chatInput.focus();
}
function closeChat() {
  chatPanel.classList.remove('open');
}

chatFab.addEventListener('click', () => {
  chatPanel.classList.contains('open') ? closeChat() : openChat();
});
closeChatBtn.addEventListener('click', closeChat);
openChatBtn.addEventListener('click', openChat);

function addMessage(text, sender) {
  const msg = document.createElement('div');
  msg.className = `chat-msg ${sender}`;
  msg.textContent = text;
  chatBody.appendChild(msg);
  chatBody.scrollTop = chatBody.scrollHeight;
}

const canned = [
  { keys: ['budget'], reply: "A good starting budget rule: 40% venue & catering, 15% photography/video, 10% florals & décor, rest split across attire, music and extras. Want a breakdown for your total budget?" },
  { keys: ['venue'], reply: "For venues, tell me your guest count and city and I can suggest the type of space (garden, ballroom, estate) that fits best." },
  { keys: ['timeline', 'schedule'], reply: "Most couples plan over 9-12 months: book venue & vendors first (months 1-3), then attire & décor (months 4-7), finalize details (months 8-12)." },
  { keys: ['photographer', 'photography', 'video'], reply: "Look for photographers whose past weddings match your venue's style. We can introduce you to a shortlist — just register above." },
  { keys: ['vendor', 'register', 'join'], reply: "You can register as a couple or a vendor using the 'Register for Service' section — pick 'I'm a Vendor / Supplier' in the form." },
  { keys: ['price', 'cost'], reply: "Costs vary by city and guest count. Share your details in the registration form and a planner will send a tailored estimate." },
];

function botReply(userText) {
  const lower = userText.toLowerCase();
  const match = canned.find(c => c.keys.some(k => lower.includes(k)));
  const reply = match
    ? match.reply
    : "That's a great question — for a detailed answer, register above and a human planner will follow up. Meanwhile, ask me about budget, venues, timelines or vendors!";
  setTimeout(() => addMessage(reply, 'bot'), 500);
}

chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const text = chatInput.value.trim();
  if (!text) return;
  addMessage(text, 'user');
  chatInput.value = '';
  botReply(text);
});

// ===================================================================
// ===== Wedding Planning Dashboard (demo — data lives in this
// ===== browser's localStorage only; not a real/secure account system)
// ===================================================================
(function () {
  const SESSION_KEY = 'fb_currentUser';
  let currentUser = null;
  let currentCoupleProfile = {};
  let countdownTimer = null;
  // Re-render hook data-shim.js's notifyDataChanged() calls after a
  // Firestore update — renderAll/getData/currentUser all live in this
  // closure, so this is the one seam a shared, page-agnostic shim function
  // can reach in to trigger a re-render from.
  window.__coupleDataChanged = () => { if (currentUser) renderAll(getData(currentUser)); };

  const galleryItems = [
    { id: 'g1', src: '1.jpg', caption: 'Sunset Ceremony' },
    { id: 'g2', src: '2.jpg', caption: 'Candlelit Staircase' },
    { id: 'g3', src: '1.jpg', caption: 'Golden Hour Vows' },
    { id: 'g4', src: '2.jpg', caption: 'Grand Entrance' },
  ];

  const budgetCategories = [
    { key: 'panel.budget_cat_venue', pct: 0.40 },
    { key: 'panel.budget_cat_catering', pct: 0.15 },
    { key: 'panel.budget_cat_photo', pct: 0.12 },
    { key: 'panel.budget_cat_florals', pct: 0.10 },
    { key: 'panel.budget_cat_attire', pct: 0.08 },
    { key: 'panel.budget_cat_music', pct: 0.08 },
    { key: 'panel.budget_cat_misc', pct: 0.07 },
  ];

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  function defaultData(weddingDate) {
    return {
      checklist: [
        { text: 'Book venue', done: false },
        { text: 'Hire photographer', done: false },
        { text: 'Send invitations', done: false },
        { text: 'Choose menu with caterer', done: false },
        { text: 'Book DJ or band', done: false },
      ],
      budgetTotal: null,
      guests: [],
      tableCount: 5,
      seating: {},
      weddingDate: weddingDate || '',
      favorites: [],
      notes: '',
      bookings: [],
      appointments: [],
      messages: [
        { id: 1, from: 'Elegant Gardens Venue', preview: 'Thanks for your inquiry! We have availability on your date.', time: '2 days ago', unread: true },
        { id: 2, from: 'Bloom & Co. Florists', preview: 'Here is your custom floral proposal, take a look!', time: '5 days ago', unread: true },
        { id: 3, from: 'Forever Begins Team', preview: 'Your dedicated planner has been assigned.', time: '1 week ago', unread: false },
      ],
      notifications: [
        { id: 1, text: 'A new venue match was found for your date.', time: 'Today', unread: true },
        { id: 2, text: 'Reminder: appointment with your photographer tomorrow.', time: 'Yesterday', unread: true },
        { id: 3, text: 'Your budget estimate was updated.', time: '3 days ago', unread: false },
      ],
    };
  }

  // Firestore-backed (see data-shim.js's ensureCoupleDocListener/
  // writeCoupleDoc) — a couple's planning data now syncs across their own
  // devices instead of being siloed to whichever browser they signed up in.
  function getData(username) {
    const key = `fb_couple_data_${username}`;
    ensureCoupleDocListener(username, 'data', key);
    return getLS(key, defaultData());
  }
  function saveData(username, data) {
    writeCoupleDoc(username, 'data', data);
  }

  // Couple accounts are real Firebase Auth users now — no client-side
  // demo_couple seed anymore (it would just get overwritten by nothing,
  // since there's no local-only account system left for it to populate).

  // ----- Elements -----
  const authWrapper = document.getElementById('authWrapper');
  const dashboard = document.getElementById('dashboard');
  const dashboardUser = document.getElementById('dashboardUser');
  const authTabs = document.querySelectorAll('.auth-tab');
  const loginForm = document.getElementById('loginForm');
  const signupForm = document.getElementById('signupForm');
  const loginNote = document.getElementById('loginNote');
  const signupNote = document.getElementById('signupNote');
  const logoutBtn = document.getElementById('logoutBtn');

  const notifBadge = document.getElementById('notifBadge');
  const msgBadge = document.getElementById('msgBadge');

  const checklistForm = document.getElementById('checklistForm');
  const checklistInput = document.getElementById('checklistInput');
  const checklistPhone = document.getElementById('checklistPhone');
  const checklistList = document.getElementById('checklistList');

  const budgetTotalInput = document.getElementById('budgetTotal');
  const budgetBreakdown = document.getElementById('budgetBreakdown');

  const guestForm = document.getElementById('guestForm');
  const guestName = document.getElementById('guestName');
  const guestPhone = document.getElementById('guestPhone');
  const guestStatus = document.getElementById('guestStatus');
  const guestSummary = document.getElementById('guestSummary');
  const guestTableBody = document.getElementById('guestTableBody');

  const tableCountInput = document.getElementById('tableCount');
  const seatsPerTableInput = document.getElementById('seatsPerTableInput');
  const seatingBoard = document.getElementById('seatingBoard');

  const weddingDateInput = document.getElementById('weddingDateInput');
  const cdDays = document.getElementById('cdDays');
  const cdHours = document.getElementById('cdHours');
  const cdMinutes = document.getElementById('cdMinutes');
  const cdSeconds = document.getElementById('cdSeconds');

  const favOnlyToggle = document.getElementById('favOnlyToggle');
  const galleryGrid = document.getElementById('galleryGrid');

  const notesArea = document.getElementById('notesArea');
  const notesSaved = document.getElementById('notesSaved');

  const bookingForm = document.getElementById('bookingForm');
  const bookingVendor = document.getElementById('bookingVendor');
  const bookingDate = document.getElementById('bookingDate');
  const bookingTableBody = document.getElementById('bookingTableBody');

  const appointmentForm = document.getElementById('appointmentForm');
  const apptWith = document.getElementById('apptWith');
  const apptTime = document.getElementById('apptTime');
  const apptTableBody = document.getElementById('apptTableBody');

  const messageList = document.getElementById('messageList');
  const notifList = document.getElementById('notifList');
  const clearNotifsBtn = document.getElementById('clearNotifsBtn');

  if (!authWrapper || !dashboard) return; // planning dashboard not on this page

  // ----- Auth tab switching -----
  authTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      authTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const isLogin = tab.dataset.authtab === 'login';
      loginForm.classList.toggle('hidden', !isLogin);
      signupForm.classList.toggle('hidden', isLogin);
      document.getElementById('coupleForgotPasswordToggleWrap').classList.toggle('hidden', !isLogin);
      document.getElementById('coupleForgotPasswordWrap').classList.add('hidden');
    });
  });

  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('loginUsername').value.trim();
    const p = document.getElementById('loginPassword').value;
    if (!window.fbAuth) {
      loginNote.style.color = '#c0392b';
      loginNote.textContent = 'Login service unavailable right now. Please try again in a moment.';
      return;
    }
    // Real email under the hood (not synthetic) so Forgot Password can use
    // Firebase's own sendPasswordResetEmail — resolve "username" to that
    // real email via the publicly-readable authLookup/contact doc first.
    let realEmail;
    try {
      const lookup = await window.fbDb.collection('couples').doc(u).collection('authLookup').doc('contact').get();
      if (!lookup.exists) { loginNote.style.color = '#c0392b'; loginNote.textContent = 'Incorrect username or password.'; return; }
      realEmail = lookup.data().email;
    } catch (err) {
      loginNote.style.color = '#c0392b';
      loginNote.textContent = 'Could not reach the login service. Please check your connection and try again.';
      return;
    }
    let userCredential;
    try {
      userCredential = await window.fbAuth.signInWithEmailAndPassword(realEmail, p);
    } catch (err) {
      loginNote.style.color = '#c0392b';
      loginNote.textContent = err.code === 'auth/too-many-requests'
        ? 'Too many failed attempts. Please try again later.'
        : 'Incorrect username or password.';
      return;
    }
    let profile;
    try {
      const doc = await window.fbDb.collection('couples').doc(u).get();
      profile = doc.exists ? doc.data() : null;
    } catch (err) {
      loginNote.style.color = '#c0392b';
      loginNote.textContent = 'Could not load your account. Please check your connection and try again.';
      return;
    }
    if (!profile || profile.uid !== userCredential.user.uid) {
      loginNote.style.color = '#c0392b';
      loginNote.textContent = 'No account found. Please contact support.';
      return;
    }
    loginNote.style.color = '';
    loginUser(u, true, profile);
  });

  // Couple accounts are real Firebase Auth users, identified by their real
  // email (not synthetic) so Forgot Password can use Firebase's own
  // sendPasswordResetEmail. "Username" stays the field the couple sees and
  // types; couples/{username}/authLookup/contact (publicly readable, email+
  // phone only) resolves it to the real email before sign-in.
  signupForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const u = document.getElementById('signupUsername').value.trim();
    const p = document.getElementById('signupPassword').value;
    const bride = document.getElementById('signupBride').value.trim();
    const groom = document.getElementById('signupGroom').value.trim();
    const email = document.getElementById('signupEmail').value.trim();
    const phone = document.getElementById('signupPhone').value.trim();
    const weddingDate = document.getElementById('signupWeddingDate').value;
    if (!window.fbAuth) {
      signupNote.style.color = '#c0392b';
      signupNote.textContent = 'Signup service unavailable right now. Please try again in a moment.';
      return;
    }
    let userCredential;
    try {
      userCredential = await window.fbAuth.createUserWithEmailAndPassword(email, p);
    } catch (err) {
      signupNote.style.color = '#c0392b';
      signupNote.textContent = err.code === 'auth/email-already-in-use'
        ? 'That username or email is already registered.'
        : (err.message || 'Could not create your account.');
      return;
    }
    // The main couples/{username} doc must exist before authLookup/contact
    // can be created — its create rule calls isCoupleOwner(), which does a
    // get() on this doc; get() on a not-yet-existing document errors out.
    try {
      await window.fbDb.collection('couples').doc(u).set({ username: u, uid: userCredential.user.uid, bride, groom, email, phone });
    } catch (err) {
      signupNote.style.color = '#c0392b';
      signupNote.textContent = 'Your account was created, but your profile could not be saved. Please contact support.';
      return;
    }
    try {
      await window.fbDb.collection('couples').doc(u).collection('authLookup').doc('contact').set({ email, phone });
    } catch (err) {
      signupNote.style.color = '#c0392b';
      signupNote.textContent = 'Your account was created, but setup could not finish. Please contact support.';
      return;
    }
    saveData(u, defaultData(weddingDate));
    signupNote.style.color = '';
    loginUser(u, true, { bride, groom, email, phone });
  });

  // ===== Forgot Password (Wedding Planning login) =====
  // Real Firebase password-reset email — accounts are keyed by real email
  // under the hood now — gated behind the same email/WhatsApp verification
  // against the publicly-readable couples/{username}/authLookup/contact
  // doc. No "enter the code" step: the emailed link goes straight to
  // Firebase's own password-reset page.
  document.getElementById('coupleForgotPasswordLink').addEventListener('click', (e) => {
    e.preventDefault();
    document.getElementById('coupleForgotPasswordWrap').classList.toggle('hidden');
  });

  function coupleContactMatches(contactOnFile, contact) {
    const normalized = contact.trim().toLowerCase();
    if (!normalized) return false;
    const emailMatch = contactOnFile.email && contactOnFile.email.toLowerCase() === normalized;
    const digits = normalized.replace(/\D/g, '');
    const phoneMatch = digits.length >= 7 && contactOnFile.phone && contactOnFile.phone.replace(/\D/g, '').endsWith(digits);
    return !!(emailMatch || phoneMatch);
  }

  document.getElementById('coupleSendCodeBtn').addEventListener('click', async () => {
    const username = document.getElementById('coupleForgotUsername').value.trim();
    const contact = document.getElementById('coupleForgotContact').value.trim();
    const note = document.getElementById('coupleForgotNote1');
    note.style.color = '#c0392b';
    if (!window.fbDb || !window.fbAuth) { note.textContent = 'Service unavailable right now. Please try again in a moment.'; return; }
    let contactOnFile;
    try {
      const doc = await window.fbDb.collection('couples').doc(username).collection('authLookup').doc('contact').get();
      if (!doc.exists) { note.textContent = 'No account found with that username.'; return; }
      contactOnFile = doc.data();
    } catch (err) {
      note.textContent = 'Could not reach the login service. Please try again.';
      return;
    }
    if (!coupleContactMatches(contactOnFile, contact)) { note.textContent = "That email/WhatsApp doesn't match our records for this account."; return; }
    try {
      await window.fbAuth.sendPasswordResetEmail(contactOnFile.email);
    } catch (err) {
      note.textContent = err.message || 'Could not send the reset email. Please try again.';
      return;
    }
    note.style.color = 'var(--primary)';
    note.textContent = `📩 A password reset link has been sent to ${contactOnFile.email}. Check your inbox (and spam folder) and follow the link to set a new password.`;
    setTimeout(() => {
      document.getElementById('coupleForgotPasswordWrap').classList.add('hidden');
      ['coupleForgotUsername', 'coupleForgotContact'].forEach(id => document.getElementById(id).value = '');
      note.textContent = '';
    }, 6000);
  });

  logoutBtn.addEventListener('click', () => {
    localStorage.removeItem(SESSION_KEY);
    currentUser = null;
    if (countdownTimer) clearInterval(countdownTimer);
    dashboard.classList.add('hidden');
    authWrapper.classList.remove('hidden');
    loginForm.reset();
    signupForm.reset();
  });

  function loginUser(username, celebrate, profile) {
    currentUser = username;
    currentCoupleProfile = profile || {};
    localStorage.setItem(SESSION_KEY, username);
    authWrapper.classList.add('hidden');
    dashboard.classList.remove('hidden');
    profile = profile || {};
    dashboardUser.textContent = (profile.bride && profile.groom) ? `${profile.bride} & ${profile.groom}` : username;
    renderAll(getData(username));
    // Only a real login/signup action triggers the celebration — resuming an
    // already-logged-in session on page reload should not replay it.
    if (celebrate) celebrateLogin();
  }

  // Falling flowers + confetti to welcome the couple into their dashboard.
  function celebrateLogin() {
    const overlay = document.createElement('div');
    overlay.className = 'celebration-overlay';
    document.body.appendChild(overlay);

    const flowers = ['🌸', '🌺', '🌷', '🌹', '💐'];
    const confettiColors = ['#0F6A5B', '#C9A227', '#E8B4B8', '#FFFFFF', '#8E44AD'];
    const pieceCount = 60;

    for (let i = 0; i < pieceCount; i++) {
      const piece = document.createElement('div');
      const isFlower = i % 3 !== 0;
      piece.className = isFlower ? 'celebration-piece' : 'celebration-piece confetti';
      if (isFlower) {
        piece.textContent = flowers[Math.floor(Math.random() * flowers.length)];
        piece.style.setProperty('--piece-size', `${1.1 + Math.random() * 1}rem`);
      } else {
        piece.style.setProperty('--piece-color', confettiColors[Math.floor(Math.random() * confettiColors.length)]);
      }
      piece.style.setProperty('--start-left', `${Math.random() * 100}vw`);
      piece.style.setProperty('--drift', `${(Math.random() - 0.5) * 200}px`);
      piece.style.setProperty('--fall-duration', `${3.5 + Math.random() * 2.5}s`);
      piece.style.setProperty('--fall-delay', `${Math.random() * 1.2}s`);
      overlay.appendChild(piece);
    }

    setTimeout(() => overlay.remove(), 7000);
  }

  // ----- Panel switching -----
  document.querySelectorAll('.dash-link, .icon-btn[data-panel]').forEach(btn => {
    btn.addEventListener('click', () => switchPanel(btn.dataset.panel));
  });
  function switchPanel(name) {
    document.querySelectorAll('.dash-link').forEach(b => b.classList.toggle('active', b.dataset.panel === name));
    document.querySelectorAll('.dash-panel').forEach(p => p.classList.toggle('active', p.id === 'panel-' + name));
  }

  // ----- Checklist -----
  function renderChecklist(data) {
    checklistList.innerHTML = data.checklist.map((item, i) => `
      <li class="${item.done ? 'done' : ''}" data-i="${i}">
        <input type="checkbox" ${item.done ? 'checked' : ''} class="check-toggle">
        <span>${escapeHtml(item.text)}${item.phone ? ` <span style="color:#999;font-size:0.85em;">— 📞 ${escapeHtml(item.phone)}</span>` : ''}</span>
        <button type="button" class="check-remove">✕</button>
      </li>`).join('');

    checklistList.querySelectorAll('.check-toggle').forEach(cb => {
      cb.addEventListener('change', () => {
        const i = Number(cb.closest('li').dataset.i);
        const data = getData(currentUser);
        data.checklist[i].done = cb.checked;
        saveData(currentUser, data);
        renderChecklist(data);
      });
    });
    checklistList.querySelectorAll('.check-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.closest('li').dataset.i);
        const data = getData(currentUser);
        data.checklist.splice(i, 1);
        saveData(currentUser, data);
        renderChecklist(data);
      });
    });
  }
  checklistForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const text = checklistInput.value.trim();
    if (!text) return;
    const data = getData(currentUser);
    data.checklist.push({ text, done: false, phone: checklistPhone.value.trim() });
    saveData(currentUser, data);
    checklistInput.value = '';
    checklistPhone.value = '';
    renderChecklist(data);
  });

  // ----- Budget -----
  function renderBudget(data) {
    const total = Number(data.budgetTotal) || 0;
    if (!total) {
      budgetBreakdown.innerHTML = '<p style="color:#999;">Enter a total budget to see your estimated breakdown.</p>';
      return;
    }
    budgetBreakdown.innerHTML = budgetCategories.map(c => `
      <div class="budget-item">
        <div class="label">${window.FBI18N.t(c.key)} (${Math.round(c.pct * 100)}%)</div>
        <div class="amount">$${Math.round(total * c.pct).toLocaleString()}</div>
      </div>`).join('');
  }
  budgetTotalInput.addEventListener('input', () => {
    const data = getData(currentUser);
    data.budgetTotal = budgetTotalInput.value;
    saveData(currentUser, data);
    renderBudget(data);
  });

  // ----- Guests -----
  function renderGuests(data) {
    guestTableBody.innerHTML = data.guests.map((g, i) => `
      <tr data-i="${i}">
        <td>${escapeHtml(g.name)}</td>
        <td>${escapeHtml(g.phone || '—')}</td>
        <td>
          <select class="guest-status-select">
            <option ${g.status === 'Pending' ? 'selected' : ''}>Pending</option>
            <option ${g.status === 'Confirmed' ? 'selected' : ''}>Confirmed</option>
            <option ${g.status === 'Declined' ? 'selected' : ''}>Declined</option>
          </select>
        </td>
        <td><button type="button" class="guest-remove">✕</button></td>
      </tr>`).join('');

    const total = data.guests.length;
    const confirmed = data.guests.filter(g => g.status === 'Confirmed').length;
    const pending = data.guests.filter(g => g.status === 'Pending').length;
    const declined = data.guests.filter(g => g.status === 'Declined').length;
    guestSummary.textContent = window.FBI18N.t('dynamic.guest_summary', { total, confirmed, pending, declined });

    guestTableBody.querySelectorAll('.guest-status-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const i = Number(sel.closest('tr').dataset.i);
        const data = getData(currentUser);
        data.guests[i].status = sel.value;
        saveData(currentUser, data);
        renderGuests(data);
      });
    });
    guestTableBody.querySelectorAll('.guest-remove').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = Number(btn.closest('tr').dataset.i);
        const data = getData(currentUser);
        const removedName = data.guests[i].name;
        data.guests.splice(i, 1);
        delete data.seating[removedName];
        saveData(currentUser, data);
        renderGuests(data);
        renderSeating(data);
      });
    });
  }
  guestForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const name = guestName.value.trim();
    if (!name) return;
    const data = getData(currentUser);
    data.guests.push({ name, phone: guestPhone.value.trim(), status: guestStatus.value });
    saveData(currentUser, data);
    guestName.value = '';
    guestPhone.value = '';
    renderGuests(data);
    renderSeating(data);
  });

  // ----- Seating Chart Builder -----
  let selectedSeatGuest = null;

  // Older saved plans stored `seating[name]` as a plain table number; treat
  // that as seat 0 of that table so old data still displays sensibly.
  function normalizeSeatPos(pos) {
    if (pos == null) return null;
    if (typeof pos === 'object') return pos;
    return { table: Number(pos), seat: 0 };
  }
  function initials(name) {
    return name.split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0].toUpperCase()).join('');
  }

  const TABLE_SHAPES = {
    round: { w: 170, h: 170, label: 'Round' },
    square: { w: 140, h: 140, label: 'Square' },
    rectangle: { w: 220, h: 130, label: 'Rectangle' },
    long: { w: 290, h: 80, label: 'Long' },
  };

  // Returns {x, y} for a seat, relative to the table's top-left corner.
  // Round tables place seats on a circle; square/rectangle place seats
  // walking the full perimeter; long tables seat only the two long sides
  // (like a banquet head table, with no seats at the short ends).
  function seatPosition(shape, index, total, w, h) {
    if (shape === 'round') {
      const angle = (360 / total) * index;
      const rad = (angle * Math.PI) / 180;
      const radius = w / 2 + 20;
      return { x: w / 2 + radius * Math.sin(rad), y: h / 2 - radius * Math.cos(rad) };
    }
    if (shape === 'long') {
      const topCount = Math.ceil(total / 2);
      const bottomCount = total - topCount;
      const onTop = index < topCount;
      const i = onTop ? index : index - topCount;
      const count = onTop ? topCount : bottomCount;
      const x = count > 1 ? (w / (count - 1)) * i : w / 2;
      return { x, y: onTop ? -18 : h + 18 };
    }
    // square / rectangle: evenly spaced around the full perimeter
    const perimeter = 2 * (w + h);
    const d = (perimeter / total) * index;
    if (d < w) return { x: d, y: -18 };
    if (d < w + h) return { x: w + 18, y: d - w };
    if (d < 2 * w + h) return { x: w - (d - w - h), y: h + 18 };
    return { x: -18, y: h - (d - 2 * w - h) };
  }

  function renderSeating(data) {
    const tableCount = Number(data.tableCount) || 5;
    const seatsPerTable = Number(data.seatsPerTable) || 8;
    data.tableShapes = data.tableShapes || {};
    tableCountInput.value = tableCount;
    seatsPerTableInput.value = seatsPerTable;
    selectedSeatGuest = null;

    const seatEntries = Object.entries(data.seating || {}).map(([name, pos]) => [name, normalizeSeatPos(pos)]);
    const seatedNames = new Set(seatEntries.map(([name]) => name));
    const unassigned = data.guests.filter(g => !seatedNames.has(g.name));

    let html = `<div class="seat-pool"><h4>Unassigned Guests (${unassigned.length})</h4><div class="seat-pool-chips">`;
    html += unassigned.length
      ? unassigned.map(g => `<span class="seat-chip" data-guest="${escapeHtml(g.name)}">${escapeHtml(g.name)}</span>`).join('')
      : `<span style="color:#999;font-size:0.85rem;">${data.guests.length ? 'Everyone is seated! 🎉' : 'Add guests first, then seat them here.'}</span>`;
    html += `</div></div>`;

    html += `<div class="seat-tables-grid">`;
    for (let table = 1; table <= tableCount; table++) {
      const shape = TABLE_SHAPES[data.tableShapes[table]] ? data.tableShapes[table] : 'round';
      const { w, h } = TABLE_SHAPES[shape];
      html += `<div class="seat-table-wrap">
        <select class="table-shape-select" data-table="${table}">
          ${Object.entries(TABLE_SHAPES).map(([key, s]) => `<option value="${key}" ${key === shape ? 'selected' : ''}>${s.label}</option>`).join('')}
        </select>
        <div class="seat-table ${shape}" style="width:${w}px;height:${h}px;">
          <div class="seat-table-label">Table ${table}</div>`;
      for (let seat = 0; seat < seatsPerTable; seat++) {
        const { x, y } = seatPosition(shape, seat, seatsPerTable, w, h);
        const style = `left:${Math.round(x)}px; top:${Math.round(y)}px;`;
        const found = seatEntries.find(([, pos]) => pos.table === table && pos.seat === seat);
        if (found) {
          html += `<div class="seat-slot filled" style="${style}" data-table="${table}" data-seat="${seat}" data-guest="${escapeHtml(found[0])}" title="${escapeHtml(found[0])} — click to unseat">${escapeHtml(initials(found[0]))}</div>`;
        } else {
          html += `<div class="seat-slot empty" style="${style}" data-table="${table}" data-seat="${seat}" title="Empty seat">+</div>`;
        }
      }
      html += `</div></div>`;
    }
    html += `</div>`;

    seatingBoard.innerHTML = html;

    seatingBoard.querySelectorAll('.seat-chip').forEach(chip => {
      chip.addEventListener('click', () => {
        seatingBoard.querySelectorAll('.seat-chip').forEach(c => c.classList.remove('selected'));
        chip.classList.add('selected');
        selectedSeatGuest = chip.dataset.guest;
      });
    });

    seatingBoard.querySelectorAll('.seat-slot').forEach(slot => {
      slot.addEventListener('click', () => {
        const data = getData(currentUser);
        if (slot.classList.contains('filled')) {
          delete data.seating[slot.dataset.guest];
          saveData(currentUser, data);
          renderSeating(data);
        } else {
          if (!selectedSeatGuest) { alert('Select a guest from the list above first, then click an empty seat.'); return; }
          data.seating[selectedSeatGuest] = { table: Number(slot.dataset.table), seat: Number(slot.dataset.seat) };
          saveData(currentUser, data);
          renderSeating(data);
        }
      });
    });

    seatingBoard.querySelectorAll('.table-shape-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const data = getData(currentUser);
        data.tableShapes = data.tableShapes || {};
        data.tableShapes[sel.dataset.table] = sel.value;
        saveData(currentUser, data);
        renderSeating(data);
      });
    });
  }

  tableCountInput.addEventListener('input', () => {
    const data = getData(currentUser);
    data.tableCount = Number(tableCountInput.value) || 1;
    saveData(currentUser, data);
    renderSeating(data);
  });
  seatsPerTableInput.addEventListener('input', () => {
    const data = getData(currentUser);
    data.seatsPerTable = Number(seatsPerTableInput.value) || 8;
    saveData(currentUser, data);
    renderSeating(data);
  });

  // ----- Countdown -----
  function startCountdown(dateStr) {
    if (countdownTimer) clearInterval(countdownTimer);
    if (!dateStr) {
      cdDays.textContent = cdHours.textContent = cdMinutes.textContent = cdSeconds.textContent = '0';
      return;
    }
    function tick() {
      const diff = new Date(dateStr).getTime() - Date.now();
      if (diff <= 0) {
        cdDays.textContent = cdHours.textContent = cdMinutes.textContent = cdSeconds.textContent = '0';
        clearInterval(countdownTimer);
        return;
      }
      cdDays.textContent = Math.floor(diff / 86400000);
      cdHours.textContent = Math.floor(diff / 3600000) % 24;
      cdMinutes.textContent = Math.floor(diff / 60000) % 60;
      cdSeconds.textContent = Math.floor(diff / 1000) % 60;
    }
    tick();
    countdownTimer = setInterval(tick, 1000);
  }
  weddingDateInput.addEventListener('change', () => {
    const data = getData(currentUser);
    data.weddingDate = weddingDateInput.value;
    saveData(currentUser, data);
    startCountdown(data.weddingDate);
  });

  // ----- Gallery / Favorites -----
  function renderGallery(data) {
    const onlyFav = favOnlyToggle.checked;
    const items = onlyFav ? galleryItems.filter(g => data.favorites.includes(g.id)) : galleryItems;
    galleryGrid.innerHTML = items.map(g => `
      <div class="gallery-item" data-id="${g.id}">
        <img src="${g.src}" alt="${escapeHtml(g.caption)}" loading="lazy">
        <button type="button" class="fav-btn ${data.favorites.includes(g.id) ? 'active' : ''}">${data.favorites.includes(g.id) ? '♥' : '♡'}</button>
      </div>`).join('') || '<p style="color:#999;">No favorites yet — tap the heart on a photo to save it here.</p>';

    galleryGrid.querySelectorAll('.fav-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.gallery-item').dataset.id;
        const data = getData(currentUser);
        const idx = data.favorites.indexOf(id);
        if (idx > -1) data.favorites.splice(idx, 1);
        else data.favorites.push(id);
        saveData(currentUser, data);
        renderGallery(data);
      });
    });
  }
  favOnlyToggle.addEventListener('change', () => renderGallery(getData(currentUser)));

  // ----- Blog (vendor-submitted articles, aggregated across every vendor) -----
  function renderVendorBlog() {
    const grid = document.getElementById('vendorBlogGrid');
    if (!grid) return;
    const vendors = JSON.parse(localStorage.getItem('fb_vendor_applications') || '[]').filter(v => v.status === 'Approved');
    const articles = [];
    vendors.forEach(v => {
      const vendorArticles = JSON.parse(localStorage.getItem(`fb_venue_blogArticles_${v.username}`) || '[]');
      vendorArticles.forEach(a => articles.push({ ...a, businessName: v.businessName }));
    });
    articles.sort((a, b) => (b.time || 0) - (a.time || 0));
    grid.innerHTML = articles.map(a => `
      <article class="blog-card">
        ${a.image ? `<img loading="lazy" decoding="async" src="${a.image}" alt="${escapeHtml(a.title)}" style="width:100%;border-radius:8px;margin-bottom:0.6rem;">` : ''}
        <h4>${escapeHtml(a.title)}</h4>
        <p>${escapeHtml(a.content)}</p>
        <p style="margin-top:0.5rem;color:#999;font-size:0.8rem;">By ${escapeHtml(a.businessName || 'Vendor')}</p>
      </article>
    `).join('');
  }

  // ----- Notes -----
  let notesTimer = null;
  notesArea.addEventListener('input', () => {
    clearTimeout(notesTimer);
    notesTimer = setTimeout(() => {
      const data = getData(currentUser);
      data.notes = notesArea.value;
      saveData(currentUser, data);
      notesSaved.textContent = 'Saved';
      setTimeout(() => notesSaved.textContent = '', 1500);
    }, 500);
  });

  // ----- Bookings -----
  function renderBookings(data) {
    bookingTableBody.innerHTML = data.bookings.map(b => `
      <tr><td>${escapeHtml(b.vendor)}</td><td>${escapeHtml(b.date)}</td><td>${escapeHtml(b.status)}</td></tr>`
    ).join('') || '<tr><td colspan="3" style="color:#999;">No bookings yet.</td></tr>';
  }
  bookingForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const vendor = bookingVendor.value.trim();
    const date = bookingDate.value;
    if (!vendor || !date) return;
    const data = getData(currentUser);
    data.bookings.push({ vendor, date, status: 'Requested' });
    saveData(currentUser, data);
    bookingVendor.value = '';
    bookingDate.value = '';
    renderBookings(data);
  });

  // ----- Appointments -----
  function renderAppointments(data) {
    apptTableBody.innerHTML = data.appointments.map(a => `
      <tr><td>${escapeHtml(a.with)}</td><td>${escapeHtml(new Date(a.time).toLocaleString())}</td></tr>`
    ).join('') || '<tr><td colspan="2" style="color:#999;">No appointments yet.</td></tr>';
  }
  appointmentForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const wth = apptWith.value.trim();
    const time = apptTime.value;
    if (!wth || !time) return;
    const data = getData(currentUser);
    data.appointments.push({ with: wth, time });
    saveData(currentUser, data);
    apptWith.value = '';
    apptTime.value = '';
    renderAppointments(data);
  });

  // ----- Messages -----
  function renderMessages(data) {
    messageList.innerHTML = data.messages.map(m => `
      <li class="${m.unread ? 'unread' : ''}" data-id="${m.id}">
        ${escapeHtml(m.from)} — ${escapeHtml(m.preview)}
        <span class="msg-meta">${escapeHtml(m.time)}</span>
      </li>`).join('');
    messageList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const id = Number(li.dataset.id);
        const data = getData(currentUser);
        const msg = data.messages.find(m => m.id === id);
        if (msg) msg.unread = false;
        saveData(currentUser, data);
        renderMessages(data);
        updateBadges(data);
      });
    });
  }

  // ----- Notifications -----
  function renderNotifications(data) {
    notifList.innerHTML = data.notifications.map(n => `
      <li class="${n.unread ? 'unread' : ''}" data-id="${n.id}">
        ${escapeHtml(n.text)}
        <span class="notif-time">${escapeHtml(n.time)}</span>
      </li>`).join('');
    notifList.querySelectorAll('li').forEach(li => {
      li.addEventListener('click', () => {
        const id = Number(li.dataset.id);
        const data = getData(currentUser);
        const n = data.notifications.find(x => x.id === id);
        if (n) n.unread = false;
        saveData(currentUser, data);
        renderNotifications(data);
        updateBadges(data);
      });
    });
  }
  clearNotifsBtn.addEventListener('click', () => {
    const data = getData(currentUser);
    data.notifications.forEach(n => n.unread = false);
    saveData(currentUser, data);
    renderNotifications(data);
    updateBadges(data);
  });

  function updateBadges(data) {
    notifBadge.textContent = data.notifications.filter(n => n.unread).length;
    msgBadge.textContent = data.messages.filter(m => m.unread).length;
  }

  // ----- Render everything on login -----
  function renderAll(data) {
    // Each piece renders independently so one failure (e.g. from an older
    // data shape in localStorage) can't stop the rest of this script file
    // from running, which would otherwise leave later features (like the
    // Success Stories upload form) with no click listeners attached.
    const steps = [
      () => renderChecklist(data),
      () => { budgetTotalInput.value = data.budgetTotal || ''; renderBudget(data); },
      () => renderGuests(data),
      () => { tableCountInput.value = data.tableCount || 5; renderSeating(data); },
      () => { weddingDateInput.value = data.weddingDate || ''; startCountdown(data.weddingDate); },
      () => { favOnlyToggle.checked = false; renderGallery(data); },
      () => renderVendorBlog(),
      () => { notesArea.value = data.notes || ''; },
      () => renderBookings(data),
      () => renderAppointments(data),
      () => renderMessages(data),
      () => renderNotifications(data),
      () => updateBadges(data),
    ];
    steps.forEach(step => {
      try { step(); } catch (err) { console.error('Wedding Planning dashboard: a section failed to render:', err); }
    });
    switchPanel('checklist');
  }

  // ----- Print Report -----
  // Uses a Blob URL rather than window.open('')+document.write() — the
  // latter is blocked on file:// pages since Chromium treats every local
  // file as its own security origin.
  function openPrintableHtml(html) {
    const blob = new Blob([html], { type: 'text/html' });
    const url = URL.createObjectURL(blob);
    const w = window.open(url, '_blank');
    if (!w) { alert('Please allow pop-ups for this page to print.'); URL.revokeObjectURL(url); return; }
    w.addEventListener('load', () => { w.focus(); w.print(); URL.revokeObjectURL(url); });
  }

  // Builds a static visual rendering of the seating chart (same table
  // shapes/seat positions as the live builder) for the printable report.
  function buildSeatingReportHtml(data) {
    const tableCount = Number(data.tableCount) || 0;
    const seatsPerTable = Number(data.seatsPerTable) || 8;
    const shapes = data.tableShapes || {};
    const seatEntries = Object.entries(data.seating || {}).map(([name, pos]) => [name, normalizeSeatPos(pos)]);
    if (!tableCount) return '<p>No tables set up yet.</p>';

    let html = '<div style="display:flex;flex-wrap:wrap;gap:2.2rem;margin-top:0.8rem;-webkit-print-color-adjust:exact;print-color-adjust:exact;">';
    for (let table = 1; table <= tableCount; table++) {
      const shapeKey = TABLE_SHAPES[shapes[table]] ? shapes[table] : 'round';
      const { w, h } = TABLE_SHAPES[shapeKey];
      const radius = shapeKey === 'round' ? '50%' : '10px';
      html += `<div style="text-align:center;">
        <div style="position:relative;width:${w}px;height:${h}px;margin:22px auto 0;background:#FAF8F2;border:2px dashed #ccc;border-radius:${radius};display:flex;align-items:center;justify-content:center;font-weight:bold;color:#0F6A5B;font-size:0.85rem;">
          Table ${table}`;
      for (let seat = 0; seat < seatsPerTable; seat++) {
        const { x, y } = seatPosition(shapeKey, seat, seatsPerTable, w, h);
        const found = seatEntries.find(([, pos]) => pos.table === table && pos.seat === seat);
        const bg = found ? '#0F6A5B' : '#fff';
        const color = found ? '#fff' : '#bbb';
        const border = found ? '2px solid #0b4f44' : '2px dashed #ccc';
        html += `<div style="position:absolute;left:${Math.round(x)}px;top:${Math.round(y)}px;transform:translate(-50%,-50%);width:26px;height:26px;border-radius:50%;background:${bg};color:${color};border:${border};display:flex;align-items:center;justify-content:center;font-size:0.55rem;font-weight:bold;">${found ? escapeHtml(initials(found[0])) : ''}</div>`;
      }
      html += `</div></div>`;
    }
    html += '</div>';
    return html;
  }

  document.getElementById('printWeddingReportBtn').addEventListener('click', () => {
    const data = getData(currentUser);
    const profile = currentCoupleProfile || {};
    const doneCount = data.checklist.filter(t => t.done).length;
    const confirmed = data.guests.filter(g => g.status === 'Confirmed').length;
    const pending = data.guests.filter(g => g.status === 'Pending').length;
    const declined = data.guests.filter(g => g.status === 'Declined').length;
    const seatedCount = Object.keys(data.seating || {}).length;
    let daysLeft = null;
    if (data.weddingDate) {
      const diff = new Date(data.weddingDate).getTime() - Date.now();
      daysLeft = diff > 0 ? Math.ceil(diff / 86400000) : 0;
    }

    const html = `<html><head><title>Wedding Plan — ${escapeHtml(profile.bride || '')} &amp; ${escapeHtml(profile.groom || '')}</title></head>
      <body style="font-family:Georgia, serif; padding:2rem; color:#2E2E2E; max-width:760px; margin:0 auto;">
        <h1 style="color:#0F6A5B;">${escapeHtml(profile.bride || '')} &amp; ${escapeHtml(profile.groom || '')}</h1>
        <p><strong>Wedding Date:</strong> ${escapeHtml(data.weddingDate || 'Not set yet')}${daysLeft !== null ? ` (${daysLeft} day${daysLeft === 1 ? '' : 's'} to go)` : ''}</p>

        <h2 style="color:#0F6A5B;border-bottom:2px solid #0F6A5B;padding-bottom:0.3rem;">Checklist</h2>
        <p>${doneCount} of ${data.checklist.length} tasks completed</p>
        <ul style="list-style:none;padding:0;">
          ${data.checklist.map(t => `<li style="margin-bottom:0.5rem;">${t.done ? '☑' : '☐'} ${escapeHtml(t.text)}${t.phone ? ` &nbsp;📞 ${escapeHtml(t.phone)}` : ''}</li>`).join('') || '<li>No tasks yet.</li>'}
        </ul>

        <h2 style="color:#0F6A5B;border-bottom:2px solid #0F6A5B;padding-bottom:0.3rem;">Budget</h2>
        <p>Total Budget: ${data.budgetTotal ? `$${escapeHtml(data.budgetTotal)}` : 'Not set yet'}</p>

        <h2 style="color:#0F6A5B;border-bottom:2px solid #0F6A5B;padding-bottom:0.3rem;">Guests</h2>
        <p>Total Guests: ${data.guests.length} — ${confirmed} confirmed, ${pending} pending, ${declined} declined</p>
        <table style="width:100%;border-collapse:collapse;margin-top:0.5rem;">
          <thead><tr style="text-align:left;border-bottom:2px solid #0F6A5B;"><th style="padding:4px;">Full Name</th><th style="padding:4px;">Phone Number</th><th style="padding:4px;">Status</th></tr></thead>
          <tbody>
            ${data.guests.map(g => `<tr style="border-bottom:1px solid #eee;"><td style="padding:4px;">${escapeHtml(g.name)}</td><td style="padding:4px;">${escapeHtml(g.phone || '—')}</td><td style="padding:4px;">${escapeHtml(g.status)}</td></tr>`).join('') || '<tr><td colspan="3" style="padding:4px;">No guests yet.</td></tr>'}
          </tbody>
        </table>

        <h2 style="color:#0F6A5B;border-bottom:2px solid #0F6A5B;padding-bottom:0.3rem;">Seating Chart</h2>
        <p>${seatedCount} of ${data.guests.length} guests seated across ${data.tableCount || 0} tables (${data.seatsPerTable || 8} seats each)</p>
        ${buildSeatingReportHtml(data)}

        <h2 style="color:#0F6A5B;border-bottom:2px solid #0F6A5B;padding-bottom:0.3rem;">Notes</h2>
        <p>${data.notes ? escapeHtml(data.notes).replace(/\n/g, '<br>') : 'No notes yet.'}</p>
      </body></html>`;
    openPrintableHtml(html);
  });

  // ----- Resume session -----
  // Waits for Firebase Auth's own (async) session restoration before
  // resuming — same race condition fixed for vendor/admin: reading Firestore
  // before Auth has restored its session gets rejected as unauthenticated.
  let __coupleSessionResumeAttempted = false;
  if (window.fbAuth) window.fbAuth.onAuthStateChanged((user) => {
    if (__coupleSessionResumeAttempted) return;
    __coupleSessionResumeAttempted = true;
    try {
      const savedUser = localStorage.getItem(SESSION_KEY);
      if (!savedUser || !user) return;
      window.fbDb.collection('couples').doc(savedUser).get().then(doc => {
        if (doc.exists) loginUser(savedUser, false, doc.data());
      }).catch(err => console.error('Wedding Planning dashboard: failed to resume session:', err));
    } catch (err) {
      console.error('Wedding Planning dashboard: failed to resume session:', err);
    }
  });
})();

// ===================================================================
// ===== Success Stories — couple photo uploads (demo — saved only
// ===== in this browser's localStorage, not shared with other visitors)
// ===================================================================
(function () {
  const STORIES_KEY = 'fb_success_stories';
  const form = document.getElementById('storyUploadForm');
  const namesInput = document.getElementById('storyNames');
  const photosInput = document.getElementById('storyPhotos');
  const quoteInput = document.getElementById('storyQuote');
  const note = document.getElementById('storyUploadNote');
  const grid = document.getElementById('userStoriesGrid');
  if (!form || !grid) return;

  function escapeHtml(str) {
    return String(str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
  }

  function getStories() {
    return JSON.parse(localStorage.getItem(STORIES_KEY) || '[]');
  }
  function saveStories(stories) {
    localStorage.setItem(STORIES_KEY, JSON.stringify(stories));
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
        canvas.width = width;
        canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        resolve(canvas.toDataURL('image/jpeg', quality));
      };
      img.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function renderStories() {
    const stories = getStories();
    grid.innerHTML = stories.map(s => `
      <div class="story-card" data-id="${s.id}">
        <div class="story-photos ${s.images.length === 1 ? 'single' : ''}">
          ${s.images.map(src => `<img loading="lazy" decoding="async" src="${src}" alt="${escapeHtml(s.names)}">`).join('')}
        </div>
        <div class="story-body">
          <p class="story-quote">"${escapeHtml(s.quote)}"</p>
          <p class="story-author">— ${escapeHtml(s.names)}</p>
        </div>
        <button type="button" class="story-remove-btn">Remove</button>
      </div>`).join('');

    grid.querySelectorAll('.story-remove-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = btn.closest('.story-card').dataset.id;
        saveStories(getStories().filter(s => String(s.id) !== id));
        renderStories();
      });
    });
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const files = Array.from(photosInput.files);
    if (files.length < 1 || files.length > 2) {
      note.style.color = '#c0392b';
      note.textContent = window.FBI18N.t('dynamic.story_choose_photos');
      return;
    }
    note.style.color = '';
    note.textContent = window.FBI18N.t('dynamic.story_uploading');

    try {
      const images = await Promise.all(files.map(f => resizeImage(f)));
      const stories = getStories();
      stories.unshift({
        id: Date.now(),
        names: namesInput.value.trim(),
        quote: quoteInput.value.trim(),
        images,
      });
      saveStories(stories);
      renderStories();
      form.reset();
      note.style.color = '';
      note.textContent = window.FBI18N.t('dynamic.story_thanks');
      setTimeout(() => note.textContent = '', 3000);
    } catch (err) {
      note.style.color = '#c0392b';
      note.textContent = window.FBI18N.t('dynamic.story_error');
    }
  });

  renderStories();
})();
