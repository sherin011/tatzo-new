/* eslint-disable no-console */
const fs = require('node:fs');
const path = require('node:path');
const admin = require('firebase-admin');

const [uid, orderIdArg, paymentIdArg, ...noteParts] = process.argv.slice(2);

if (!uid) {
  console.error('Usage: npm run verify-subscription-payment -- <uid> [orderId] [paymentId] [note]');
  process.exit(1);
}

const serviceAccountPath = process.env.FIREBASE_SERVICE_ACCOUNT;
if (!serviceAccountPath) {
  console.error('Set FIREBASE_SERVICE_ACCOUNT to your service account JSON file path.');
  process.exit(1);
}

const resolved = path.resolve(serviceAccountPath);
if (!fs.existsSync(resolved)) {
  console.error(`Service account file not found: ${resolved}`);
  process.exit(1);
}

const serviceAccount = require(resolved);

admin.initializeApp({
  credential: admin.credential.cert(serviceAccount),
  projectId: process.env.FIREBASE_PROJECT_ID || serviceAccount.project_id,
});

const run = async () => {
  const db = admin.firestore();
  const userRef = db.collection('users').doc(uid);
  const subscriptionRef = db.collection('artistSubscriptions').doc(uid);
  const userSnap = await userRef.get();

  if (!userSnap.exists) {
    throw new Error(`users/${uid} not found.`);
  }

  const user = userSnap.data() || {};
  const note = noteParts.join(' ').trim();
  const existingPayment = user.subscriptionPayment || {};
  const paidAtIso = existingPayment.paidAt || new Date().toISOString();
  const orderId = orderIdArg || existingPayment.orderId || null;
  const paymentId = paymentIdArg || existingPayment.paymentId || null;
  const amount = Number(existingPayment.amount || 1499);

  await Promise.all([
    userRef.set(
      {
        subscriptionStatus: 'active',
        subscriptionPaymentStatus: 'paid',
        subscriptionVerificationStatus: 'verified',
        subscriptionLastError: '',
        subscriptionVerificationNote: note || null,
        subscriptionVerificationRequestedAt: null,
        subscriptionPaidAt: admin.firestore.FieldValue.serverTimestamp(),
        subscriptionPayment: {
          provider: 'razorpay',
          orderId,
          paymentId,
          amount,
          paidAt: paidAtIso,
        },
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
    subscriptionRef.set(
      {
        uid,
        planName: 'Tatzo Pro',
        amount,
        billingCycle: 'monthly',
        status: 'active',
        paymentStatus: 'paid',
        renewsAt: admin.firestore.FieldValue.serverTimestamp(),
        updatedAt: admin.firestore.FieldValue.serverTimestamp(),
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    ),
  ]);

  console.log(`Subscription verified for uid=${uid}`);
  console.log(`orderId=${orderId || '-'} paymentId=${paymentId || '-'}`);
};

run()
  .catch((error) => {
    console.error('Subscription verification failed:', error.message);
    process.exit(1);
  })
  .finally(() => {
    void admin.app().delete();
  });
