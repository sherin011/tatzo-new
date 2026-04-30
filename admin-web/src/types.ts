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
};
