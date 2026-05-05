export type RequestedRole = 'artist' | 'dealer';

export type VerificationStatus = 'unsubmitted' | 'pending' | 'approved' | 'rejected';

export type VerificationDoc = {
  uid: string;
  requestedRole: RequestedRole;
  status: VerificationStatus;
  shopName?: string;
  businessEmail?: string;
  idProof?: string;
  portfolioLink?: string;
  certStoragePaths?: string[];
  locationCity?: string;
  locationArea?: string;
  submittedAt?: unknown;
  updatedAt?: unknown;
  reviewedAt?: unknown;
  reviewedBy?: string;
  rejectReason?: string;
};

export type DealerVerificationStatus = 'pending' | 'approved' | 'rejected' | 'unsubmitted';

export type DealerVerificationDoc = {
  uid: string;
  shopName?: string;
  businessEmail?: string;
  idProof?: string;
  portfolioLink?: string;
  upiId?: string;
  bankDetails?: string;
  locationCity?: string;
  locationArea?: string;
  status: DealerVerificationStatus;
  rejectReason?: string;
  createdAt?: unknown;
  updatedAt?: unknown;
};

export type UserDoc = {
  uid?: string;
  email?: string | null;
  displayName?: string | null;
  role?: 'user' | 'artist' | 'dealer';
  requestedRole?: RequestedRole | null;
  verificationStatus?: VerificationStatus;
  verificationRejectReason?: string;
  locationCity?: string;
  locationArea?: string;
  artistName?: string;
  startingPrice?: number;
  experience?: string;
  bio?: string;
  styles?: string[];
  profileImageUrl?: string;
  dealerRequestStatus?: DealerVerificationStatus;
  dealerRejectReason?: string;
  dealerRequestedAt?: unknown;
};

export type AdminDashboardMetrics = {
  totalUsers: number;
  totalArtists: number;
  totalDealers: number;
  totalPosts: number;
  totalBookings: number;
  bookingsPendingPayment: number;
  bookingsPendingArtistApproval: number;
  bookingsConfirmed: number;
  bookingsCompleted: number;
  bookingsCancelled: number;
  pendingVerifications: number;
  approvedVerifications: number;
  rejectedVerifications: number;
  pendingDealerVerifications: number;
  approvedDealerVerifications: number;
  rejectedDealerVerifications: number;
};
