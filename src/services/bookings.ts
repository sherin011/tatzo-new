import {
  Timestamp,
  collection,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import { Linking } from 'react-native';
import Constants from 'expo-constants';
import { auth, db } from '../config/firebaseConfig';
import { getPaymentsServerUrl } from '../config/payments';
import type { AiSkinCheckStatus, BookingStatus, TimeSlotId } from '../types/app';
import { writeNotificationDual } from './notifications';

const SLOT_HOLD_MINUTES = 15;

const buildPaymentReturnUrl = () => {
  const hostUri =
    (Constants.expoConfig as any)?.hostUri ||
    (Constants as any)?.manifest?.debuggerHost ||
    (Constants as any)?.manifest2?.extra?.expoClient?.hostUri;

  if (!hostUri) return 'tatzo://payment';
  const host = String(hostUri);
  return `exp://${host}/--/payment`;
};

const toMillis = (value: any): number => {
  if (!value) return 0;
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  if (typeof value?.toMillis === 'function') return value.toMillis();
  if (typeof value?.seconds === 'number') return value.seconds * 1000 + Math.floor((value.nanoseconds ?? 0) / 1_000_000);
  return 0;
};

const slotLockDocId = (artistUid: string, dateISO: string, slotId: TimeSlotId) => `${artistUid}_${dateISO}_${slotId}`;

const isTerminalStatus = (status: BookingStatus | string | null | undefined) =>
  status === 'confirmed' ||
  status === 'completed' ||
  status === 'cancelled' ||
  status === 'rejected' ||
  status === 'payment_failed' ||
  status === 'payment_timeout';

const isLockActive = (lock: any, nowMs: number) => {
  if (!lock) return false;
  const status = String(lock.status ?? '');
  if (status === 'confirmed') return true;
  if (status !== 'held') return false;
  const expiresAtMs = toMillis(lock.expiresAt);
  return expiresAtMs > nowMs;
};

const resolveArtistUidByIdentity = async (params: { artistUid?: string; artistName: string; artistHandle?: string }) => {
  if (params.artistUid?.trim()) return params.artistUid.trim();

  const byName = query(collection(db, 'artists'), where('displayName', '==', params.artistName), limit(1));
  const byNameSnap = await getDocs(byName);
  if (!byNameSnap.empty) return byNameSnap.docs[0].id;

  if (params.artistHandle?.trim()) {
    const byHandle = query(collection(db, 'artists'), where('handle', '==', params.artistHandle.trim()), limit(1));
    const byHandleSnap = await getDocs(byHandle);
    if (!byHandleSnap.empty) return byHandleSnap.docs[0].id;
  }

  return null;
};

export type CreateBookingInput = {
  artistId: string;
  artistUid?: string;
  artistName: string;
  artistHandle?: string;
  location: string;
  dateISO: string;
  slotId: TimeSlotId;
  startingFrom: number;
  depositAmount: number;
  aiSkinCheckStatus: AiSkinCheckStatus;
  aiRiskScore: number;
  aiSkinCheckNotes: string;
  aiFlagForArtist: boolean;
  skinAnswers?: Record<string, string>;
};

export type UserPayableBooking = {
  id: string;
  artistName: string;
  dateISO: string;
  slotId: TimeSlotId;
  depositAmount: number;
  status: BookingStatus;
};

export const createBooking = async (input: CreateBookingInput) => {
  const user = auth.currentUser;
  if (!user) throw new Error('You must be signed in.');

  const artistUid = await resolveArtistUidByIdentity({
    artistUid: input.artistUid,
    artistName: input.artistName,
    artistHandle: input.artistHandle,
  });

  if (!artistUid) {
    throw new Error('Artist is not onboarded yet. Please choose an onboarded artist.');
  }

  const bookingRef = doc(collection(db, 'bookings'));
  const slotRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, input.dateISO, input.slotId));
  const nowMs = Date.now();
  const expiresAt = Timestamp.fromMillis(nowMs + SLOT_HOLD_MINUTES * 60 * 1000);

  try {
    await runTransaction(db, async (tx) => {
      const slotSnap = await tx.get(slotRef);
      const slotData = slotSnap.exists() ? slotSnap.data() : null;

      if (slotData && isLockActive(slotData, nowMs) && slotData.bookingId !== bookingRef.id) {
        throw new Error('This time slot is already booked. Please choose another slot.');
      }

      tx.set(slotRef, {
        artistUid,
        dateISO: input.dateISO,
        slotId: input.slotId,
        bookingId: bookingRef.id,
        status: 'held',
        expiresAt,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }, { merge: true });

      tx.set(bookingRef, {
        id: bookingRef.id,
        userUid: user.uid,
        userEmail: user.email ?? null,
        userName: user.displayName ?? null,
        artistId: input.artistId,
        artistUid,
        artistName: input.artistName,
        artistHandle: input.artistHandle ?? null,
        location: input.location,
        dateISO: input.dateISO,
        slotId: input.slotId,
        startingFrom: input.startingFrom,
        depositAmount: input.depositAmount,
        currency: 'INR',
        aiSkinCheckStatus: input.aiSkinCheckStatus,
        aiRiskScore: input.aiRiskScore,
        aiSkinCheckNotes: input.aiSkinCheckNotes,
        aiCheckedAt: serverTimestamp(),
        aiFlagForArtist: Boolean(input.aiFlagForArtist),
        skinAnswers: input.skinAnswers ?? {},
        paymentRetryCount: 0,
        status: 'pending_artist_approval' as BookingStatus,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    });
  } catch (error: any) {
    const message = String(error?.message ?? 'Could not create booking.');
    if (message.toLowerCase().includes('already booked')) {
      throw error;
    }
    throw new Error(message);
  }

  await writeNotificationDual({
    id: `booking_requested_${bookingRef.id}`,
    toUid: artistUid,
    fromUid: user.uid,
    fromName: user.displayName ?? user.email ?? 'User',
    type: 'booking_requested',
    title: 'New booking request',
    message: `${user.displayName ?? 'A user'} requested ${input.dateISO} (${input.slotId}).`,
    entityType: 'booking',
    entityId: bookingRef.id,
    bookingId: bookingRef.id,
    dateISO: input.dateISO,
    metadata: {
      slotId: input.slotId,
      aiSkinCheckStatus: input.aiSkinCheckStatus,
      aiRiskScore: input.aiRiskScore,
    },
  });

  return { id: bookingRef.id, alreadyExists: false as const, artistUid };
};

export const listUserPayableBookings = async (uid: string) => {
  const q = query(
    collection(db, 'bookings'),
    where('userUid', '==', uid),
    where('status', 'in', ['artist_approved_payment_pending', 'payment_failed']),
    orderBy('updatedAt', 'desc'),
    limit(20),
  );
  const snap = await getDocs(q);

  return snap.docs.map((row) => {
    const d = row.data() as any;
    return {
      id: row.id,
      artistName: String(d.artistName ?? 'Artist'),
      dateISO: String(d.dateISO ?? ''),
      slotId: (d.slotId ?? 'morning') as TimeSlotId,
      depositAmount: Number(d.depositAmount ?? 249),
      status: d.status as BookingStatus,
    } as UserPayableBooking;
  });
};

export const openRazorpayCheckoutForBooking = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const currentStatus = String(data?.status ?? '') as BookingStatus;
  if (currentStatus !== 'artist_approved_payment_pending' && currentStatus !== 'payment_failed') {
    throw new Error('Payment is not available for this booking yet.');
  }

  const amount = Number(data?.depositAmount ?? 249);
  const user = auth.currentUser;
  const baseUrl = getPaymentsServerUrl();
  const name = encodeURIComponent(user?.displayName ?? 'Tatzo User');
  const email = encodeURIComponent(user?.email ?? '');
  const phone = encodeURIComponent('');
  const returnUrl = encodeURIComponent(buildPaymentReturnUrl());

  const url = `${baseUrl}/pay?bookingId=${encodeURIComponent(bookingId)}&amountRupees=${encodeURIComponent(String(amount))}&name=${name}&email=${email}&phone=${phone}&returnUrl=${returnUrl}`;
  await Linking.openURL(url);
};

