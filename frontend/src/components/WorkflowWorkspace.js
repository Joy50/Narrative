import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { rumorGet } from '../api/rumor';
import WorkflowPanel from './WorkflowPanel';

export default function WorkflowWorkspace({ focus, mediaOnly = false, onChange }) {
  const [params, setParams] = useSearchParams();
  const [claims, setClaims] = useState([]);
  const [query, setQuery] = useState('');
  const [error, setError] = useState('');
  const parameter = focus === 'verification' ? 'id' : 'claim';
  const selected = params.get(parameter) || '';
  useEffect(() => {
    let cancelled = false;
    const timer = setTimeout(() => {
      rumorGet(`claims/?page_size=100&q=${encodeURIComponent(query)}${mediaOnly ? '&status=Media' : ''}`).then((result) => {
        if (cancelled) return;
        if (result.ok) { setClaims(result.data.results); setError(''); }
        else setError('Could not load the investigation queue.');
      });
    }, 200);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [query, mediaOnly]);
  return <>
    <div className="card-stat p-3 mb-3">
      <h2 className="h5">{focus === 'forensic' ? 'Analyze submitted media' : focus === 'verification' ? 'Select a claim to verify' : 'Investigate a claim narrative'}</h2>
      <input className="form-control mb-2" aria-label="Search investigation claims" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search the scanner queue" />
      <select className="form-select" aria-label="Select investigation claim" value={selected} onChange={(e) => { const next = new URLSearchParams(params); next.set(parameter, e.target.value); next.delete('cluster'); setParams(next); }}>
        <option value="">Select a submitted claim</option>
        {selected && !claims.some((row) => row.claim_id === selected) && <option>{selected}</option>}
        {claims.map((row) => <option key={row.id} value={row.claim_id}>{row.claim_id} · {row.text.slice(0, 100)}</option>)}
      </select>
      {error && <p role="alert">{error}</p>}
      {mediaOnly && <p className="small mt-2 mb-0">Original media is analyzed by your configured forensic service. Missing service configuration is shown on the analysis record.</p>}
    </div>
    {selected && <WorkflowPanel key={selected} claimId={selected} focus={focus} onChange={onChange} />}
  </>;
}
