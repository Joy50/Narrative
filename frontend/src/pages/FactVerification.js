import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rumorGet, rumorSend } from '../api/rumor';
import { EvidenceSourceCard } from '../components/ui';
import WorkflowPanel from '../components/WorkflowPanel';
import WorkflowWorkspace from '../components/WorkflowWorkspace';
import { useApp } from '../context/AppContext';

const VERDICTS = [
  ['supported', 'Supported', 'vd-supported'],
  ['refuted', 'Refuted', 'vd-refuted'],
  ['misleading', 'Misleading', 'vd-misleading'],
  ['ctx', 'Out of Context', 'vd-ctx'],
  ['synthetic', 'Synthetic Media', 'vd-synthetic'],
  ['unverified', 'Unverified', 'vd-unverified'],
  ['satire', 'Satire / Parody', 'vd-satire'],
];

export default function FactVerification() {
  const { notify } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const claimId = params.get('id') || '';
  const assessmentId = params.get('assessment');
  const [claim, setClaim] = useState(null);
  const [evidence, setEvidence] = useState([]);
  const [verdict, setVerdict] = useState('unverified');
  const [confidence, setConfidence] = useState(70);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    setClaim(null); setEvidence([]); setNotes(''); setError('');
    if (!claimId) return undefined;
    rumorGet(`claims/by-id/${encodeURIComponent(claimId)}/${assessmentId ? `?assessment=${encodeURIComponent(assessmentId)}` : ''}`).then((result) => {
      if (cancelled) return;
      if (!result.ok) { setError(result.data?.detail || 'The selected claim could not be loaded.'); return; }
      setClaim(result.data);
      setEvidence(result.data.evidence_items || []);
      setNotes(result.data.evidence || '');
      if (result.data.status) {
        const found = VERDICTS.find((row) => row[1] === result.data.status);
        setVerdict(found ? found[0] : 'unverified');
      }
      if (assessmentId && result.data.latest_assessment) {
        const saved = result.data.latest_assessment;
        setNotes(saved.notes);
        setConfidence(saved.confidence);
        setVerdict(VERDICTS.find((row) => row[1] === saved.verdict)?.[0] || 'unverified');
      }
    });
    return () => { cancelled = true; };
  }, [claimId, assessmentId]);

  const submit = async () => {
    if (!claim || busy) return;
    setBusy(true);
    const result = await rumorSend(`claims/${claim.id}/assess/`, {
      body: { verdict, confidence, notes, promote: verdict === 'supported' },
    });
    setBusy(false);
    if (!result.ok) {
      notify(result.data?.detail || 'Assessment could not be stored');
      return;
    }
    notify(verdict === 'supported' ? 'Supported verdict stored in the rumor validated-claim database' : 'Assessment queued for supervisor in the rumor app');
    navigate(`/explorer?claim=${encodeURIComponent(claim.claim_id)}`);
  };

  if (!claimId) return <WorkflowWorkspace focus="verification" />;

  return (
    <>
      <div className="d-flex justify-content-end gap-2 mb-3">
        <button className="btn btn-outline-soft" onClick={() => navigate(`/scanner?claim=${encodeURIComponent(claimId)}`)}><i className="fas fa-arrow-left me-1" />Back to scanner</button>
        <button className="btn btn-primary-soft" disabled={!claim || busy} onClick={submit}>
          <i className={`fas ${busy ? 'fa-spinner fa-spin' : 'fa-paper-plane'} me-1`} />Submit for review
        </button>
      </div>
      <div className="claim-banner">
        <div className="d-flex justify-content-between align-items-start flex-wrap gap-2">
          <div style={{ flex: 1, minWidth: 300 }}>
            <div className="claim-label"><i className="fas fa-quote-left me-1" />Claim under verification</div>
            <div className="claim-text">{claim?.text || 'Loading rumor-app claim…'}</div>
            <div className="claim-meta">{claim ? `${claim.claim_id} · ${claim.language} · ${claim.url || 'no URL'} · ${claim.source}` : claimId}</div>
          </div>
          <div className="text-end">
            <div className="claim-label mb-1">Review priority</div>
            <div style={{ fontSize: '1.8rem', fontWeight: 700, color: '#ffb74d' }}>{claim?.review_score || '—'}</div>
          </div>
        </div>
      </div>

      {error && <div className="alert alert-danger" role="alert">{error}</div>}
      <WorkflowPanel key={claimId} claimId={claimId} focus="verification" onChange={async () => {
        const result = await rumorGet(`claims/by-id/${encodeURIComponent(claimId)}/`);
        if (result.ok) setEvidence(result.data.evidence_items || []);
      }} />
      <div className="row g-4">
        <div className="col-xl-7">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between">
              <span><i className="fas fa-search" /> Evidence corpus</span>
              <span className="badge-soft">{evidence.length} sources found</span>
            </div>
            <div className="p-3">
              {evidence.map((item) => (
                <EvidenceSourceCard key={`${item.name}-${item.stance}`} name={item.name} snippet={item.snippet} meta={item.meta} stance={item.stance} stanceClass={item.stance_class} />
              ))}
            </div>
          </div>
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-robot" /> Draft assessment</div>
            <div className="p-3">
              <div className="ai-draft">
                <div className="ai-label">Rumor app · verification desk</div>
                {claim?.validated_match
                  ? `Internal validated record ${claim.validated_match.claim_id} is a corroboration pointer from ${claim.validated_match.authority}. Confirm with human review before any public statement.`
                  : 'No matching valid record in the rumor-app database. Independent corroboration is still required. Detection scores and match counts are triage signals, not falsity probabilities.'}
              </div>
            </div>
          </div>
        </div>
        <div className="col-xl-5">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-gavel" /> Analyst verdict</div>
            <div className="p-3">
              <div className="verdict-grid mb-3">
                {VERDICTS.map(([id, label, dot]) => (
                  <div key={id} className={`verdict-option ${verdict === id ? 'selected' : ''}`} onClick={() => setVerdict(id)}>
                    <span className={`v-dot ${dot}`} />{label}
                  </div>
                ))}
              </div>
              <div className="d-flex justify-content-between mb-1">
                <span className="small fw-semibold">Analyst confidence</span>
                <span className="badge-soft">{confidence}%</span>
              </div>
              <input type="range" className="confidence-slider mb-3" min="0" max="100" value={confidence} onChange={(e) => setConfidence(Number(e.target.value))} />
              <textarea className="form-control mb-3" rows="4" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="review-flow mb-3">
                <span className="step done">Analysis</span>
                <span className="step current">Analyst Review</span>
                <span className="step">Supervisor</span>
                <span className="step">Approved</span>
              </div>
              <button className="btn btn-primary-soft w-100" disabled={!claim || busy} onClick={submit}>
                <i className="fas fa-paper-plane me-1" />Submit to reviewer
              </button>
              {verdict === 'supported' && <div className="stat-mini mt-2">Supported verdicts are stored in the rumor-app internal valid-claim database.</div>}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
