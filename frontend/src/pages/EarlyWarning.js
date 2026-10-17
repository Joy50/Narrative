import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { rumorGet, rumorSend } from '../api/rumor';
import PaginationBar, { pageSlice } from '../components/PaginationBar';
import { EmptyState, ThreatPriorityIndicator, VerificationStatusBadge } from '../components/ui';
import { useApp } from '../context/AppContext';

function sevLabel(sev) {
  if (!sev) return 'Low';
  return sev.charAt(0).toUpperCase() + sev.slice(1);
}

function factorColor(score) {
  if (score >= 80) return '#b33a3a';
  if (score >= 65) return '#d9a23b';
  return '#2f7d6d';
}

export default function EarlyWarning() {
  const { notify, ready } = useApp();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const alertParam = params.get('alert') || '';
  const [payload, setPayload] = useState(null);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [busy, setBusy] = useState('');
  const [offline, setOffline] = useState(false);
  const pageSize = 5;

  const load = useCallback(async () => {
    const result = await rumorGet('alerts/');
    if (result.ok) {
      setPayload(result.data);
      setOffline(false);
    } else {
      setOffline(true);
    }
    return result;
  }, []);

  useEffect(() => {
    if (ready) load();
  }, [load, ready]);

  const alerts = payload?.alerts || [];
  const overview = payload?.overview || {};
  const selected = alerts.find((row) => row.id === alertParam) || payload?.selected || null;

  const counts = useMemo(() => ({
    all: alerts.length,
    critical: alerts.filter((row) => row.sev === 'critical').length,
    unassigned: alerts.filter((row) => !row.assignee).length,
    mine: alerts.filter((row) => row.mine).length,
  }), [alerts]);

  const rows = useMemo(() => {
    if (filter === 'critical') return alerts.filter((row) => row.sev === 'critical');
    if (filter === 'unassigned') return alerts.filter((row) => !row.assignee);
    if (filter === 'mine') return alerts.filter((row) => row.mine);
    return alerts;
  }, [alerts, filter]);

  const chips = [
    ['all', `All (${counts.all})`],
    ['critical', `Critical (${counts.critical})`],
    ['unassigned', `Unassigned (${counts.unassigned})`],
    ['mine', `Mine (${counts.mine})`],
  ];

  const selectAlert = (id) => {
    setParams(id ? { alert: id } : {});
  };

  const assign = async () => {
    if (!selected || selected.mine) return;
    setBusy('assign');
    const result = await rumorSend(`alerts/${encodeURIComponent(selected.id)}/assign/`);
    setBusy('');
    if (!result.ok) {
      notify(result.data?.detail || 'Assignment failed');
      return;
    }
    setPayload(result.data);
    setParams({ alert: selected.id });
    notify('Alert assigned to you');
  };

  const openInvestigation = () => {
    if (!selected) return;
    if (selected.claim_id) {
      navigate(`/cases?claim=${encodeURIComponent(selected.claim_id)}`);
      return;
    }
    const qs = new URLSearchParams({
      draft: selected.title || 'Early warning investigation',
      summary: selected.desc || '',
      priority: selected.sev || 'Normal',
    });
    navigate(`/cases?${qs.toString()}`);
  };

  return (
    <>
      <div className="d-flex justify-content-end gap-2 mb-3">
        <button className="btn btn-outline-soft" onClick={() => load()} disabled={!!busy}>
          <i className="fas fa-rotate me-1" />Reload analysis
        </button>
        <button className={`btn btn-outline-soft ${rulesOpen ? 'active' : ''}`} onClick={() => setRulesOpen((open) => !open)}>
          <i className="fas fa-sliders me-1" />Rules
        </button>
        <button className="btn btn-outline-soft" onClick={() => notify('Alerts muted for 1 hour')}>
          <i className="fas fa-bell-slash me-1" />Mute 1h
        </button>
      </div>

      {rulesOpen && (
        <div className="card-stat p-3 mb-4">
          <div className="fw-semibold mb-2 ink">Watch rules</div>
          <div className="row g-2">
            {(payload?.rules || []).map((rule) => (
              <div className="col-md-6" key={rule.id}>
                <div className="d-flex justify-content-between gap-2 align-items-start">
                  <div>
                    <div className="fw-semibold small ink">{rule.id} · {rule.version}</div>
                    <div className="stat-mini">{rule.label}</div>
                  </div>
                  <span className="badge-soft">{rule.count} firing</span>
                </div>
              </div>
            ))}
          </div>
          <div className="stat-mini mt-3">Scores rank review order. They are not a truth or falsity verdict.</div>
        </div>
      )}

      <div className="row g-3 mb-4">
        {[
          ['Active alerts', overview.active ?? '—', `${overview.critical ?? 0} critical`, 'fa-triangle-exclamation'],
          ['Triggered today', overview.triggered_today ?? '—', `${overview.repetitions ?? 0} repetitions`, 'fa-bolt'],
          ['Unassigned', overview.unassigned ?? '—', `${overview.mine ?? 0} assigned to you`, 'fa-user-clock'],
          ['Rules firing', overview.rules ?? '—', `${overview.suppressed ?? 0} below threshold`, 'fa-sliders'],
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
        <div className="col-xl-7">
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between flex-wrap gap-2">
              <span><i className="fas fa-stream" /> Alert feed {payload && <span className="live-dot ms-2" />}</span>
              <div className="d-flex gap-2 flex-wrap">
                {chips.map(([id, label]) => (
                  <button
                    key={id}
                    className={`filter-chip ${filter === id ? 'active' : ''}`}
                    onClick={() => { setFilter(id); setPage(1); }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
            <div className="p-3 scrollable">
              {!payload && !offline && <div className="stat-mini">Loading alert analysis…</div>}
              {offline && !payload && <EmptyState title="Alert analysis is offline" body="Reload once the rumor service is reachable." />}
              {payload && rows.length === 0 && (
                <EmptyState title="No alerts in this view" body="Open claims that trip a watch rule will appear here." />
              )}
              {pageSlice(rows, page, pageSize).map((row) => (
                <div
                  key={row.id}
                  className={`alert-card ${row.sev} ${selected?.id === row.id ? 'active' : ''}`}
                  onClick={() => selectAlert(row.id)}
                >
                  <div className="d-flex justify-content-between">
                    <ThreatPriorityIndicator level={sevLabel(row.sev)} />
                    <span className="stat-mini">{row.time}</span>
                  </div>
                  <div className="alert-title mt-1">{row.title}</div>
                  <div className="alert-desc">{row.desc}</div>
                  <div className="stat-mini mt-2">{row.rule} · {row.meta}</div>
                </div>
              ))}
              <PaginationBar page={page} pageSize={pageSize} count={rows.length} onPage={setPage} />
            </div>
          </div>
        </div>

        <div className="col-xl-5">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between">
              <span><i className="fas fa-chart-line" /> Alert analysis</span>
              {selected && <ThreatPriorityIndicator level={sevLabel(selected.sev)} />}
            </div>
            <div className="p-3 scrollable">
              {!selected && <EmptyState title="Nothing selected" body="Choose an alert to see why it fired." />}
              {selected && (
                <>
                  <div className="fw-semibold mb-2 ink">{selected.title}</div>
                  <p className="small text-muted mb-2">{selected.recommendation}</p>
                  <div className="d-flex align-items-center gap-3 mb-3">
                    <div style={{ fontSize: '1.8rem', fontWeight: 700, color: factorColor(selected.score) }}>{selected.score}</div>
                    <div>
                      <div className="stat-mini">Review-priority score</div>
                      <div className="mini-tag">Means review sooner · not a verdict</div>
                    </div>
                  </div>
                  {(selected.factors || []).map((factor) => (
                    <div className="mb-2" key={factor.label}>
                      <div className="d-flex justify-content-between small">
                        <span>{factor.label}</span>
                        <strong>{factor.score}</strong>
                      </div>
                      <div className="score-bar">
                        <div className="fill" style={{ width: `${factor.score}%`, background: factorColor(factor.score) }} />
                      </div>
                      <div className="stat-mini mt-1">{factor.note}</div>
                    </div>
                  ))}

                  <div className="mt-3 mb-2 fw-semibold small ink">Why it fired</div>
                  <ul className="small text-muted ps-3 mb-3">
                    {(selected.why || []).map((line) => <li key={line}>{line}</li>)}
                  </ul>

                  <div className="stat-mini mb-3">{selected.platform} · {selected.source} · {selected.due}</div>

                  {selected.validated && (
                    <div className="evidence-card mb-3">
                      <div className="d-flex justify-content-between align-items-start mb-1">
                        <span className="fw-semibold ink">{selected.validated.authority}</span>
                        <span className="mini-tag">{selected.validated.diverges ? 'Diverges' : 'Comparison'}</span>
                      </div>
                      <div className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.65 }}>{selected.validated.text}</div>
                      <div className="stat-mini mt-2">{selected.validated.claim_id}</div>
                    </div>
                  )}

                  {(selected.related || []).length > 0 && (
                    <>
                      <div className="fw-semibold small ink mb-2">Related in cluster</div>
                      {selected.related.map((row) => (
                        <button
                          type="button"
                          className="source-db-item"
                          key={row.claim_id}
                          onClick={() => navigate(`/verify?id=${encodeURIComponent(row.claim_id)}`)}
                        >
                          <div className="d-flex justify-content-between gap-2 mb-1">
                            <span className="mini-tag">{row.claim_id}</span>
                            <VerificationStatusBadge status={row.status} />
                          </div>
                          <div className="source-db-text">{row.text}</div>
                        </button>
                      ))}
                    </>
                  )}

                  <div className="d-grid gap-2 mt-3">
                    <button className="btn btn-primary-soft" disabled={!!busy || selected.mine} onClick={assign}>
                      <i className={`fas ${busy === 'assign' ? 'fa-spinner fa-spin' : 'fa-user-check'} me-1`} />
                      {selected.mine ? `Assigned to ${selected.assignee}` : 'Assign to me'}
                    </button>
                    <button className="btn btn-outline-soft" onClick={openInvestigation}>Open investigation</button>
                    {selected.cluster && (
                      <button className="btn btn-outline-soft" onClick={() => navigate(`/explorer?cluster=${encodeURIComponent(selected.cluster)}${selected.claim_id ? `&claim=${encodeURIComponent(selected.claim_id)}` : ''}`)}>
                        Open narrative cluster
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