const releaseSlotForBooking = async (bookingData: any, nextStatus: 'released' | 'confirmed') => {
  const artistUid = String(bookingData?.artistUid ?? '').trim();
  const dateISO = String(bookingData?.dateISO ?? '').trim();
  const slotId = String(bookingData?.slotId ?? '').trim() as TimeSlotId;
  const bookingId = String(bookingData?.id ?? bookingData?.bookingId ?? '').trim();

  if (!artistUid || !dateISO || !slotId || !bookingId) return;

  const lockRef = doc(db, 'bookingSlots', slotLockDocId(artistUid, dateISO, slotId));
  const lockSnap = await getDoc(lockRef);
  if (!lockSnap.exists()) return;

  const lockData = lockSnap.data() as any;
  if (String(lockData.bookingId ?? '') !== bookingId) return;

  await updateDoc(lockRef, {
    status: nextStatus,
    expiresAt: nextStatus === 'released' ? Timestamp.fromMillis(Date.now() - 1000) : lockData.expiresAt ?? null,
    updatedAt: serverTimestamp(),
  });
};

export const markBookingPaidRazorpay = async (params: {
  bookingId: string;
  orderId: string;
  paymentId: string;
  signature: string;
}) => {
  const { bookingId, orderId, paymentId, signature } = params;

  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const currentStatus = String(data?.status ?? '') as BookingStatus;
  if (currentStatus !== 'artist_approved_payment_pending' && currentStatus !== 'payment_failed') {
    throw new Error('Payment not allowed for this booking status.');
  }

  const amount = Number(data?.depositAmount ?? 249);
  const baseUrl = getPaymentsServerUrl();

  const r = await fetch(`${baseUrl}/api/razorpay/verify`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ orderId, paymentId, signature }),
  });

  const j = (await r.json().catch(() => null)) as any;
  if (!r.ok || !j?.verified) {
    await updateDoc(ref, {
      status: 'payment_failed' as BookingStatus,
      paymentRetryCount: Number(data?.paymentRetryCount ?? 0) + 1,
      updatedAt: serverTimestamp(),
    });
    throw new Error('Payment verification failed.');
  }

  await updateDoc(ref, {
    status: 'confirmed' as BookingStatus,
    reminderCreated: false,
    reminderSentAt: null,
    reminderScheduledFor: data?.dateISO ?? null,
    payment: {
      provider: 'razorpay',
      status: 'paid',
      amount,
      orderId,
      paymentId,
      signature,
      at: serverTimestamp(),
    },
    updatedAt: serverTimestamp(),
  });

  await releaseSlotForBooking({ ...data, id: bookingId }, 'confirmed');

  const toArtistUid = String(data?.artistUid ?? '').trim();
  if (toArtistUid) {
    await writeNotificationDual({
      id: `payment_success_${bookingId}`,
      toUid: toArtistUid,
      fromUid: auth.currentUser?.uid || String(data?.userUid ?? '') || toArtistUid,
      fromName: auth.currentUser?.displayName ?? auth.currentUser?.email ?? 'User',
      type: 'payment_success',
      title: 'Payment Received',
      message: `${data?.userName ?? 'User'} completed payment. Booking confirmed for ${data?.dateISO ?? ''} - ${data?.slotId ?? ''}.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: amount,
    });
  }

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_confirmed_${bookingId}`,
      toUid: toUserUid,
      fromUid: toArtistUid || auth.currentUser?.uid || toUserUid,
      fromName: data?.artistName ?? 'Artist',
      type: 'booking_confirmed',
      title: 'Booking Confirmed',
      message: `Your tattoo booking is confirmed for ${data?.dateISO ?? ''} - ${data?.slotId ?? ''}.`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: amount,
    });
  }
};

