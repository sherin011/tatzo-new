import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { auth } from '../firebase';
import { listPendingVerifications } from '../services';
import type { VerificationDoc } from '../types';

type Row = VerificationDoc & { id: string };

export default function PendingApplications() {
  const [items, setItems] = useState<Row[]>([]);
  const [queryText, setQueryText] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = async () => {
    setLoading(true);
    setError('');

    try {
      const data = await listPendingVerifications();
      setItems(data);
    } catch (e: any) {
      const message = e?.message ?? 'Could not load pending applications.';
      const hasPermissionIssue =
        String(e?.code ?? '').includes('permission-denied') ||
        message.toLowerCase().includes('missing or insufficient permissions');

      if (hasPermissionIssue) {
        setError(
          'Firestore permission denied. Verify admin claim, sign out/sign in again, and deploy latest firestore.rules if needed.',
        );
      } else {
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  };

  const refreshTokenAndReload = async () => {
    if (!auth.currentUser) return;
    setBusy(true);
    setError('');
    try {
      await auth.currentUser.getIdToken(true);
      await load();
    } catch (e: any) {
      setError(e?.message ?? 'Token refresh failed. Sign out and sign in again.');
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const filteredItems = useMemo(() => {
    const q = queryText.trim().toLowerCase();
    if (!q) return items;

    return items.filter((item) => {
      const haystack = [item.uid, item.shopName, item.businessEmail, item.requestedRole, item.locationCity, item.locationArea]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [items, queryText]);

  return (
    <div className="page">
      <div className="toolbar">
        <div>
          <h2>Pending Verifications</h2>
          <p className="muted">Review artist/dealer requests and approve with confidence.</p>
        </div>
        <div className="toolbar-actions">
          <button onClick={load} disabled={loading || busy}>
            Refresh
          </button>
          <button onClick={refreshTokenAndReload} disabled={loading || busy}>
            {busy ? 'Refreshing...' : 'Refresh Token'}
          </button>
        </div>
      </div>

      <div className="stats-grid">
        <div className="stats-card">
          <span>Total Pending</span>
          <strong>{items.length}</strong>
        </div>
        <div className="stats-card">
          <span>Showing</span>
          <strong>{filteredItems.length}</strong>
        </div>
      </div>

      <div className="search-wrap">
        <input
          value={queryText}
          onChange={(e) => setQueryText(e.target.value)}
          placeholder="Search by studio, role, email, uid, location..."
          aria-label="Search pending applications"
        />
      </div>

      {loading ? <div className="hint">Loading...</div> : null}
      {error ? <div className="error">{error}</div> : null}
      {!loading && !error && filteredItems.length === 0 ? <div className="hint">No pending requests found.</div> : null}

      <div className="list">
        {filteredItems.map((item) => (
          <Link key={item.id} to={`/verifications/${item.uid}`} className="list-card">
            <div className="list-main">
              <strong>{item.shopName ?? 'Unnamed Studio'}</strong>
              <div className="muted">{item.uid}</div>
              <div className="muted small">
                {(item.locationArea ?? '-')}, {(item.locationCity ?? '-')}
              </div>
            </div>
            <div className="list-side">
              <div className="tag">{item.requestedRole?.toUpperCase() ?? 'N/A'}</div>
              <span className="muted small">{item.businessEmail ?? '-'}</span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
