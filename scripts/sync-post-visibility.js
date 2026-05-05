/*
Usage:
  node scripts/sync-post-visibility.js --all
  node scripts/sync-post-visibility.js --artist <artistUid>

Requires:
  FIREBASE_SERVICE_ACCOUNT=/path/to/service-account.json
  Optional FIREBASE_PROJECT_ID
*/

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');

const args = process.argv.slice(2);
const allMode = args.includes('--all') || args.length === 0;
const artistIndex = args.indexOf('--artist');
const artistUid = artistIndex >= 0 ? String(args[artistIndex + 1] || '').trim() : '';

if (!allMode && !artistUid) {
  console.error('Provide --all or --artist <uid>.');
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

const db = admin.firestore();
const PAGE_SIZE = 300;
const MAX_BATCH_WRITES = 400;

const resolveArtistFlags = async (uid, cache) => {
  const safeUid = String(uid || '').trim();
  if (!safeUid) {
    return { artistApproved: false, artistVisible: false };
  }

  if (cache.has(safeUid)) return cache.get(safeUid);

  try {
    const snap = await db.collection('artists').doc(safeUid).get();
    if (!snap.exists) {
      const flags = { artistApproved: false, artistVisible: false };
      cache.set(safeUid, flags);
      return flags;
    }

    const data = snap.data() || {};
    const flags = {
      artistApproved: String(data.verificationStatus || '') === 'approved',
      artistVisible: data.isVisible === true,
    };
    cache.set(safeUid, flags);
    return flags;
  } catch {
    const flags = { artistApproved: false, artistVisible: false };
    cache.set(safeUid, flags);
    return flags;
  }
};

(async () => {
  const cache = new Map();
  let totalSeen = 0;
  let totalUpdated = 0;
  let totalSkipped = 0;
  let page = 0;

  let cursor = null;

  while (true) {
    let q = db.collection('posts').orderBy(admin.firestore.FieldPath.documentId()).limit(PAGE_SIZE);
    if (artistUid) {
      q = db
        .collection('posts')
        .where('artistUid', '==', artistUid)
        .orderBy(admin.firestore.FieldPath.documentId())
        .limit(PAGE_SIZE);
    }
    if (cursor) {
      q = q.startAfter(cursor);
    }

    const snap = await q.get();
    if (snap.empty) break;

    page += 1;
    let batch = db.batch();
    let writes = 0;

    for (const docSnap of snap.docs) {
      totalSeen += 1;
      const data = docSnap.data() || {};
      const uid = String(data.artistUid || '').trim();
      const target = await resolveArtistFlags(uid, cache);

      const currentApproved = data.artistApproved === true;
      const currentVisible = data.artistVisible === true;

      if (currentApproved === target.artistApproved && currentVisible === target.artistVisible) {
        totalSkipped += 1;
        continue;
      }

      batch.update(docSnap.ref, {
        artistApproved: target.artistApproved,
        artistVisible: target.artistVisible,
        lastVisibilitySyncAt: admin.firestore.FieldValue.serverTimestamp(),
      });
      writes += 1;
      totalUpdated += 1;

      if (writes >= MAX_BATCH_WRITES) {
        await batch.commit();
        batch = db.batch();
        writes = 0;
      }
    }

    if (writes > 0) {
      await batch.commit();
    }

    cursor = snap.docs[snap.docs.length - 1];
    console.log(
      `[sync-post-visibility] page=${page} seen=${totalSeen} updated=${totalUpdated} skipped=${totalSkipped}`,
    );

    if (snap.size < PAGE_SIZE) break;
  }

  console.log(
    `[sync-post-visibility] completed mode=${artistUid ? `artist:${artistUid}` : 'all'} seen=${totalSeen} updated=${totalUpdated} skipped=${totalSkipped}`,
  );
})();
