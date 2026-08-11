// ===================================================================
// Forever Begins — Customer-facing venue listing & profile (demo)
// Reads the same fb_vendor_applications / fb_venue_* localStorage data
// the Vendor Dashboard writes to. Same file:// storage-isolation caveat
// as the rest of the site applies — serve via a local web server for
// all pages to share data reliably.
// ===================================================================

// getLS/setLS are now provided by data-shim.js (loaded before this file),
// backed by Firestore instead of plain localStorage.
ensureApplicationsListener();
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, s => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[s]));
}
// Vendors type these link fields freely (website, socials, maps, tour link)
// and they render as <a href> on the public profile page — without this,
// a vendor entering "javascript:..." as their "website" would let that
// script run in a customer's browser the moment they clicked the link.
// Only http(s) links (adding https:// to bare domains) are allowed through;
// any other scheme (javascript:, data:, vbscript:, ...) is rejected.
function safeUrl(url) {
  if (!url) return '';
  const trimmed = String(url).trim();
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (trimmed.startsWith('//')) return `https:${trimmed}`;
  if (!/^[a-z][a-z0-9+.-]*:/i.test(trimmed)) return `https://${trimmed}`;
  return '';
}
// Firestore-backed (see data-shim.js): registers a live listener for this
// vendor+dataName pair the first time it's read, so every existing
// `getLS(vfKey(username, name), fallback)` call site stays unchanged.
function vfKey(username, name) {
  const key = `fb_venue_${name}_${username}`;
  ensureVendorDocListener(username, name, key);
  return key;
}

// Updates the page's SEO meta tags per view (category listing vs. a specific
// vendor profile) so search engines and social shares see distinct,
// relevant titles/descriptions instead of one static tag for every vendor.
function updateSEOTags({ title, description, url, image }) {
  const setEl = (id, fn) => { const el = document.getElementById(id); if (el) fn(el); };
  setEl('pageTitle', el => el.textContent = title);
  setEl('metaDescription', el => el.setAttribute('content', description));
  setEl('ogTitle', el => el.setAttribute('content', title));
  setEl('ogDescription', el => el.setAttribute('content', description));
  setEl('twitterTitle', el => el.setAttribute('content', title));
  setEl('twitterDescription', el => el.setAttribute('content', description));
  if (url) {
    setEl('canonicalLink', el => el.setAttribute('href', url));
    setEl('ogUrl', el => el.setAttribute('content', url));
  }
  if (image) setEl('ogImage', el => el.setAttribute('content', image));
}

// Injects (or replaces) a LocalBusiness JSON-LD block for the vendor profile
// currently being viewed — removed on category listing pages since there's
// no single business to describe there.
function updateVendorStructuredData(data) {
  let script = document.getElementById('vendorStructuredData');
  if (!data) {
    if (script) script.remove();
    return;
  }
  if (!script) {
    script = document.createElement('script');
    script.type = 'application/ld+json';
    script.id = 'vendorStructuredData';
    document.head.appendChild(script);
  }
  script.textContent = JSON.stringify(data);
}
// Used by the Invitation Cards design-upload field in Reserve by Booking —
// this file had no image-resize helper of its own before, so that upload
// would throw a ReferenceError the first time a couple attached a file.
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

// Cover media can be a photo or a video the vendor uploaded. Supports the
// older plain-string (image dataURL) shape too, from before video covers.
// `eager` skips lazy-loading for the large profile hero cover, which is
// typically the page's LCP element — deferring its fetch would slow down
// the very metric lazy-loading is meant to improve elsewhere on the page.
function coverMediaTag(cover, className, altText, eager) {
  if (!cover) return '';
  const loadingAttrs = eager ? 'fetchpriority="high"' : 'loading="lazy" decoding="async"';
  if (typeof cover === 'object' && cover.src) {
    return cover.type === 'video'
      ? `<video src="${cover.src}" class="${className}" muted loop autoplay playsinline></video>`
      : `<img ${loadingAttrs} src="${cover.src}" class="${className}" alt="${escapeHtml(altText || '')}">`;
  }
  return `<img ${loadingAttrs} src="${cover}" class="${className}" alt="${escapeHtml(altText || '')}">`;
}
function avgOf(list, field) {
  const vals = list.map(r => Number(r[field])).filter(n => !isNaN(n));
  return vals.length ? (vals.reduce((s, n) => s + n, 0) / vals.length).toFixed(1) : null;
}
// Supports the newer structured {name, price} add-on shape, the Catering
// {name, image} shape, and the older plain-string shape from before
// add-ons had prices.
function addonDisplay(a) {
  if (a && typeof a === 'object') {
    if ('image' in a) return `${a.image ? `<img loading="lazy" decoding="async" src="${a.image}" alt="" style="width:20px;height:20px;object-fit:cover;border-radius:4px;vertical-align:middle;margin-right:4px;">` : ''}${escapeHtml(a.name)}`;
    return `${escapeHtml(a.name)} (+$${escapeHtml(a.price || 0)})`;
  }
  return escapeHtml(a);
}
function pushVendorNotification(username, type, text) {
  appendToVendorList(username, 'notifications', { id: Date.now() + Math.random(), type, text, time: Date.now(), read: false });
}

// Tracks per-design engagement (Invitation Cards) — incremented whenever a
// couple opens a design's photo, feeding the vendor's "Most Viewed Designs"
// and "Most Requested Styles" analytics.
function bumpDesignView(username, designId) {
  const designs = getLS(vfKey(username, 'designs'), []);
  const design = designs.find(d => d.id === designId);
  if (!design) return;
  design.views = (design.views || 0) + 1;
  setLS(vfKey(username, 'designs'), designs);
}

// Tracks per-item engagement (Jewelry) — incremented whenever a couple
// opens a jewelry item's photo, feeding the vendor's "Most Viewed
// Products" and "Most Requested Collections" analytics.
function bumpJewelryView(username, itemId) {
  const items = getLS(vfKey(username, 'jewelryItems'), []);
  const item = items.find(j => j.id === itemId);
  if (!item) return;
  item.views = (item.views || 0) + 1;
  setLS(vfKey(username, 'jewelryItems'), items);
}

const params = new URLSearchParams(location.search);
const categoryParam = params.get('category') || 'Wedding Venues';
const vendorParam = params.get('v');

const listingView = document.getElementById('listingView');
const profileView = document.getElementById('profileView');
const notFoundState = document.getElementById('notFoundState');

let currentProfileVendor = null;
let profileCalendarDate = new Date();

// Deferred with setTimeout so this runs only after the whole script has
// finished its first pass — calling render functions synchronously from
// here (before later const/let declarations execute) throws a
// temporal-dead-zone ReferenceError.
setTimeout(() => {
  if (vendorParam) {
    renderProfile(vendorParam);
  } else {
    renderListing(categoryParam);
  }
}, 0);

// ===================================================================
// LISTING
// ===================================================================
let currentCategoryVendors = [];

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
};
const CAKE_CATEGORIES = [
  'Wedding Cakes', 'Engagement Cakes', 'Bridal Shower Cakes', "Groom's Cakes", 'Cupcake Towers',
  'Proposal Cakes', 'Gender Reveal', 'Dessert Tables', 'Mini Cakes', 'Custom Cakes',
];
const CAKE_DESIGNER_SERVICES = [
  'Custom Cake Design', 'Cake Tasting Session', 'Dessert Table Setup', 'Cupcake Station',
  'Macaron Tower', 'Cookie Favors', 'Delivery', 'Venue Setup', 'Pickup',
];
const CAKE_FLAVORS = ['Vanilla', 'Chocolate', 'Red Velvet', 'Lemon', 'Pistachio', 'Strawberry', 'Caramel', 'Custom Flavor'];
const CAKE_FILLINGS = ['Chocolate Ganache', 'Vanilla Cream', 'Cream Cheese', 'Strawberry', 'Pistachio', 'Nutella', 'Custom Filling'];
const CAKE_DECORATION_STYLES = ['Floral', 'Modern', 'Luxury', 'Minimalist', 'Rustic', 'Marble Effect', 'Gold Details', 'Custom Theme'];
const FOOD_CATEGORIES = [
  'Lebanese Cuisine', 'International Cuisine', 'Appetizers', 'Main Courses', 'Desserts',
  'Beverages', 'Kids Menu', 'Vegetarian Menu', 'Vegan Menu', 'Special Dietary Options',
];
const RESTAURANT_SERVICES = [
  'Proposal Setup', 'Engagement Dinner', 'Private Dining', 'Romantic Dinner', 'Rooftop Dining',
  'Garden Dining', 'Beachfront Dining', 'Family Engagement Party', 'VIP Dining Room', 'Event Decoration',
];
const RESTAURANT_VENUE_SPACES = ['Indoor Hall', 'Outdoor Garden', 'Rooftop', 'Terrace', 'Private Room', 'VIP Area'];
const RESTAURANT_MENU_CATEGORIES = [
  'Appetizers', 'Main Courses', 'Desserts', 'Drinks', 'Special Couple Menus',
  'Vegetarian & Vegan Options', 'Kids Menu (Engagement Parties)',
];
const RESTAURANT_DECORATION_OPTIONS = ['Floral Decorations', 'Balloon Setup', 'Candlelight', 'Romantic Theme', 'Luxury Theme', 'Custom Decoration'];
function categoryIcon(category) {
  return CATEGORY_ICONS[category] || '🏛️';
}

function avgPackagePrice(username) {
  const packages = getLS(vfKey(username, 'packages'), []);
  if (!packages.length) return null;
  const prices = packages.map(p => Number(p.price)).filter(n => !isNaN(n));
  return prices.length ? prices.reduce((s, n) => s + n, 0) / prices.length : null;
}

function renderListing(category) {
  document.getElementById('listingCategoryEyebrow').textContent = category;
  document.getElementById('listingTitle').textContent = category;
  updateVendorStructuredData(null);
  updateSEOTags({
    title: `${category} in Lebanon | Forever Begins`,
    description: `Browse trusted ${category} in Lebanon and book directly through Forever Begins — compare packages, prices and reviews.`,
    url: `https://foreverbegins.pro/venue.html?category=${encodeURIComponent(category)}`,
  });

  const isVenue = category === 'Wedding Venues';
  document.getElementById('searchVenueNameLabel').textContent = isVenue ? 'Venue Name' : 'Business Name';
  document.getElementById('searchVenueTypeGroup').classList.toggle('hidden', !isVenue);

  currentCategoryVendors = getLS('fb_vendor_applications', [])
    .filter(v => v.category === category && (v.status || 'Pending') === 'Approved' && !v.frozen)
    .map(v => {
      const profile = getLS(vfKey(v.username, 'profile'), {});
      const reviews = getLS(vfKey(v.username, 'reviews'), []);
      return { v, profile, reviews, avgRating: avgOf(reviews, 'rating'), avgPrice: avgPackagePrice(v.username) };
    });

  if (!currentCategoryVendors.length) {
    document.getElementById('vendorGrid').innerHTML = '';
    document.getElementById('notFoundState').classList.remove('hidden');
    document.querySelector('#notFoundState h2').textContent = 'No vendors listed yet';
    document.querySelector('#notFoundState p').textContent = `No approved ${category} vendors are live yet — check back soon.`;
    document.querySelector('#notFoundState a').textContent = 'Back to homepage';
    document.querySelector('#notFoundState a').href = 'index.html';
    return;
  }

  renderVendorGrid(currentCategoryVendors);

  document.getElementById('venueSearchForm').addEventListener('submit', (e) => {
    e.preventDefault();
    applyVenueSearch();
  });
}

function applyVenueSearch() {
  const name = document.getElementById('searchVenueName').value.trim().toLowerCase();
  const location = document.getElementById('searchVenueLocation').value.trim().toLowerCase();
  const minRating = Number(document.getElementById('searchVenueRating').value) || 0;
  const type = document.getElementById('searchVenueType').value;
  const priceRange = document.getElementById('searchVenuePrice').value;
  let priceMin = 0, priceMax = Infinity;
  if (priceRange) { const parts = priceRange.split('-'); priceMin = Number(parts[0]); priceMax = Number(parts[1]); }

  const filtered = currentCategoryVendors.filter(({ v, profile, avgRating, avgPrice }) => {
    if (name && !v.businessName.toLowerCase().includes(name)) return false;
    if (location && !(v.location || '').toLowerCase().includes(location)) return false;
    if (minRating && (!avgRating || Number(avgRating) < minRating)) return false;
    if (type && profile.indoorOutdoor !== type) return false;
    if (priceRange && (avgPrice == null || avgPrice < priceMin || avgPrice > priceMax)) return false;
    return true;
  });

  const note = document.getElementById('venueSearchNote');
  note.textContent = filtered.length ? `Showing ${filtered.length} result${filtered.length === 1 ? '' : 's'}.` : 'No vendors match your search.';
  renderVendorGrid(filtered);
}

// Lets a couple compare several vendors of the same category (venues,
// photographers, etc.) and send one inquiry to all of them at once instead
// of messaging each profile separately. Selection persists across re-renders
// triggered by the search form, keyed by username.
const selectedInquiryVendors = new Set();
let selectedInquiryVendorNames = {};

