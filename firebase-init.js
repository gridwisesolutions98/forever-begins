// Initializes the Firebase app and exposes auth/db/storage globally for
// data-shim.js and the page's application script to use. Loaded first, on
// every HTML page, before firebase-init's sibling scripts.
//
// Picks the project config by hostname: localhost/127.0.0.1 uses the dev
// project and connects to the Firebase Local Emulator Suite (so local
// development and testing never touches a real cloud project); the real
// production domain uses the prod project config.
//
// TODO(real launch): fill in PROD_CONFIG with the real production Firebase
// project's config (Firebase Console > Project Settings > General > Your
// apps > Web app). These are public client-side values, safe to commit.
(function () {
  const isLocal = ['localhost', '127.0.0.1'].includes(location.hostname);

  // Placeholder project id used only to talk to the Local Emulator Suite —
  // the emulators don't validate these values against a real cloud project.
  const DEV_CONFIG = {
    apiKey: 'demo-api-key',
    authDomain: 'demo-forever-begins.firebaseapp.com',
    projectId: 'demo-forever-begins',
    storageBucket: 'demo-forever-begins.appspot.com',
  };
  const PROD_CONFIG = {
    apiKey: 'AIzaSyDtKjrTZP1ioy_sOcxjGqETh5oFH8Fgpis',
    authDomain: 'foreverbegins-f4d0f.firebaseapp.com',
    projectId: 'foreverbegins-f4d0f',
    storageBucket: 'foreverbegins-f4d0f.firebasestorage.app',
    messagingSenderId: '1038682693567',
    appId: '1:1038682693567:web:781bb1e7e05d9d54704b0a',
  };

  const config = isLocal ? DEV_CONFIG : PROD_CONFIG;
  firebase.initializeApp(config);

  const auth = firebase.auth();
  const db = firebase.firestore();
  const storage = firebase.storage();

  if (isLocal) {
    auth.useEmulator('http://localhost:9099', { disableWarnings: true });
    db.useEmulator('localhost', 8080);
    storage.useEmulator('localhost', 9199);
  }

  window.fbAuth = auth;
  window.fbDb = db;
  window.fbStorage = storage;
})();
