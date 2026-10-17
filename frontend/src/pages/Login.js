import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Login() {
  const { user, login, ready } = useApp();
  useEffect(() => {
    document.title = 'NarrativeShield · Secure Access';
  }, []);
  const [form, setForm] = useState({ operatorId: '', passphrase: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (user) return <Navigate to="/" replace />;

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.operatorId.trim() || !form.passphrase) {
      setError('Username and password are required.');
      return;
    }
    setBusy(true);
    const result = await login(form);
    setBusy(false);
    if (!result.ok) setError(result.error);
  };

  return (
    <div className="login-shell d-flex flex-column">
      <div className="login-banner">RESTRICTED  //  NARRATIVESHIELD  //  AUTHORIZED PERSONNEL ONLY</div>
      <main className="login-stage">
        <div className="login-card">
          <div className="text-center mb-4">
            <div className="login-mark d-inline-flex align-items-center justify-content-center mb-3">
              <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="NarrativeShield" />
            </div>
            <h1 className="h4 mb-1 login-title">NarrativeShield</h1>
            <div className="small login-sub">Rumor Scanner & Deepfake Intelligence</div>
          </div>

          <form onSubmit={onSubmit} aria-label="Sign in">
            <label htmlFor="login-username" className="login-label">Username</label>
            <div className="login-field mb-3">
              <i className="fas fa-user-secret" aria-hidden="true" />
              <input id="login-username" className="form-control login-input" name="operatorId" value={form.operatorId} onChange={onChange} placeholder="Enter your username" autoComplete="username" autoCapitalize="none" spellCheck={false} aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
            </div>
            <label htmlFor="login-password" className="login-label">Password</label>
            <div className="login-field mb-3">
              <i className="fas fa-key" aria-hidden="true" />
              <input id="login-password" className="form-control login-input" type="password" name="passphrase" value={form.passphrase} onChange={onChange} placeholder="Enter your password" autoComplete="current-password" aria-invalid={!!error} aria-describedby={error ? 'login-error' : undefined} />
            </div>


            {error && (
              <div id="login-error" className="mb-3 small login-error" role="alert">
                <i className="fas fa-triangle-exclamation me-1" />{error}
              </div>
            )}

            <button className="btn btn-primary-soft w-100 py-2" disabled={busy} type="submit">
              {busy ? <><i className="fas fa-spinner fa-spin me-2" />Authenticating…</> : <><i className="fas fa-lock me-2" />Establish secure session</>}
            </button>
          </form>

          <div className="mt-4 small login-foot">
            <div className="mb-2"><i className="fas fa-building-shield me-2" aria-hidden="true" />Authorized analysts only</div>
            <div className="login-demo">Demo access: <code>a.rahman</code> / <code>shield-0421</code></div>
          </div>
        </div>
      </main>
    </div>
  );
}
