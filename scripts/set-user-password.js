/*
Usage:
  node scripts/set-user-password.js <user-email-or-uid> <new-password>

Requirements:
  1) Set FIREBASE_SERVICE_ACCOUNT env var to service account JSON path
  2) Optional FIREBASE_PROJECT_ID (otherwise from service account)
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const target = process.argv[2];
const newPassword = process.argv[3];

if (!target || !newPassword) {
  console.error('Usage: node scripts/set-user-password.js <user-email-or-uid> <new-password>');
  process.exit(1);
}

if (newPassword.length < 8) {
  console.error('Password must be at least 8 characters.');
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

    await admin.auth().updateUser(userRecord.uid, { password: newPassword });
    console.log('Password updated successfully for uid:', userRecord.uid);
    console.log('User must sign out and sign in again with the new password.');
  } catch (err) {
    console.error('Failed to update password:', err.message || err);
    process.exit(1);
  }
})();
