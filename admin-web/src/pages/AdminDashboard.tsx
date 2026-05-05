import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import {
  approveDealerVerification,
  approveVerification,
  getAdminDashboardMetrics,
  getDealerVerificationWithUser,
  getVerificationWithUser,
  listPendingDealerVerifications,
  listPendingVerifications,
  listRecentVerifications,
  rejectDealerVerification,
  rejectVerification,
} from '../services';
import type { AdminDashboardMetrics, DealerVerificationDoc, VerificationDoc } from '../types';

type VerificationRow = VerificationDoc & { id: string };
type DealerVerificationRow = DealerVerificationDoc & { id: string };

const toReadableDate = (value: unknown) => {
  if (!value) return '-';
  if (typeof value === 'string') return value;
  if (value instanceof Date) return value.toLocaleString();
  if (typeof value === 'object' && value && 'toDate' in value && typeof (value as any).toDate === 'function') {
    try {
      return (value as any).toDate().toLocaleString();
    } catch {
      return '-';
    }
  }
  return '-';
};

export default function AdminDashboard() {
  const [metrics, setMetrics] = useState<AdminDashboardMetrics | null>(null);
  const [pendingRows, setPendingRows] = useState<VerificationRow[]>([]);
  const [pendingDealerRows, setPendingDealerRows] = useState<DealerVerificationRow[]>([]);
  const [recentRows, setRecentRows] = useState<VerificationRow[]>([]);
  const [queryText, setQueryText] = useState('');
  const [roleFilter, setRoleFilter] = useState<'all' | 'artist' | 'dealer'>('all');
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [actionUid, setActionUid] = useState('');
  const [error, setError] = useState('');

  const loadAll = async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError('');

    try {
      const [nextMetrics, pending, pendingDealers, recent] = await Promise.all([
        getAdminDashboardMetrics(),
        listPendingVerifications(),
        listPendingDealerVerifications(),
        listRecentVerifications(10),
      ]);
      setMetrics(nextMetrics);
      setPendingRows(pending);
      setPendingDealerRows(pendingDealers);
      setRecentRows(recent);
    } catch (e: any) {
      const message = e?.message ?? 'Failed to load dashboard metrics.';
      const hasPermissionIssue =
        String(e?.code ?? '').includes('permission-denied') ||
        message.toLowerCase().includes('missing or insufficient permissions');

      if (hasPermissionIssue) {
        setError('Firestore permission denied. Verify admin claim, sign out/sign in again, and deploy latest firestore.rules.');
      } else {
        setError(message);
      }
    } finally {
      if (initial) setLoading(false);
      else setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadAll(true);
  }, []);

  const refreshSessionAndReload = async () => {
    if (!auth.currentUser) return;
    setRefreshing(true);
    setError('');
    try {
      await auth.currentUser.getIdToken(true);
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Token refresh failed. Sign out and sign in again.');
      setRefreshing(false);
    }
  };

  const onApprove = async (uid: string) => {
    if (!uid) return;
    setActionUid(uid);
    setError('');
    try {
      const data = await getVerificationWithUser(uid);
      if (!data.verification) throw new Error('Verification document missing.');
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await approveVerification({
        uid,
        requestedRole: data.verification.requestedRole,
        adminUid,
        user: data.user,
        verification: data.verification,
      });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Approve failed.');
    } finally {
      setActionUid('');
    }
  };

  const onReject = async (uid: string, requestedRole: 'artist' | 'dealer') => {
    if (!uid) return;
    const reason = window.prompt('Enter reject reason');
    if (!reason || !reason.trim()) return;

    setActionUid(uid);
    setError('');
    try {
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await rejectVerification({ uid, requestedRole, adminUid, reason: reason.trim() });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Reject failed.');
    } finally {
      setActionUid('');
    }
  };

  const onApproveDealer = async (uid: string) => {
    if (!uid) return;
    setActionUid(uid);
    setError('');
    try {
      const data = await getDealerVerificationWithUser(uid);
      if (!data.dealerVerification) throw new Error('Dealer request not found.');
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await approveDealerVerification({
        uid,
        adminUid,
        user: data.user,
        dealerVerification: data.dealerVerification,
      });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Dealer approve failed.');
    } finally {
      setActionUid('');
    }
  };

  const onRejectDealer = async (uid: string) => {
    if (!uid) return;
    const reason = window.prompt('Enter dealer reject reason');
    if (!reason || !reason.trim()) return;

    setActionUid(uid);
    setError('');
    try {
      const adminUid = auth.currentUser?.uid ?? 'admin';
      await rejectDealerVerification({ uid, adminUid, reason: reason.trim() });
      await loadAll(false);
    } catch (e: any) {
      setError(e?.message ?? 'Dealer reject failed.');
    } finally {
      setActionUid('');
    }
  };

  const filteredPending = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return pendingRows.filter((row) => {
      const roleMatches = roleFilter === 'all' || row.requestedRole === roleFilter;
      if (!roleMatches) return false;
      if (!query) return true;

      const haystack = [row.shopName, row.businessEmail, row.uid, row.locationArea, row.locationCity, row.requestedRole]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [pendingRows, queryText, roleFilter]);

  const filteredDealers = useMemo(() => {
    const query = queryText.trim().toLowerCase();
    return pendingDealerRows.filter((row) => {
      if (!query) return true;
      const haystack = [row.shopName, row.businessEmail, row.uid, row.locationArea, row.locationCity]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [pendingDealerRows, queryText]);

  const roleBars = useMemo(() => {
    const total = metrics?.totalUsers ?? 0;
    const artists = metrics?.totalArtists ?? 0;
    const dealers = metrics?.totalDealers ?? 0;
    const users = Math.max(total - artists - dealers, 0);
    const safe = total || 1;

    return [
      { label: 'Users', value: users, pct: Math.round((users / safe) * 100) },
      { label: 'Artists', value: artists, pct: Math.round((artists / safe) * 100) },
      { label: 'Dealers', value: dealers, pct: Math.round((dealers / safe) * 100) },
    ];
  }, [metrics]);

  const bookingBars = useMemo(() => {
    const total = metrics?.totalBookings ?? 0;
    const safe = total || 1;
    return [
      { label: 'Pending Payment', value: metrics?.bookingsPendingPayment ?? 0, pct: Math.round(((metrics?.bookingsPendingPayment ?? 0) / safe) * 100) },
      { label: 'Pending Artist Approval', value: metrics?.bookingsPendingArtistApproval ?? 0, pct: Math.round(((metrics?.bookingsPendingArtistApproval ?? 0) / safe) * 100) },
      { label: 'Confirmed', value: metrics?.bookingsConfirmed ?? 0, pct: Math.round(((metrics?.bookingsConfirmed ?? 0) / safe) * 100) },
      { label: 'Completed', value: metrics?.bookingsCompleted ?? 0, pct: Math.round(((metrics?.bookingsCompleted ?? 0) / safe) * 100) },
      { label: 'Cancelled', value: metrics?.bookingsCancelled ?? 0, pct: Math.round(((metrics?.bookingsCancelled ?? 0) / safe) * 100) },
    ];
  }, [metrics]);

  return (
    <div className="dashboard-page">
      <div className="dashboard-head">
        <div>
          <h2>Control Tower</h2>
          <p className="muted">Monitor users, artist approvals, dealer onboarding, and booking pipeline in one view.</p>
        </div>
        <div className="toolbar-actions">
          <button onClick={() => void loadAll(false)} disabled={loading || refreshing}>
            Refresh
          </button>
          <button onClick={refreshSessionAndReload} disabled={loading || refreshing}>
            {refreshing ? 'Refreshing...' : 'Refresh Token'}
          </button>
          <Link to="/verifications" className="link-btn">
            Full Queue
          </Link>
        </div>
      </div>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="hint">Loading dashboard...</div> : null}

      {!loading && metrics ? (
        <>
          <div className="kpi-grid">
            <div className="kpi-card"><span>Total Users</span><strong>{metrics.totalUsers}</strong></div>
            <div className="kpi-card"><span>Artists</span><strong>{metrics.totalArtists}</strong></div>
            <div className="kpi-card"><span>Dealers</span><strong>{metrics.totalDealers}</strong></div>
            <div className="kpi-card"><span>Pending Artist Verifications</span><strong>{metrics.pendingVerifications}</strong></div>
            <div className="kpi-card"><span>Pending Dealer Requests</span><strong>{metrics.pendingDealerVerifications}</strong></div>
            <div className="kpi-card"><span>Total Posts</span><strong>{metrics.totalPosts}</strong></div>
            <div className="kpi-card"><span>Total Bookings</span><strong>{metrics.totalBookings}</strong></div>
          </div>

          <div className="viz-grid">
            <div className="viz-card">
              <h3>Role Distribution</h3>
              {roleBars.map((row) => (
                <div key={row.label} className="bar-row">
                  <div className="bar-label">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="bar-track"><div className="bar-fill purple" style={{ width: `${row.pct}%` }} /></div>
                </div>
              ))}
            </div>

            <div className="viz-card">
              <h3>Booking Pipeline</h3>
              {bookingBars.map((row) => (
                <div key={row.label} className="bar-row">
                  <div className="bar-label">
                    <span>{row.label}</span>
                    <strong>{row.value}</strong>
                  </div>
                  <div className="bar-track"><div className="bar-fill cyan" style={{ width: `${row.pct}%` }} /></div>
                </div>
              ))}
            </div>
          </div>

          <div className="queue-card">
            <div className="queue-head">
              <h3>Pending Artist/Dealer Verification Queue</h3>
              <div className="filter-row">
                <input
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Search by studio, email, uid, city..."
                />
                <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value as 'all' | 'artist' | 'dealer')}>
                  <option value="all">All Roles</option>
                  <option value="artist">Artist</option>
                  <option value="dealer">Dealer</option>
                </select>
              </div>
            </div>

            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Studio</th>
                    <th>Role</th>
                    <th>Location</th>
                    <th>Business Email</th>
                    <th>Submitted</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredPending.map((row) => (
                    <tr key={row.id}>
                      <td>{row.shopName ?? '-'}</td>
                      <td>{row.requestedRole}</td>
                      <td>{[row.locationArea, row.locationCity].filter(Boolean).join(', ') || '-'}</td>
                      <td>{row.businessEmail ?? '-'}</td>
                      <td>{toReadableDate(row.submittedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <Link to={`/verifications/${row.uid}`} className="link-btn compact">Review</Link>
                          <button disabled={actionUid === row.uid} onClick={() => void onApprove(row.uid)}>
                            {actionUid === row.uid ? '...' : 'Approve'}
                          </button>
                          <button
                            disabled={actionUid === row.uid}
                            onClick={() => void onReject(row.uid, row.requestedRole)}
                            className="danger-btn"
                          >
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredPending.length === 0 ? <div className="hint">No pending artist/dealer role verifications.</div> : null}
          </div>

          <div className="queue-card">
            <h3>Pending Dealer Requests (Secondary Flow)</h3>
            <div className="table-wrap">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Studio</th>
                    <th>Location</th>
                    <th>Business Email</th>
                    <th>Updated</th>
                    <th>Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredDealers.map((row) => (
                    <tr key={row.id}>
                      <td>{row.shopName ?? '-'}</td>
                      <td>{[row.locationArea, row.locationCity].filter(Boolean).join(', ') || '-'}</td>
                      <td>{row.businessEmail ?? '-'}</td>
                      <td>{toReadableDate(row.updatedAt)}</td>
                      <td>
                        <div className="table-actions">
                          <button disabled={actionUid === row.uid} onClick={() => void onApproveDealer(row.uid)}>
                            {actionUid === row.uid ? '...' : 'Approve'}
                          </button>
                          <button disabled={actionUid === row.uid} onClick={() => void onRejectDealer(row.uid)} className="danger-btn">
                            Reject
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {filteredDealers.length === 0 ? <div className="hint">No pending dealer requests.</div> : null}
          </div>

          <div className="queue-card">
            <h3>Recent Verification Activity</h3>
            <div className="activity-list">
              {recentRows.map((row) => (
                <div key={`${row.id}_${row.status}`} className="activity-item">
                  <div>
                    <strong>{row.shopName ?? row.uid}</strong>
                    <div className="muted small">{row.uid}</div>
                  </div>
                  <div className={`status-pill status-${row.status}`}>{String(row.status ?? '').toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      ) : null}
    </div>
  );
}
