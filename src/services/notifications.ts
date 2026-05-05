import { deleteDoc, doc, getDoc, serverTimestamp, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { NotificationType } from '../types/app';

export type AppNotificationPayload = {
  id?: string;
  toUid: string;
  fromUid: string | null;
  fromName?: string | null;
  type: NotificationType;
  title: string;
  message: string;
  entityType?: 'booking' | 'post' | 'verification' | 'dealerVerification' | 'follow' | 'inquiry' | 'profile' | 'system';
  entityId?: string | null;
  read?: boolean;
  readAt?: unknown;
  createOnly?: boolean;
  // Keep compatibility with existing notification UI and previous fields.
  bookingId?: string | null;
  dateISO?: string | null;
  proposedDateISO?: string | null;
  depositAmount?: number | null;
  postId?: string | null;
  postPreview?: string | null;
  reason?: string | null;
  metadata?: Record<string, unknown>;
};

const buildNotificationDocId = (input: {
  id?: string;
  type: NotificationType;
  toUid: string;
  fromUid: string | null;
  entityId?: string | null;
}) => {
  if (input.id) return input.id;
  const from = input.fromUid ?? 'system';
  const entity = input.entityId ?? 'na';
  return `${input.type}_${input.toUid}_${from}_${entity}`;
};

export const writeNotificationDual = async (payload: AppNotificationPayload) => {
  const notificationId = buildNotificationDocId({
    id: payload.id,
    type: payload.type,
    toUid: payload.toUid,
    fromUid: payload.fromUid,
    entityId: payload.entityId,
  });

  const globalRef = doc(db, 'notifications', notificationId);
  const userRef = doc(db, 'users', payload.toUid, 'notifications', notificationId);

  const base = {
    id: notificationId,
    toUid: payload.toUid,
    receiverUid: payload.toUid,
    fromUid: payload.fromUid,
    senderUid: payload.fromUid,
    fromName: payload.fromName ?? null,
    senderName: payload.fromName ?? null,
    type: payload.type,
    title: payload.title,
    message: payload.message,
    entityType: payload.entityType ?? 'system',
    entityId: payload.entityId ?? null,
    bookingId: payload.bookingId ?? null,
    dateISO: payload.dateISO ?? null,
    proposedDateISO: payload.proposedDateISO ?? null,
    depositAmount: payload.depositAmount ?? null,
    postId: payload.postId ?? null,
    postPreview: payload.postPreview ?? null,
    reason: payload.reason ?? null,
    metadata: payload.metadata ?? null,
    read: Boolean(payload.read ?? false),
    readAt: payload.read ? payload.readAt ?? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  batch.set(globalRef, { ...base, createdAt: serverTimestamp() }, { merge: true });
  batch.set(userRef, { ...base, createdAt: serverTimestamp() }, { merge: true });

  try {
    await batch.commit();
  } catch (error: any) {
    // createOnly is used to avoid duplicate notifications for like/follow.
    // If sender cannot overwrite an existing doc due rules, ignore safely.
    if (payload.createOnly && String(error?.code ?? '').includes('permission-denied')) {
      return notificationId;
    }
    throw error;
  }

  return notificationId;
};

export const deleteNotificationDual = async (uid: string, notificationId: string) => {
  if (!uid || !notificationId) return;
  const globalRef = doc(db, 'notifications', notificationId);
  const userRef = doc(db, 'users', uid, 'notifications', notificationId);
  await Promise.all([deleteDoc(globalRef).catch(() => {}), deleteDoc(userRef).catch(() => {})]);
};

export const markNotificationReadDual = async (uid: string, notificationId: string, read = true) => {
  if (!uid || !notificationId) return;

  const globalRef = doc(db, 'notifications', notificationId);
  const userRef = doc(db, 'users', uid, 'notifications', notificationId);

  const [globalSnap, userSnap] = await Promise.all([getDoc(globalRef), getDoc(userRef)]);
  const patch = {
    read,
    readAt: read ? serverTimestamp() : null,
    updatedAt: serverTimestamp(),
  };

  const batch = writeBatch(db);
  if (globalSnap.exists()) batch.set(globalRef, patch, { merge: true });
  if (userSnap.exists()) batch.set(userRef, patch, { merge: true });
  if (globalSnap.exists() || userSnap.exists()) {
    await batch.commit();
  }
};
