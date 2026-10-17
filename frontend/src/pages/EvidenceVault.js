import { useCallback, useEffect, useState } from 'react';
import { request, readSession, refreshSession } from '../api/client';
import { useApp } from '../context/AppContext';

const base = '/api/rumor/evidence/';
const sizeLabel = (bytes) => bytes < 1024 ? `${bytes} B` : bytes < 1048576 ? `${(bytes / 1024).toFixed(1)} KB` : `${(bytes / 1048576).toFixed(1)} MB`;

export default function EvidenceVault() {
  const { notify } = useApp();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [query, setQuery] = useState('');
  const [selectedId, setSelectedId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [form, setForm] = useState({ case_reference: '', source_url: '', notes: '' });
  const selected = rows.find((item) => item.id === selectedId) || rows[0];

  const load = useCallback(async () => {
    setLoading(true);
    const result = await request(`${base}?q=${encodeURIComponent(query)}`);
    if (result.ok) { setRows(result.data.results); setStats(result.data.stats); setError(''); }
    else setError(result.data?.detail || 'Could not load evidence.');
    setLoading(false);
  }, [query]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);

  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    if (file.size === 0 || file.size > 500 * 1024 * 1024) { notify('Choose a non-empty file up to 500 MB.'); return; }
    setBusy(true);
    const data = new FormData();
    data.append('file', file);
    Object.entries(form).forEach(([key, value]) => data.append(key, value));
    const result = await request(base, { method: 'POST', body: data });
    if (result.ok) {
      setSelectedId(result.data.id); setUploading(false); setFile(null);
      setForm({ case_reference: '', source_url: '', notes: '' }); setQuery('');
      notify('Original stored and SHA-256 recorded.'); await load();
    } else notify(result.data?.detail || Object.values(result.data || {}).flat().join(' ') || 'Upload failed.');
    setBusy(false);
  };

  const verify = async () => {
    if (!selected) return;
    setBusy(true);
    const result = await request(`${base}${selected.id}/verify/`, { method: 'POST' });
    notify(result.ok ? `Integrity: ${result.data.integrity}` : 'Integrity check failed.');
    await load(); setBusy(false);
  };

  const hold = async () => {
    setBusy(true);
    const result = await request(`${base}${selected.id}/`, { method: 'PATCH', body: { retention_hold: !selected.retention_hold } });
    if (!result.ok) notify('Could not update retention hold.');
    await load(); setBusy(false);
  };

  const download = async () => {
    setBusy(true);
    try {
      const url = `${process.env.REACT_APP_API_URL || ''}${base}${selected.id}/download/`;
      let response = await fetch(url, { headers: { Authorization: `Bearer ${readSession()?.access || ''}` } });
      if (response.status === 401) {
        const session = await refreshSession();
        if (session) response = await fetch(url, { headers: { Authorization: `Bearer ${session.access}` } });
      }
      if (!response.ok) throw new Error('Download failed.');
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = objectUrl; link.download = selected.name;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      await load();
    } catch { notify('Original could not be downloaded.'); }
    setBusy(false);
  };

  return <>
    <div className="d-flex justify-content-end gap-2 mb-3">
      <button className="btn btn-primary-soft" onClick={() => setUploading(!uploading)}><i className="fas fa-upload me-1" />Ingest evidence</button>
    </div>
    {uploading && <form className="card-stat p-3 mb-4" onSubmit={upload}>
      <h5>Ingest original</h5>
      <label className="form-label-clean" htmlFor="evidence-file">File (up to 500 MB)</label>
      <input id="evidence-file" className="form-control mb-3" type="file" required onChange={(e) => setFile(e.target.files[0])} />
      {Object.entries(form).map(([key, value]) => <label className="d-block mb-3" key={key}>
        <span className="form-label-clean">{key === 'case_reference' ? 'Case reference (optional)' : key === 'source_url' ? 'Source URL (optional)' : 'Notes'}</span>
        <input className="form-control" type={key === 'source_url' ? 'url' : 'text'} maxLength={key === 'case_reference' ? 120 : key === 'source_url' ? 1000 : undefined} value={value} onChange={(e) => setForm({ ...form, [key]: e.target.value })} />
      </label>)}
      <button className="btn btn-primary-soft" disabled={busy}>{busy ? 'Uploading...' : 'Store original'}</button>
    </form>}
    <div className="row g-3 mb-4">
      {[['Vault objects', stats.total], ['Hash issues', stats.mismatches], ['Collected today', stats.today], ['Retention holds', stats.holds]].map(([label, value]) =>
        <div className="col-xl-3 col-md-6" key={label}><div className="card-stat p-3"><div className="stat-label">{label}</div><div className="stat-value">{value ?? '?'}</div></div></div>)}
    </div>
    <div className="card-stat mb-4 p-3"><input className="form-control" aria-label="Search evidence" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search evidence ID, filename, case, or SHA-256" /></div>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={load}>Retry</button></div>}
    <div className="row g-4">
      <div className="col-xl-8"><div className="card-stat p-0 overflow-hidden"><div className="card-header-clean">Originals registry</div><div className="p-3">
        {loading && <div role="status">Loading evidence...</div>}
        {!loading && !error && !rows.length && <div className="text-muted">{query ? 'No matching evidence.' : 'No evidence stored yet. Ingest an original to begin.'}</div>}
        {rows.map((item) => <button type="button" key={item.id} className={`claim-card w-100 text-start ${selected?.id === item.id ? 'active' : ''}`} onClick={() => setSelectedId(item.id)}>
          <div className="d-flex justify-content-between"><div><div className="case-id">{item.evidence_id}</div><div className="fw-semibold ink">{item.name}</div><div className="stat-mini">{sizeLabel(item.size)} ? {item.case_reference || 'No case reference'}</div></div><span className="badge-soft">{item.integrity}</span></div>
          <div className="evidence-hash mt-2" style={{ overflowWrap: 'anywhere' }}>{item.sha256}</div>
        </button>)}
      </div></div></div>
      <div className="col-xl-4">{selected && <div className="card-stat p-0 overflow-hidden">
        <div className="card-header-clean">{selected.evidence_id} ? {selected.name}</div>
        <div className="p-3">
          <div className="stat-mini mb-2">Collected {new Date(selected.created_at).toLocaleString()}</div>
          <p>Case: {selected.case_reference || 'Unassigned'}</p>
          {selected.source_url && <p style={{ overflowWrap: 'anywhere' }}>Source: {selected.source_url}</p>}
          {selected.notes && <p>{selected.notes}</p>}
          <p>Last integrity check: {selected.verified_at ? new Date(selected.verified_at).toLocaleString() : 'Never'}</p>
          <div className="d-flex flex-wrap gap-2 mb-3">
            <button className="btn btn-primary-soft" disabled={busy} onClick={download}>Download original</button>
            <button className="btn btn-outline-soft" disabled={busy} onClick={verify}>Verify SHA-256</button>
            <button className="btn btn-outline-soft" disabled={busy} onClick={hold}>{selected.retention_hold ? 'Release retention hold' : 'Place retention hold'}</button>
          </div>
          <h6>Custody history</h6>
          {selected.events.map((event) => <div className="queue-item" key={event.id}><strong>{event.action}</strong><div className="stat-mini">{event.actor} ? {new Date(event.created_at).toLocaleString()}</div><div>{event.detail}</div></div>)}
        </div>
      </div>}</div>
    </div>
  </>;
}
