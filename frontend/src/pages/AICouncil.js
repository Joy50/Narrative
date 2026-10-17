import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rumorGet, rumorSend } from '../api/rumor';
import { useApp } from '../context/AppContext';
import { AnalysisOutput } from '../components/WorkflowPanel';

export default function AICouncil() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const filter = params.get('claim') || '';
  const [claimId, setClaimId] = useState(filter);
  const [run, setRun] = useState(null);
  const [history, setHistory] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNext, setHasNext] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [busy, setBusy] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);
  useEffect(() => {
    setClaimId(filter); setRun(null); setPage(1); setHistory([]);
  }, [filter]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    rumorGet(`council/?page=${page}${filter ? `&claim_id=${encodeURIComponent(filter)}` : ''}`).then((result) => {
      if (cancelled) return;
      setLoading(false);
      if (!result.ok) { setError(result.data?.detail || 'Could not load council history.'); return; }
      setHistory(result.data.results);
      setHasNext(!!result.data.next);
      setError('');
      setRun((current) => current || result.data.results[0] || null);
    });
    return () => { cancelled = true; };
  }, [page, filter, reload]);

  const start = async (event) => {
    event.preventDefault();
    if (busy || !claimId.trim()) return;
    setBusy(true);
    setError('');
    const result = await rumorSend('council/', { body: { claim_id: claimId.trim() } });
    setBusy(false);
    if (!result.ok) { setError(result.status === 404 ? 'Claim not found. Enter an existing claim ID from the scanner.' : result.data?.detail || 'Could not start council run.'); return; }
    setRun(result.data);
    if (filter !== claimId.trim()) setParams({ claim: claimId.trim() });
    setPage(1);
    setReload((n) => n + 1);
    notify(result.data.status === 'completed' ? 'Council analysis stored' : 'Council run failed; details are recorded');
  };

  const accept = async () => {
    if (!run || busy) return;
    setBusy(true);
    const result = await rumorSend(`council/${run.id}/accept/`);
    setBusy(false);
    if (!result.ok) { setError(result.data?.detail || 'Could not save draft.'); return; }
    setRun(result.data);
    setReload((n) => n + 1);
    notify('Draft saved for analyst review');
  };

  return <>
    <form onSubmit={start} className="card-stat p-3 mb-3">
      <label htmlFor="council-claim" className="form-label">Claim ID</label>
      <div className="d-flex gap-2 flex-wrap">
        <input id="council-claim" className="form-control" style={{ maxWidth: 360 }} value={claimId} onChange={(e) => setClaimId(e.target.value)} placeholder="Enter an existing claim ID" required disabled={busy} />
        <button className="btn btn-primary-soft" disabled={busy || !claimId.trim()}>{busy ? 'Working…' : 'Run new council'}</button>
        <button type="button" className="btn btn-outline-soft" disabled={busy} onClick={() => setShowHistory(!showHistory)}>Run history</button>
        <button type="button" className="btn btn-outline-soft" onClick={() => navigate('/scanner')}>Browse claims</button>
      </div>
      <p className="small mt-2 mb-0">Council runs OpenAI verification and web research, routes linked media to the configured forensic service, then analyzes narratives, creates review alerts when needed, and prepares an intelligence report draft. Findings require review.</p>
    </form>
    {error && <div className="alert alert-danger" role="alert">{error} <button className="btn btn-sm btn-outline-soft" onClick={() => setReload((n) => n + 1)}>Reload history</button></div>}
    {loading && <p role="status">Loading council history…</p>}
    {showHistory && <div className="card-stat p-3 mb-3">
      <h2 className="h6">Run history</h2>
      {!history.length && !loading && <p>No runs recorded.</p>}
      {history.map((item) => <button key={item.id} disabled={busy} className="btn btn-outline-soft d-block w-100 text-start mb-2" onClick={() => { setRun(item); setClaimId(item.claim_id); }}>
        #{item.id} · {item.claim_id} · {item.status} · {new Date(item.created_at).toLocaleString()} {item.assessment ? '· Draft saved' : ''}
      </button>)}
      <div className="d-flex gap-2 align-items-center">
        <button className="btn btn-outline-soft" disabled={page === 1 || loading || busy} onClick={() => setPage(page - 1)}>Previous</button>
        <span>Page {page}</span>
        <button className="btn btn-outline-soft" disabled={!hasNext || loading || busy} onClick={() => setPage(page + 1)}>Next</button>
      </div>
    </div>}
    {!run && !loading && <div className="card-stat p-4">No council run selected. Enter a claim ID to begin.</div>}
    {run && <>
      <div className="council-banner">
        <div className="label">Council run #{run.id} · {run.status}</div>
        <div className="title">{run.claim_id} · {run.snapshot.text || 'Analysis unavailable'}</div>
        <div className="meta">{new Date(run.created_at).toLocaleString()} · {run.agents.length} agent outputs · {run.snapshot.engine || 'Local rules'}</div>
      </div>
      {run.error && <div className="alert alert-danger" role="alert">{run.error}</div>}
      {run.snapshot.report_id && <button className="btn btn-primary-soft mb-3" onClick={() => navigate(`/reports?report=${run.snapshot.report_id}`)}>Open intelligence report draft</button>}
      {run.snapshot.analysis_runs?.map((analysis) => <AnalysisOutput key={analysis.id} analysis={analysis} />)}
      <div className="row g-3 mb-4">
        {run.agents.map((agent) => <div className="col-xl-4 col-md-6" key={agent.name}>
          <div className={`agent-card ${agent.status === 'complete' ? 'complete' : 'warning'}`}>
            <span className={`agent-status ${agent.status === 'complete' ? 'st-complete' : 'st-warning'}`}>{agent.status.toUpperCase()}</span>
            <div className="agent-name">{agent.name}</div><div className="agent-role">{agent.role}</div><div className="agent-output">{agent.body}</div>
          </div>
        </div>)}
      </div>
      <div className="row g-4">
        <div className="col-xl-6"><div className="card-stat p-3">
          <h2 className="h6">Challenge & consistency review</h2>
          {run.checks.map((check) => <p key={check} className="small">{check}</p>)}
          {run.snapshot.corpus_candidate && <div className="small">
            <strong>Recorded corpus candidate: {run.snapshot.corpus_candidate.claim_id}</strong>
            <p>{run.snapshot.corpus_candidate.authority} · {run.snapshot.corpus_candidate.verified_at}</p>
            <p>{run.snapshot.corpus_candidate.text}</p><p>{run.snapshot.corpus_candidate.url || 'No source URL recorded'}</p>
          </div>}
        </div></div>
        <div className="col-xl-6"><div className="card-stat p-3">
          <h2 className="h6">Draft assessment</h2><div className="mini-tag mb-2">DRAFT · REQUIRES HUMAN APPROVAL</div>
          <p className="small" style={{ whiteSpace: 'pre-wrap' }}>{run.draft || 'No draft available.'}</p>
          <button className="btn btn-primary-soft w-100" disabled={busy || run.status !== 'completed' || !!run.assessment} onClick={accept}>{run.assessment ? 'Draft saved for review' : 'Save draft to case file'}</button>
          {run.assessment && <button className="btn btn-outline-soft w-100 mt-2" onClick={() => navigate(`/verify?id=${encodeURIComponent(run.claim_id)}&assessment=${run.assessment}`)}>Review saved draft</button>}
          {run.case && <button className="btn btn-outline-soft w-100 mt-2" onClick={() => navigate(`/cases?claim=${encodeURIComponent(run.claim_id)}`)}>Open case file</button>}
        </div></div>
      </div>
    </>}
  </>;
}
