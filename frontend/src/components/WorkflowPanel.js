import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rumorGet, rumorSend } from '../api/rumor';
import { request } from '../api/client';
import { useApp } from '../context/AppContext';

function safeUrl(url) {
  try { return ['http:', 'https:'].includes(new URL(url).protocol) ? url : null; } catch { return null; }
}

export function AnalysisOutput({ analysis }) {
  return <section className="border rounded p-3 mb-3">
    <div className="d-flex justify-content-between gap-2 flex-wrap"><strong>{analysis.kind} analysis #{analysis.id}</strong><span className="badge-soft">{analysis.status}</span></div>
    <div className="small text-muted mb-2">{analysis.provider} · {new Date(analysis.created_at).toLocaleString()}</div>
    {analysis.error && <p className="text-danger" role="status">{analysis.error}</p>}
    {analysis.current === false && <p className="text-warning">Investigation data has changed since this run. Rerun analysis to include current evidence.</p>}
    {analysis.result.summary && <p style={{ whiteSpace: 'pre-wrap' }}>{analysis.result.summary}</p>}
    {analysis.result.verdict && <p>Suggested verdict: <strong>{analysis.result.verdict}</strong> · Model confidence: {analysis.result.confidence}/100 (uncalibrated; review required)</p>}
    {['claims', 'findings', 'reasons', 'gaps', 'limitations'].map((key) => analysis.result[key]?.length > 0 && <div key={key} className="mb-2"><strong className="text-capitalize">{key}</strong><ul>{analysis.result[key].map((value, i) => <li key={i}>{value}</li>)}</ul></div>)}
    {analysis.result.citations?.length > 0 && <div><strong>Research sources</strong><ul>{analysis.result.citations.map((citation, i) => <li key={i}>{safeUrl(citation.url) ? <a href={citation.url} target="_blank" rel="noreferrer">{citation.title || citation.url}</a> : citation.title}</li>)}</ul></div>}
  </section>;
}

