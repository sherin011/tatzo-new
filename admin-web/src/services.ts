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
import type {
  AdminDashboardMetrics,
  DealerVerificationDoc,
  RequestedRole,
  UserDoc,
  VerificationDoc,
} from './types';

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
    pendingDealerVerifications,
    approvedDealerVerifications,
    rejectedDealerVerifications,
  ] = await Promise.all([
    countDocuments(query(collection(db, 'users'))),
    countDocuments(query(collection(db, 'artists'))),
    countDocuments(query(collection(db, 'dealers'))),
    countDocuments(query(collection(db, 'posts'))),
    countDocuments(query(collection(db, 'bookings'))),
    countDocuments(query(collection(db, 'bookings'), where('status', 'in', ['artist_approved_payment_pending', 'payment_failed']))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'pending_artist_approval'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'confirmed'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'completed'))),
    countDocuments(query(collection(db, 'bookings'), where('status', '==', 'cancelled'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'pending'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'approved'))),
    countDocuments(query(collection(db, 'verifications'), where('status', '==', 'rejected'))),
    countDocuments(query(collection(db, 'dealerVerifications'), where('status', '==', 'pending'))),
    countDocuments(query(collection(db, 'dealerVerifications'), where('status', '==', 'approved'))),
    countDocuments(query(collection(db, 'dealerVerifications'), where('status', '==', 'rejected'))),
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
    pendingDealerVerifications,
    approvedDealerVerifications,
    rejectedDealerVerifications,
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

export const listPendingDealerVerifications = async () => {
  await ensureFreshAuthToken();
  const withOrder = query(collection(db, 'dealerVerifications'), where('status', '==', 'pending'), orderBy('updatedAt', 'desc'));
  try {
    const snap = await getDocs(withOrder);
    return snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & DealerVerificationDoc>;
  } catch (e: any) {
    const withoutOrder = query(collection(db, 'dealerVerifications'), where('status', '==', 'pending'));
    const snap = await getDocs(withoutOrder);
    const rows = snap.docs.map((d) => ({ id: d.id, ...(d.data() as any) })) as Array<{ id: string } & DealerVerificationDoc>;
    rows.sort((a, b) => toMillis(b.updatedAt) - toMillis(a.updatedAt));
    return rows;
  }
};

