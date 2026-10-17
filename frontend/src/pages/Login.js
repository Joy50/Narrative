import { useEffect, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { useApp } from '../context/AppContext';

export default function Login() {
  const { user, login, ready } = useApp();
  useEffect(() => {
    document.title = 'NarrativeShield · Secure Access';
  }, []);
  const [form, setForm] = useState({ operatorId: '', passphrase: '', token: '' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  if (!ready) return null;
  if (user) return <Navigate to="/" replace />;

  const onChange = (e) => setForm({ ...form, [e.target.name]: e.target.value });

  const onSubmit = async (e) => {
    e.preventDefault();
    setError('');
    if (!form.operatorId || !form.passphrase || !form.token) {
      setError('Operator ID, passphrase, and clearance token are required.');
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
      <div className="flex-grow-1 d-flex align-items-center justify-content-center p-4">
        <div className="login-card p-4 p-md-5 position-relative">
          <div className="text-center mb-4">
            <div className="login-mark d-inline-flex align-items-center justify-content-center mb-3">
              <img src={`${process.env.PUBLIC_URL}/logo.png`} alt="NarrativeShield" />
            </div>
            <h1 className="h4 mb-1 login-title">NarrativeShield</h1>
            <div className="small login-sub">Rumor Scanner & Deepfake Intelligence</div>
          </div>

          <form onSubmit={onSubmit}>
            <label className="small mb-1 login-label">Operator ID</label>
            <div className="login-field mb-3">
              <i className="fas fa-user-secret" />
              <input className="form-control login-input" name="operatorId" value={form.operatorId} onChange={onChange} placeholder="a.rahman" autoComplete="username" />
            </div>
            <label className="small mb-1 login-label">Passphrase</label>
            <div className="login-field mb-3">
              <i className="fas fa-key" />
              <input className="form-control login-input" type="password" name="passphrase" value={form.passphrase} onChange={onChange} placeholder="••••••••" autoComplete="current-password" />
            </div>
            <label className="small mb-1 login-label">Clearance token</label>
            <div className="login-field mb-3">
              <i className="fas fa-fingerprint" />
              <input className="form-control login-input" name="token" value={form.token} onChange={onChange} placeholder="NS-ALPHA-7" />
            </div>

            {error && (
              <div className="mb-3 small login-error">
                <i className="fas fa-triangle-exclamation me-1" />{error}
              </div>
            )}

            <button className="btn btn-primary-soft w-100 py-2" disabled={busy} type="submit">
              {busy ? <><i className="fas fa-spinner fa-spin me-2" />Authenticating…</> : <><i className="fas fa-lock me-2" />Establish secure session</>}
            </button>
          </form>

          <div className="mt-4 small login-foot">
            <div className="mb-1"><i className="fas fa-building-shield me-2" />Intelligence Operations · authorized analysts only</div>
            <div>Demo access: <code>a.rahman</code> / <code>shield-0421</code> / <code>NS-ALPHA-7</code></div>
          </div>
        </div>
      </div>
    </div>
  );
}
