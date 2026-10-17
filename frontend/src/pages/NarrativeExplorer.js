import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Area, AreaChart, ResponsiveContainer, Tooltip } from 'recharts';
import { rumorGet, rumorSend } from '../api/rumor';
import PaginationBar, { pageSlice } from '../components/PaginationBar';
import { EmptyState, ThreatPriorityIndicator, VerificationStatusBadge } from '../components/ui';
import { useApp } from '../context/AppContext';
import WorkflowWorkspace from '../components/WorkflowWorkspace';

const tooltipStyle = {
  background: '#FFFFFF',
  border: '1px solid #D9EDE3',
  color: '#163B32',
  borderRadius: 12,
  fontSize: 12,
  boxShadow: '0 10px 28px rgba(20, 83, 45, 0.08)',
};

function nodePos(node, layout) {
  if (!node) return null;
  return layout === 'Timeline'
    ? { x: node.tx ?? node.x, y: node.ty ?? node.y }
    : { x: node.x, y: node.y };
}

function PropagationGraph({ graph, layout }) {
  const nodes = graph?.nodes || [];
  const links = graph?.links || [];
  const byId = Object.fromEntries(nodes.map((node) => [node.id, node]));

  if (!nodes.length) {
    return <div className="empty-graph">No observed public nodes in this cluster yet.</div>;
  }

  return (
    <svg viewBox="0 0 560 400" width="100%" height="400">
      {links.map((link) => {
        const from = nodePos(byId[link.source], layout);
        const to = nodePos(byId[link.target], layout);
        if (!from || !to) return null;
        return (
          <line
            key={`${link.source}-${link.target}-${link.kind || 'edge'}`}
            className={`link ${link.kind || ''}`}
            x1={from.x}
            y1={from.y}
            x2={to.x}
            y2={to.y}
          />
        );
      })}
      {nodes.map((node) => {
        const pos = nodePos(node, layout);
        if (!pos) return null;
        return (
          <g key={node.id}>
            <circle cx={pos.x} cy={pos.y} r={node.size || 9} fill={node.color || '#059669'} />
            <text className="node-label" x={pos.x} y={pos.y + (node.size || 9) + 12}>{node.label}</text>
          </g>
        );
      })}
    </svg>
  );
}