export const getDealerVerificationWithUser = async (uid: string) => {
  await ensureFreshAuthToken();
  const [dSnap, uSnap] = await Promise.all([getDoc(doc(db, 'dealerVerifications', uid)), getDoc(doc(db, 'users', uid))]);

  return {
    dealerVerification: (dSnap.exists() ? ({ uid: dSnap.id, ...(dSnap.data() as any) } as DealerVerificationDoc) : null),
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
  const artistName = user?.artistName ?? displayName;
  const locationCity = verification.locationCity ?? user?.locationCity ?? '';
  const locationArea = verification.locationArea ?? user?.locationArea ?? '';
  const startingPrice = Number((user as any)?.startingPrice ?? 0) || 0;
  const styles = Array.isArray((user as any)?.styles)
    ? (user as any).styles.map((tag: unknown) => String(tag).trim()).filter(Boolean)
    : [];

  return {
    uid,
    role,
    artistName,
    displayName,
    studioName: verification.shopName ?? displayName,
    locationCity,
    locationArea,
    location: [locationArea, locationCity].filter(Boolean).join(', '),
    startingPrice,
    startingFrom: startingPrice,
    experience: String((user as any)?.experience ?? '').trim(),
    bio: String((user as any)?.bio ?? '').trim(),
    styles,
    tags: styles,
    profileImageUrl: String((user as any)?.profileImageUrl ?? '').trim(),
    verificationStatus: 'approved',
    isVisible: true,
    verifiedPro: role === 'artist',
    authorizedSeller: role === 'dealer',
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp(),
  };
};

const writeNotificationDual = async (
  uid: string,
  payload: {
    id?: string;
    fromUid?: string;
    fromName?: string;
    type: string;
    title: string;
    message: string;
    entityType: string;
    entityId: string;
    reason?: string;
  },
) => {
  const notificationId = payload.id || `${payload.type}_${payload.entityId}`;
  const body = {
    id: notificationId,
    toUid: uid,
    fromUid: payload.fromUid ?? null,
    fromName: payload.fromName ?? null,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    entityType: payload.entityType,
    entityId: payload.entityId,
    reason: payload.reason ?? null,
    read: false,
    readAt: null,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  };

  await Promise.all([
    setDoc(doc(db, 'notifications', notificationId), body, { merge: true }),
    setDoc(doc(db, 'users', uid, 'notifications', notificationId), body, { merge: true }),
  ]);
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
  const userWasApprovedArtist = user?.role === 'artist' && user?.verificationStatus === 'approved';
  const shouldResetSubscriptionForNewArtist = requestedRole === 'artist' && !userWasApprovedArtist;
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
      ...(shouldResetSubscriptionForNewArtist
        ? {
            subscriptionStatus: 'inactive',
            subscriptionPaymentStatus: 'idle',
            subscriptionVerificationStatus: 'failed',
            subscriptionVerificationRequestedAt: null,
            subscriptionPaidAt: null,
            subscriptionLastError: '',
            subscriptionPayment: null,
          }
        : {}),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  const targetCollection = requestedRole === 'artist' ? 'artists' : 'dealers';
  batch.set(doc(db, targetCollection, uid), buildPublicProfilePayload(uid, requestedRole, user, verification), { merge: true });

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `verification_approved_${uid}`,
    type: 'verification_approved',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    title: 'Verification approved',
    message: 'Your role verification is approved. Artist dashboard is now unlocked.',
    entityType: 'verification',
    entityId: uid,
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

  await writeNotificationDual(uid, {
    id: `verification_rejected_${uid}`,
    type: 'verification_rejected',
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    title: 'Verification rejected',
    message: 'Your role verification was rejected. Check reason and resubmit.',
    entityType: 'verification',
    entityId: uid,
    reason: cleanReason,
  });
};

export const approveDealerVerification = async (params: {
  uid: string;
  adminUid: string;
  user: UserDoc | null;
  dealerVerification: DealerVerificationDoc;
}) => {
  await ensureFreshAuthToken();
  const { uid, adminUid, user, dealerVerification } = params;
  const batch = writeBatch(db);

  batch.set(
    doc(db, 'dealerVerifications', uid),
    {
      status: 'approved',
      rejectReason: '',
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid),
    {
      dealerRequestStatus: 'approved',
      dealerRejectReason: '',
      authorizedSeller: true,
      // Critical: keep role unchanged (artist stays artist)
      role: user?.role === 'artist' ? 'artist' : user?.role ?? 'artist',
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'dealers', uid),
    {
      uid,
      role: 'dealer',
      displayName: user?.displayName ?? user?.email ?? 'TATZO Dealer',
      studioName: dealerVerification.shopName ?? user?.displayName ?? 'Dealer Studio',
      locationCity: dealerVerification.locationCity ?? user?.locationCity ?? '',
      locationArea: dealerVerification.locationArea ?? user?.locationArea ?? '',
      location: [dealerVerification.locationArea ?? user?.locationArea ?? '', dealerVerification.locationCity ?? user?.locationCity ?? '']
        .filter(Boolean)
        .join(', '),
      authorizedSeller: true,
      updatedAt: serverTimestamp(),
      createdAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `dealer_request_approved_${uid}`,
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    type: 'dealer_request_approved',
    title: 'Dealer request approved',
    message: 'Your dealer request is approved. Artist role remains active.',
    entityType: 'dealerVerification',
    entityId: uid,
  });
};

export const rejectDealerVerification = async (params: {
  uid: string;
  adminUid: string;
  reason: string;
}) => {
  await ensureFreshAuthToken();
  const { uid, adminUid, reason } = params;
  const cleanReason = reason.trim();
  if (!cleanReason) throw new Error('Reject reason is required.');

  const batch = writeBatch(db);

  batch.set(
    doc(db, 'dealerVerifications', uid),
    {
      status: 'rejected',
      rejectReason: cleanReason,
      reviewedBy: adminUid,
      reviewedAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  batch.set(
    doc(db, 'users', uid),
    {
      dealerRequestStatus: 'rejected',
      dealerRejectReason: cleanReason,
      authorizedSeller: false,
      updatedAt: serverTimestamp(),
    },
    { merge: true },
  );

  await batch.commit();

  await writeNotificationDual(uid, {
    id: `dealer_request_rejected_${uid}`,
    fromUid: adminUid,
    fromName: 'TATZO Admin',
    type: 'dealer_request_rejected',
    title: 'Dealer request rejected',
    message: 'Your dealer request was rejected. Check reason and re-apply.',
    entityType: 'dealerVerification',
    entityId: uid,
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