export const artistApproveBooking = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (status !== 'pending_artist_approval') {
    throw new Error('Only pending requests can be accepted.');
  }

  await updateDoc(ref, {
    status: 'artist_approved_payment_pending' as BookingStatus,
    artistApprovedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_artist_approved_payment_pending_${bookingId}`,
      toUid: toUserUid,
      fromUid: auth.currentUser?.uid || String(data?.artistUid ?? '') || toUserUid,
      fromName: auth.currentUser?.displayName ?? 'Artist',
      type: 'booking_artist_approved_payment_pending',
      title: 'Artist Approved Your Booking',
      message: 'Your booking is approved. Tap Pay Now to confirm your slot.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
      depositAmount: Number(data?.depositAmount ?? 249),
    });
  }
};

export const artistRejectBooking = async (bookingId: string, reason = '') => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (status !== 'pending_artist_approval' && status !== 'artist_approved_payment_pending') {
    throw new Error('Booking cannot be rejected in this status.');
  }

  await updateDoc(ref, {
    status: 'rejected' as BookingStatus,
    rejectReason: reason.trim() || null,
    updatedAt: serverTimestamp(),
  });

  await releaseSlotForBooking({ ...data, id: bookingId }, 'released');

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_rejected_${bookingId}`,
      toUid: toUserUid,
      fromUid: auth.currentUser?.uid || String(data?.artistUid ?? '') || toUserUid,
      fromName: auth.currentUser?.displayName ?? 'Artist',
      type: 'booking_rejected',
      title: 'Booking rejected',
      message: reason.trim() ? `Reason: ${reason.trim()}` : 'Your booking request was rejected.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      reason: reason.trim() || null,
      dateISO: data?.dateISO ?? null,
    });
  }
};

