import {
  collection,
  doc,
  getCountFromServer,
  getDoc,
  getDocs,
  limit,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { getDownloadURL, ref as storageRef } from 'firebase/storage';
import { auth, db, storage } from './firebase';
import type { AdminDashboardMetrics, RequestedRole, UserDoc, VerificationDoc } from './types';

const ensureFreshAuthToken = async () => {
  if (!auth.currentUser) return;
  await auth.currentUser.getIdToken(true);
};

const countDocuments = async (q: ReturnType<typeof query>) => {
  const snap = await getCountFromServer(q);
  return snap.data().count;
};

const toMillis = (value: unknown) => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value === 'object' && value && 'toMillis' in value && typeof (value as any).toMillis === 'function') {
    try {
      return (value as any).toMillis();
    } catch {
      return 0;
    }
  }
  if (typeof value === 'object' && value && 'seconds' in value) {
    const secs = Number((value as any).seconds ?? 0);
    const nanos = Number((value as any).nanoseconds ?? 0);
    return secs * 1000 + Math.floor(nanos / 1_000_000);
  }
  return 0;
};

export const listPendingVerifications = async () => {
  await ensureFreshAuthToken();
  const withOrder = query(collection(db, 'verifications'), where('status', '==', 'pending'), orderBy('submittedAt', 'desc'));

  try {
    const snap = await getDocs(withOrder);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & VerificationDoc>;
  } catch (e: any) {
    const needsIndex =
      String(e?.code ?? '').includes('failed-precondition') ||
      String(e?.message ?? '').toLowerCase().includes('requires an index') ||
      String(e?.message ?? '').toLowerCase().includes('index is currently building');

    if (!needsIndex) throw e;

    const withoutOrder = query(collection(db, 'verifications'), where('status', '==', 'pending'));
    const snap = await getDocs(withoutOrder);
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & VerificationDoc>;
    rows.sort((a, b) => toMillis(b.submittedAt) - toMillis(a.submittedAt));
    return rows;
  }
};

export const listRecentVerifications = async (maxRows = 8) => {
  await ensureFreshAuthToken();
  const q = query(collection(db, 'verifications'), orderBy('updatedAt', 'desc'), limit(maxRows));
  const snap = await getDocs(q);
  return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & VerificationDoc>;
};

export const getAdminDashboardMetrics = async (): Promise<AdminDashboardMetrics> => {
  await ensureFreshAuthToken();

  const [
    totalUsers,
    totalArtists,
    totalDealers,
    totalPosts,
    totalBookings,
    bookingsPendingPayment,
    bookingsPendingArtistApproval,
    bookingsConfirmed,
    bookingsCompleted,
    bookingsCancelled,
    pendingVerifications,
    approvedVerifications,
    rejectedVerifications,
  ] = await Promise.all([
    countDocuments(query(collection(db, 'users'))),
    countDocuments(query(collection(db, 'users'), where('role', '==', 'artist'))),
    countDocuments(query(collection(db, 'users'), where('role', '==', 'dealer'))),
    countDocuments(query(collection(db, 'posts'))),
    countDocuments(query(collection(db, 'bookings'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'pending_payment'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'pending_artist_approval'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'confirmed'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'completed'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'cancelled'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'pending'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'approved'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'rejected'))),
  ]);

  return {
    totalUsers,
    totalArtists,
    totalDealers,
    totalPosts,
    totalBookings,
    bookingsPendingPayment,
    bookingsPendingArtistApproval,
    bookingsConfirmed,
    bookingsCompleted,
    bookingsCancelled,
    pendingVerifications,
    approvedVerifications,
    rejectedVerifications,
  };
};

export const getVerificationWithUser = async (uid: string) => {
  await ensureFreshAuthToken();
  const [vSnap, uSnap] = await Promise.all([getDoc(doc(db, 'verifications', uid)), getDoc(doc(db, 'users', uid))]);

  return {
    verification: (vSnap.exists() ? ({ uid: vSnap.id, ...(vSnap.data() as any) } as VerificationDoc) : null),
    user: (uSnap.exists() ? ({ uid: uSnap.id, ...(uSnap.data() as any) } as UserDoc) : null),
  };
};

export const getCertificateUrls = async (paths: string[]) => {
  await ensureFreshAuthToken();
  const urls = await Promise.all(
    paths.map(async (p) => {
      const url = await getDownloadURL(storageRef(storage, p));
      return { path: p, url };
    }),
  );
  return urls;
};

const buildPublicProfilePayload = (uid: string, role: RequestedRole, user: UserDoc | null, verification: VerificationDoc) => {
  const displayName = user?.displayName ?? user?.email ?? 'TATZO Pro';
  const locationCity = verification.locationCity ?? user?.locationCity ?? '';
  const locationArea = verification.locationArea ?? user?.locationArea ?? '';

  return {
    uid,
    role,
    displayName,
    studioName: verification.shopName ?? displayName,
    locationCity,
    locationArea,
    location: [locationArea, locationCity].filter(Boolean).join(', '),
    verifiedPro: role === 'artist',
    authorizedSeller: role === 'dealer',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
};

const createNotification = async (uid: string, payload: Record<string, unknown>) => {
  const notificationId = `verification_${Date.now()}`;
  await setDoc(doc(db, 'users', uid, 'notifications', notificationId), {
    id: notificationId,
    toUid: uid,
    read: false,
    createdAt: serverTimestamp(),
    ...payload,
  });
};

export const approveVerification = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  user: UserDoc | null;
  verification: VerificationDoc;
}) => {
  await ensureFreshAuthToken();
  const { uid, requestedRole, adminUid, user, verification } = params;
  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'approved',
    rejectReason: '',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      role: requestedRole,
      requestedRole: null,
      verificationStatus: 'approved',
      verificationRejectReason: '',
      verificationUpdatedAt: serverTimestamp(),
      isProfileComplete: true,
      verifiedPro: requestedRole === 'artist',
      authorizedSeller: requestedRole === 'dealer',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const targetCollection = requestedRole === 'artist' ? 'artists' : 'dealers';
  batch.set(doc(db, targetCollection, uid), buildPublicProfilePayload(uid, requestedRole, user, verification), { merge: true });

  await batch.commit();

  await createNotification(uid, {
    type: 'verification_approved',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
  });
};

export const rejectVerification = async (params: {
  uid: string;
  requestedRole: RequestedRole;
  adminUid: string;
  reason: string;
}) => {
  await ensureFreshAuthToken();
  const { uid, adminUid, reason } = params;
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('Reject reason is required.');

  const batch = writeBatch(db);

  batch.update(doc(db, 'verifications', uid), {
    status: 'rejected',
    rejectReason: cleanReason,
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  batch.set(
    doc(db, 'users', uid),
    {
      role: 'user',
      verificationStatus: 'rejected',
      verificationRejectReason: cleanReason,
      verificationUpdatedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await createNotification(uid, {
    type: 'verification_rejected',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    reason: cleanReason,
  });
};

export const rollbackToPending = async (uid: string, adminUid: string) => {
  await ensureFreshAuthToken();
  await updateDoc(doc(db, 'verifications', uid), {
    status: 'pending',
    reviewedBy: adminUid,
    reviewedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
};
