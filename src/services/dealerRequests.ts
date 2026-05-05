import { doc, getDoc, serverTimestamp, setDoc, writeBatch } from 'firebase/firestore';
import { db } from '../config/firebaseConfig';
import type { DealerRequestStatus } from '../types/app';
import { writeNotificationDual } from './notifications';

export type DealerVerificationDoc = {
  uid: string;
  status: DealerRequestStatus;
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink?: string;
  upiId?: string;
  bankDetails?: string;
  locationCity: string;
  locationArea: string;
  rejectReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

type SubmitDealerRequestInput = {
  uid: string;
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink?: string;
  upiId?: string;
  bankDetails?: string;
  locationCity: string;
  locationArea: string;
  actorName?: string;
};

const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const getDealerRequest = async (uid: string): Promise<DealerVerificationDoc | null> => {
  const snap = await getDoc(doc(db, 'dealerVerifications', uid));
  return snap.exists() ? (snap.data() as DealerVerificationDoc) : null;
};

export const submitDealerRequest = async (input: SubmitDealerRequestInput) => {
  const uid = input.uid.trim();
  if (!uid) throw new Error('Missing uid.');
  if (!input.shopName.trim()) throw new Error('Studio/Shop name is required.');
  if (!input.businessEmail.trim() || !emailPattern.test(input.businessEmail.trim())) throw new Error('Enter a valid email.');
  if (!input.idProof.trim()) throw new Error('Aadhar/PAN is required.');
  if (!input.locationCity.trim() || !input.locationArea.trim()) throw new Error('Location is required.');

  const reqRef = doc(db, 'dealerVerifications', uid);
  const userRef = doc(db, 'users', uid);

  const existing = await getDoc(reqRef);
  const existingStatus = String(existing.data()?.status ?? '') as DealerRequestStatus;
  if (existing.exists() && existingStatus === 'pending') {
    throw new Error('Dealer verification already pending.');
  }

  const now = serverTimestamp();
  const batch = writeBatch(db);

  batch.set(
    reqRef,
    {
      uid,
      status: 'pending' as DealerRequestStatus,
      shopName: input.shopName.trim(),
      businessEmail: input.businessEmail.trim(),
      idProof: input.idProof.trim(),
      portfolioLink: String(input.portfolioLink ?? '').trim(),
      upiId: String(input.upiId ?? '').trim(),
      bankDetails: String(input.bankDetails ?? '').trim(),
      locationCity: input.locationCity.trim(),
      locationArea: input.locationArea.trim(),
      rejectReason: '',
      createdAt: existing.exists() ? existing.data()?.createdAt ?? now : now,
      updatedAt: now,
    },
    { merge: true },
  );

  batch.set(
    userRef,
    {
      dealerRequestStatus: 'pending' as DealerRequestStatus,
      dealerRejectReason: '',
      dealerRequestedAt: now,
      updatedAt: now,
    },
    { merge: true },
  );

  await batch.commit();

  await writeNotificationDual({
    id: `dealer_request_submitted_${uid}`,
    toUid: uid,
    fromUid: uid,
    fromName: input.actorName ?? 'You',
    type: 'dealer_request_submitted',
    title: 'Dealer request submitted',
    message: 'Your dealer application is in review.',
    entityType: 'dealerVerification',
    entityId: uid,
  });
};

