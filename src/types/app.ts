import { User } from 'firebase/auth';

export type UserRole = 'user' | 'artist' | 'dealer';
export type RequestedRole = 'artist' | 'dealer';

export type DashboardRouteName = 'UserDashboard' | 'ArtistDashboard' | 'DealerDashboard';

export type RootStackParamList = {
  Login: undefined;
  UserDashboard: undefined;
  ArtistDashboard: undefined;
  DealerDashboard: undefined;
};

export type VerificationStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';
export type TimeSlotId = 'morning' | 'afternoon' | 'evening';
export type DealerRequestStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export type BookingStatus =
  | 'pending_payment' // legacy compatibility
  | 'pending_artist_approval'
  | 'artist_approved_payment_pending'
  | 'confirmed'
  | 'rejected'
  | 'completed'
  | 'cancelled'
  | 'payment_failed'
  | 'payment_timeout'
  | 'reschedule_proposed';

export type AiSkinCheckStatus = 'safe' | 'warning' | 'unsafe' | 'not_checked';

export type NotificationType =
  | 'like'
  | 'follow'
  | 'share'
  | 'inquiry'
  | 'post_created'
  | 'booking_requested'
  | 'booking_rejected'
  | 'booking_artist_approved_payment_pending'
  | 'booking_reminder'
  | 'payment_success'
  | 'booking_confirmed'
  | 'booking_cancelled'
  | 'dealer_request_submitted'
  | 'dealer_request_approved'
  | 'dealer_request_rejected'
  // Legacy notification types kept for compatibility while old docs exist.
  | 'booking_request'
  | 'booking_confirmed'
  | 'booking_declined'
  | 'reschedule_proposed'
  | 'session_completed'
  | 'verification_approved'
  | 'verification_rejected';

export type UserProfile = {
  uid?: string;
  email?: string;
  displayName?: string;
  role?: UserRole;
  setupComplete?: boolean;

  // Location (soft-required; gated for verification)
  locationCity?: string;
  locationArea?: string;

  // Legacy fallback (older docs/components). Keep until migration is complete.
  location?: string;

  bio?: string;
  phone?: string;
  artistName?: string;
  startingPrice?: number;
  experience?: string;
  styles?: string[];
  profileImageUrl?: string;
  createdAt?: unknown;
  updatedAt?: unknown;

  // Verification (Artist/Dealer)
  requestedRole?: RequestedRole | null;
  verificationStatus?: VerificationStatus;
  verificationRejectReason?: string;
  isProfileComplete?: boolean;
  verifiedPro?: boolean;
  authorizedSeller?: boolean;
  verificationUpdatedAt?: unknown;

  // Subscription state
  subscriptionStatus?: 'inactive' | 'active';
  subscriptionPlan?: 'tatzo_pro';
  subscriptionExpiresAt?: unknown;
  subscriptionPaymentStatus?: 'idle' | 'processing' | 'failed' | 'cancelled' | 'paid';
  subscriptionVerificationStatus?: 'pending' | 'verified' | 'failed';
  subscriptionVerificationRequestedAt?: unknown;
  subscriptionPaidAt?: unknown;
  subscriptionLastError?: string;
  subscriptionPayment?: {
    provider?: 'razorpay';
    orderId?: string;
    paymentId?: string;
    amount?: number;
    paidAt?: unknown;
  };

  // Payout setup (placeholder until real Razorpay onboarding)
  payoutStatus?: 'unconfigured' | 'pending' | 'ready';

  // Secondary dealer request while remaining artist.
  dealerRequestStatus?: DealerRequestStatus;
  dealerRejectReason?: string;
  dealerRequestedAt?: unknown;

  // Artist onboarding checklist
  artistOnboarding?: {
    profileDone?: boolean;
    payoutDone?: boolean;
    firstPostDone?: boolean;
    dismissedAt?: unknown;
    updatedAt?: unknown;
  };
};

export type AppSessionState =
  | { status: 'loading' }
  | { status: 'signedOut' }
  | { status: 'needsProfile'; user: User; profile: UserProfile | null }
  | {
      status: 'ready';
      user: User;
      profile: UserProfile & { role: UserRole; setupComplete: true };
      route: DashboardRouteName;
    };

export type BookingModel = {
  id: string;
  userUid: string;
  userEmail?: string | null;
  userName?: string | null;
  artistId?: string;
  artistUid: string;
  artistName: string;
  artistHandle?: string | null;
  location?: string;
  dateISO: string;
  slotId: TimeSlotId;
  startingFrom?: number;
  depositAmount: number;
  currency?: string;
  status: BookingStatus;
  rejectReason?: string | null;
  aiSkinCheckStatus: AiSkinCheckStatus;
  aiRiskScore: number;
  aiSkinCheckNotes: string;
  aiCheckedAt?: unknown;
  aiFlagForArtist: boolean;
  reminderCreated?: boolean;
  reminderSentAt?: unknown;
  reminderScheduledFor?: unknown;
  skinAnswers?: Record<string, string>;
  paymentRetryCount?: number;
  payment?: {
    provider?: 'razorpay';
    status?: 'paid';
    amount?: number;
    orderId?: string;
    paymentId?: string;
    signature?: string;
    at?: unknown;
  };
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type ArtistSubscriptionPaymentStatus = 'idle' | 'processing' | 'failed' | 'cancelled' | 'paid';

export type DealerVerificationDoc = {
  uid: string;
  shopName: string;
  businessEmail: string;
  idProof: string;
  portfolioLink?: string;
  upiId?: string;
  bankDetails?: string;
  locationCity: string;
  locationArea: string;
  status: DealerRequestStatus;
  rejectReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type NotificationDoc = {
  id: string;
  toUid: string;
  fromUid?: string | null;
  fromName?: string | null;
  type: NotificationType;
  title?: string;
  message?: string;
  entityType?: string;
  entityId?: string;
  bookingId?: string;
  postId?: string;
  dateISO?: string;
  proposedDateISO?: string;
  depositAmount?: number;
  reason?: string | null;
  read: boolean;
  readAt?: unknown;
  createdAt?: unknown;
  metadata?: Record<string, unknown>;
};
