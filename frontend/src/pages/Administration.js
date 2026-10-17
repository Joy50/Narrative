import { useState } from 'react';
import PaginationBar, { pageSlice } from '../components/PaginationBar';
import { useApp } from '../context/AppContext';

const OPERATORS = [
  { name: 'A. Rahman', role: 'Senior Analyst', status: 'Active', clearance: 'RESTRICTED' },
  { name: 'S. Karim', role: 'Supervisor', status: 'Active', clearance: 'RESTRICTED' },
  { name: 'M. Hossain', role: 'Analyst', status: 'Active', clearance: 'INTERNAL' },
  { name: 'N. Ferdous', role: 'Analyst', status: 'Away', clearance: 'INTERNAL' },
];

const CONNECTORS = [
  { name: 'Prothom Alo RSS', state: 'Healthy', rate: '12 items/h' },
  { name: 'BDNews24 RSS', state: 'Healthy', rate: '8 items/h' },
  { name: 'X/Twitter API', state: 'Rate limited', rate: 'paused' },
  { name: 'YouTube channels', state: 'Healthy', rate: '6 items/h' },
];

export default function Administration() {
  const { notify, user } = useApp();
  const [tab, setTab] = useState('Operators');
  const [page, setPage] = useState(1);
  const pageSize = 4;
  const tabRows = tab === 'Operators' ? OPERATORS : tab === 'Connectors' ? CONNECTORS : tab === 'Audit log' ? [
    `${user?.name || 'Operator'} established session`,
    'Hash verification sweep completed · 0 mismatches',
    'Report INV-2025-0410 v2 approved',
    'Connector X/Twitter entered rate-limit state',
  ] : [['claim-extractor', 'v1.2.0'], ['osint-retriever', 'v2.0.1'], ['video-temporal', 'v3.0.2'], ['audio-synthesis', 'v1.0.0']];

  return (
    <>
      <div className="card-stat mb-4 p-0 overflow-hidden">
        <div className="card-header-clean p-0">
          <div className="page-tabs d-flex px-3 pt-2">
            {['Operators', 'Connectors', 'Audit log', 'Models'].map((name) => (
              <button key={name} className={`nav-link ${tab === name ? 'active' : ''}`} onClick={() => { setTab(name); setPage(1); }}>{name}</button>
            ))}
          </div>
        </div>
        <div className="p-3">
          {tab === 'Operators' && (
            <>
              {pageSlice(OPERATORS, page, pageSize).map((op) => (
                <div className="queue-item d-flex justify-content-between align-items-center" key={op.name}>
                  <div>
                    <strong>{op.name}</strong>
                    <div className="stat-mini">{op.role} · {op.clearance}</div>
                  </div>
                  <span className={`badge-soft ${op.status === 'Away' ? '' : ''}`}>{op.status}</span>
                </div>
              ))}
              <button className="btn btn-primary-soft mt-2" onClick={() => notify('Operator invite drafted')}>Invite operator</button>
            </>
          )}
          {tab === 'Connectors' && pageSlice(CONNECTORS, page, pageSize).map((c) => (
            <div className="queue-item d-flex justify-content-between" key={c.name}>
              <div>
                <strong>{c.name}</strong>
                <div className="stat-mini">{c.rate}</div>
              </div>
              <span className="badge-soft">{c.state}</span>
            </div>
          ))}
          {tab === 'Audit log' && (
            <div>
              {pageSlice(tabRows, page, pageSize).map((row) => (
                <div className="activity-item" key={row}><strong>{row}</strong></div>
              ))}
            </div>
          )}
          {tab === 'Models' && (
            <div>
              {pageSlice(tabRows, page, pageSize).map(([m, v]) => (
                <div className="meta-row" key={m}><span className="value">{m}</span><span className="mini-tag">{v}</span></div>
              ))}
            </div>
          )}
          <PaginationBar page={page} pageSize={pageSize} count={tabRows.length} onPage={setPage} />
        </div>
      </div>
    </>
  );
}
