import { useCallback, useEffect, useState } from 'react';
import { request, readSession, refreshSession } from '../api/client';
import { useApp } from '../context/AppContext';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { AnalysisOutput } from '../components/WorkflowPanel';
import { listResults } from '../components/PaginationBar';

const base = '/api/rumor/reports/';
const fields = ['title', 'language', 'case_reference', 'summary', 'findings', 'recommendations'];
const empty = { title: '', language: 'en', case_reference: '', summary: '', findings: '', recommendations: '' };

export default function Reports() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const reportId = params.get('report');
  const { notify } = useApp();
  const [rows, setRows] = useState([]);
  const [stats, setStats] = useState({});
  const [active, setActive] = useState(null);
  const [form, setForm] = useState(empty);
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState('');
  const [canReview, setCanReview] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [creating, setCreating] = useState(false);
  const [claims, setClaims] = useState([]);
  const [claimCount, setClaimCount] = useState(0);
  const [claimPage, setClaimPage] = useState(1);
  const [claimQuery, setClaimQuery] = useState('');
  const [claimIds, setClaimIds] = useState([]);
  const [evidence, setEvidence] = useState([]);
  const [evidenceIds, setEvidenceIds] = useState([]);
  const [note, setNote] = useState('');
  const [history, setHistory] = useState(false);
  const [preview, setPreview] = useState(null);
  const [dirty, setDirty] = useState(false);

  const choose = (report) => {
    setActive(report); setForm(Object.fromEntries(fields.map((key) => [key, report[key]])));
    setCreating(false); setPreview(null); setDirty(false); setNote('');
  };
  const load = useCallback(async () => {
    setLoading(true);
    const result = await request(`${base}?q=${encodeURIComponent(query)}&status=${filter}`);
    if (result.ok) { setRows(result.data.results); setStats(result.data.stats); setCanReview(result.data.can_review); setError(''); }
    else setError(result.data?.detail || 'Reports could not be loaded.');
    setLoading(false);
  }, [query, filter]);
  useEffect(() => {
    if (!reportId) return;
    let cancelled = false;
    request(`${base}${encodeURIComponent(reportId)}/`).then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setActive(result.data);
        setForm(Object.fromEntries(fields.map((key) => [key, result.data[key]])));
        setCreating(false); setDirty(false); setPreview(null);
      } else setError('The requested investigation report could not be opened.');
    });
    return () => { cancelled = true; };
  }, [reportId]);
  useEffect(() => { const timer = setTimeout(load, 250); return () => clearTimeout(timer); }, [load]);
  useEffect(() => {
    if (!creating) return undefined;
    let cancelled = false;
    const timer = setTimeout(async () => {
      const result = await request(`/api/rumor/claims/?q=${encodeURIComponent(claimQuery)}&page=${claimPage}&page_size=20`);
      if (!cancelled && result.ok) { setClaims(listResults(result.data)); setClaimCount(result.data.count ?? listResults(result.data).length); }
      else if (!cancelled) notify('Claims could not be loaded.');
    }, 250);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [creating, claimQuery, claimPage, notify]);

  const begin = async () => {
    setCreating(true); setActive(null); setForm(empty); setClaimIds([]); setEvidenceIds([]); setHistory(false); setDirty(false); setPreview(null);
    const result = await request('/api/rumor/evidence/');
    if (result.ok) setEvidence(result.data.results);
    else notify('Evidence list unavailable; reports can still be created from claims.');
  };
  const save = async (event) => {
    event.preventDefault(); setBusy(true);
    const body = creating ? { ...form, claim_ids: claimIds, evidence_ids: evidenceIds } : { ...form, version: active.version };
    if (creating) ['summary', 'findings', 'recommendations'].forEach((key) => { if (!body[key].trim()) delete body[key]; });
    const result = await request(creating ? base : `${base}${active.id}/`, { method: creating ? 'POST' : 'PATCH', body });
    if (result.ok) { choose(result.data); notify('Report saved.'); await load(); }
    else notify(result.data?.detail || Object.values(result.data || {}).flat().join(' ') || 'Report could not be saved.');
    setBusy(false);
  };
  const transition = async (action) => {
    setBusy(true);
    const result = await request(`${base}${active.id}/action/`, { method: 'POST', body: { action, note, version: active.version } });
    if (result.ok) { choose(result.data); await load(); notify('Report status updated.'); }
    else notify(result.data?.detail || 'Status change failed.');
    setBusy(false);
  };
  const download = async (format) => {
    setBusy(true);
    try {
      const url = `${process.env.REACT_APP_API_URL || ''}${base}${active.id}/export/?download=${format}`;
      let response = await fetch(url, { headers: { Authorization: `Bearer ${readSession()?.access || ''}` } });
      if (response.status === 401) {
        const session = await refreshSession();
        if (session) response = await fetch(url, { headers: { Authorization: `Bearer ${session.access}` } });
      }
      if (!response.ok) throw new Error();
      const objectUrl = URL.createObjectURL(await response.blob());
      const link = document.createElement('a'); link.href = objectUrl; link.download = `report-${active.id}-v${active.version}.${format}`;
      document.body.appendChild(link); link.click(); link.remove(); setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      const updated = await request(`${base}${active.id}/`); if (updated.ok) setActive(updated.data);
    } catch { notify('Export failed.'); }
    setBusy(false);
  };
  const toggle = (setter, id) => setter((prev) => prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]);
  const content = preview?.snapshot || form;
  const sources = preview?.snapshot.source_snapshot || active?.source_snapshot;
  const editable = creating || (active?.status === 'draft' && active?.can_edit);

  return <>
    <div className="d-flex justify-content-end mb-3"><button className="btn btn-primary-soft" disabled={busy || dirty} onClick={begin}>Generate report</button></div>
    <div className="row g-3 mb-4">{[['Reports', stats.total], ['Drafts', stats.draft], ['Awaiting approval', stats.pending], ['Published this month', stats.published_month]].map(([label, value]) =>
      <div className="col-md-3" key={label}><div className="card-stat p-3"><div className="stat-label">{label}</div><div className="stat-value">{value ?? '?'}</div></div></div>)}</div>
    {error && <div className="alert alert-danger" role="alert">{error}<button className="btn btn-link" onClick={load}>Retry</button></div>}
    <div className="row g-4">
      <div className="col-xl-3"><div className="card-stat p-3">
        <h5>Report library</h5>
        <input className="form-control mb-2" aria-label="Search reports" placeholder="Search title or case" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="form-select mb-3" aria-label="Report status" value={filter} onChange={(e) => setFilter(e.target.value)}><option value="">All statuses</option>{['draft', 'pending', 'approved', 'published'].map((value) => <option key={value}>{value}</option>)}</select>
        {loading && <p role="status">Loading reports...</p>}
        {!loading && !error && !rows.length && <p className="text-muted">No reports found. Generate a report to begin.</p>}
        {rows.map((report) => <button type="button" disabled={busy || dirty} className={`report-item w-100 text-start ${active?.id === report.id ? 'active' : ''}`} key={report.id} onClick={() => choose(report)}>
          <div className="d-flex justify-content-between"><span className="badge-soft">{report.status}</span><span className="mini-tag">v{report.version}</span></div><div className="fw-semibold">{report.title}</div><div className="stat-mini">{report.case_reference || `RPT-${report.id}`} ? {report.author}</div>
        </button>)}
      </div></div>
      <div className="col-xl-6">
        {!creating && !active && <div className="card-stat p-4">Select a report to preview it, or generate a report from recorded claims.</div>}
        {(creating || active) && <form className="card-stat p-3" onSubmit={save}>
          <h5>{creating ? 'Generate intelligence report' : `RPT-${active.id} ? v${active.version} ? ${active.status}`}</h5>
          {creating && <>
            <label className="form-label-clean">Select claims (required)</label>
            <input className="form-control mb-2" aria-label="Search claims" placeholder="Search claims" value={claimQuery} onChange={(e) => { setClaimQuery(e.target.value); setClaimPage(1); }} />
            <div className="mb-2" style={{ maxHeight: 240, overflowY: 'auto' }}>{claims.map((claim) => <label className="d-block mb-2" key={claim.id}><input type="checkbox" checked={claimIds.includes(claim.id)} onChange={() => toggle(setClaimIds, claim.id)} /> {claim.claim_id} ? {claim.text}</label>)}</div>
            <div className="d-flex gap-2 mb-3"><button type="button" className="btn btn-outline-soft" disabled={claimPage === 1} onClick={() => setClaimPage(claimPage - 1)}>Previous</button><span>{claimIds.length} selected</span><button type="button" className="btn btn-outline-soft" disabled={claimPage * 20 >= claimCount} onClick={() => setClaimPage(claimPage + 1)}>Next</button></div>
            <details className="mb-3"><summary>Attach evidence references (optional)</summary>{evidence.map((item) => <label className="d-block my-2" key={item.id}><input type="checkbox" checked={evidenceIds.includes(item.id)} onChange={() => toggle(setEvidenceIds, item.id)} /> {item.evidence_id} ? {item.name}</label>)}</details>
            <p className="stat-mini">Blank sections are populated from recorded claims. English and Bangla text can be authored; translation is manual.</p>
          </>}
          {fields.map((key) => <label className="d-block mb-3" key={key}><span className="form-label-clean">{key.replace('_', ' ')}</span>
            {key === 'language' ? <select className="form-select" value={form[key]} disabled={!editable || busy} onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setDirty(true); }}><option value="en">English</option><option value="bn">?????</option></select>
            : ['summary', 'findings', 'recommendations'].includes(key) ? <textarea className="form-control" rows={5} value={form[key]} readOnly={!editable} disabled={busy} onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setDirty(true); }} />
            : <input className="form-control" required={key === 'title'} maxLength={key === 'title' ? 255 : 120} value={form[key]} readOnly={!editable} disabled={busy} onChange={(e) => { setForm({ ...form, [key]: e.target.value }); setDirty(true); }} />}
          </label>)}
          {editable && <div className="d-flex gap-2"><button className="btn btn-primary-soft" disabled={busy || (creating && !claimIds.length)}>{busy ? 'Saving...' : creating ? 'Create draft' : 'Save new version'}</button>{dirty && active && <button type="button" className="btn btn-outline-soft" onClick={() => choose(active)}>Discard edits</button>}</div>}
        </form>}
        {active && <div className="card-stat p-3 mt-3"><h5>Report preview {preview ? `? v${preview.version}` : ''}</h5><article lang={content.language}>
          <h4>{content.title}</h4><p>{content.case_reference}</p>
          {['summary', 'findings', 'recommendations'].map((key) => <section key={key}><h6 className="text-capitalize">{key}</h6><p style={{ whiteSpace: 'pre-wrap' }}>{content[key]}</p></section>)}
          <h6>Recorded source snapshot</h6><div className="stat-mini mb-2">Captured {sources?.captured_at ? new Date(sources.captured_at).toLocaleString() : ''}</div>
          {content.case_reference && <button type="button" className="btn btn-outline-soft btn-sm mb-3" onClick={() => navigate(`/cases?case=${encodeURIComponent(content.case_reference)}`)}>Open case {content.case_reference}</button>}
          {sources?.claims?.map((claim) => <div className="queue-item" key={claim.id}><button type="button" className="btn btn-link p-0" onClick={() => navigate(`/verify?id=${encodeURIComponent(claim.claim_id)}`)}>{claim.claim_id} · {claim.status}</button><p>{claim.text}</p><div style={{ overflowWrap: 'anywhere' }}>{claim.source} · {claim.url}</div></div>)}
          {sources?.evidence?.map((item) => <div className="queue-item" key={item.id}><button type="button" className="btn btn-link p-0" onClick={() => navigate(`/vault?evidence=${item.id}`)}>{item.name} · {item.integrity}</button><div className="evidence-hash" style={{ overflowWrap: 'anywhere' }}>{item.sha256}</div></div>)}
          {sources?.analysis_runs?.map((analysis) => <AnalysisOutput key={analysis.id} analysis={analysis} />)}
        </article></div>}
      </div>
      <div className="col-xl-3">{active && <>
        <div className="card-stat p-3 mb-3"><h5>Review and publication</h5><p className="stat-mini">Publication marks this report as published within this application.</p>
          <textarea className="form-control mb-3" aria-label="Review note" placeholder="Review note (required when requesting revision)" value={note} onChange={(e) => setNote(e.target.value)} />
          {active.status === 'draft' && active.can_edit && <button className="btn btn-primary-soft w-100 mb-2" disabled={busy || dirty} onClick={() => transition('submit')}>Submit for review</button>}
          {canReview && active.status === 'pending' && <button className="btn btn-primary-soft w-100 mb-2" disabled={busy} onClick={() => transition('approve')}>Approve</button>}
          {canReview && active.status === 'approved' && <button className="btn btn-primary-soft w-100 mb-2" disabled={busy} onClick={() => transition('publish')}>Publish internally</button>}
          {canReview && active.status !== 'draft' && <button className="btn btn-outline-soft w-100 mb-2" disabled={busy || !note.trim()} onClick={() => transition('request_revision')}>Request revision</button>}
          {!canReview && <p className="stat-mini">Approval and publication require reviewer permission.</p>}
          {dirty && <p role="status">Save or discard edits before switching reports or submitting.</p>}
          <div className="d-flex gap-2"><button className="btn btn-outline-soft" disabled={busy || dirty} onClick={() => download('txt')}>Download text</button><button className="btn btn-outline-soft" disabled={busy || dirty} onClick={() => download('json')}>JSON</button></div>
        </div>
        <div className="card-stat p-3 mb-3"><button className="btn btn-outline-soft mb-2" onClick={() => setHistory(!history)}>Version history</button>
          {history && <><button className="btn btn-link" onClick={() => setPreview(null)}>Current preview</button>{active.revisions.map((revision) => <button className="report-item w-100 text-start" key={revision.version} onClick={() => setPreview(revision)}>v{revision.version} ? {revision.actor}<div className="stat-mini">{new Date(revision.created_at).toLocaleString()}</div></button>)}</>}
        </div>
        <div className="card-stat p-3"><h6>Activity</h6>{active.events.map((event) => <div className="queue-item" key={event.id}><strong>{event.action.replace('_', ' ')}</strong><div className="stat-mini">{event.actor} ? {new Date(event.created_at).toLocaleString()}</div><p>{event.note}</p></div>)}</div>
      </>}</div>
    </div>
  </>;
}