export const artistCompleteBooking = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (status !== 'confirmed') throw new Error('Only confirmed bookings can be completed.');

  await updateDoc(ref, {
    status: 'completed' as BookingStatus,
    completedAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `booking_completed_${bookingId}`,
      toUid: toUserUid,
      fromUid: auth.currentUser?.uid || String(data?.artistUid ?? '') || toUserUid,
      fromName: auth.currentUser?.displayName ?? 'Artist',
      type: 'booking_confirmed',
      title: 'Session completed',
      message: 'Your tattoo session was marked as completed.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
    });
  }
};

export const cancelBookingByUser = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) throw new Error('Booking not found.');

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (isTerminalStatus(status)) return;

  await updateDoc(ref, {
    status: 'cancelled' as BookingStatus,
    cancelledAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });

  await releaseSlotForBooking({ ...data, id: bookingId }, 'released');

  const toArtistUid = String(data?.artistUid ?? '').trim();
  if (toArtistUid) {
    await writeNotificationDual({
      id: `booking_cancelled_${bookingId}`,
      toUid: toArtistUid,
      fromUid: auth.currentUser?.uid || String(data?.userUid ?? '') || toArtistUid,
      fromName: auth.currentUser?.displayName ?? auth.currentUser?.email ?? 'User',
      type: 'booking_cancelled',
      title: 'Booking cancelled',
      message: `User cancelled booking ${data?.dateISO ?? ''} (${data?.slotId ?? ''}).`,
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
    });
  }
};

export const markPaymentTimeout = async (bookingId: string) => {
  const ref = doc(db, 'bookings', bookingId);
  const snap = await getDoc(ref);
  if (!snap.exists()) return;

  const data = snap.data() as any;
  const status = String(data?.status ?? '') as BookingStatus;
  if (status !== 'artist_approved_payment_pending') return;

  await updateDoc(ref, {
    status: 'payment_timeout' as BookingStatus,
    updatedAt: serverTimestamp(),
  });
  await releaseSlotForBooking({ ...data, id: bookingId }, 'released');

  const toUserUid = String(data?.userUid ?? '').trim();
  if (toUserUid) {
    await writeNotificationDual({
      id: `payment_timeout_${bookingId}`,
      toUid: toUserUid,
      fromUid: String(data?.artistUid ?? '').trim() || auth.currentUser?.uid || toUserUid,
      fromName: data?.artistName ?? 'Artist',
      type: 'booking_cancelled',
      title: 'Payment timed out',
      message: 'Booking payment window expired. You can retry by booking again.',
      entityType: 'booking',
      entityId: bookingId,
      bookingId,
      dateISO: data?.dateISO ?? null,
    });
  }
};

export const subscribeUserPayableBookings = (
  uid: string,
  onRows: (rows: UserPayableBooking[]) => void,
  onError?: (error: Error) => void,
) => {
  const q = query(
    collection(db, 'bookings'),
    where('userUid', '==', uid),
    where('status', 'in', ['artist_approved_payment_pending', 'payment_failed']),
    orderBy('updatedAt', 'desc'),
    limit(20),
  );

  return onSnapshot(
    q,
    (snap) => {
      const rows = snap.docs.map((row) => {
        const d = row.data() as any;
        return {
          id: row.id,
          artistName: String(d.artistName ?? 'Artist'),
          dateISO: String(d.dateISO ?? ''),
          slotId: (d.slotId ?? 'morning') as TimeSlotId,
          depositAmount: Number(d.depositAmount ?? 249),
          status: d.status as BookingStatus,
        };
      });
      onRows(rows);
    },
    (err) => {
      onError?.(err as Error);
    },
  );
};

