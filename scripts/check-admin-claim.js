/*
Usage:
  node scripts/check-admin-claim.js <user-email-or-uid>

Requirements:
  1) Set FIREBASE_SERVICE_ACCOUNT env var to service account JSON path
  2) Optional FIREBASE_PROJECT_ID (otherwise from service account)
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const target = process.argv[2];
if (!target) {
  console.error('Usage: node scripts/check-admin-claim.js <user-email-or-uid>');
  process.exit(1);
}

const saPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!saPath) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT to your service account JSON path.');
  process.exit(1);
}

const absolute = path.resolve(saPath);
if (!fs.existsSync(absolute)) {
  console.error('Service account file not found:', absolute);
  process.exit(1);
}

const serviceAccount = JSON.parse(fs.readFileSync(absolute, 'utf8'));

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});

(async () => {
  try {
    let userRecord;
    if (target.includes('@')) {
      userRecord = await admin.auth().getUserByEmail(target);
    } else {
      userRecord = await admin.auth().getUser(target);
    }

    const claims = userRecord.customClaims || {};
    console.log('UID:', userRecord.uid);
    console.log('Email:', userRecord.email || '(none)');
    console.log('Custom Claims:', JSON.stringify(claims, null, 2));
    console.log('Has admin=true:', claims.admin === true);
  } catch (err) {
    console.error('Failed to read user claim:', err.message || err);
    process.exit(1);
  }
})();
