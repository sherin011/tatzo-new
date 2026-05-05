import { DashboardRouteName, UserProfile, UserRole, VerificationStatus } from '../types/app';

const ROLE_ROUTE_MAP: Record<UserRole, DashboardRouteName> = {
  user: 'UserDashboard',
  artist: 'ArtistDashboard',
  dealer: 'DealerDashboard',
};

export const isUserRole = (value: unknown): value is UserRole => {
  return value === 'user' || value === 'artist' || value === 'dealer';
};

export const isVerificationStatus = (value: unknown): value is VerificationStatus => {
  return value === 'unsubmitted' || value === 'pending' || value === 'approved' || value === 'rejected';
};

// Artist/Dealer dashboards unlock only after admin approval.
export const resolveEffectiveRole = (profile: Pick<UserProfile, 'role' | 'verificationStatus'>): UserRole => {
  const role = isUserRole(profile.role) ? profile.role : 'user';
  if (role === 'user') return 'user';
  return profile.verificationStatus === 'approved' ? role : 'user';
};

// Session-level readiness: we only need a valid role + setupComplete.
// Location + verification gating is handled inside the UI (Profile/Apply flow).
export const isProfileComplete = (
  profile: UserProfile | null,
): profile is UserProfile & { role: UserRole; setupComplete: true } => {
  return Boolean(profile?.setupComplete && isUserRole(profile.role));
};

export const resolveDashboardRoute = (role: UserRole): DashboardRouteName => {
  return ROLE_ROUTE_MAP[role];
};