function renderVendorGrid(list) {
  const grid = document.getElementById('vendorGrid');
  const favorites = getLS('fb_customer_favorites', []);

  if (!list.length) {
    grid.innerHTML = '<p class="empty-state">No vendors match your search.</p>';
    updateBulkInquiryBar();
    return;
  }

  grid.innerHTML = list.map(({ v, profile, reviews, avgRating }) => {
    const isFav = favorites.includes(v.username);
    const isSelected = selectedInquiryVendors.has(v.username);
    selectedInquiryVendorNames[v.username] = v.businessName;
    return `
    <div class="vendor-card" data-username="${escapeHtml(v.username)}">
      <div class="vendor-cover-wrap">
        <label class="vendor-inquiry-check-wrap" title="Select to send a group inquiry">
          <input type="checkbox" class="vendor-inquiry-check" data-username="${escapeHtml(v.username)}" ${isSelected ? 'checked' : ''}>
        </label>
        <button type="button" class="vendor-fav-btn ${isFav ? 'active' : ''}" data-username="${escapeHtml(v.username)}">${isFav ? '❤️' : '🤍'}</button>
        ${profile.coverPhoto
          ? coverMediaTag(profile.coverPhoto, 'vendor-cover', v.businessName)
          : `<div class="vendor-cover" style="display:flex;align-items:center;justify-content:center;color:#ccc;font-size:2rem;">${categoryIcon(v.category)}</div>`}
        ${profile.logo ? `<img loading="lazy" decoding="async" class="vendor-logo" src="${profile.logo}" alt="logo">` : ''}
      </div>
      <div class="vendor-card-body">
        <h3>${escapeHtml(v.businessName)}</h3>
        <div class="vendor-location">${escapeHtml(v.location || '')}</div>
        <div class="vendor-badges">
          ${v.verified ? '<span class="badge-pill badge-verified">✔ Verified</span>' : ''}
          ${v.sponsored ? '<span class="badge-pill badge-sponsored">Sponsored</span>' : ''}
          ${v.featuredListing ? '<span class="badge-pill badge-featured">Featured</span>' : ''}
        </div>
        <div class="vendor-rating">${avgRating ? `⭐ ${avgRating}` : 'No reviews yet'} <span class="count">${reviews.length ? `(${reviews.length} review${reviews.length === 1 ? '' : 's'})` : ''}</span></div>
        <button type="button" class="vendor-see-details">See Details</button>
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.vendor-card').forEach(card => {
    card.addEventListener('click', () => {
      location.href = `venue.html?v=${encodeURIComponent(card.dataset.username)}`;
    });
  });

  grid.querySelectorAll('.vendor-fav-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      toggleFavorite(btn.dataset.username);
      const nowFav = getLS('fb_customer_favorites', []).includes(btn.dataset.username);
      btn.classList.toggle('active', nowFav);
      btn.textContent = nowFav ? '❤️' : '🤍';
    });
  });

  grid.querySelectorAll('.vendor-inquiry-check-wrap').forEach(wrap => {
    wrap.addEventListener('click', (e) => e.stopPropagation());
  });
  grid.querySelectorAll('.vendor-inquiry-check').forEach(check => {
    check.addEventListener('click', (e) => e.stopPropagation());
    check.addEventListener('change', () => {
      if (check.checked) selectedInquiryVendors.add(check.dataset.username);
      else selectedInquiryVendors.delete(check.dataset.username);
      updateBulkInquiryBar();
    });
  });

  updateBulkInquiryBar();
}

function updateBulkInquiryBar() {
  const bar = document.getElementById('bulkInquiryBar');
  if (!bar) return;
  const count = selectedInquiryVendors.size;
  bar.classList.toggle('hidden', count === 0);
  if (count > 0) {
    document.getElementById('bulkInquiryCount').textContent = `${count} vendor${count === 1 ? '' : 's'} selected`;
  }
}

document.getElementById('openBulkInquiryBtn').addEventListener('click', () => {
  const names = Array.from(selectedInquiryVendors).map(u => selectedInquiryVendorNames[u] || u);
  document.getElementById('bulkInquiryVendorList').textContent = names.join(', ');
  document.getElementById('bulkInquiryNote').textContent = '';
  openModal('bulkInquiryModal');
});

document.getElementById('clearBulkInquiryBtn').addEventListener('click', () => {
  selectedInquiryVendors.clear();
  document.querySelectorAll('.vendor-inquiry-check').forEach(c => c.checked = false);
  updateBulkInquiryBar();
});

document.getElementById('bulkInquiryForm').addEventListener('submit', (e) => {
  e.preventDefault();
  const usernames = Array.from(selectedInquiryVendors);
  if (!usernames.length) return;
  const name = document.getElementById('bulkMsgName').value.trim();
  const email = document.getElementById('bulkMsgEmail').value.trim();
  const phone = document.getElementById('bulkMsgPhone').value.trim();
  const message = document.getElementById('bulkMsgText').value.trim();
  usernames.forEach(username => {
    appendToVendorList(username, 'inquiries', {
      id: Date.now() + Math.random(),
      from: name,
      channel: 'Inbox',
      message,
      phone,
      email,
      quoteRequested: false,
      status: 'Unread',
      reply: '',
      time: Date.now(),
    });
    pushVendorNotification(username, 'message', `New message from ${name}.`);
  });
  const note = document.getElementById('bulkInquiryNote');
  note.style.color = 'var(--primary)';
  note.textContent = `Message sent to ${usernames.length} vendor${usernames.length === 1 ? '' : 's'}!`;
  e.target.reset();
  selectedInquiryVendors.clear();
  document.querySelectorAll('.vendor-inquiry-check').forEach(c => c.checked = false);
  updateBulkInquiryBar();
  setTimeout(() => { closeModal('bulkInquiryModal'); note.textContent = ''; }, 1800);
});

function toggleFavorite(username) {
  const favorites = getLS('fb_customer_favorites', []);
  const idx = favorites.indexOf(username);
  if (idx > -1) favorites.splice(idx, 1); else favorites.push(username);
  setLS('fb_customer_favorites', favorites);
}

// ===================================================================
// PROFILE
// ===================================================================
function renderProfile(username) {
  const vendors = getLS('fb_vendor_applications', []);
  const v = vendors.find(x => x.username === username && (x.status || 'Pending') === 'Approved' && !x.frozen);
  if (!v) {
    listingView.classList.add('hidden');
    profileView.classList.add('hidden');
    notFoundState.classList.remove('hidden');
    updateVendorStructuredData(null);
    return;
  }
  currentProfileVendor = v;
  listingView.classList.add('hidden');
  notFoundState.classList.add('hidden');
  profileView.classList.remove('hidden');

  const isVenue = v.category === 'Wedding Venues';
  const isPhotographer = v.category === 'Photographers & Videographers';
  const isDjBand = v.category === 'DJs & Bands';
  const isFlorist = v.category === 'Florists & Decor';
  const isMakeupArtist = v.category === 'Makeup Artists';
  const isHairStylist = v.category === 'Hair Stylists';
  const isBridalShop = v.category === 'Bridal Dress Shops';
  const isSuitRental = v.category === 'Suit Rental';
  const isVehicleRental = v.category === 'Vehicle Rental';
  const isCatering = v.category === 'Catering';
  const isHoneymoonAgency = v.category === 'Honeymoon Agency';
  const isInvitationCards = v.category === 'Invitation Cards';
  const isBridalStylist = v.category === 'Bridal Stylist';
  const isJewelry = v.category === 'Jewelry';
  const isZaffeh = v.category === 'Zaffeh';
  const isCakeDesigner = v.category === 'Cake Designers';
  const isRestaurant = v.category === 'Restaurants';
  const isEntertainment = v.category === 'Wedding Entertainment';
  updatePurposeFieldsForCategory(v.category);
  updateApptDressFieldForCategory(v.category, username);
  updateBookDressFieldForCategory(v.category, username);
  updateBookVehicleFieldForCategory(v.category, username);
  updateBookJewelryFieldForCategory(v.category, username);
  updateBookEntertainmentFieldForCategory(v.category, username);
  updateBookCakeFieldForCategory(v.category, username);
  document.getElementById('bookSuitOptionsGroup').classList.toggle('hidden', v.category !== 'Suit Rental');
  document.getElementById('bookInvitationGroup').classList.toggle('hidden', !isInvitationCards);
  document.getElementById('bookRestaurantGroup').classList.toggle('hidden', !isRestaurant);
  if (isRestaurant) {
    document.getElementById('bookRestaurantDecorationGrid').innerHTML = RESTAURANT_DECORATION_OPTIONS.map(o => `
      <label class="amenity-item"><input type="checkbox" value="${o}" class="book-restaurant-decoration-check"> ${o}</label>
    `).join('');
  }
  const profile = getLS(vfKey(username, 'profile'), {});
  const packages = getLS(vfKey(username, 'packages'), []);
  const foodmenu = getLS(vfKey(username, 'foodmenu'), []);
  const reviews = getLS(vfKey(username, 'reviews'), []);

  const seoDescription = (profile.description && profile.description.trim())
    ? profile.description.trim().slice(0, 155)
    : `${v.businessName} — ${v.category} in ${v.location || 'Lebanon'}. View packages, photos and reviews, and book directly on Forever Begins.`;
  const profileUrl = `https://foreverbegins.pro/venue.html?v=${encodeURIComponent(username)}`;
  const profileImage = (profile.coverPhoto && typeof profile.coverPhoto === 'object' ? profile.coverPhoto.src : profile.coverPhoto) || 'https://foreverbegins.pro/6.jpeg';
  updateSEOTags({
    title: `${v.businessName} — ${v.category}${v.location ? ` in ${v.location}` : ''} | Forever Begins`,
    description: seoDescription,
    url: profileUrl,
    image: profileImage,
  });
  const avgRatingForSchema = avgOf(reviews, 'rating');
  updateVendorStructuredData({
    '@context': 'https://schema.org',
    '@type': 'LocalBusiness',
    name: v.businessName,
    description: seoDescription,
    url: profileUrl,
    image: profileImage,
    address: v.location ? { '@type': 'PostalAddress', addressLocality: v.location, addressCountry: 'LB' } : undefined,
    telephone: v.phone || undefined,
    aggregateRating: avgRatingForSchema ? {
      '@type': 'AggregateRating',
      ratingValue: avgRatingForSchema,
      reviewCount: reviews.length,
    } : undefined,
  });

  // Header
  document.getElementById('profileCoverWrap').innerHTML = profile.coverPhoto
    ? coverMediaTag(profile.coverPhoto, 'profile-cover', v.businessName, true)
    : `<div class="profile-cover" style="background:#eee;display:flex;align-items:center;justify-content:center;color:#ccc;font-size:3rem;">${categoryIcon(v.category)}</div>`;
  document.getElementById('profileLogo').src = profile.logo || '';
  document.getElementById('profileLogo').style.visibility = profile.logo ? 'visible' : 'hidden';
  document.getElementById('profileName').textContent = v.businessName;
  const avg = avgOf(reviews, 'rating');
  document.getElementById('profileRating').innerHTML = avg ? `⭐ ${avg} <span class="count">(${reviews.length})</span>` : 'No reviews yet';
  document.getElementById('profileCategory').textContent = v.category;
  document.getElementById('profileLocation').textContent = v.location || '';
  document.getElementById('profileVerifiedBadge').innerHTML = v.verified ? '<span class="badge-pill badge-verified">✔ Verified</span>' : '';

  // Overview
  document.getElementById('profileDescription').textContent = profile.description || 'No description provided yet.';
  const details = [];
  if (isVenue) {
    if (profile.capacity) details.push({ label: 'Capacity', value: `${profile.capacity} guests` });
    if (profile.indoorOutdoor) details.push({ label: 'Indoor / Outdoor', value: profile.indoorOutdoor });
    if (profile.parkingInfo) details.push({ label: 'Parking', value: profile.parkingInfo });
    if (profile.accessibility) details.push({ label: 'Accessibility', value: profile.accessibility });
  } else if (isPhotographer) {
    if (profile.equipmentUsed) details.push({ label: 'Equipment Used', value: profile.equipmentUsed });
    if (profile.awards && profile.awards.length) details.push({ label: 'Awards & Certifications', value: profile.awards.join(', ') });
  } else if (isDjBand) {
    if (profile.yearsExperience) details.push({ label: 'Years of Experience', value: `${profile.yearsExperience} years` });
    if (profile.musicGenres && profile.musicGenres.length) details.push({ label: 'Music Library', value: profile.musicGenres.join(', ') });
    if (profile.languages && profile.languages.length) details.push({ label: 'Languages Performed', value: profile.languages.join(', ') });
  } else if (isFlorist) {
    if (profile.serviceAreas && profile.serviceAreas.length) details.push({ label: 'Service Areas', value: profile.serviceAreas.join(', ') });
  } else if (isMakeupArtist) {
    if (profile.artistName) details.push({ label: 'Artist Name', value: profile.artistName });
    if (profile.certifications && profile.certifications.length) details.push({ label: 'Certifications', value: profile.certifications.join(', ') });
    if (profile.serviceAreas && profile.serviceAreas.length) details.push({ label: 'Service Areas', value: profile.serviceAreas.join(', ') });
  } else if (isHairStylist) {
    if (profile.stylistName) details.push({ label: 'Stylist Name', value: profile.stylistName });
    if (profile.hairCertifications && profile.hairCertifications.length) details.push({ label: 'Certifications', value: profile.hairCertifications.join(', ') });
    if (profile.serviceAreas && profile.serviceAreas.length) details.push({ label: 'Service Areas', value: profile.serviceAreas.join(', ') });
  } else if (isBridalShop) {
    if (profile.shopName) details.push({ label: 'Shop Name', value: profile.shopName });
    if (profile.designerBrands && profile.designerBrands.length) details.push({ label: 'Designer Brands Carried', value: profile.designerBrands.join(', ') });
    if (profile.serviceAreas && profile.serviceAreas.length) details.push({ label: 'Service Areas', value: profile.serviceAreas.join(', ') });
  } else if (isSuitRental) {
    if (profile.shopName) details.push({ label: 'Shop Name', value: profile.shopName });
    if (profile.designerBrands && profile.designerBrands.length) details.push({ label: 'Designer Brands Carried', value: profile.designerBrands.join(', ') });
    if (profile.serviceAreas && profile.serviceAreas.length) details.push({ label: 'Service Areas', value: profile.serviceAreas.join(', ') });
  } else if (isVehicleRental) {
    if (profile.companyName) details.push({ label: 'Company Name', value: profile.companyName });
    if (profile.vehicleBrands && profile.vehicleBrands.length) details.push({ label: 'Vehicle Brands Carried', value: profile.vehicleBrands.join(', ') });
    if (profile.serviceAreas && profile.serviceAreas.length) details.push({ label: 'Service Areas', value: profile.serviceAreas.join(', ') });
  } else if (isHoneymoonAgency) {
    if (profile.yearsExperience) details.push({ label: 'Years of Experience', value: `${profile.yearsExperience} years` });
    if (profile.travelCertifications && profile.travelCertifications.length) details.push({ label: 'Travel Licenses & Certifications', value: profile.travelCertifications.join(', ') });
    if (profile.teamMembers && profile.teamMembers.length) details.push({ label: 'Team Members', value: profile.teamMembers.join(', ') });
    if (profile.workingHours) details.push({ label: 'Working Hours', value: profile.workingHours });
  } else if (isInvitationCards) {
    if (profile.yearsExperience) details.push({ label: 'Years of Experience', value: `${profile.yearsExperience} years` });
    if (profile.designerInfo) details.push({ label: 'Designer Information', value: profile.designerInfo });
    if (profile.workingHours) details.push({ label: 'Working Hours', value: profile.workingHours });
  } else if (isBridalStylist) {
    if (profile.stylistName) details.push({ label: 'Stylist Name', value: profile.stylistName });
    if (profile.languagesSpoken && profile.languagesSpoken.length) details.push({ label: 'Languages Spoken', value: profile.languagesSpoken.join(', ') });
  } else if (isJewelry) {
    if (profile.designerInfo) details.push({ label: 'Designer Information', value: profile.designerInfo });
  } else if (isRestaurant) {
    if (profile.cuisineType) details.push({ label: 'Cuisine Type', value: profile.cuisineType });
  }
  document.getElementById('profileDetailGrid').innerHTML = details.map(d => `
    <div class="detail-item"><strong>${escapeHtml(d.label)}</strong>${escapeHtml(d.value)}</div>
  `).join('');
  let amenityTags;
  if (isVenue) amenityTags = profile.amenities || [];
  else if (isFlorist) amenityTags = [...(profile.floralServices || []), ...(profile.decorationServices || [])];
  else if (isMakeupArtist) amenityTags = [
    ...(profile.bridalMakeupServices || []), ...(profile.additionalMakeupServices || []),
    ...(profile.beautyServices || []), ...(profile.beautyStyle || []),
  ];
  else if (isHairStylist) amenityTags = [
    ...(profile.bridalHairServices || []), ...(profile.additionalHairServices || []), ...(profile.hairStyles || []),
  ];
  else if (isBridalShop) amenityTags = [...(profile.bridalShopServices || []), ...(profile.designerBrands || [])];
  else if (isSuitRental) amenityTags = [...(profile.suitRentalServices || []), ...(profile.designerBrands || [])];
  else if (isVehicleRental) amenityTags = [...(profile.vehicleRentalServices || []), ...(profile.vehicleBrands || [])];
  else if (isCatering) amenityTags = profile.cateringServices || [];
  else if (isHoneymoonAgency) amenityTags = profile.honeymoonServices || [];
  else if (isInvitationCards) amenityTags = profile.invitationServices || [];
  else if (isJewelry) amenityTags = profile.jewelryServices || [];
  else if (isZaffeh) amenityTags = profile.zaffehServices || [];
  else if (isCakeDesigner) amenityTags = profile.cakeDesignerServices || [];
  else if (isRestaurant) amenityTags = [...(profile.restaurantServices || []), ...(profile.restaurantVenueSpaces || [])];
  else if (isEntertainment) amenityTags = profile.entertainmentServiceTypes || [];
  else amenityTags = profile.servicesOffered || [];
  document.getElementById('profileAmenities').innerHTML = amenityTags.map(a => `<span class="amenity-tag">${escapeHtml(a)}</span>`).join('');
  document.getElementById('profileTourLinkWrap').innerHTML = safeUrl(profile.tourLink)
    ? `<a href="${escapeHtml(safeUrl(profile.tourLink))}" target="_blank" rel="noopener noreferrer" class="btn btn-outline btn-sm">🔗 View 360° Virtual Tour</a>` : '';

  // Tab visibility: Food Menu only applies to venues; Portfolio (albums,
  // featured shots, highlight reels, before/after) only applies to
  // photographers/videographers.
  document.querySelector('.profile-tab[data-tab="foodmenu"]').classList.toggle('hidden', !isVenue);
  document.querySelector('.profile-tab[data-tab="portfolio"]').classList.toggle('hidden', !isPhotographer && !isBridalStylist && !isZaffeh && !isHairStylist && !isMakeupArtist && !isInvitationCards && !isEntertainment);
  document.querySelector('.profile-tab[data-tab="dresscollection"]').classList.toggle('hidden', !isBridalShop);
  document.querySelector('.profile-tab[data-tab="suitcollection"]').classList.toggle('hidden', !isSuitRental);
  document.querySelector('.profile-tab[data-tab="vehiclemanagement"]').classList.toggle('hidden', !isVehicleRental);
  document.querySelector('.profile-tab[data-tab="menumanagement"]').classList.toggle('hidden', !isCatering);
  document.querySelector('.profile-tab[data-tab="designcollection"]').classList.toggle('hidden', !isInvitationCards);
  document.querySelector('.profile-tab[data-tab="jewelrycollection"]').classList.toggle('hidden', !isJewelry);
  document.querySelector('.profile-tab[data-tab="cakecollection"]').classList.toggle('hidden', !isCakeDesigner);
  document.querySelector('.profile-tab[data-tab="restaurantmenu"]').classList.toggle('hidden', !isRestaurant);
  document.querySelector('.profile-tab[data-tab="entertainmentservices"]').classList.toggle('hidden', !isEntertainment);
  const activeTab = document.querySelector('.profile-tab.active');
  if (activeTab && activeTab.classList.contains('hidden')) {
    document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
    document.querySelector('.profile-tab[data-tab="overview"]').classList.add('active');
    document.querySelectorAll('.profile-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-overview').classList.add('active');
  }
  if (isPhotographer || isBridalStylist || isZaffeh || isHairStylist || isMakeupArtist || isInvitationCards || isEntertainment) {
    const portfolioKeyPrefix = isBridalStylist ? 'stylist' : isZaffeh ? 'zaffeh' : isHairStylist ? 'hair' : isMakeupArtist ? 'makeup' : isInvitationCards ? 'design' : isEntertainment ? 'entertainment' : '';
    renderPortfolioTab(username, portfolioKeyPrefix);
  }
  if (isBridalShop) renderDressCollectionTab(username);
  if (isSuitRental) renderSuitCollectionTab(username);
  if (isVehicleRental) renderVehicleManagementTab(username);
  if (isCatering) renderMenuManagementTab(username);
  if (isInvitationCards) renderDesignCollectionTab(username);
  if (isJewelry) renderJewelryCollectionTab(username);
  if (isCakeDesigner) renderCakeCollectionTab(username);
  if (isRestaurant) { renderRestaurantMenuTab(username); renderVirtualTourCard(username); }
  if (isFlorist) renderWeddingProjectsCard(username, 'weddingProjects', 'Previous Wedding Projects');
  if (isEntertainment) { renderEntertainmentServicesTab(username); renderWeddingProjectsCard(username, 'entertainmentPreviousEvents', 'Previous Events'); }
  if (isVenue) renderVenueLayoutCards(username);

  // Gallery
  const mediaItems = [
    ...(profile.gallery || []).map(src => ({ type: 'image', src })),
    ...(profile.videos || []).map(src => ({ type: 'video', src })),
  ];
  document.getElementById('profileGallery').innerHTML = mediaItems.length
    ? mediaItems.map((m, i) => m.type === 'video'
        ? `<video src="${m.src}" muted data-i="${i}" class="gallery-item-media"></video>`
        : `<img loading="lazy" decoding="async" src="${m.src}" alt="Gallery photo" data-i="${i}" class="gallery-item-media">`).join('')
    : '<p style="color:#999;">No photos or videos uploaded yet.</p>';
  document.querySelectorAll('.gallery-item-media').forEach(el => {
    el.addEventListener('click', () => openLightbox(mediaItems[Number(el.dataset.i)]));
  });

  // Kitchen Photos (Catering only) — a separate gallery from the event
  // photos above, showcasing the vendor's own kitchen/prep facilities.
  document.getElementById('kitchenPhotosProfileCard').classList.toggle('hidden', !isCatering);
  if (isCatering) {
    const kitchenPhotos = profile.kitchenPhotos || [];
    const kitchenMedia = kitchenPhotos.map(src => ({ type: 'image', src }));
    document.getElementById('profileKitchenPhotos').innerHTML = kitchenMedia.length
      ? kitchenMedia.map((m, i) => `<img loading="lazy" decoding="async" src="${m.src}" alt="Kitchen photo" data-i="${i}" class="kitchen-photo-media">`).join('')
      : '<p style="color:#999;">No kitchen photos uploaded yet.</p>';
    document.querySelectorAll('.kitchen-photo-media').forEach(el => {
      el.addEventListener('click', () => openLightbox(kitchenMedia[Number(el.dataset.i)]));
    });
  }

  // Previous Designs (Invitation Cards only) — a separate gallery from the
  // general portfolio gallery above, showcasing specific past projects.
  document.getElementById('previousDesignsProfileCard').classList.toggle('hidden', !isInvitationCards);
  if (isInvitationCards) {
    const previousDesigns = profile.previousDesigns || [];
    const previousDesignsMedia = previousDesigns.map(src => ({ type: 'image', src }));
    document.getElementById('profilePreviousDesigns').innerHTML = previousDesignsMedia.length
      ? previousDesignsMedia.map((m, i) => `<img loading="lazy" decoding="async" src="${m.src}" alt="Previous design" data-i="${i}" class="previous-design-media">`).join('')
      : '<p style="color:#999;">No previous designs uploaded yet.</p>';
    document.querySelectorAll('.previous-design-media').forEach(el => {
      el.addEventListener('click', () => openLightbox(previousDesignsMedia[Number(el.dataset.i)]));
    });
  }

  // Packages
  document.getElementById('profilePackages').innerHTML = packages.length ? packages.map((p, pi) => `
    <div class="package-view-card">
      <h4>${escapeHtml(p.name)} ${p.type ? `<span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(p.type)}</span>` : ''}</h4>
      <div class="price">$${escapeHtml(p.price)}${p.priceMax ? `–$${escapeHtml(p.priceMax)}` : ''}${isCatering ? ` <span style="font-size:0.75rem;font-weight:400;color:#777;">/ person</span>` : isHoneymoonAgency ? ` <span style="font-size:0.75rem;font-weight:400;color:#777;">/ couple</span>` : ''}</div>
      ${!isPhotographer && !isMakeupArtist && !isHairStylist && !isBridalShop && !isSuitRental && !isVehicleRental && !isHoneymoonAgency && !isInvitationCards && !isBridalStylist && !isJewelry && !isZaffeh && !isCakeDesigner ? `<div class="meta">${escapeHtml(p.minGuests || 0)}–${escapeHtml(p.maxGuests || '∞')} guests</div>` : ''}
      ${p.description ? `<div>${escapeHtml(p.description)}</div>` : ''}
      ${p.includedItems && p.includedItems.length ? `<div><strong>Included:</strong> ${p.includedItems.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.numberOfTables ? `<div><strong>Tables:</strong> ${escapeHtml(p.numberOfTables)}</div>` : ''}
      ${p.flowerTypes && p.flowerTypes.length ? `<div><strong>Flowers:</strong> ${p.flowerTypes.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.decorationStyle ? `<div><strong>Style:</strong> ${escapeHtml(p.decorationStyle)}</div>` : ''}
      ${p.includedServices && p.includedServices.length ? `<div><strong>Included:</strong> ${p.includedServices.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.setup ? `<div><strong>Setup:</strong> ${escapeHtml(p.setup)}</div>` : ''}
      ${p.duration ? `<div><strong>Duration:</strong> ${escapeHtml(p.duration)}</div>` : ''}
      ${p.customizationOptions && p.customizationOptions.length ? `<div><strong>Customization Options:</strong> ${p.customizationOptions.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.numberOfPeople ? `<div><strong>People Included:</strong> ${escapeHtml(p.numberOfPeople)}</div>` : ''}
      ${p.depositRequired ? `<div><strong>Deposit Required:</strong> ${escapeHtml(p.depositRequired)}</div>` : ''}
      ${p.extraHourPrice ? `<div><strong>Extra Hour Price:</strong> $${escapeHtml(p.extraHourPrice)}</div>` : ''}
      ${p.purchaseAvailable ? `<div><strong>Available for Purchase</strong> (not just rental)</div>` : ''}
      ${p.termsConditions ? `<div><strong>Terms &amp; Conditions:</strong> ${escapeHtml(p.termsConditions)}</div>` : ''}
      ${p.addons && p.addons.length ? `<div><strong>Add-ons:</strong> ${p.addons.map(addonDisplay).join(', ')}</div>` : ''}
      ${p.seasonal ? `<div><strong>Seasonal:</strong> ${escapeHtml(p.seasonal)}</div>` : ''}
      ${p.discount ? `<div><strong>Promo:</strong> ${escapeHtml(p.discount)}</div>` : ''}
      ${p.destination ? `<div><strong>Destination:</strong> ${escapeHtml(p.destination)}</div>` : ''}
      ${p.hotelInfo ? `<div><strong>Hotel Information:</strong> ${escapeHtml(p.hotelInfo)}</div>` : ''}
      ${p.flightDetails ? `<div><strong>Flight Details:</strong> ${escapeHtml(p.flightDetails)}</div>` : ''}
      ${p.transportation ? `<div><strong>Transportation:</strong> ${escapeHtml(p.transportation)}</div>` : ''}
      ${p.insurance ? `<div><strong>Insurance:</strong> ${escapeHtml(p.insurance)}</div>` : ''}
      ${p.availability ? `<div><strong>Availability:</strong> ${escapeHtml(p.availability)}</div>` : ''}
      ${p.minimumQuantity ? `<div><strong>Minimum Quantity:</strong> ${escapeHtml(p.minimumQuantity)}</div>` : ''}
      ${p.entranceStyles && p.entranceStyles.length ? `<div><strong>Entrance Styles:</strong> ${p.entranceStyles.map(escapeHtml).join(', ')}</div>` : ''}
      ${p.musicOptions && p.musicOptions.length ? `<div><strong>Music Selection:</strong> ${p.musicOptions.map(escapeHtml).join(', ')}</div>` : ''}
      ${(isHoneymoonAgency || isZaffeh) && p.media && p.media.length ? `<div class="gallery-grid-view package-media-grid" data-package-i="${pi}">${p.media.map((m, i) => m.type === 'video' ? `<video src="${m.src}" muted data-i="${i}" class="package-media-item"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="${escapeHtml(p.name)} photo ${i + 1}" data-i="${i}" class="package-media-item">`).join('')}</div>` : ''}
      ${isZaffeh && p.showcaseVideos && p.showcaseVideos.length ? `
        <p style="margin:0.4rem 0 0.2rem;font-size:0.85rem;color:#777;"><strong>Watch Previous Performances</strong></p>
        <div class="gallery-grid-view package-showcase-grid" data-package-i="${pi}">${p.showcaseVideos.map((v, i) => `<video src="${v.src}" muted data-i="${i}" class="package-showcase-item"></video>`).join('')}</div>` : ''}
      ${isCakeDesigner && p.media && p.media.length ? `
        <div class="cake-package-360-preview" data-package-i="${pi}" style="text-align:center;margin-top:0.6rem;">
          <img loading="lazy" decoding="async" class="cake-package-360-image" src="${p.media[0].src}" alt="${escapeHtml(p.name)} cake preview" style="max-width:220px;border-radius:8px;">
          <div style="margin-top:0.4rem;">
            <button type="button" class="btn btn-outline btn-sm cake-package-360-prev">◀ Rotate</button>
            <button type="button" class="btn btn-outline btn-sm cake-package-360-next">Rotate ▶</button>
          </div>
          <p style="font-size:0.75rem;color:#999;margin-top:0.3rem;">360° Preview — browse through uploaded angles</p>
        </div>` : ''}
      ${isCakeDesigner && p.price && p.numberOfPeople ? `
        <div class="cake-price-calculator" data-package-i="${pi}" style="margin-top:0.6rem;padding:0.6rem;background:#f7f5f0;border-radius:8px;">
          <label style="font-size:0.85rem;display:block;margin-bottom:0.3rem;">💰 Price Calculator — estimate for your guest count:</label>
          <input type="number" class="cake-calc-input" min="1" placeholder="e.g. 120" style="width:100px;padding:4px;">
          <span class="cake-calc-result" style="margin-left:0.5rem;font-weight:700;color:var(--primary);"></span>
        </div>` : ''}
      <button class="btn btn-primary btn-sm select-package-btn" data-package="${escapeHtml(p.name)}">Reserve This Package</button>
    </div>
  `).join('') : '<p style="color:#999;">No packages published yet.</p>';
  document.querySelectorAll('.package-media-grid').forEach(grid => {
    const pkg = packages[Number(grid.dataset.packageI)];
    const media = pkg.media || [];
    grid.querySelectorAll('.package-media-item').forEach(el => {
      el.addEventListener('click', () => openLightbox(media[Number(el.dataset.i)]));
    });
  });
  document.querySelectorAll('.package-showcase-grid').forEach(grid => {
    const pkg = packages[Number(grid.dataset.packageI)];
    const showcaseMedia = (pkg.showcaseVideos || []).map(v => ({ type: 'video', src: v.src }));
    grid.querySelectorAll('.package-showcase-item').forEach(el => {
      el.addEventListener('click', () => openLightbox(showcaseMedia[Number(el.dataset.i)]));
    });
  });
  document.querySelectorAll('.cake-package-360-preview').forEach(container => {
    const pkg = packages[Number(container.dataset.packageI)];
    const photos = (pkg.media || []).filter(m => m.type !== 'video');
    let index = 0;
    const img = container.querySelector('.cake-package-360-image');
    function updatePreviewImg() { if (photos.length) img.src = photos[index].src; }
    container.querySelector('.cake-package-360-prev').addEventListener('click', () => {
      index = (index - 1 + photos.length) % photos.length;
      updatePreviewImg();
    });
    container.querySelector('.cake-package-360-next').addEventListener('click', () => {
      index = (index + 1) % photos.length;
      updatePreviewImg();
    });
  });
  document.querySelectorAll('.cake-price-calculator').forEach(container => {
    const pkg = packages[Number(container.dataset.packageI)];
    const input = container.querySelector('.cake-calc-input');
    const result = container.querySelector('.cake-calc-result');
    input.addEventListener('input', () => {
      const servings = Number(input.value);
      if (!servings || !pkg.numberOfPeople) { result.textContent = ''; return; }
      const perServing = Number(pkg.price) / Number(pkg.numberOfPeople);
      result.textContent = `≈ $${Math.round(perServing * servings)}`;
    });
  });
  document.querySelectorAll('.select-package-btn').forEach(btn => {
    btn.addEventListener('click', () => openBookingModal(btn.dataset.package));
  });

  // Food Menu
  document.getElementById('profileFoodMenu').innerHTML = foodmenu.length ? foodmenu.map(m => `
    <div class="food-menu-card">
      <h4>${escapeHtml(m.name)} <span style="font-size:0.75rem;color:#999;">(${escapeHtml(m.type)})</span></h4>
      <div style="font-weight:700;color:var(--primary);">$${escapeHtml(m.pricePerPerson)} / person</div>
      <div style="color:#999;font-size:0.85rem;">${escapeHtml(m.minGuests || 0)}–${escapeHtml(m.maxGuests || '∞')} guests</div>
      ${m.appetizers && m.appetizers.length ? `<div><strong>Appetizers:</strong> ${m.appetizers.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.mains && m.mains.length ? `<div><strong>Main Course:</strong> ${m.mains.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.stations && m.stations.length ? `<div><strong>Live Stations:</strong> ${m.stations.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.sides && m.sides.length ? `<div><strong>Sides:</strong> ${m.sides.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.desserts && m.desserts.length ? `<div><strong>Desserts:</strong> ${m.desserts.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.beverages && m.beverages.length ? `<div><strong>Beverages:</strong> ${m.beverages.map(escapeHtml).join(', ')}${m.includesAlcohol ? ' (includes alcohol)' : ''}</div>` : ''}
      ${m.dietary && m.dietary.length ? `<div><strong>Dietary Options:</strong> ${m.dietary.map(escapeHtml).join(', ')}</div>` : ''}
      ${m.childrenPrice ? `<div><strong>Children's Price:</strong> ${escapeHtml(m.childrenPrice)}</div>` : ''}
      ${m.serviceChargeEnabled ? `<div><strong>Service Charge:</strong> ${escapeHtml(m.serviceChargePercent || 0)}%</div>` : ''}
      ${m.extras && m.extras.length ? `<div><strong>Extras:</strong> ${m.extras.map(escapeHtml).join(', ')}</div>` : ''}
    </div>
  `).join('') : '<p style="color:#999;">No food menu published yet.</p>';

  // Availability (read-only)
  renderAvailabilityView(username);

  // Reviews
  const foodAvg = avgOf(reviews, 'foodRating');
  const ambianceAvg = avgOf(reviews, 'ambianceRating');
  document.getElementById('profileRatingBreakdown').innerHTML = isVenue
    ? `Overall: <strong>${avg || '—'}</strong> &nbsp; 🍽️ Food: <strong>${foodAvg || '—'}</strong> &nbsp; 🎨 Ambiance: <strong>${ambianceAvg || '—'}</strong>`
    : `Overall: <strong>${avg || '—'}</strong>`;
  document.getElementById('profileReviewsList').innerHTML = reviews.length ? reviews.filter(r => !r.flagged).map(r => `
    <div class="review-item">
      <div style="display:flex;justify-content:space-between;"><strong>${escapeHtml(r.author)}</strong><span class="review-stars">⭐ ${escapeHtml(r.rating)}</span></div>
      <p style="margin:0.4rem 0;color:#555;">${escapeHtml(r.text)}</p>
      ${r.reply ? `<div class="reply-box"><strong>Vendor reply:</strong> ${escapeHtml(r.reply)}</div>` : ''}
    </div>
  `).join('') : '<p style="color:#999;">No reviews yet.</p>';

  // Contact & links
  const contactItems = [];
  if (v.phone) contactItems.push(`<li>📞 ${escapeHtml(v.phone)}</li>`);
  if (v.email) contactItems.push(`<li>✉️ ${escapeHtml(v.email)}</li>`);
  if (v.location) contactItems.push(`<li>📍 ${escapeHtml(v.location)}</li>`);
  if (safeUrl(v.mapsLink)) contactItems.push(`<li><a href="${escapeHtml(safeUrl(v.mapsLink))}" target="_blank" rel="noopener noreferrer">View on Google Maps</a></li>`);
  document.getElementById('profileContactList').innerHTML = contactItems.join('');

  const socials = [];
  if (safeUrl(v.website)) socials.push(`<a href="${escapeHtml(safeUrl(v.website))}" target="_blank" rel="noopener noreferrer">🌐 Website</a>`);
  if (safeUrl(v.instagram)) socials.push(`<a href="${escapeHtml(safeUrl(v.instagram))}" target="_blank" rel="noopener noreferrer">📷 Instagram</a>`);
  if (safeUrl(v.facebook)) socials.push(`<a href="${escapeHtml(safeUrl(v.facebook))}" target="_blank" rel="noopener noreferrer">📘 Facebook</a>`);
  if (safeUrl(v.tiktok)) socials.push(`<a href="${escapeHtml(safeUrl(v.tiktok))}" target="_blank" rel="noopener noreferrer">🎵 TikTok</a>`);
  if (v.whatsapp) socials.push(`<a href="https://wa.me/${escapeHtml(v.whatsapp.replace(/\D/g, ''))}" target="_blank" rel="noopener noreferrer">💬 WhatsApp</a>`);
  document.getElementById('profileSocialLinks').innerHTML = socials.join('');

  populateBookingForm(username, packages);
  renderMyAppointments(username);
  updateFavoriteBtn();
}

// ===================================================================
// PORTFOLIO (Photographers & Videographers only): featured shots, albums,
// highlight reels, before/after — mirrors the vendor dashboard's Portfolio
// tab data (fb_venue_portfolioAlbums_*, fb_venue_portfolioVideos_*,
// fb_venue_beforeAfter_*).
// ===================================================================
function renderPortfolioTab(username, keyPrefix) {
  const albums = getLS(vfKey(username, keyPrefix ? `${keyPrefix}Albums` : 'portfolioAlbums'), []);
  const portfolioVideos = getLS(vfKey(username, keyPrefix ? `${keyPrefix}Videos` : 'portfolioVideos'), []);
  const beforeAfter = getLS(vfKey(username, keyPrefix ? `${keyPrefix}BeforeAfter` : 'beforeAfter'), []);

  const featuredPhotos = albums.flatMap(al => (al.photos || []).filter(p => p.featured));
  document.getElementById('profileFeaturedCard').classList.toggle('hidden', !featuredPhotos.length);
  const featuredMedia = featuredPhotos.map(p => ({ type: 'image', src: p.src }));
  document.getElementById('profileFeaturedGrid').innerHTML = featuredMedia.map((m, i) => `
    <img loading="lazy" decoding="async" src="${m.src}" alt="Featured work" data-i="${i}" class="featured-media">
  `).join('');
  document.querySelectorAll('.featured-media').forEach(el => {
    el.addEventListener('click', () => openLightbox(featuredMedia[Number(el.dataset.i)]));
  });

  document.getElementById('profileAlbumsList').innerHTML = albums.length ? albums.map((al, ai) => `
    <div style="margin-bottom:1.4rem;">
      <h4 style="margin-bottom:0.6rem;">${escapeHtml(al.name)}</h4>
      <div class="gallery-grid-view" data-album-i="${ai}">
        ${(al.photos || []).map((p, i) => `<img loading="lazy" decoding="async" src="${p.src}" alt="${escapeHtml(al.name)} photo ${i + 1}" data-i="${i}" class="album-media">`).join('') || '<p style="color:#999;">No photos in this album yet.</p>'}
      </div>
    </div>
  `).join('') : '<p style="color:#999;">No albums published yet.</p>';
  document.querySelectorAll('[data-album-i]').forEach(grid => {
    const al = albums[Number(grid.dataset.albumI)];
    const media = (al.photos || []).map(p => ({ type: 'image', src: p.src }));
    grid.querySelectorAll('.album-media').forEach(el => {
      el.addEventListener('click', () => openLightbox(media[Number(el.dataset.i)]));
    });
  });

  document.getElementById('profileHighlightReelsCard').classList.toggle('hidden', !portfolioVideos.length);
  const videoMedia = portfolioVideos.map(v => ({ type: 'video', src: v.src }));
  document.getElementById('profileHighlightReelsGrid').innerHTML = videoMedia.map((m, i) => `
    <video src="${m.src}" muted data-i="${i}" class="reel-media"></video>
  `).join('');
  document.querySelectorAll('.reel-media').forEach(el => {
    el.addEventListener('click', () => openLightbox(videoMedia[Number(el.dataset.i)]));
  });

  document.getElementById('profileBeforeAfterCard').classList.toggle('hidden', !beforeAfter.length);
  document.getElementById('profileBeforeAfterList').innerHTML = beforeAfter.length ? beforeAfter.map(ba => `
    <div style="margin-bottom:1.2rem;">
      <div class="form-row-2">
        <div><p style="font-size:0.8rem;color:#999;margin-bottom:0.3rem;">Before</p><img loading="lazy" decoding="async" src="${ba.before}" alt="Before" style="width:100%;border-radius:10px;"></div>
        <div><p style="font-size:0.8rem;color:#999;margin-bottom:0.3rem;">After</p><img loading="lazy" decoding="async" src="${ba.after}" alt="After" style="width:100%;border-radius:10px;"></div>
      </div>
      ${ba.label ? `<p style="color:#555;margin-top:0.5rem;">${escapeHtml(ba.label)}</p>` : ''}
    </div>
  `).join('') : '<p style="color:#999;">No before/after examples yet.</p>';
}

function renderDressCollectionTab(username) {
  const dresses = getLS(vfKey(username, 'dresses'), []);
  const filterSelect = document.getElementById('profileDressFilterCategory');
  const categories = Array.from(new Set(dresses.map(d => d.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? dresses.filter(d => d.category === filter) : dresses;
    const grid = document.getElementById('profileDressCollection');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No dresses in this collection yet.</p>'; return; }
    grid.innerHTML = filtered.map((d, di) => {
      const media = d.media || [];
      return `
      <div class="package-view-card" data-dress-i="${di}">
        <h4>${escapeHtml(d.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(d.category)}</span></h4>
        ${d.designerName || d.collectionName ? `<div class="meta">${d.designerName ? escapeHtml(d.designerName) : ''}${d.designerName && d.collectionName ? ' · ' : ''}${d.collectionName ? escapeHtml(d.collectionName) : ''}</div>` : ''}
        ${d.style ? `<div><strong>Style:</strong> ${escapeHtml(d.style)}</div>` : ''}
        ${d.sizes && d.sizes.length ? `<div><strong>Sizes:</strong> ${d.sizes.map(escapeHtml).join(', ')}</div>` : ''}
        ${d.colors && d.colors.length ? `<div><strong>Colors:</strong> ${d.colors.map(escapeHtml).join(', ')}</div>` : ''}
        ${d.fabricType ? `<div><strong>Fabric:</strong> ${escapeHtml(d.fabricType)}</div>` : ''}
        <div><strong>Availability:</strong> ${escapeHtml(d.availability || '—')}</div>
        ${d.buy ? `<div><strong>Buy:</strong> ${d.buyPrice ? `$${escapeHtml(d.buyPrice)}` : 'Contact for price'}</div>` : ''}
        ${d.rent ? `<div><strong>Rent:</strong> ${d.rentPrice ? `$${escapeHtml(d.rentPrice)}` : 'Contact for price'}</div>` : ''}
        ${media.length ? `<div class="gallery-grid-view dress-media-grid" data-dress-i="${di}">${media.map((m, i) => m.type === 'video' ? `<video src="${m.src}" muted data-i="${i}" class="dress-media-item"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="${escapeHtml(d.name)} photo ${i + 1}" data-i="${i}" class="dress-media-item">`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.dress-media-grid').forEach(mediaGrid => {
      const dress = filtered[Number(mediaGrid.dataset.dressI)];
      const mediaList = dress.media || [];
      mediaGrid.querySelectorAll('.dress-media-item').forEach(el => {
        el.addEventListener('click', () => openLightbox(mediaList[Number(el.dataset.i)]));
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

function renderSuitCollectionTab(username) {
  const suits = getLS(vfKey(username, 'suits'), []);
  const filterSelect = document.getElementById('profileSuitFilterCategory');
  const categories = Array.from(new Set(suits.map(s => s.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? suits.filter(s => s.category === filter) : suits;
    const grid = document.getElementById('profileSuitCollection');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No suits in this collection yet.</p>'; return; }
    grid.innerHTML = filtered.map((s, si) => {
      const media = s.media || [];
      return `
      <div class="package-view-card" data-suit-i="${si}">
        <h4>${escapeHtml(s.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(s.category)}</span></h4>
        ${s.brand || s.collectionName ? `<div class="meta">${s.brand ? escapeHtml(s.brand) : ''}${s.brand && s.collectionName ? ' · ' : ''}${s.collectionName ? escapeHtml(s.collectionName) : ''}</div>` : ''}
        ${s.style ? `<div><strong>Style:</strong> ${escapeHtml(s.style)}</div>` : ''}
        ${s.sizes && s.sizes.length ? `<div><strong>Sizes:</strong> ${s.sizes.map(escapeHtml).join(', ')}</div>` : ''}
        ${s.colors && s.colors.length ? `<div><strong>Colors:</strong> ${s.colors.map(escapeHtml).join(', ')}</div>` : ''}
        ${s.fabricType ? `<div><strong>Fabric:</strong> ${escapeHtml(s.fabricType)}</div>` : ''}
        <div><strong>Availability:</strong> ${escapeHtml(s.availability || '—')}</div>
        ${media.length ? `<div class="gallery-grid-view suit-media-grid" data-suit-i="${si}">${media.map((m, i) => m.type === 'video' ? `<video src="${m.src}" muted data-i="${i}" class="suit-media-item"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="${escapeHtml(s.name)} photo ${i + 1}" data-i="${i}" class="suit-media-item">`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.suit-media-grid').forEach(mediaGrid => {
      const suit = filtered[Number(mediaGrid.dataset.suitI)];
      const mediaList = suit.media || [];
      mediaGrid.querySelectorAll('.suit-media-item').forEach(el => {
        el.addEventListener('click', () => openLightbox(mediaList[Number(el.dataset.i)]));
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

function renderVehicleManagementTab(username) {
  const vehicles = getLS(vfKey(username, 'vehicles'), []);
  const filterSelect = document.getElementById('profileVehicleFilterCategory');
  const categories = Array.from(new Set(vehicles.map(v => v.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? vehicles.filter(v => v.category === filter) : vehicles;
    const grid = document.getElementById('profileVehicleManagement');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No vehicles in this fleet yet.</p>'; return; }
    grid.innerHTML = filtered.map((v, vi) => {
      const media = v.media || [];
      return `
      <div class="package-view-card" data-vehicle-i="${vi}">
        <h4>${escapeHtml(v.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(v.category)}</span></h4>
        ${v.brandModel || v.year ? `<div class="meta">${v.brandModel ? escapeHtml(v.brandModel) : ''}${v.brandModel && v.year ? ' · ' : ''}${v.year ? escapeHtml(v.year) : ''}</div>` : ''}
        ${v.color ? `<div><strong>Color:</strong> ${escapeHtml(v.color)}</div>` : ''}
        ${v.passengerCapacity ? `<div><strong>Passenger Capacity:</strong> ${escapeHtml(v.passengerCapacity)}</div>` : ''}
        ${v.description ? `<div>${escapeHtml(v.description)}</div>` : ''}
        ${v.features && v.features.length ? `<div><strong>Features:</strong> ${v.features.map(escapeHtml).join(', ')}</div>` : ''}
        ${media.length ? `<div class="gallery-grid-view vehicle-media-grid" data-vehicle-i="${vi}">${media.map((m, i) => m.type === 'video' ? `<video src="${m.src}" muted data-i="${i}" class="vehicle-media-item"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="${escapeHtml(v.name)} photo ${i + 1}" data-i="${i}" class="vehicle-media-item">`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.vehicle-media-grid').forEach(mediaGrid => {
      const vehicle = filtered[Number(mediaGrid.dataset.vehicleI)];
      const mediaList = vehicle.media || [];
      mediaGrid.querySelectorAll('.vehicle-media-item').forEach(el => {
        el.addEventListener('click', () => openLightbox(mediaList[Number(el.dataset.i)]));
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

function renderDesignCollectionTab(username) {
  const designs = getLS(vfKey(username, 'designs'), []);
  const filterSelect = document.getElementById('profileDesignFilterCategory');
  const categories = Array.from(new Set(designs.map(d => d.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? designs.filter(d => d.category === filter) : designs;
    const grid = document.getElementById('profileDesignCollection');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No designs in this collection yet.</p>'; return; }
    grid.innerHTML = filtered.map((d, di) => {
      const media = d.media || [];
      return `
      <div class="package-view-card" data-design-i="${di}">
        <h4>${escapeHtml(d.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(d.category)}</span></h4>
        ${d.style ? `<div class="meta">${escapeHtml(d.style)}</div>` : ''}
        ${d.availableFormats ? `<div><strong>Available Formats:</strong> ${escapeHtml(d.availableFormats)}</div>` : ''}
        ${d.paperType ? `<div><strong>Paper Type:</strong> ${escapeHtml(d.paperType)}</div>` : ''}
        ${d.sizeOptions ? `<div><strong>Size Options:</strong> ${escapeHtml(d.sizeOptions)}</div>` : ''}
        ${d.colorOptions ? `<div><strong>Color Options:</strong> ${escapeHtml(d.colorOptions)}</div>` : ''}
        ${d.customizationOptions ? `<div><strong>Customization Options:</strong> ${escapeHtml(d.customizationOptions)}</div>` : ''}
        ${media.length ? `<div class="gallery-grid-view design-media-grid" data-design-i="${di}">${media.map((m, i) => m.type === 'video' ? `<video src="${m.src}" muted data-i="${i}" class="design-media-item"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="${escapeHtml(d.name)} photo ${i + 1}" data-i="${i}" class="design-media-item">`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.design-media-grid').forEach(mediaGrid => {
      const design = filtered[Number(mediaGrid.dataset.designI)];
      const mediaList = design.media || [];
      mediaGrid.querySelectorAll('.design-media-item').forEach(el => {
        el.addEventListener('click', () => {
          openLightbox(mediaList[Number(el.dataset.i)]);
          bumpDesignView(username, design.id);
        });
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

function renderJewelryCollectionTab(username) {
  const items = getLS(vfKey(username, 'jewelryItems'), []);
  const filterSelect = document.getElementById('profileJewelryFilterCategory');
  const categories = Array.from(new Set(items.map(j => j.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? items.filter(j => j.category === filter) : items;
    const grid = document.getElementById('profileJewelryCollection');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No jewelry in this collection yet.</p>'; return; }
    grid.innerHTML = filtered.map((j, ji) => {
      const media = j.media || [];
      return `
      <div class="package-view-card" data-jewelry-i="${ji}">
        <h4>${escapeHtml(j.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(j.category)}</span></h4>
        ${j.collectionName ? `<div class="meta">${escapeHtml(j.collectionName)}</div>` : ''}
        ${j.description ? `<div>${escapeHtml(j.description)}</div>` : ''}
        ${j.materials && j.materials.length ? `<div><strong>Materials:</strong> ${j.materials.map(escapeHtml).join(', ')}</div>` : ''}
        ${j.weight ? `<div><strong>Weight:</strong> ${escapeHtml(j.weight)}</div>` : ''}
        ${j.stoneDetails ? `<div><strong>Stone Details:</strong> ${escapeHtml(j.stoneDetails)}</div>` : ''}
        ${j.sizes ? `<div><strong>Available Sizes:</strong> ${escapeHtml(j.sizes)}</div>` : ''}
        <div><strong>Availability:</strong> ${escapeHtml(j.availability || '—')}</div>
        ${j.buy ? `<div><strong>Buy:</strong> ${j.buyPrice ? `$${escapeHtml(j.buyPrice)}` : 'Contact for price'}</div>` : ''}
        ${j.rent ? `<div><strong>Rent:</strong> ${j.rentPrice ? `$${escapeHtml(j.rentPrice)}` : 'Contact for price'}</div>` : ''}
        ${media.length ? `<div class="gallery-grid-view jewelry-media-grid" data-jewelry-i="${ji}">${media.map((m, i) => m.type === 'video' ? `<video src="${m.src}" muted data-i="${i}" class="jewelry-media-item"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="${escapeHtml(j.name)} photo ${i + 1}" data-i="${i}" class="jewelry-media-item">`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.jewelry-media-grid').forEach(mediaGrid => {
      const item = filtered[Number(mediaGrid.dataset.jewelryI)];
      const mediaList = item.media || [];
      mediaGrid.querySelectorAll('.jewelry-media-item').forEach(el => {
        el.addEventListener('click', () => {
          openLightbox(mediaList[Number(el.dataset.i)]);
          bumpJewelryView(username, item.id);
        });
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

function renderCakeCollectionTab(username) {
  const cakes = getLS(vfKey(username, 'cakes'), []);
  const filterSelect = document.getElementById('profileCakeFilterCategory');
  const categories = Array.from(new Set(cakes.map(c => c.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? cakes.filter(c => c.category === filter) : cakes;
    const grid = document.getElementById('profileCakeCollection');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No cakes in this collection yet.</p>'; return; }
    grid.innerHTML = filtered.map((c, ci) => {
      const photos = (c.media || []).filter(m => m.type !== 'video');
      return `
      <div class="package-view-card" data-cake-i="${ci}">
        <h4>${escapeHtml(c.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(c.category)}</span></h4>
        ${c.description ? `<div>${escapeHtml(c.description)}</div>` : ''}
        ${c.tiers ? `<div><strong>Tiers:</strong> ${escapeHtml(c.tiers)}</div>` : ''}
        ${c.serves ? `<div><strong>Serves:</strong> ${escapeHtml(c.serves)} guests</div>` : ''}
        ${c.flavors && c.flavors.length ? `<div><strong>Flavors:</strong> ${c.flavors.map(escapeHtml).join(', ')}</div>` : ''}
        ${c.fillings && c.fillings.length ? `<div><strong>Fillings:</strong> ${c.fillings.map(escapeHtml).join(', ')}</div>` : ''}
        ${c.decorationStyles && c.decorationStyles.length ? `<div><strong>Decoration Style:</strong> ${c.decorationStyles.map(escapeHtml).join(', ')}</div>` : ''}
        <div><strong>Availability:</strong> ${escapeHtml(c.availability || '—')}</div>
        ${c.price ? `<div><strong>Price:</strong> $${escapeHtml(c.price)}</div>` : ''}
        ${photos.length ? `
          <div class="cake-360-preview" data-cake-i="${ci}" style="text-align:center;margin-top:0.6rem;">
            <img loading="lazy" decoding="async" class="cake-360-image" src="${photos[0].src}" alt="${escapeHtml(c.name)} preview" style="max-width:200px;border-radius:8px;">
            <div style="margin-top:0.4rem;">
              <button type="button" class="btn btn-outline btn-sm cake-360-prev">◀ Rotate</button>
              <button type="button" class="btn btn-outline btn-sm cake-360-next">Rotate ▶</button>
            </div>
            <p style="font-size:0.75rem;color:#999;margin-top:0.3rem;">360° Preview — browse through uploaded angles</p>
          </div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.cake-360-preview').forEach(container => {
      const cake = filtered[Number(container.dataset.cakeI)];
      const photos = (cake.media || []).filter(m => m.type !== 'video');
      let index = 0;
      const img = container.querySelector('.cake-360-image');
      function updatePreviewImg() { if (photos.length) img.src = photos[index].src; }
      container.querySelector('.cake-360-prev').addEventListener('click', () => {
        index = (index - 1 + photos.length) % photos.length;
        updatePreviewImg();
      });
      container.querySelector('.cake-360-next').addEventListener('click', () => {
        index = (index + 1) % photos.length;
        updatePreviewImg();
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

function renderRestaurantMenuTab(username) {
  const dishes = getLS(vfKey(username, 'restaurantMenu'), []);
  const filterSelect = document.getElementById('profileRestaurantMenuFilterCategory');
  const categories = Array.from(new Set(dishes.map(d => d.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? dishes.filter(d => d.category === filter) : dishes;
    const grid = document.getElementById('profileRestaurantMenu');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No dishes on the menu yet.</p>'; return; }
    grid.innerHTML = filtered.map(d => `
      <div class="package-view-card">
        <h4>${escapeHtml(d.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(d.category)}</span></h4>
        ${d.picture ? `<img loading="lazy" decoding="async" src="${d.picture}" alt="${escapeHtml(d.name)}" style="max-width:100%;border-radius:8px;margin:0.4rem 0;">` : ''}
        ${d.ingredients ? `<div><strong>Ingredients:</strong> ${escapeHtml(d.ingredients)}</div>` : ''}
      </div>
    `).join('');
  }

  filterSelect.onchange = renderList;
  renderList();
}

// Wedding Entertainment vendors list their bookable acts/activities with
// full details, so couples can browse before choosing which one to reserve
// at booking time.
function renderEntertainmentServicesTab(username) {
  const services = getLS(vfKey(username, 'entertainmentServices'), []);
  const filterSelect = document.getElementById('profileEntertainmentServicesFilterType');
  const types = Array.from(new Set(services.map(s => s.type))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Types</option>' + types.map(t => `<option>${escapeHtml(t)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? services.filter(s => s.type === filter) : services;
    const grid = document.getElementById('profileEntertainmentServices');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No services listed yet.</p>'; return; }
    grid.innerHTML = filtered.map(s => `
      <div class="package-view-card">
        <h4>${escapeHtml(s.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(s.type)}</span></h4>
        ${s.picture ? `<img loading="lazy" decoding="async" src="${s.picture}" alt="${escapeHtml(s.name)}" style="max-width:100%;border-radius:8px;margin:0.4rem 0;">` : ''}
        ${s.description ? `<p>${escapeHtml(s.description)}</p>` : ''}
        <div class="meta">${s.duration ? `⏱️ ${escapeHtml(s.duration)}` : ''} ${s.ageGroup ? `· 👪 ${escapeHtml(s.ageGroup)}` : ''} ${s.numberOfPerformers ? `· 🧑‍🎤 ${escapeHtml(s.numberOfPerformers)} performer${Number(s.numberOfPerformers) === 1 ? '' : 's'}` : ''}</div>
        ${s.equipmentIncluded ? `<div><strong>Equipment Included:</strong> ${escapeHtml(s.equipmentIncluded)}</div>` : ''}
      </div>
    `).join('');
  }

  filterSelect.onchange = renderList;
  renderList();
}

// Restaurants get a read-only "Virtual Tour" gallery on the Overview tab —
// a photo/video walkthrough of the space, since a real interactive 3D/AR
// tour isn't feasible in a static localStorage app.
function renderVirtualTourCard(username) {
  const profile = getLS(vfKey(username, 'profile'), {});
  const media = profile.virtualTour || [];
  const card = document.getElementById('profileVirtualTourCard');
  card.classList.toggle('hidden', !media.length);
  if (!media.length) return;
  document.getElementById('profileVirtualTourGrid').innerHTML = media.map((m, i) =>
    m.type === 'video' ? `<video src="${m.src}" controls style="width:100%;border-radius:8px;"></video>` : `<img loading="lazy" decoding="async" src="${m.src}" alt="Virtual tour photo ${i + 1}" style="width:100%;border-radius:8px;">`
  ).join('');
}

// Florists & Decor: showcase of previously completed wedding decor
// projects — mirrors the vendor dashboard's "Previous Wedding Projects" tool.
function renderWeddingProjectsCard(username, key, heading) {
  const projects = getLS(vfKey(username, key || 'weddingProjects'), []);
  const card = document.getElementById('profileWeddingProjectsCard');
  card.querySelector('h3').textContent = heading || 'Previous Wedding Projects';
  card.classList.toggle('hidden', !projects.length);
  if (!projects.length) return;
  document.getElementById('profileWeddingProjectsList').innerHTML = projects.map((p, pi) => `
    <div style="margin-bottom:1.4rem;">
      <h4 style="margin-bottom:0.3rem;">${escapeHtml(p.title)}</h4>
      <p class="meta">${p.venue ? `📍 ${escapeHtml(p.venue)}` : ''} ${p.date ? `· ${escapeHtml(p.date)}` : ''}</p>
      ${p.description ? `<p style="color:#555;">${escapeHtml(p.description)}</p>` : ''}
      <div class="gallery-grid-view" data-project-i="${pi}">
        ${(p.photos || []).map((src, i) => `<img loading="lazy" decoding="async" src="${src}" alt="${escapeHtml(p.title)} photo ${i + 1}" data-i="${i}" class="project-media">`).join('') || ''}
      </div>
    </div>
  `).join('');
  document.querySelectorAll('[data-project-i]').forEach(grid => {
    const project = projects[Number(grid.dataset.projectI)];
    const media = (project.photos || []).map(src => ({ type: 'image', src }));
    grid.querySelectorAll('.project-media').forEach(el => {
      el.addEventListener('click', () => openLightbox(media[Number(el.dataset.i)]));
    });
  });
}

// Read-only versions of the venue's Interactive Venue Map and Table Seating
// Planner — no dragging or editing, just a preview so couples can see the
// layout before booking.
const VENUE_MAP_MARKER_ICONS = { table: '🍽️', stage: '🎤', bar: '🍸', dancefloor: '💃', entrance: '🚪' };
const VENUE_TABLE_SHAPES = {
  round: { w: 90, h: 90, radius: '50%', label: 'Round' },
  square: { w: 80, h: 80, radius: '8px', label: 'Square' },
  rectangle: { w: 120, h: 70, radius: '8px', label: 'Rectangle' },
  long: { w: 160, h: 50, radius: '8px', label: 'Long' },
};

function renderVenueLayoutCards(username) {
  const mapData = getLS(vfKey(username, 'venueMap'), { background: '', markers: [] });
  const mapCard = document.getElementById('profileVenueMapCard');
  const hasMap = mapData.background || (mapData.markers && mapData.markers.length);
  mapCard.classList.toggle('hidden', !hasMap);
  if (hasMap) {
    const canvas = document.getElementById('profileVenueMapCanvas');
    canvas.style.backgroundImage = mapData.background ? `url(${mapData.background})` : '';
    canvas.innerHTML = (mapData.markers || []).map(m => `
      <div style="position:absolute;left:${m.x}%;top:${m.y}%;transform:translate(-50%,-50%);text-align:center;">
        <div style="font-size:1.8rem;line-height:1;">${VENUE_MAP_MARKER_ICONS[m.type] || '📍'}</div>
        ${m.label ? `<div style="font-size:0.7rem;background:rgba(255,255,255,0.85);border-radius:4px;padding:1px 4px;">${escapeHtml(m.label)}</div>` : ''}
      </div>
    `).join('');
  }

  const tables = getLS(vfKey(username, 'venueTables'), []);
  const seatingCard = document.getElementById('profileVenueSeatingCard');
  seatingCard.classList.toggle('hidden', !tables.length);
  if (tables.length) {
    document.getElementById('profileVenueSeatingLayout').innerHTML = tables.map(t => {
      const shape = VENUE_TABLE_SHAPES[t.shape] || VENUE_TABLE_SHAPES.round;
      return `
      <div style="width:150px;text-align:center;">
        <div style="width:${shape.w}px;height:${shape.h}px;border-radius:${shape.radius};background:var(--primary);color:#fff;display:flex;align-items:center;justify-content:center;margin:0 auto 0.5rem;font-size:0.8rem;font-weight:700;">${escapeHtml(t.seats)} seats</div>
        <p style="margin:0;font-weight:700;font-size:0.9rem;">${escapeHtml(t.label)}</p>
      </div>`;
    }).join('');
  }
}

function renderMenuManagementTab(username) {
  const categoryPhotos = getLS(vfKey(username, 'foodCategoryPhotos'), {});
  const categoriesWithPhotos = FOOD_CATEGORIES.filter(cat => (categoryPhotos[cat] || []).length);
  const catMedia = [];
  document.getElementById('profileFoodCategories').innerHTML = categoriesWithPhotos.length
    ? categoriesWithPhotos.map(cat => (categoryPhotos[cat] || []).map(src => {
        const i = catMedia.length;
        catMedia.push({ type: 'image', src });
        return `<img loading="lazy" decoding="async" src="${src}" alt="${escapeHtml(cat)}" title="${escapeHtml(cat)}" data-i="${i}" class="food-category-photo-media">`;
      }).join('')).join('')
    : '<p style="color:#999;">No food category photos uploaded yet.</p>';
  document.querySelectorAll('.food-category-photo-media').forEach(el => {
    el.addEventListener('click', () => openLightbox(catMedia[Number(el.dataset.i)]));
  });

  const items = getLS(vfKey(username, 'menuItems'), []);
  const filterSelect = document.getElementById('profileMenuFilterCategory');
  const categories = Array.from(new Set(items.map(i => i.category))).filter(Boolean);
  filterSelect.innerHTML = '<option value="">All Categories</option>' + categories.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function renderList() {
    const filter = filterSelect.value;
    const filtered = filter ? items.filter(i => i.category === filter) : items;
    const grid = document.getElementById('profileMenuItems');
    if (!filtered.length) { grid.innerHTML = '<p style="color:#999;">No menu items published yet.</p>'; return; }
    const itemMedia = [];
    grid.innerHTML = filtered.map((item, ii) => {
      const photos = item.photos || [];
      return `
      <div class="package-view-card" data-item-i="${ii}">
        <h4>${escapeHtml(item.name)} <span class="amenity-tag" style="font-size:0.7rem;">${escapeHtml(item.category)}</span></h4>
        <span class="status-pill ${item.availability === 'Available' ? 'approved' : 'rejected'}">${escapeHtml(item.availability)}</span>
        ${item.price ? `<div class="price">$${escapeHtml(item.price)}</div>` : ''}
        ${item.description ? `<div>${escapeHtml(item.description)}</div>` : ''}
        ${item.ingredients && item.ingredients.length ? `<div><strong>Ingredients:</strong> ${item.ingredients.map(escapeHtml).join(', ')}</div>` : ''}
        ${photos.length ? `<div class="gallery-grid-view menu-item-media-grid" data-item-i="${ii}">${photos.map((src, i) => `<img loading="lazy" decoding="async" src="${src}" alt="${escapeHtml(item.name)} photo ${i + 1}" data-i="${i}" class="menu-item-media-item">`).join('')}</div>` : ''}
      </div>`;
    }).join('');

    grid.querySelectorAll('.menu-item-media-grid').forEach(mediaGrid => {
      const item = filtered[Number(mediaGrid.dataset.itemI)];
      const photos = item.photos || [];
      mediaGrid.querySelectorAll('.menu-item-media-item').forEach(el => {
        el.addEventListener('click', () => openLightbox({ type: 'image', src: photos[Number(el.dataset.i)] }));
      });
    });
  }

  filterSelect.onchange = renderList;
  renderList();
}

// ===================================================================
// AVAILABILITY (read-only calendar view)
// ===================================================================
function renderAvailabilityView(username) {
  const calendar = getLS(vfKey(username, 'calendar'), {});
  const year = profileCalendarDate.getFullYear();
  const month = profileCalendarDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const startWeekday = firstDay.getDay();
  const monthName = profileCalendarDate.toLocaleString('default', { month: 'long', year: 'numeric' });

  let cells = '';
  for (let i = 0; i < startWeekday; i++) cells += `<div class="cal-day empty"></div>`;
  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const status = calendar[dateStr] || 'available';
    cells += `<div class="cal-day ${status}">${d}</div>`;
  }

  document.getElementById('profileAvailability').innerHTML = `
    <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:0.8rem;">
      <button class="btn btn-outline btn-sm" id="availPrevBtn">← Prev</button>
      <strong>${monthName}</strong>
      <button class="btn btn-outline btn-sm" id="availNextBtn">Next →</button>
    </div>
    <div class="calendar-grid-view">
      <div class="cal-dow">Sun</div><div class="cal-dow">Mon</div><div class="cal-dow">Tue</div>
      <div class="cal-dow">Wed</div><div class="cal-dow">Thu</div><div class="cal-dow">Fri</div><div class="cal-dow">Sat</div>
      ${cells}
    </div>
    <div class="cal-legend">
      <span>⬜ Available</span><span>▨ Blocked/Reserved/Maintenance (unavailable)</span>
    </div>`;

  document.getElementById('availPrevBtn').addEventListener('click', () => { profileCalendarDate.setMonth(profileCalendarDate.getMonth() - 1); renderAvailabilityView(username); });
  document.getElementById('availNextBtn').addEventListener('click', () => { profileCalendarDate.setMonth(profileCalendarDate.getMonth() + 1); renderAvailabilityView(username); });
}

// ===================================================================
// PROFILE TABS
// ===================================================================
document.querySelectorAll('.profile-tab').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.profile-tab').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    document.querySelectorAll('.profile-panel').forEach(p => p.classList.remove('active'));
    document.getElementById('tab-' + btn.dataset.tab).classList.add('active');
  });
});

// ===================================================================
// MODALS
// ===================================================================
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
document.querySelectorAll('[data-close-modal]').forEach(btn => {
  btn.addEventListener('click', () => closeModal(btn.dataset.closeModal));
});
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });
});

// ===================================================================
// MEDIA LIGHTBOX (full-screen view + save)
// ===================================================================
const lightboxOverlay = document.getElementById('lightboxOverlay');
const lightboxContent = document.getElementById('lightboxContent');
const lightboxSaveBtn = document.getElementById('lightboxSaveBtn');

function openLightbox(media) {
  const ext = media.type === 'video' ? 'mp4' : 'jpg';
  lightboxContent.innerHTML = media.type === 'video'
    ? `<video src="${media.src}" controls autoplay></video>`
    : `<img loading="lazy" decoding="async" src="${media.src}" alt="Full size photo">`;
  lightboxSaveBtn.href = media.src;
  lightboxSaveBtn.download = `forever-begins-${media.type}.${ext}`;
  lightboxSaveBtn.textContent = media.type === 'video' ? '💾 Save Video' : '💾 Save Image';
  lightboxOverlay.classList.remove('hidden');
}
function closeLightbox() {
  lightboxOverlay.classList.add('hidden');
  lightboxContent.innerHTML = '';
}
document.getElementById('lightboxCloseBtn').addEventListener('click', closeLightbox);
lightboxOverlay.addEventListener('click', (e) => { if (e.target === lightboxOverlay) closeLightbox(); });

// ===================================================================
// FAVORITES & WEDDING CHECKLIST (profile sidebar)
// ===================================================================
function updateFavoriteBtn() {
  if (!currentProfileVendor) return;
  const isFav = getLS('fb_customer_favorites', []).includes(currentProfileVendor.username);
  const btn = document.getElementById('favoriteBtn');
  btn.textContent = isFav ? '❤️ Added to Favorites' : '🤍 Add to Favorites';
  btn.classList.toggle('active', isFav);
}
document.getElementById('favoriteBtn').addEventListener('click', () => {
  toggleFavorite(currentProfileVendor.username);
  updateFavoriteBtn();
  const note = document.getElementById('favoriteNote');
  const isFav = getLS('fb_customer_favorites', []).includes(currentProfileVendor.username);
  note.style.color = 'var(--primary)';
  note.textContent = isFav ? 'Added to your favorites!' : 'Removed from favorites.';
  setTimeout(() => note.textContent = '', 2000);
});

// Adds this vendor to the logged-in couple's Wedding Planning checklist
// (the same account/data used on the main site's Wedding Planning dashboard).
document.getElementById('addToChecklistBtn').addEventListener('click', () => {
  const note = document.getElementById('checklistNote');
  const username = localStorage.getItem('fb_currentUser');
  if (!username) {
    note.style.color = '#c0392b';
    note.textContent = 'Please log in to your Wedding Planning dashboard on the main site first.';
    return;
  }
  const dataKey = `fb_data_${username}`;
  const data = getLS(dataKey, {});
  data.checklist = data.checklist || [];
  const taskText = `Contact ${currentProfileVendor.businessName} (${currentProfileVendor.category})`;
  if (data.checklist.some(item => item.text === taskText)) {
    note.style.color = 'var(--primary)';
    note.textContent = 'Already on your checklist!';
    return;
  }
  data.checklist.push({ text: taskText, done: false });
  setLS(dataKey, data);
  note.style.color = 'var(--primary)';
  note.textContent = 'Added to your Wedding Checklist!';
  setTimeout(() => note.textContent = '', 2500);
});

document.getElementById('openMessageBtn').addEventListener('click', () => openModal('messageModal'));
document.getElementById('openAppointmentBtn').addEventListener('click', () => openModal('appointmentModal'));
document.getElementById('openBookingBtn').addEventListener('click', () => openBookingModal());

function openBookingModal(packageName) {
  if (packageName) document.getElementById('bookPackage').value = packageName;
  updateDepositSummary();
  openModal('bookingModal');
}

// ===================================================================
// SEND MESSAGE
// ===================================================================
document.getElementById('messageForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentProfileVendor) return;
  const username = currentProfileVendor.username;
  appendToVendorList(username, 'inquiries', {
    id: Date.now(),
    from: document.getElementById('msgName').value.trim(),
    channel: 'Inbox',
    message: document.getElementById('msgText').value.trim(),
    phone: document.getElementById('msgPhone').value.trim(),
    email: document.getElementById('msgEmail').value.trim(),
    quoteRequested: false,
    status: 'Unread',
    reply: '',
    time: Date.now(),
  });
  pushVendorNotification(username, 'message', `New message from ${document.getElementById('msgName').value.trim()}.`);
  const note = document.getElementById('msgNote');
  note.style.color = 'var(--primary)';
  note.textContent = 'Message sent! The vendor will get back to you soon.';
  e.target.reset();
  setTimeout(() => { closeModal('messageModal'); note.textContent = ''; }, 1800);
});

// ===================================================================
// BOOK APPOINTMENT (free, no payment)
// ===================================================================
document.getElementById('appointmentForm').addEventListener('submit', (e) => {
  e.preventDefault();
  if (!currentProfileVendor) return;
  const username = currentProfileVendor.username;
  const newAppt = {
    id: Date.now(),
    fullName: document.getElementById('apptFullName').value.trim(),
    email: document.getElementById('apptEmail').value.trim(),
    phone: document.getElementById('apptPhone').value.trim(),
    weddingDate: document.getElementById('apptWeddingDate').value,
    apptDate: document.getElementById('apptDate').value,
    apptTime: document.getElementById('apptTime').value,
    purpose: APPOINTMENT_PURPOSES_BY_CATEGORY[currentProfileVendor.category] ? document.getElementById('apptPurpose').value : '',
    dressName: (() => {
      if (currentProfileVendor.category !== 'Bridal Dress Shops') return '';
      const dressSelect = document.getElementById('apptDress');
      const selected = dressSelect.options[dressSelect.selectedIndex];
      return selected ? selected.textContent : '';
    })(),
    status: 'Pending',
    time: Date.now(),
  };
  appendToVendorList(username, 'appointments', newAppt);
  pushVendorNotification(username, 'booking', `New appointment request from ${newAppt.fullName}.`);

  const mine = getLS('fb_my_appointments', []);
  mine.push({ username, apptId: newAppt.id });
  setLS('fb_my_appointments', mine);

  const note = document.getElementById('apptNote');
  note.style.color = 'var(--primary)';
  note.textContent = 'Request sent! The vendor will confirm or decline shortly — track it under "My Appointments".';
  e.target.reset();
  renderMyAppointments(username);
  setTimeout(() => { closeModal('appointmentModal'); note.textContent = ''; }, 2200);
});

function renderMyAppointments(username) {
  const mine = getLS('fb_my_appointments', []).filter(x => x.username === username);
  const appts = getLS(vfKey(username, 'appointments'), []);
  const relevant = mine.map(m => appts.find(a => a.id === m.apptId)).filter(Boolean);
  const list = document.getElementById('myAppointmentsList');
  if (!relevant.length) { list.innerHTML = '<p style="color:#999;font-size:0.85rem;">No appointments requested yet.</p>'; return; }

  list.innerHTML = relevant.map(a => `
    <div class="my-appt-row" data-id="${a.id}">
      <span>${escapeHtml(a.apptDate)} ${escapeHtml(a.apptTime)}<br><span class="status-pill ${a.status.toLowerCase()}">${a.status}</span></span>
      ${a.status === 'Pending' || a.status === 'Confirmed'
        ? `<span><button class="btn btn-outline btn-sm reschedule-my-appt">Reschedule</button> <button class="btn btn-outline btn-sm cancel-my-appt">Cancel</button></span>`
        : ''}
    </div>
  `).join('');

  list.querySelectorAll('.my-appt-row').forEach(row => {
    const id = Number(row.dataset.id);
    const rescheduleBtn = row.querySelector('.reschedule-my-appt');
    if (rescheduleBtn) rescheduleBtn.addEventListener('click', () => {
      const newDate = prompt('New appointment date (YYYY-MM-DD):');
      if (!newDate) return;
      const newTime = prompt('New appointment time (HH:MM):');
      if (!newTime) return;
      const appts = getLS(vfKey(username, 'appointments'), []);
      const a = appts.find(x => x.id === id);
      if (a) { a.apptDate = newDate; a.apptTime = newTime; a.status = 'Pending'; }
      setLS(vfKey(username, 'appointments'), appts);
      pushVendorNotification(username, 'booking', `${a ? a.fullName : 'A couple'} rescheduled their appointment — awaiting reconfirmation.`);
      renderMyAppointments(username);
    });
    const cancelBtn = row.querySelector('.cancel-my-appt');
    if (cancelBtn) cancelBtn.addEventListener('click', () => {
      if (!confirm('Cancel this appointment?')) return;
      const appts = getLS(vfKey(username, 'appointments'), []);
      const a = appts.find(x => x.id === id);
      if (a) a.status = 'Cancelled';
      setLS(vfKey(username, 'appointments'), appts);
      renderMyAppointments(username);
    });
  });
}

// ===================================================================
// RESERVE BY BOOKING (deposit required)
// ===================================================================
// "Number of Guests" only makes sense for venues/DJs/florists — their
// packages scale with a guest range. Photographers, wedding planners and
// makeup artists have no guest-based package field, so it's hidden for them.
function updateBookGuestsFieldForCategory(category) {
  const group = document.getElementById('bookGuestsGroup');
  const label = document.getElementById('bookGuestsLabel');
  const NO_GUESTS_FIELD = ['Photographers & Videographers', 'Wedding Planner', 'Makeup Artists', 'Bridal Stylist', 'Jewelry'];
  if (NO_GUESTS_FIELD.includes(category)) {
    group.classList.add('hidden');
  } else {
    group.classList.remove('hidden');
    label.textContent = 'Number of Guests';
  }
}

// Some categories get an extra "what is this for?" field, since the reason
// behind a request varies a lot by category (a venue visit vs. a food
// tasting vs. a bridal makeup trial) and is worth distinguishing at a
// glance. Each category opts into the field per-modal — a venue only needs
// this on the free appointment request, while a makeup artist wants it on
// both the appointment and the paid booking.
const APPOINTMENT_PURPOSES_BY_CATEGORY = {
  'Wedding Venues': ['See the Location', 'Taste the Food', 'Other'],
  'Makeup Artists': [
    'Consultation', 'Makeup Trial', 'Bridal Makeup', 'Bridesmaids Makeup',
    'Engagement Makeup', 'Party Makeup', 'Photoshoot Makeup', 'Touch-Up Session', 'Other',
  ],
  'Hair Stylists': [
    'Consultation', 'Hair Trial', 'Wedding Day Styling', 'Bridesmaids Styling',
    'Engagement Hairstyle', 'Party Hairstyle', 'Hair Treatment', 'Other',
  ],
  'Bridal Dress Shops': [
    'Consultation', 'Dress Fitting', 'Trial Fitting', 'Final Fitting', 'Pickup/Return', 'Other',
  ],
  'Suit Rental': [
    'New Fitting', 'Consultation', 'Pickup', 'Return', 'Other',
  ],
  'Catering': ['Consultation', 'Taste the Food', 'Other'],
  'Invitation Cards': ['Design Consultation', 'Meeting Request', 'Other'],
  'Bridal Stylist': ['Consultation', 'Other'],
  'Jewelry': ['Consultation', 'Ring Selection', 'Fitting', 'Custom Design', 'Other'],
  'Zaffeh': ['Consultation', 'Performance Show', 'Other'],
  'Cake Designers': ['Consultation', 'Tasting', 'Other'],
  'Restaurants': ['Consultation', 'Visit the Location', 'Other'],
};
const INVITATION_SERVICES = [
  'Custom Invitation Design', 'Digital Invitations', 'Printed Invitations', 'Guest Name Printing',
  'Envelope Design', 'Wedding Stationery', 'QR Code Invitations', 'RSVP Cards',
];
const ZAFFEH_PERFORMANCE_TYPES = [
  'Traditional Lebanese Zaffeh', 'Luxury Zaffeh', 'Oriental Zaffeh', 'Modern Zaffeh',
  'Dabke Performance', 'Drum Show', 'Fire Show (Optional)', 'LED Show',
  'Bride & Groom Entrance', 'Sword Show (Optional)', 'Live Singers', 'Custom Performance',
];
const BOOKING_PURPOSES_BY_CATEGORY = {
  'Makeup Artists': APPOINTMENT_PURPOSES_BY_CATEGORY['Makeup Artists'],
  'Hair Stylists': APPOINTMENT_PURPOSES_BY_CATEGORY['Hair Stylists'],
  'Bridal Dress Shops': APPOINTMENT_PURPOSES_BY_CATEGORY['Bridal Dress Shops'],
  'Invitation Cards': INVITATION_SERVICES,
  'Bridal Stylist': ['Book a Bridal Stylist'],
  'Zaffeh': ZAFFEH_PERFORMANCE_TYPES,
};
function updatePurposeFieldsForCategory(category) {
  const apptOptions = APPOINTMENT_PURPOSES_BY_CATEGORY[category];
  const bookOptions = BOOKING_PURPOSES_BY_CATEGORY[category];
  document.getElementById('apptPurposeGroup').classList.toggle('hidden', !apptOptions);
  if (apptOptions) document.getElementById('apptPurpose').innerHTML = apptOptions.map(p => `<option>${escapeHtml(p)}</option>`).join('');
  document.getElementById('bookPurposeGroup').classList.toggle('hidden', !bookOptions);
  if (bookOptions) document.getElementById('bookPurpose').innerHTML = bookOptions.map(p => `<option>${escapeHtml(p)}</option>`).join('');
}

// Bridal Dress Shops require the bride to say which dress an appointment or
// booking is about, since a shop stocks many distinct dresses.
function populateDressSelect(groupId, selectId, category, username) {
  const isBridalShop = category === 'Bridal Dress Shops';
  document.getElementById(groupId).classList.toggle('hidden', !isBridalShop);
  if (isBridalShop) {
    const dresses = getLS(vfKey(username, 'dresses'), []);
    document.getElementById(selectId).innerHTML = dresses.length
      ? dresses.map(d => `<option value="${d.id}">${escapeHtml(d.name)} (${escapeHtml(d.category)})</option>`).join('')
      : '<option value="">No dresses listed yet — contact the shop directly</option>';
  }
}
function updateApptDressFieldForCategory(category, username) {
  populateDressSelect('apptDressGroup', 'apptDress', category, username);
}
function updateBookDressFieldForCategory(category, username) {
  populateDressSelect('bookDressGroup', 'bookDress', category, username);
}

// Vehicle Rental customers pick which vehicle (or fleet car) they want
// alongside the package itself, since a company may list several vehicles.
function populateVehicleSelect(groupId, selectId, category, username) {
  const isVehicleRental = category === 'Vehicle Rental';
  document.getElementById(groupId).classList.toggle('hidden', !isVehicleRental);
  if (isVehicleRental) {
    const vehicles = getLS(vfKey(username, 'vehicles'), []);
    document.getElementById(selectId).innerHTML = vehicles.length
      ? vehicles.map(v => `<option value="${v.id}">${escapeHtml(v.name)} (${escapeHtml(v.category)})</option>`).join('')
      : '<option value="">No vehicles listed yet — contact the company directly</option>';
  }
}
function updateBookVehicleFieldForCategory(category, username) {
  populateVehicleSelect('bookVehicleGroup', 'bookVehicle', category, username);
}

// Wedding Entertainment customers must pick exactly which service they're
// booking (Face Painting, Magic Show, Photo Booth, etc.) — there's no
// sensible default, so the field is required at submit time.
function updateBookEntertainmentFieldForCategory(category, username) {
  const isEntertainment = category === 'Wedding Entertainment';
  document.getElementById('bookEntertainmentServiceGroup').classList.toggle('hidden', !isEntertainment);
  if (!isEntertainment) return;
  const services = getLS(vfKey(username, 'entertainmentServices'), []);
  const select = document.getElementById('bookEntertainmentService');
  select.innerHTML = services.length
    ? '<option value="">Select a service…</option>' + services.map(s => `<option value="${s.id}">${escapeHtml(s.name)} (${escapeHtml(s.type)})</option>`).join('')
    : '<option value="">No services listed yet — contact the vendor directly</option>';
}

// Jewelry customers pick which specific piece they want to reserve, then —
// since rings, bracelets and necklaces are each sized on a different
// standard scale — a size field tailored to that piece's category.
const JEWELRY_RING_SIZES = ['4', '4.5', '5', '5.5', '6', '6.5', '7', '7.5', '8', '8.5', '9', '9.5', '10', '10.5', '11', '11.5', '12', '12.5', '13'];
const JEWELRY_BRACELET_SIZES = ['6"', '6.5"', '7"', '7.5"', '8"', '8.5"', '9"'];
const JEWELRY_NECKLACE_SIZES = ['14"', '16"', '18"', '20"', '22"', '24"'];
const JEWELRY_RING_CATEGORIES = ['Engagement Rings', 'Wedding Rings'];

function updateBookJewelrySizeField(items) {
  const itemSelect = document.getElementById('bookJewelryItem');
  const sizeGroup = document.getElementById('bookJewelrySizeGroup');
  const sizeSelect = document.getElementById('bookJewelrySize');
  const sizeLabel = document.getElementById('bookJewelrySizeLabel');
  const item = items.find(j => String(j.id) === itemSelect.value);
  const category = item ? item.category : '';
  const sizes = JEWELRY_RING_CATEGORIES.includes(category) ? JEWELRY_RING_SIZES
    : category === 'Bracelets' ? JEWELRY_BRACELET_SIZES
    : category === 'Necklaces' ? JEWELRY_NECKLACE_SIZES : null;
  sizeGroup.classList.toggle('hidden', !sizes);
  if (sizes) {
    sizeLabel.textContent = JEWELRY_RING_CATEGORIES.includes(category) ? 'Ring Size' : category === 'Bracelets' ? 'Bracelet Size' : 'Necklace Length';
    sizeSelect.innerHTML = sizes.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  }
}

function updateBookJewelryFieldForCategory(category, username) {
  const isJewelry = category === 'Jewelry';
  document.getElementById('bookJewelryGroup').classList.toggle('hidden', !isJewelry);
  document.getElementById('bookJewelrySizeGroup').classList.toggle('hidden', true);
  if (!isJewelry) return;
  const items = getLS(vfKey(username, 'jewelryItems'), []);
  const itemSelect = document.getElementById('bookJewelryItem');
  itemSelect.innerHTML = items.length
    ? items.map(j => `<option value="${j.id}">${escapeHtml(j.name)} (${escapeHtml(j.category)})</option>`).join('')
    : '<option value="">No jewelry listed yet — contact the shop directly</option>';
  itemSelect.onchange = () => updateBookJewelrySizeField(items);
  updateBookJewelrySizeField(items);
}

// Cake Designers customers pick a category, a specific cake from that
// category, which services they need, up to 3 flavor and 3 filling
// choices, and a decoration style — the flavor/filling/decoration options
// narrow to whatever that specific cake actually offers once one is chosen.
function updateBookCakeFlavorFillingFields(cakes) {
  const itemSelect = document.getElementById('bookCakeItem');
  const cake = cakes.find(c => String(c.id) === itemSelect.value);
  const flavors = (cake && cake.flavors && cake.flavors.length) ? cake.flavors : CAKE_FLAVORS;
  const fillings = (cake && cake.fillings && cake.fillings.length) ? cake.fillings : CAKE_FILLINGS;
  const decorations = (cake && cake.decorationStyles && cake.decorationStyles.length) ? cake.decorationStyles : CAKE_DECORATION_STYLES;
  ['bookCakeFlavor1', 'bookCakeFlavor2', 'bookCakeFlavor3'].forEach(id => {
    document.getElementById(id).innerHTML = '<option value="">None</option>' + flavors.map(f => `<option>${escapeHtml(f)}</option>`).join('');
  });
  ['bookCakeFilling1', 'bookCakeFilling2', 'bookCakeFilling3'].forEach(id => {
    document.getElementById(id).innerHTML = '<option value="">None</option>' + fillings.map(f => `<option>${escapeHtml(f)}</option>`).join('');
  });
  document.getElementById('bookCakeDecorationStyle').innerHTML = decorations.map(s => `<option>${escapeHtml(s)}</option>`).join('');
}

function updateBookCakeFieldForCategory(category, username) {
  const isCakeDesigner = category === 'Cake Designers';
  ['bookCakeCategoryGroup', 'bookCakeServicesGroup', 'bookCakeFlavorsGroup', 'bookCakeFlavor3Group', 'bookCakeFillingsGroup', 'bookCakeFilling3Group'].forEach(id => {
    document.getElementById(id).classList.toggle('hidden', !isCakeDesigner);
  });
  if (!isCakeDesigner) return;

  document.getElementById('bookCakeServicesGrid').innerHTML = CAKE_DESIGNER_SERVICES.map(s => `
    <label class="amenity-item"><input type="checkbox" value="${s}" class="book-cake-service-check"> ${s}</label>
  `).join('');

  const cakes = getLS(vfKey(username, 'cakes'), []);
  const categorySelect = document.getElementById('bookCakeCategory');
  const itemSelect = document.getElementById('bookCakeItem');
  categorySelect.innerHTML = '<option value="">All Categories</option>' + CAKE_CATEGORIES.map(c => `<option>${escapeHtml(c)}</option>`).join('');

  function populateItemSelect() {
    const filter = categorySelect.value;
    const filtered = filter ? cakes.filter(c => c.category === filter) : cakes;
    itemSelect.innerHTML = filtered.length
      ? filtered.map(c => `<option value="${c.id}">${escapeHtml(c.name)} (${escapeHtml(c.category)})</option>`).join('')
      : '<option value="">No cakes listed yet — contact the designer directly</option>';
    updateBookCakeFlavorFillingFields(cakes);
  }
  categorySelect.onchange = populateItemSelect;
  itemSelect.onchange = () => updateBookCakeFlavorFillingFields(cakes);
  populateItemSelect();
}

function populateBookingForm(username, packages) {
  updateBookGuestsFieldForCategory(currentProfileVendor.category);

  const pkgSelect = document.getElementById('bookPackage');
  pkgSelect.innerHTML = packages.length
    ? packages.map(p => `<option value="${escapeHtml(p.name)}" data-price="${p.price}">${escapeHtml(p.name)} — $${escapeHtml(p.price)}</option>`).join('')
    : `<option value="">No packages available — contact the vendor</option>`;

  const foodmenu = getLS(vfKey(username, 'foodmenu'), []);
  const foodSelect = document.getElementById('bookFoodMenu');
  foodSelect.innerHTML = '<option value="">None</option>' + foodmenu.map(m =>
    `<option value="${escapeHtml(m.name)}" data-price="${m.pricePerPerson}">${escapeHtml(m.name)} — $${escapeHtml(m.pricePerPerson)}/person</option>`
  ).join('');
  document.getElementById('bookFoodMenuGroup').classList.toggle('hidden', !foodmenu.length);

  const settings = getLS(vfKey(username, 'settings'), {});
  const availableMethods = (settings.paymentMethods && settings.paymentMethods.length) ? settings.paymentMethods : ['OMT', 'Whish Money', 'Western Union', 'Credit/Debit Card'];
  document.getElementById('bookPaymentMethod').innerHTML = availableMethods.map(m => `<option>${escapeHtml(m)}</option>`).join('');

  const policyBox = document.getElementById('policyBox');
  policyBox.innerHTML = `
    <strong>Cancellation Policy:</strong> ${escapeHtml(settings.cancellationPolicy || 'Not specified by vendor — contact them directly.')}<br>
    <strong>Refund Policy:</strong> ${escapeHtml(settings.refundPolicy || 'Not specified by vendor — contact them directly.')}
  `;

  renderBookingAddons(packages);
  updateZaffehPackageFields(packages);

  pkgSelect.addEventListener('change', () => { renderBookingAddons(packages); updateDepositSummary(); updateZaffehPackageFields(packages); });
  foodSelect.addEventListener('change', updateDepositSummary);
  document.getElementById('bookGuests').addEventListener('input', updateDepositSummary);
  document.getElementById('bookPhone').addEventListener('input', updateDepositSummary);
  document.getElementById('bookCouponCode').addEventListener('input', updateDepositSummary);
  document.getElementById('bookPaymentMethod').addEventListener('change', updatePaymentMethodDisplay);

  updatePaymentMethodDisplay();
  updateDepositSummary();
}

// Zaffeh packages let a couple pick their preferred entrance style and
// entrance song from whatever options the vendor listed on that specific
// package — re-populated whenever the chosen package changes.
function updateZaffehPackageFields(packages) {
  const isZaffeh = currentProfileVendor && currentProfileVendor.category === 'Zaffeh';
  const styleGroup = document.getElementById('bookEntranceStyleGroup');
  const musicGroup = document.getElementById('bookMusicSelectionGroup');
  if (!isZaffeh) {
    styleGroup.classList.add('hidden');
    musicGroup.classList.add('hidden');
    return;
  }
  const pkgSelect = document.getElementById('bookPackage');
  const pkg = packages.find(p => p.name === pkgSelect.value);
  const styles = (pkg && pkg.entranceStyles) || [];
  const music = (pkg && pkg.musicOptions) || [];
  styleGroup.classList.toggle('hidden', !styles.length);
  if (styles.length) document.getElementById('bookEntranceStyle').innerHTML = styles.map(s => `<option>${escapeHtml(s)}</option>`).join('');
  musicGroup.classList.toggle('hidden', !music.length);
  if (music.length) document.getElementById('bookMusicSelection').innerHTML = music.map(s => `<option>${escapeHtml(s)}</option>`).join('');
}

function renderBookingAddons(packages) {
  const pkgSelect = document.getElementById('bookPackage');
  const pkg = packages.find(p => p.name === pkgSelect.value);
  const structuredAddons = ((pkg && pkg.addons) || []).filter(a => a && typeof a === 'object');
  const group = document.getElementById('bookAddonsGroup');
  group.classList.toggle('hidden', !structuredAddons.length);
  document.getElementById('bookAddonsList').innerHTML = structuredAddons.map(a => `
    <label style="display:flex;align-items:center;gap:0.5rem;margin-bottom:0.4rem;font-size:0.9rem;">
      <input type="checkbox" class="booking-addon-check" data-price="${a.price}" value="${escapeHtml(a.name)}"> ${escapeHtml(a.name)} (+$${escapeHtml(a.price)})
    </label>
  `).join('');
  document.querySelectorAll('.booking-addon-check').forEach(cb => cb.addEventListener('change', updateDepositSummary));
}

function calculateOrderTotal(username, packages) {
  const pkgSelect = document.getElementById('bookPackage');
  const selectedOption = pkgSelect.options[pkgSelect.selectedIndex];
  const packagePrice = selectedOption ? Number(selectedOption.dataset.price) || 0 : 0;

  const foodSelect = document.getElementById('bookFoodMenu');
  const foodOption = foodSelect.options[foodSelect.selectedIndex];
  const foodPricePerPerson = foodOption ? Number(foodOption.dataset.price) || 0 : 0;
  const guests = Number(document.getElementById('bookGuests').value) || 0;
  const foodTotal = foodPricePerPerson * guests;

  const addonsTotal = Array.from(document.querySelectorAll('.booking-addon-check:checked'))
    .reduce((s, cb) => s + Number(cb.dataset.price || 0), 0);

  const subtotal = packagePrice + foodTotal + addonsTotal;
  const phone = document.getElementById('bookPhone').value;
  const win = findApplicableSpinWin(phone, currentProfileVendor.category, 'discount');
  const discountAmount = win ? Math.round(subtotal * win.percent) / 100 : 0;
  const freebie = findApplicableSpinWin(phone, currentProfileVendor.category, 'freebie');

  const couponInput = document.getElementById('bookCouponCode');
  const sponsor = couponInput ? findSponsorCoupon(couponInput.value) : null;
  const couponDiscountAmount = sponsor ? Math.round(subtotal * 10) / 100 : 0;

  return {
    packagePrice, foodTotal, addonsTotal, subtotal, spinWin: win, discountAmount, freebie,
    sponsor, couponDiscountAmount,
    total: subtotal - discountAmount - couponDiscountAmount,
  };
}

// Looks up a Sponsor coupon code across ALL vendors (not just this one) —
// sponsors are individual vendors who bought the Sponsored Service promotion
// and can be redeemed on any booking/reservation site-wide.
function findSponsorCoupon(code) {
  const clean = (code || '').trim().toUpperCase();
  if (!clean) return null;
  const vendors = getLS('fb_vendor_applications', []);
  return vendors.find(v => v.sponsored && v.sponsorCoupon && v.sponsorCoupon.toUpperCase() === clean) || null;
}

// Finds an unused Spin & Win prize (of the given type) for this phone number
// that applies to this vendor's category, or a generic category-free one.
function findApplicableSpinWin(phone, category, type) {
  const digits = (phone || '').replace(/\D/g, '');
  if (!digits) return null;
  const wins = getLS('fb_spin_wins', []);
  return wins.find(w =>
    !w.used && w.type === type &&
    (w.phone || '').replace(/\D/g, '') === digits &&
    (!w.category || w.category === category)
  ) || null;
}
function markSpinWinUsed(winId) {
  const wins = getLS('fb_spin_wins', []);
  const w = wins.find(x => x.id === winId);
  if (w) w.used = true;
  setLS('fb_spin_wins', wins);
}

function updateDepositSummary() {
  if (!currentProfileVendor) return;
  const username = currentProfileVendor.username;
  const packages = getLS(vfKey(username, 'packages'), []);
  const settings = getLS(vfKey(username, 'settings'), {});
  const depositPercent = Number(settings.depositPercent) || 0;
  const { packagePrice, foodTotal, addonsTotal, spinWin, discountAmount, freebie, sponsor, couponDiscountAmount, total } = calculateOrderTotal(username, packages);

  if (!packagePrice) { document.getElementById('depositSummary').innerHTML = 'Select a package to see deposit details.'; return; }

  const deposit = Math.round(total * depositPercent) / 100;
  const remaining = total - deposit;
  const parts = [`Package $${packagePrice}`];
  if (foodTotal) parts.push(`Food menu $${foodTotal}`);
  if (addonsTotal) parts.push(`Add-ons $${addonsTotal}`);
  let html = `${parts.join(' + ')}`;
  if (discountAmount) html += ` − <strong style="color:var(--secondary);">Spin &amp; Win discount ${spinWin.percent}%: -$${discountAmount}</strong>`;
  if (couponDiscountAmount) html += ` − <strong style="color:var(--secondary);">Sponsor coupon discount 10%: -$${couponDiscountAmount}</strong>`;
  const remainingLabel = currentProfileVendor.category === 'Suit Rental' ? 'Remaining balance (rest of the money) due at pickup' : 'Remaining balance due later';
  html += ` = <strong>$${total}</strong> total — Deposit required now (${depositPercent}%): <strong>$${deposit}</strong> — ${remainingLabel}: <strong>$${remaining}</strong>`;
  if (discountAmount) html += `<br>🎉 <span style="color:var(--secondary);">Your ${spinWin.percent}% Spin &amp; Win discount has been applied automatically!</span>`;
  if (freebie) html += `<br>🎁 <span style="color:var(--secondary);">Your "${escapeHtml(freebie.prizeLabel)}" prize will be honored with this booking!</span>`;
  document.getElementById('depositSummary').innerHTML = html;

  const couponNote = document.getElementById('couponNote');
  const couponValue = document.getElementById('bookCouponCode').value.trim();
  if (!couponValue) { couponNote.textContent = ''; }
  else if (sponsor) { couponNote.style.color = 'var(--secondary)'; couponNote.textContent = `✓ Coupon applied — 10% off, courtesy of ${sponsor.businessName}.`; }
  else { couponNote.style.color = '#c0392b'; couponNote.textContent = 'Coupon code not recognized.'; }
}

function updatePaymentMethodDisplay() {
  if (!currentProfileVendor) return;
  const method = document.getElementById('bookPaymentMethod').value;
  const payToBox = document.getElementById('payToNumberBox');
  const refGroup = document.getElementById('transactionRefGroup');
  const cardGroup = document.getElementById('cardFieldsGroup');
  const settings = getLS(vfKey(currentProfileVendor.username, 'settings'), {});

  if (method === 'Credit/Debit Card') {
    payToBox.classList.add('hidden');
    refGroup.classList.add('hidden');
    cardGroup.classList.remove('hidden');
    return;
  }

  cardGroup.classList.add('hidden');
  refGroup.classList.remove('hidden');
  payToBox.classList.remove('hidden');
  const numberByMethod = { 'OMT': settings.omtNumber, 'Whish Money': settings.whishNumber, 'Western Union': settings.westernUnionInfo };
  const numberText = numberByMethod[method];
  payToBox.innerHTML = numberText
    ? `<strong>Pay to (${escapeHtml(method)}):</strong> ${escapeHtml(numberText)}`
    : `<strong>${escapeHtml(method)}:</strong> The vendor hasn't provided a receiving number yet — please contact them directly to arrange payment.`;
}

document.getElementById('bookingForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!currentProfileVendor) return;
  const username = currentProfileVendor.username;
  const isInvitationCards = currentProfileVendor.category === 'Invitation Cards';
  const packages = getLS(vfKey(username, 'packages'), []);
  const pkgSelect = document.getElementById('bookPackage');
  const selectedOption = pkgSelect.options[pkgSelect.selectedIndex];
  const note = document.getElementById('bookNote');
  if (!selectedOption || !selectedOption.value) {
    note.style.color = '#c0392b';
    note.textContent = 'Please select a package.';
    return;
  }

  const isEntertainmentBooking = currentProfileVendor.category === 'Wedding Entertainment';
  const entertainmentServiceSelect = document.getElementById('bookEntertainmentService');
  if (isEntertainmentBooking && !entertainmentServiceSelect.value) {
    note.style.color = '#c0392b';
    note.textContent = 'Please select which entertainment service you would like to book.';
    return;
  }

  const method = document.getElementById('bookPaymentMethod').value;
  const isCard = method === 'Credit/Debit Card';
  if (isCard) {
    const cardDigits = document.getElementById('cardNumber').value.replace(/\D/g, '');
    if (cardDigits.length < 12) {
      note.style.color = '#c0392b';
      note.textContent = 'Please enter a valid card number.';
      return;
    }
  }

  const settings = getLS(vfKey(username, 'settings'), {});
  const depositPercent = Number(settings.depositPercent) || 0;
  const { total, spinWin, discountAmount, freebie, sponsor, couponDiscountAmount } = calculateOrderTotal(username, packages);
  const deposit = Math.round(total * depositPercent) / 100;
  const foodSelect = document.getElementById('bookFoodMenu');
  const addonsSelected = Array.from(document.querySelectorAll('.booking-addon-check:checked')).map(cb => cb.value);

  const newBooking = {
    id: Date.now(),
    coupleName: document.getElementById('bookFullName').value.trim(),
    date: document.getElementById('bookWeddingDate').value,
    package: selectedOption.value,
    foodMenu: foodSelect.value || null,
    guests: document.getElementById('bookGuests').value || null,
    purpose: BOOKING_PURPOSES_BY_CATEGORY[currentProfileVendor.category] ? document.getElementById('bookPurpose').value : '',
    dressName: (() => {
      if (currentProfileVendor.category !== 'Bridal Dress Shops') return '';
      const dressSelect = document.getElementById('bookDress');
      const selected = dressSelect.options[dressSelect.selectedIndex];
      return selected ? selected.textContent : '';
    })(),
    vehicleName: (() => {
      if (currentProfileVendor.category !== 'Vehicle Rental') return '';
      const vehicleSelect = document.getElementById('bookVehicle');
      const selected = vehicleSelect.options[vehicleSelect.selectedIndex];
      return selected ? selected.textContent : '';
    })(),
    jewelryItemName: (() => {
      if (currentProfileVendor.category !== 'Jewelry') return '';
      const jewelrySelect = document.getElementById('bookJewelryItem');
      const selected = jewelrySelect.options[jewelrySelect.selectedIndex];
      return selected ? selected.textContent : '';
    })(),
    jewelrySize: currentProfileVendor.category === 'Jewelry' && !document.getElementById('bookJewelrySizeGroup').classList.contains('hidden')
      ? document.getElementById('bookJewelrySize').value : '',
    entranceStyle: currentProfileVendor.category === 'Zaffeh' && !document.getElementById('bookEntranceStyleGroup').classList.contains('hidden')
      ? document.getElementById('bookEntranceStyle').value : '',
    musicSelection: currentProfileVendor.category === 'Zaffeh' && !document.getElementById('bookMusicSelectionGroup').classList.contains('hidden')
      ? document.getElementById('bookMusicSelection').value : '',
    cakeItemName: (() => {
      if (currentProfileVendor.category !== 'Cake Designers') return '';
      const cakeSelect = document.getElementById('bookCakeItem');
      const selected = cakeSelect.options[cakeSelect.selectedIndex];
      return selected ? selected.textContent : '';
    })(),
    cakeServicesNeeded: currentProfileVendor.category === 'Cake Designers'
      ? Array.from(document.querySelectorAll('.book-cake-service-check:checked')).map(c => c.value) : [],
    cakeFlavors: currentProfileVendor.category === 'Cake Designers'
      ? [document.getElementById('bookCakeFlavor1').value, document.getElementById('bookCakeFlavor2').value, document.getElementById('bookCakeFlavor3').value].filter(Boolean) : [],
    cakeFillings: currentProfileVendor.category === 'Cake Designers'
      ? [document.getElementById('bookCakeFilling1').value, document.getElementById('bookCakeFilling2').value, document.getElementById('bookCakeFilling3').value].filter(Boolean) : [],
    cakeDecorationStyle: currentProfileVendor.category === 'Cake Designers' ? document.getElementById('bookCakeDecorationStyle').value : '',
    purchaseType: currentProfileVendor.category === 'Suit Rental' ? document.getElementById('bookPurchaseType').value : '',
    pickupDate: currentProfileVendor.category === 'Suit Rental' ? document.getElementById('bookPickupDate').value : '',
    quantity: isInvitationCards ? document.getElementById('bookInvitationQuantity').value : '',
    designUpload: isInvitationCards && document.getElementById('bookInvitationDesignUpload').files[0]
      ? await uploadMedia(document.getElementById('bookInvitationDesignUpload').files[0], `vendors/${username}/customerUploads`) : '',
    notes: isInvitationCards ? document.getElementById('bookInvitationNotes').value.trim() : '',
    decorationOptions: currentProfileVendor.category === 'Restaurants'
      ? Array.from(document.querySelectorAll('.book-restaurant-decoration-check:checked')).map(c => c.value) : [],
    eventDetails: currentProfileVendor.category === 'Restaurants' ? document.getElementById('bookRestaurantEventDetails').value.trim() : '',
    entertainmentServiceName: isEntertainmentBooking
      ? entertainmentServiceSelect.options[entertainmentServiceSelect.selectedIndex].textContent : '',
    addons: addonsSelected,
    orderTotal: total,
    // Applied automatically from a Spin & Win prize — locked in once booked,
    // there's no vendor control to remove or cancel it.
    spinDiscount: spinWin ? { percent: spinWin.percent, amount: discountAmount } : null,
    spinFreebie: freebie ? freebie.prizeLabel : null,
    // 10% goes to the sponsor whose coupon was used, as commission — tallied
    // in the admin Sponsors panel by scanning bookings across all vendors.
    couponDiscount: sponsor ? { sponsorCoupon: sponsor.sponsorCoupon, sponsorName: sponsor.businessName, percent: 10, amount: couponDiscountAmount } : null,
    depositAmount: deposit,
    // Card payments are simulated as processed immediately; manual transfer
    // methods stay unconfirmed until the vendor verifies receipt themselves.
    depositPaid: isCard,
    // Invitation Cards orders always start at the beginning of the print
    // pipeline (Pending) regardless of payment method — a paid deposit
    // doesn't skip design approval — unlike other categories, where a card
    // payment confirms the booking outright.
    status: isInvitationCards ? 'Pending' : (isCard ? 'Confirmed' : 'Pending'),
    checkedIn: false,
    customerEmail: document.getElementById('bookEmail').value.trim(),
    customerPhone: document.getElementById('bookPhone').value.trim(),
    paymentMethod: method,
    // The full card number/CVC are never persisted anywhere — only a masked
    // reference is kept for the vendor's records.
    transactionRef: isCard
      ? `Card ending ${document.getElementById('cardNumber').value.replace(/\D/g, '').slice(-4)}`
      : document.getElementById('bookTransactionRef').value.trim(),
    time: Date.now(),
  };
  appendToVendorList(username, 'bookings', newBooking);
  if (spinWin) markSpinWinUsed(spinWin.id);
  if (freebie) markSpinWinUsed(freebie.id);

  if (isCard) {
    appendToVendorList(username, 'payments', {
      id: Date.now() + 1, bookingId: newBooking.id, method: 'Credit/Debit Card',
      amount: deposit, status: 'Completed', isDeposit: true, time: Date.now(),
    });
    pushVendorNotification(username, 'payment', `Card payment of $${deposit} received automatically from ${newBooking.coupleName} — booking confirmed.`);
  } else {
    pushVendorNotification(username, 'booking', `New reservation request from ${newBooking.coupleName} (${newBooking.package}) — awaiting deposit confirmation.`);
  }

  note.style.color = 'var(--primary)';
  note.textContent = isCard
    ? `Payment successful! Your $${deposit} deposit was processed and your booking is confirmed.`
    : `Reservation submitted! Your booking will be confirmed automatically once your $${deposit} deposit is confirmed by the vendor.`;
  e.target.reset();
  renderBookingAddons(packages);
  updatePaymentMethodDisplay();
  updateDepositSummary();
  setTimeout(() => { closeModal('bookingModal'); note.textContent = ''; }, 3000);
});
