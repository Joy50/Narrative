import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { mapClaim, rumorGet, rumorSend } from '../api/rumor';
import PaginationBar, { listCount, listResults } from '../components/PaginationBar';
import { EmptyState, ThreatPriorityIndicator, VerificationStatusBadge } from '../components/ui';
import { useApp } from '../context/AppContext';

const LANGS = ['All', 'Bangla', 'English', 'Banglish'];
const STATUSES = ['All', 'Unreviewed', 'Supported', 'Media', 'High'];

export default function RumorScanner() {
  const navigate = useNavigate();
  const { notify, user, ready } = useApp();
  const [params] = useSearchParams();
  const [langFilter, setLangFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState('All');
  const [query, setQuery] = useState(params.get('q') || '');
  const [claims, setClaims] = useState([]);
  const [validated, setValidated] = useState([]);
  const [feeds, setFeeds] = useState([]);
  const [clusters, setClusters] = useState([]);
  const [stats, setStats] = useState({ extracted: 0, unverified: 0, clusters: 0, high_priority: 0 });
  const [dbQuery, setDbQuery] = useState('');
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState('');
  const [selectedId, setSelectedId] = useState(params.get('claim') || '');
  const [intake, setIntake] = useState({ text: '', url: '', source: '' });
  const [claimPage, setClaimPage] = useState(1);
  const [claimPageSize, setClaimPageSize] = useState(8);
  const [claimCount, setClaimCount] = useState(0);
  const [clusterPage, setClusterPage] = useState(1);
  const [clusterCount, setClusterCount] = useState(0);
  const [feedPage, setFeedPage] = useState(1);
  const [feedCount, setFeedCount] = useState(0);
  const [dbPage, setDbPage] = useState(1);
  const [dbCount, setDbCount] = useState(0);

  const load = useCallback(async () => {
    const claimQs = new URLSearchParams({
      page: String(claimPage),
      page_size: String(claimPageSize),
      language: langFilter,
      status: statusFilter,
      q: query,
    });
    const [overview, claimRes, sourceRes, clusterRes, validRes] = await Promise.all([
      rumorGet('overview/'),
      rumorGet(`claims/?${claimQs.toString()}`),
      rumorGet(`sources/?page=${feedPage}&page_size=6`),
      rumorGet(`clusters/?page=${clusterPage}&page_size=6`),
      rumorGet(`validated-claims/?active=1&q=${encodeURIComponent(dbQuery)}&page=${dbPage}&page_size=6`),
    ]);
    if (overview.ok) setStats(overview.data);
    if (claimRes.ok) {
      setClaims(listResults(claimRes.data).map(mapClaim));
      setClaimCount(listCount(claimRes.data));
      setOnline(true);
    } else {
      setOnline(false);
    }
    if (sourceRes.ok) {
      setFeeds(listResults(sourceRes.data));
      setFeedCount(listCount(sourceRes.data));
    }
    if (clusterRes.ok) {
      setClusters(listResults(clusterRes.data));
      setClusterCount(listCount(clusterRes.data));
    }
    if (validRes.ok) {
      setValidated(listResults(validRes.data));
      setDbCount(listCount(validRes.data));
    }
  }, [claimPage, claimPageSize, langFilter, statusFilter, query, feedPage, clusterPage, dbPage, dbQuery]);

  useEffect(() => {
    if (ready) load();
  }, [load, ready]);

  const visible = claims;
  const selected = visible.find((c) => c.id === selectedId) || visible[0] || null;
  const internalHits = validated;

  const run = async (key, work, okMessage) => {
    setBusy(key);
    try {
      const result = await work();
      if (result?.ok === false) {
        notify(result.data?.detail || 'Rumor app request failed');
        return result;
      }
      notify(okMessage);
      await load();
      return result;
    } catch {
      notify('Rumor app request failed');
      return { ok: false };
    } finally {
      setBusy('');
    }
  };

  const submitIntake = async () => {
    const result = await run('intake', () => rumorSend('intake/', {
      body: {
        source_kind: intake.url ? 'url' : 'text',
        text: intake.text,
        url: intake.url,
        source: intake.source || (intake.url ? 'Authorized public URL' : 'Scanner paste'),
      },
    }), 'Claim extracted into the rumor scanner');
    if (result?.ok) setIntake({ text: '', url: '', source: '' });
  };

  const assignMe = (claim) => run('assign', () => rumorSend(`claims/${claim.pk}/`, {
    method: 'PATCH',
    body: { assign_me: true, analyst: user?.name },
  }), `Assigned ${claim.id} to ${user?.name || 'you'}`);

  return (
    <>
      <div className="d-flex justify-content-end gap-2 mb-3 flex-wrap">
        <button className="btn btn-outline-soft" disabled={!!busy} onClick={() => run('scan', () => rumorSend('sources/scan/'), 'Source scan complete against the internal valid-claim database')}>
          <i className={`fas ${busy === 'scan' ? 'fa-spinner fa-spin' : 'fa-satellite-dish'} me-1`} />Scan sources
        </button>
        <button className="btn btn-outline-soft" disabled={!!busy} onClick={() => run('clusters', () => rumorSend('clusters/refresh/'), 'Clusters rebuilt from rumor-app claims')}>
          <i className={`fas ${busy === 'clusters' ? 'fa-spinner fa-spin' : 'fa-object-group'} me-1`} />Refresh clusters
        </button>
        <button className="btn btn-primary-soft" onClick={() => navigate('/submit')}><i className="fas fa-plus me-1" />Submit content</button>
      </div>

      <div className="row g-3 mb-4">
        {[
          ['Extracted claims', stats.extracted ?? claims.length, online ? 'Rumor app live' : 'offline cache'],
          ['Unverified queue', stats.unverified ?? '—', 'awaiting analyst'],
          ['Semantic clusters', stats.clusters ?? clusters.length, 'rebuilt from claims'],
          ['High-priority review', stats.high_priority ?? '—', 'urgency, not falsity'],
        ].map(([label, value, hint]) => (
          <div className="col-xl-3 col-md-6" key={label}>
            <div className="card-stat"><div className="card-body"><div className="stat-label">{label}</div><div className="stat-value">{value}</div><div className="stat-mini">{hint}</div></div></div>
          </div>
        ))}
      </div>

      <div className="card-stat p-3 mb-3">
        <div className="row g-2 align-items-center">
          <div className="col-md-6">
            <div className="search-wrap">
              <i className="fas fa-search" />
              <input className="form-control" value={query} onChange={(e) => { setQuery(e.target.value); setClaimPage(1); }} placeholder="Search keyword, claim, topic, or URL" />
            </div>
          </div>
          <div className="col-md-6 d-flex flex-wrap gap-2 justify-content-md-end">
            {LANGS.map((chip) => (
              <button key={chip} className={`filter-chip ${langFilter === chip ? 'active' : ''}`} onClick={() => { setLangFilter(chip); setClaimPage(1); }}>{chip}</button>
            ))}
            {STATUSES.map((chip) => (
              <button key={chip} className={`filter-chip ${statusFilter === chip ? 'active' : ''}`} onClick={() => { setStatusFilter(chip); setClaimPage(1); }}>{chip}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-lg-8">
          {visible.length === 0 && <EmptyState title="No matching claims" body="Adjust filters or ingest a public URL / claim into the rumor app." />}
          {visible.map((c) => {
            const hit = c.validatedMatch;
            return (
            <article className={`claim-card ${selected?.id === c.id ? 'active' : ''}`} key={c.id} onClick={() => setSelectedId(c.id)}>
              <div className="d-flex justify-content-between align-items-start gap-2 mb-2 flex-wrap">
                <div className="d-flex gap-2 flex-wrap">
                  <span className="mini-tag">{c.id}</span>
                  <span className="mini-tag">{c.lang}</span>
                  <span className="mini-tag">cluster · {c.cluster || 'unclassified'}</span>
                  {hit && <span className="mini-tag match-tag">Internal DB · {hit.claim_id}</span>}
                </div>
                <div className="d-flex gap-2">
                  <ThreatPriorityIndicator level={c.priority} />
                  <VerificationStatusBadge status={c.status} />
                </div>
              </div>
              <p className="mb-2 ink" style={{ fontSize: '0.95rem', lineHeight: 1.65 }}>{c.text}</p>
              <div className="row g-2 small text-muted mb-2">
                <div className="col-md-6"><i className="fas fa-globe me-1" />{c.source}</div>
                <div className="col-md-6"><i className="fas fa-clock me-1" />First observed {c.firstSeen}</div>
                <div className="col-md-6"><i className="fas fa-clone me-1" />{c.matches} matching public posts</div>
                <div className="col-md-6"><i className="fas fa-user me-1" />Assigned {c.analyst || 'Unassigned'}</div>
              </div>
              <div className="legal-note mb-3">{c.evidence}</div>
              <div className="d-flex justify-content-between align-items-center flex-wrap gap-2">
                <span className="stat-mini"><i className="fas fa-link me-1" />{c.url || 'No URL'}</span>
                <div className="d-flex gap-2 flex-wrap">
                  <button className="btn btn-outline-soft btn-sm" onClick={(e) => { e.stopPropagation(); assignMe(c); }}>Assign me</button>
                  <button className="btn btn-outline-soft btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/verify?id=${c.id}`); }}>Open verification</button>
                  <button className="btn btn-primary-soft btn-sm" onClick={(e) => { e.stopPropagation(); navigate(`/cases?claim=${c.id}`); }}>Open investigation</button>
                </div>
              </div>
            </article>
            );
          })}
          <PaginationBar page={claimPage} pageSize={claimPageSize} count={claimCount} onPage={setClaimPage} onPageSize={setClaimPageSize} sizes={[8, 10, 20]} />
        </div>
        <div className="col-lg-4">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean">Quick intake</div>
            <div className="p-3 d-grid gap-2">
              <input className="form-control" placeholder="Public source URL (optional)" value={intake.url} onChange={(e) => setIntake({ ...intake, url: e.target.value })} />
              <textarea className="form-control" rows="3" placeholder="Paste a public claim or excerpt" value={intake.text} onChange={(e) => setIntake({ ...intake, text: e.target.value })} />
              <button className="btn btn-primary-soft" disabled={!!busy || (!intake.text.trim() && !intake.url.trim())} onClick={submitIntake}>
                <i className={`fas ${busy === 'intake' ? 'fa-spinner fa-spin' : 'fa-plus'} me-1`} />Extract into rumor app
              </button>
              <div className="stat-mini">Public sources only. Extraction creates atomic claims and checks the internal valid-claim database.</div>
            </div>
          </div>

          {selected && (
            <div className="card-stat mb-4 p-0 overflow-hidden">
              <div className="card-header-clean">Selected claim</div>
              <div className="p-3">
                <div className="d-flex justify-content-between mb-2"><span className="mini-tag">{selected.id}</span><span className="stat-mini">Review urgency {selected.reviewScore || '—'}</span></div>
                <div className="fw-semibold mb-2">{selected.text}</div>
                <div className="stat-mini mb-3">{selected.cluster} · {selected.analyst || 'Unassigned'}</div>
                <div className="d-grid gap-2">
                  <button className="btn btn-outline-soft text-start" onClick={() => navigate(`/verify?id=${selected.id}`)}>Open verification desk</button>
                  <button className="btn btn-outline-soft text-start" onClick={() => navigate('/forensic')}>Send media to deepfake analysis</button>
                </div>
              </div>
            </div>
          )}

          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean">Emerging narratives</div>
            <div className="p-3">
              {clusters.map((item) => (
                <div className="queue-item d-flex justify-content-between" key={item.slug} onClick={() => navigate(`/explorer?cluster=${encodeURIComponent(item.slug)}`)}>
                  <div><strong>{item.label}</strong><div className="stat-mini">{item.post_count} posts · observed relationship only</div></div>
                  <span className="mini-tag">{item.trend}</span>
                </div>
              ))}
              <PaginationBar page={clusterPage} pageSize={6} count={clusterCount} onPage={setClusterPage} />
            </div>
          </div>

          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between align-items-center">
              <span>Source monitoring</span>
              <span className="badge-soft">{dbCount} valid records</span>
            </div>
            <div className="p-3">
              {feeds.map((feed) => (
                <div className="d-flex justify-content-between py-2 border-bottom" key={feed.name}>
                  <span>{feed.name}</span>
                  <span className="stat-mini">{feed.status}</span>
                </div>
              ))}
              <PaginationBar page={feedPage} pageSize={6} count={feedCount} onPage={setFeedPage} />
              <div className="source-db-head mt-3">
                <div className="fw-semibold">Internal database · claims marked valid</div>
                <div className="stat-mini">Rumor-app Supported records used to match incoming claims.</div>
              </div>
              <div className="search-wrap mt-2 mb-2">
                <i className="fas fa-search" />
                <input className="form-control" value={dbQuery} onChange={(e) => { setDbQuery(e.target.value); setDbPage(1); }} placeholder="Search validated claims" />
              </div>
              <div className="source-db-list">
                {internalHits.length === 0 && <div className="stat-mini py-2">No validated claims match this search.</div>}
                {internalHits.map((row) => (
                  <button type="button" className="source-db-item" key={row.claim_id} onClick={() => { setQuery(row.topic || row.claim_id); setClaimPage(1); }}>
                    <div className="d-flex justify-content-between gap-2">
                      <span className="mini-tag">{row.claim_id}</span>
                      <VerificationStatusBadge status={row.verdict || 'Supported'} />
                    </div>
                    <div className="source-db-text">{row.text}</div>
                    <div className="stat-mini">{row.authority} · {row.verified_at} · {row.match_count} matches</div>
                  </button>
                ))}
                <PaginationBar page={dbPage} pageSize={6} count={dbCount} onPage={setDbPage} />
              </div>
            </div>
          </div>

          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean">Analyst controls</div>
            <div className="p-3 d-grid gap-2">
              <button className="btn btn-outline-soft text-start" onClick={() => navigate('/submit')}>Full intake form</button>
              <button className="btn btn-outline-soft text-start" disabled={!!busy} onClick={() => run('extract', () => rumorSend('extract/'), 'Bulk extraction finished against existing rumor records')}>
                {busy === 'extract' ? 'Extracting…' : 'Bulk claim extraction'}
              </button>
              <button className="btn btn-outline-soft text-start" onClick={() => navigate(`/council${selectedId ? `?claim=${encodeURIComponent(selectedId)}` : ''}`)}>Request AI Council review</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