export default function WorkflowPanel({ claimId, focus = 'verification', onChange }) {
  const navigate = useNavigate();
  const { notify } = useApp();
  const [data, setData] = useState(null);
  const [analysts, setAnalysts] = useState([]);
  const [assignee, setAssignee] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [file, setFile] = useState(null);
  const [notes, setNotes] = useState('');
  const [history, setHistory] = useState(false);
  const load = useCallback(async () => {
    if (!claimId) return;
    const result = await rumorGet(`workflow/${encodeURIComponent(claimId)}/`);
    if (result.ok) { setData(result.data); setAssignee(result.data.handling_mode === 'council' ? 'council' : String(result.data.assigned_to || '')); setError(''); }
    else setError(result.data?.detail || 'Could not load investigation.');
  }, [claimId]);
  useEffect(() => { setData(null); setError(''); load(); }, [load]);
  useEffect(() => { rumorGet('analysts/').then((result) => { if (result.ok) setAnalysts(result.data); }); }, []);

  const action = async (key, work) => {
    if (busy) return;
    setBusy(key); setError('');
    try {
      const result = await work();
      if (!result.ok) { setError(result.data?.detail || 'Investigation action failed.'); return; }
      await load();
      if (onChange) await onChange();
      notify('Investigation updated');
      return result;
    } finally { setBusy(''); }
  };
  const assign = () => action('assign', () => rumorSend(`workflow/${encodeURIComponent(claimId)}/assign/`, {
    body: assignee === 'council' ? { mode: 'council' } : { mode: 'analyst', user_id: Number(assignee) },
  }));
  const run = async (stage) => {
    const result = await action(stage, () => rumorSend(`workflow/${encodeURIComponent(claimId)}/run/`, { body: { stage } }));
    if (result?.ok && result.data.analyses[0]?.status === 'completed') {
      if (stage === 'verification' && result.data.media_type) navigate(`/forensic?claim=${encodeURIComponent(claimId)}`);
      if (stage === 'forensic') navigate(`/explorer?claim=${encodeURIComponent(claimId)}`);
    }
  };
  const council = () => action('council', () => rumorSend('council/', { body: { claim_id: claimId } }));
  const report = async () => {
    const result = await action('report', () => rumorSend(`workflow/${encodeURIComponent(claimId)}/report/`));
    if (result?.ok) navigate(`/reports?report=${result.data.report_id}`);
  };
  const upload = async (event) => {
    event.preventDefault();
    if (!file) return;
    const body = new FormData(); body.append('file', file); body.append('claim_id', claimId); body.append('notes', notes);
    const result = await action('upload', () => request('/api/rumor/evidence/', { method: 'POST', body }));
    if (result?.ok) { setFile(null); setNotes(''); event.target.reset(); }
  };
  if (!claimId) return null;
  const latest = data?.analyses.filter((row, index, rows) => rows.findIndex((item) => item.kind === row.kind) === index) || [];
  return <div className="card-stat p-3 mb-4">
    <h2 className="h5">Investigation workflow</h2>
    {error && <div className="alert alert-danger" role="alert">{error}</div>}
    {!data && !error && <p role="status">Loading investigation…</p>}
    {data && <>
      <p className="small">{data.claim_id} · Stage: <strong>{data.stage}</strong> · Owner: {data.analyst || 'Unassigned'} · {data.media_type || 'Text or link'}</p>
      <p className="small text-muted">Analysis results and reports preserve their original evidence snapshots. Added evidence requires reanalysis and review of any existing report.</p>
      <div className="d-flex gap-2 flex-wrap mb-3">
        <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/scanner?claim=${encodeURIComponent(claimId)}`)}>Scanner record</button>
        <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/vault?claim=${encodeURIComponent(claimId)}`)}>Evidence repository</button>
        <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/council?claim=${encodeURIComponent(claimId)}`)}>Council history</button>
        <select className="form-select" style={{ maxWidth: 280 }} aria-label="Assign investigation" value={assignee} onChange={(e) => setAssignee(e.target.value)} disabled={!!busy}>
          <option value="">Select an analyst</option>{analysts.map((row) => <option value={row.id} key={row.id}>{row.name} ({row.username})</option>)}<option value="council">AI Council</option>
        </select>
        <button className="btn btn-outline-soft" disabled={!assignee || !!busy} onClick={assign}>Assign investigation</button>
        <button className="btn btn-primary-soft" disabled={!!busy} onClick={() => run(focus)}>{busy === focus ? 'Analyzing…' : focus === 'verification' ? 'Research and verify with OpenAI' : focus === 'forensic' ? 'Run media forensic analysis' : 'Analyze narrative and alert risk'}</button>
        <button className="btn btn-outline-soft" disabled={!!busy} onClick={council}>{busy === 'council' ? 'Council investigating…' : 'Run AI Council'}</button>
      </div>
      {busy && <p role="status">Working on {busy}. Provider analysis may take several minutes. Keep this page open.</p>}
      <div className="d-flex gap-2 flex-wrap mb-3">
        <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/verify?id=${encodeURIComponent(claimId)}`)}>Claim verification</button>
        {data.media_type && <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/forensic?claim=${encodeURIComponent(claimId)}`)}>Deepfake analysis</button>}
        <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/explorer?claim=${encodeURIComponent(claimId)}${data.cluster ? `&cluster=${encodeURIComponent(data.cluster)}` : ''}`)}>Narrative analysis</button>
        {data.case && <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={() => navigate(`/cases?claim=${encodeURIComponent(claimId)}`)}>Case {data.case}</button>}
        <button className="btn btn-outline-soft btn-sm" disabled={!!busy} onClick={report}>{data.report_id ? 'Generate or open report draft' : 'Generate intelligence report draft'}</button>
        {data.alert && <button className="btn btn-outline-soft btn-sm" onClick={() => navigate(`/warning?alert=${data.alert.id}`)}>View {data.alert.severity} alert</button>}
      </div>
      {data.alert && <div className="alert alert-warning">Narrative flagged for review: {data.alert.summary}</div>}
      <details className="mb-3"><summary>Add evidence to this investigation</summary>
        <form onSubmit={upload} className="mt-2">
          <label className="form-label">Original or supporting file (up to 500 MB)<input className="form-control" type="file" required disabled={!!busy} onChange={(e) => setFile(e.target.files[0])} /></label>
          <textarea className="form-control mb-2" aria-label="Evidence notes" placeholder="Source, context, and what this evidence establishes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <button className="btn btn-outline-soft" disabled={!!busy || !file}>Attach evidence</button>
        </form>
      </details>
      {data.originals.length > 0 && <details className="mb-3"><summary>{data.originals.length} linked original(s)</summary><ul>{data.originals.map((obj) => <li key={obj.id}><button className="btn btn-link p-0" onClick={() => navigate(`/vault?evidence=${obj.id}`)}>EV-{String(obj.id).padStart(6, '0')} · {obj.name}</button> · {obj.media_type || 'Supporting file'}<div className="small" style={{ overflowWrap: 'anywhere' }}>SHA-256: {obj.sha256}</div></li>)}</ul></details>}
      <button className="btn btn-link p-0 mb-2" onClick={() => setHistory(!history)}>{history ? 'Show latest results' : 'Show analysis history'}</button>
      {(history ? data.analyses : latest).map((row) => <AnalysisOutput key={row.id} analysis={row} />)}
      {!data.analyses.length && <p className="text-muted mb-0">No analysis has run. Assign an analyst or use AI Council to begin.</p>}
    </>}
  </div>;
}