export default function NarrativeExplorer() {
  const navigate = useNavigate();
  const { notify, ready } = useApp();
  const [params, setParams] = useSearchParams();
  const clusterParam = params.get('cluster') || '';
  const claimParam = params.get('claim') || '';
  const [layout, setLayout] = useState('Force');
  const [query, setQuery] = useState('');
  const [payload, setPayload] = useState(null);
  const [online, setOnline] = useState(false);
  const [busy, setBusy] = useState('');
  const [clusterPage, setClusterPage] = useState(1);
  const [claimPage, setClaimPage] = useState(1);
  const [validPage, setValidPage] = useState(1);
  const listSize = 6;

  const load = useCallback(async (slug = clusterParam) => {
    const path = claimParam ? `narratives/?claim_id=${encodeURIComponent(claimParam)}` : slug ? `narratives/${encodeURIComponent(slug)}/` : 'narratives/';
    const result = await rumorGet(path);
    if (result.ok) {
      setPayload(result.data);
      setOnline(true);
    } else {
      setOnline(false);
    }
  }, [clusterParam, claimParam]);

  useEffect(() => {
    if (ready) load();
  }, [load, ready]);

  const overview = payload?.overview || { active: 0, claims_clustered: 0, spread_nodes: 0, anomalous: 0 };
  const clusters = payload?.clusters || [];
  const selected = payload?.selected || null;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return clusters.filter((row) => (
      !q
      || row.title.toLowerCase().includes(q)
      || row.slug.toLowerCase().includes(q)
      || (row.desc || '').toLowerCase().includes(q)
    ));
  }, [clusters, query]);

  const selectCluster = (slug) => {
    setClaimPage(1);
    setValidPage(1);
    setParams(slug ? { cluster: slug } : {});
  };

  const refresh = async () => {
    setBusy('clusters');
    const result = await rumorSend('clusters/refresh/');
    setBusy('');
    if (!result.ok) {
      notify(result.data?.detail || 'Cluster rebuild failed');
      return;
    }
    notify('Clusters rebuilt from rumor-app claims');
    await load(clusterParam);
  };

  return (
    <>
      <WorkflowWorkspace focus="narrative" onChange={() => load()} />
      <div className="d-flex justify-content-end gap-2 mb-3 flex-wrap">
        <button className="btn btn-outline-soft" disabled={!!busy} onClick={() => load(clusterParam)}>
          <i className="fas fa-rotate me-1" />Reload analysis
        </button>
        <button className="btn btn-outline-soft" disabled={!!busy} onClick={refresh}>
          <i className={`fas ${busy === 'clusters' ? 'fa-spinner fa-spin' : 'fa-object-group'} me-1`} />Refresh clusters
        </button>
        <button className="btn btn-primary-soft" onClick={() => navigate(selected?.slug ? `/scanner?q=${encodeURIComponent(selected.slug)}` : '/scanner')}>
          <i className="fas fa-magnifying-glass me-1" />Open in scanner
        </button>
      </div>

      <div className="row g-3 mb-4">
        {[
          ['Active narratives', overview.active, online ? 'Rumor app live' : 'offline', 'fa-stream'],
          ['Claims clustered', overview.claims_clustered, 'from rumor intake', 'fa-object-group'],
          ['Observed spread nodes', overview.spread_nodes, 'public sources only', 'fa-share-alt'],
          ['Anomalous patterns', overview.anomalous, 'flagged for review', 'fa-exclamation-triangle'],
        ].map(([label, value, badge, icon]) => (
          <div className="col-xl-3 col-md-6" key={label}>
            <div className="card-stat">
              <div className="card-body d-flex justify-content-between align-items-center">
                <div>
                  <div className="stat-label">{label}</div>
                  <div className="stat-value">{value}</div>
                  <span className="badge-soft mt-1 d-inline-block">{badge}</span>
                </div>
                <i className={`fas ${icon} stat-icon`} />
              </div>
            </div>
          </div>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-xl-3">
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between">
              <span><i className="fas fa-list" /> Narrative clusters</span>
              <span className="badge-soft">{visible.length}</span>
            </div>
            <div className="p-3">
              <div className="search-wrap mb-3">
                <i className="fas fa-search" />
                <input className="form-control" value={query} onChange={(e) => { setQuery(e.target.value); setClusterPage(1); }} placeholder="Search cluster or claim" />
              </div>
              <div className="scrollable">
                {visible.length === 0 && <EmptyState title="No clusters" body="Ingest claims in the rumor scanner, then refresh clusters." />}
                {pageSlice(visible, clusterPage, listSize).map((row) => (
                  <button
                    type="button"
                    key={row.slug}
                    className={`narrative-item ${selected?.slug === row.slug ? 'active' : ''}`}
                    onClick={() => selectCluster(row.slug)}
                  >
                    <div className="d-flex justify-content-between gap-2">
                      <div className="fw-semibold ink">{row.title}</div>
                      <span className="mini-tag" style={{ background: row.style?.bg, color: row.style?.color }}>{row.style?.tag || row.trend}</span>
                    </div>
                    <div className="small text-muted mt-1">{row.desc}</div>
                    <div className="stat-mini mt-2">{row.claims} claims · {row.nodes} nodes · {row.age}</div>
                  </button>
                ))}
                <PaginationBar page={clusterPage} pageSize={listSize} count={visible.length} onPage={setClusterPage} />
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-6">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between">
              <span><i className="fas fa-project-diagram" /> Propagation graph · {selected?.title || '—'}</span>
              <span className="badge-soft">Observed only</span>
            </div>
            <div className="p-3">
              <div className="graph-canvas">
                <PropagationGraph graph={selected?.graph} layout={layout} />
                <div className="legend">
                  <span><span className="legend-dot ld-origin" />First observed</span>
                  <span><span className="legend-dot ld-amplify" />Amplification</span>
                  <span><span className="legend-dot ld-cross" />Cross-platform</span>
                  <span><span className="legend-dot ld-organic" />Organic / supported</span>
                </div>
                <div className="graph-controls">
                  {['Force', 'Timeline'].map((mode) => (
                    <button key={mode} className={`btn ${layout === mode ? 'active' : ''}`} onClick={() => setLayout(mode)}>{mode}</button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-clock" /> Observed propagation timeline</div>
            <div className="p-3">
              {!selected?.timeline?.length && <div className="stat-mini">No timeline events for this cluster.</div>}
              <div className="propagation-timeline">
                {(selected?.timeline || []).map((event) => (
                  <div className={`timeline-node ${event.tone || ''}`} key={`${event.time}-${event.title}`}>
                    <div className="small text-muted">{event.time}</div>
                    <div className="fw-semibold">{event.title}</div>
                    <div>{event.detail}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-3">
          <div className="card-stat p-0 overflow-hidden mb-4">
            <div className="card-header-clean"><i className="fas fa-chart-line" /> Cluster metrics</div>
            <div className="p-3">
              {[
                ['Velocity', selected?.metrics?.velocity || 0, '#C2410C'],
                ['Cross-platform', selected?.metrics?.cross_platform || 0, '#B45309'],
                ['Recycle risk', selected?.metrics?.recycle_risk || 0, '#0F766E'],
              ].map(([label, value, color]) => (
                <div key={label} className="mb-3">
                  <div className="d-flex justify-content-between small mb-1"><span>{label}</span><strong>{value}</strong></div>
                  <div className="score-bar"><div className="fill" style={{ width: `${value}%`, background: color }} /></div>
                </div>
              ))}
              {!!selected?.series?.length && (
                <div style={{ height: 88 }} className="mb-2">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={selected.series}>
                      <Tooltip contentStyle={tooltipStyle} />
                      <Area type="monotone" dataKey="posts" stroke="#059669" fill="#D1FAE5" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              )}
              <div className="insight-card mt-2" style={{ borderRadius: 8, padding: '0.7rem 0.9rem', fontSize: '0.8rem' }}>
                Pattern is a hypothesis for review, not a coordination conclusion. Observed public sources only.
              </div>
            </div>
          </div>

          <div className="card-stat p-0 overflow-hidden mb-4">
            <div className="card-header-clean">Claims in cluster</div>
            <div className="p-3">
              {!(selected?.claims || []).length && <div className="stat-mini">No claims assigned to this narrative.</div>}
              {pageSlice(selected?.claims || [], claimPage, listSize).map((claim) => (
                <button
                  type="button"
                  className="source-db-item"
                  key={claim.claim_id}
                  onClick={() => navigate(`/verify?id=${claim.claim_id}`)}
                >
                  <div className="d-flex justify-content-between gap-2 mb-1">
                    <span className="mini-tag">{claim.claim_id}</span>
                    <ThreatPriorityIndicator level={claim.priority} />
                  </div>
                  <div className="source-db-text">{claim.text}</div>
                  <div className="d-flex justify-content-between align-items-center mt-1">
                    <span className="stat-mini">{claim.source}</span>
                    <VerificationStatusBadge status={claim.status} />
                  </div>
                </button>
              ))}
              <PaginationBar page={claimPage} pageSize={listSize} count={(selected?.claims || []).length} onPage={setClaimPage} />
            </div>
          </div>

          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean">Internal valid matches</div>
            <div className="p-3">
              {!(selected?.validated || []).length && <div className="stat-mini">No Supported records matched this cluster.</div>}
              {pageSlice(selected?.validated || [], validPage, listSize).map((row) => (
                <div className="source-db-item" key={row.claim_id}>
                  <div className="mini-tag mb-1">{row.claim_id}</div>
                  <div className="source-db-text">{row.text}</div>
                  <div className="stat-mini">{row.authority} · {row.verified_at} · {row.match_count} matches</div>
                </div>
              ))}
              <PaginationBar page={validPage} pageSize={listSize} count={(selected?.validated || []).length} onPage={setValidPage} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
