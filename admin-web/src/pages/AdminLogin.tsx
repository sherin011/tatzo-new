import { FormEvent, useMemo, useState } from 'react';
import { loginAdmin, signupAdminCandidate } from '../auth';

type Props = {
  onSuccess: () => void;
};

type Mode = 'signin' | 'signup';

const isStrongPassword = (value: string) => value.length >= 8;

export default function AdminLogin({ onSuccess }: Props) {
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');

  const ctaLabel = useMemo(() => {
    if (busy) return mode === 'signin' ? 'Signing in...' : 'Creating...';
    return mode === 'signin' ? 'Sign in' : 'Create account';
  }, [busy, mode]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    setInfo('');

    try {
      if (mode === 'signup') {
        if (!isStrongPassword(password)) {
          throw new Error('Password must be at least 8 characters.');
        }
        await signupAdminCandidate(email, password);
        setInfo('Account created. Set admin=true custom claim, then sign in.');
        setMode('signin');
        setPassword('');
      } else {
        await loginAdmin(email, password);
        onSuccess();
      }
    } catch (err: any) {
      setError(err?.message ?? 'Authentication failed');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="center-wrap">
      <form className="panel" onSubmit={submit}>
        <h1>TATZO Admin</h1>
        <p>Verification review portal</p>

        <div className="segmented">
          <button
            className={`seg-btn ${mode === 'signin' ? 'seg-btn-active' : ''}`}
            onClick={() => setMode('signin')}
            type="button"
          >
            Sign in
          </button>
          <button
            className={`seg-btn ${mode === 'signup' ? 'seg-btn-active' : ''}`}
            onClick={() => setMode('signup')}
            type="button"
          >
            Sign up
          </button>
        </div>

        <label>Email</label>
        <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" required />
        <label>Password</label>
        <input value={password} onChange={(e) => setPassword(e.target.value)} type="password" required />

        {info ? <div className="hint">{info}</div> : null}
        {error ? <div className="error">{error}</div> : null}

        <button disabled={busy} type="submit">
          {ctaLabel}
        </button>
      </form>
    </div>
  );
}
