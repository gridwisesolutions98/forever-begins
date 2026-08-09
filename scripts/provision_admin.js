// One-time admin provisioning script — run manually against a Firebase
// project (dev emulator or real prod project) to create the admin's
// Firebase Auth account (identified by their REAL email, so Forgot
// Password can use Firebase's own sendPasswordResetEmail), the
// `admins/{uid}` doc the security rules check via isAdmin(), and the
// `adminLoginLookup/{username}` doc that resolves "username" to that real
// email before sign-in. Never run automatically by the app itself; uses
// the Admin SDK, which always bypasses rules.
//
// Usage (against the local emulator):
//   FIRESTORE_EMULATOR_HOST=localhost:8080 FIREBASE_AUTH_EMULATOR_HOST=localhost:9099 \
//   node scripts/provision_admin.js demo-forever-begins foreverbeginslb F0reverBeg1n12 hello@foreverbegins.pro
//
// Usage (against a real project — omit the emulator env vars, use a real
// service account by setting GOOGLE_APPLICATION_CREDENTIALS first):
//   node scripts/provision_admin.js <real-project-id> foreverbeginslb <new-password> <real-email>
const { initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getFirestore } = require('firebase-admin/firestore');

const [projectId, username, password, email] = process.argv.slice(2);
if (!projectId || !username || !password || !email) {
  console.error('Usage: node scripts/provision_admin.js <projectId> <username> <password> <email>');
  process.exit(1);
}

initializeApp({ projectId });
const auth = getAuth();
const db = getFirestore();

(async () => {
  let user;
  try {
    user = await auth.getUserByEmail(email);
    await auth.updateUser(user.uid, { password });
    console.log('Existing admin auth account updated:', user.uid);
  } catch (e) {
    user = await auth.createUser({ email, password });
    console.log('Created admin auth account:', user.uid);
  }
  await db.collection('admins').doc(user.uid).set({ username, createdAt: Date.now() });
  console.log('admins/' + user.uid + ' Firestore doc written.');
  await db.collection('adminLoginLookup').doc(username).set({ email });
  console.log('adminLoginLookup/' + username + ' Firestore doc written.');
  process.exit(0);
})().catch(err => { console.error('FATAL:', err); process.exit(1); });