const todayISO = () => {
  const d = new Date();
  const yyyy = d.getFullYear();
  const mm = `${d.getMonth() + 1}`.padStart(2, '0');
  const dd = `${d.getDate()}`.padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
};

export const createTodayBookingReminders = async (params: { uid: string; role: 'user' | 'artist' }) => {
  const safeUid = String(params.uid ?? '').trim();
  if (!safeUid) return 0;

  const field = params.role === 'artist' ? 'artistUid' : 'userUid';
  const dateISO = todayISO();

  const reminderQuery = query(
    collection(db, 'bookings'),
    where(field, '==', safeUid),
    where('status', '==', 'confirmed'),
    where('dateISO', '==', dateISO),
    limit(30),
  );

  const snap = await getDocs(reminderQuery);
  if (snap.empty) return 0;

  let created = 0;

  for (const row of snap.docs) {
    const bookingId = row.id;

    const reminderPayload = await runTransaction(db, async (tx) => {
      const latest = await tx.get(doc(db, 'bookings', bookingId));
      if (!latest.exists()) return null;
      const d = latest.data() as any;
      if (String(d?.status ?? '') !== 'confirmed') return null;
      if (String(d?.dateISO ?? '') !== dateISO) return null;
      if (d?.reminderCreated === true) return null;

      tx.update(latest.ref, {
        reminderCreated: true,
        reminderSentAt: serverTimestamp(),
        reminderScheduledFor: d?.dateISO ?? dateISO,
        updatedAt: serverTimestamp(),
      });

      return {
        bookingId,
        userUid: String(d?.userUid ?? '').trim(),
        artistUid: String(d?.artistUid ?? '').trim(),
        userName: String(d?.userName ?? 'User').trim() || 'User',
        artistName: String(d?.artistName ?? 'Artist').trim() || 'Artist',
        slotId: String(d?.slotId ?? ''),
        dateISO: String(d?.dateISO ?? dateISO),
      };
    });

    if (!reminderPayload) continue;

    if (reminderPayload.userUid) {
      await writeNotificationDual({
        id: `booking_reminder_user_${bookingId}`,
        toUid: reminderPayload.userUid,
        fromUid: reminderPayload.artistUid || reminderPayload.userUid,
        fromName: reminderPayload.artistName,
        type: 'booking_reminder',
        title: 'Booking Reminder',
        message: `Your tattoo booking is scheduled today for ${reminderPayload.slotId}.`,
        entityType: 'booking',
        entityId: bookingId,
        bookingId,
        dateISO: reminderPayload.dateISO,
        createOnly: true,
      });
    }

    if (reminderPayload.artistUid) {
      await writeNotificationDual({
        id: `booking_reminder_artist_${bookingId}`,
        toUid: reminderPayload.artistUid,
        fromUid: reminderPayload.userUid || reminderPayload.artistUid,
        fromName: reminderPayload.userName,
        type: 'booking_reminder',
        title: 'Booking Reminder',
        message: `You have a confirmed booking with ${reminderPayload.userName} today for ${reminderPayload.slotId}.`,
        entityType: 'booking',
        entityId: bookingId,
        bookingId,
        dateISO: reminderPayload.dateISO,
        createOnly: true,
      });
    }

    created += 1;
  }

  return created;
};
export const migrateLegacyPendingPaymentBookingsForUser = async (uid: string) => {
  const q = query(collection(db, 'bookings'), where('userUid', '==', uid), where('status', '==', 'pending_payment'), limit(50));
  const snap = await getDocs(q);
  if (snap.empty) return 0;

  await Promise.all(
    snap.docs.map((row) =>
      updateDoc(row.ref, {
        status: 'pending_artist_approval' as BookingStatus,
        migratedFromPendingPaymentAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      }),
    ),
  );

  return snap.docs.length;
};


