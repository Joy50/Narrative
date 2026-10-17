import { useEffect, useState } from 'react';
import { useNavigate, useOutletContext } from 'react-router-dom';
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { rumorGet } from '../api/rumor';
import { IntelligenceMetricCard, ThreatPriorityIndicator } from '../components/ui';

const COLORS = { Unverified: '#64748B', Supported: '#059669', Refuted: '#DC2626', Misleading: '#D97706', 'Out of Context': '#2563EB', 'Synthetic Media': '#7C3AED', 'Satire / Parody': '#0D9488' };
const tooltipStyle = { background: '#FFFFFF', border: '1px solid #D9EDE3', borderRadius: 12, fontSize: 12 };
const stagePath = (claimId, kind) => `${kind === 'forensic' ? '/forensic?claim=' : kind === 'narrative' ? '/explorer?claim=' : '/verify?id='}${encodeURIComponent(claimId)}`;

function Panel({ title, action, children }) {
  return <section className="card-stat p-0 overflow-hidden h-100">
    <div className="card-header-clean d-flex justify-content-between align-items-center flex-wrap gap-2"><h2 className="h6 mb-0">{title}</h2>{action}</div>
    <div className="p-3">{children}</div>
  </section>;
}

export default function Dashboard() {
  const navigate = useNavigate();
  const { range = '7d' } = useOutletContext() || {};
  const days = range === '24h' ? 1 : range === '30d' ? 30 : 7;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(true);
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    rumorGet(`intelligence-overview/?days=${days}`).then((result) => {
      if (cancelled) return;
      if (result.ok) setData(result.data);
      else setError(result.data?.detail || 'Intelligence Overview could not be loaded.');
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [days, reload]);
  const metric = (key) => data ? data.totals[key] : '—';
  const snapshotDays = data?.days || days;
  const dateLabel = snapshotDays === 1 ? 'Today' : `Last ${snapshotDays} calendar days`;
  const time = (value) => new Date(value).toLocaleString(undefined, { timeZone: data?.timezone || 'Asia/Dhaka', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
  return <div className="overview-fit intelligence-overview" aria-busy={loading}>
    <div className="overview-toolbar">
      <div><h2 className="h5 mb-1">Investigation command center</h2><p className="text-muted small mb-0">Current queues across intake, analysis, alerts, and reporting.</p></div>
      <div className="d-flex gap-2 flex-wrap">
        <button className="btn btn-outline-soft" disabled={loading} onClick={() => setReload((value) => value + 1)}><i className={`fas ${loading ? 'fa-spinner fa-spin' : 'fa-rotate'} me-2`} />Refresh</button>
        <button className="btn btn-primary-soft" onClick={() => navigate('/submit')}><i className="fas fa-plus me-2" />Submit content</button>
      </div>
    </div>
    {loading && <p className="small text-muted mb-0" role="status">Updating overview…</p>}
    {error && <div className="alert alert-danger mb-0" role="alert">{error} {data && 'Showing the last loaded snapshot.'}<button className="btn btn-link" onClick={() => setReload((value) => value + 1)}>Retry</button></div>}
    <div className="row g-3">
      {[
        ['Unverified claims', 'unverified', `${metric('claims')} total claims`, 'fa-clock', 'warning', 'kpi-amber', '/scanner'],
        ['Unassigned claims', 'unassigned', 'Unverified and awaiting assignment', 'fa-user-plus', 'info', 'kpi-sky', '/scanner'],
        ['Active investigations', 'active_cases', 'Excludes published and closed', 'fa-folder-open', 'info', 'kpi-sky', '/cases'],
        ['High-priority alerts', 'high_priority_alerts', 'High and critical review leads', 'fa-bell', 'critical', 'kpi-coral', '/warning'],
        ['Report drafts', 'draft_reports', `${metric('pending_reports')} pending review`, 'fa-file-lines', 'success', 'kpi-mint', '/reports'],
        ['Analysis needs attention', 'analysis_attention', 'Latest failed or blocked stages', 'fa-triangle-exclamation', 'warning', 'kpi-amber', '#attention'],
      ].map(([label, key, hint, icon, tone, pastel, path]) => <div className="col-12 col-sm-6 col-xl-4 col-xxl-2" key={key}>
        <button className="overview-metric-link" aria-label={`Open ${label}`} onClick={() => path === '#attention' ? document.getElementById('overview-attention')?.scrollIntoView({ behavior: 'smooth' }) : navigate(path)}>
          <IntelligenceMetricCard label={label} value={metric(key)} hint={hint} icon={icon} tone={tone} pastel={pastel} />
        </button>
      </div>)}
    </div>
    {data && <>
      <Panel title="Investigation pipeline" action={<button className="btn btn-sm btn-outline-soft" onClick={() => navigate('/council')}>AI Council · {data.totals.council_runs} runs</button>}>
        <div className="overview-pipeline">{data.stages.map((stage, index) => <div className="overview-stage" key={stage.key}><span className="overview-stage-number">{index + 1}</span><div><div className="small text-muted">{stage.label}</div><strong>{stage.count}</strong></div></div>)}</div>
        <p className="stat-mini mb-0 mt-2">Current claim stages across all records. Media is routed through forensics; reports remain subject to review.</p>
      </Panel>
      <div className="row g-3">
        <div className="col-lg-7"><Panel title="Submitted claims" action={<span className="stat-mini">{dateLabel} · {data.timezone}</span>}>
          <div className="overview-chart" role="img" aria-label={`${data.intake.reduce((sum, point) => sum + point.claims, 0)} submitted claims in the selected calendar window`}>
            <ResponsiveContainer width="100%" height="100%"><BarChart data={data.intake}>
              <CartesianGrid stroke="#D9EDE3" vertical={false} /><XAxis dataKey="label" tick={{ fill: '#4B6B60', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" /><YAxis allowDecimals={false} width={28} tick={{ fontSize: 11 }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(5,150,105,0.06)' }} /><Bar dataKey="claims" name="Submitted claims" fill="#059669" radius={[5, 5, 0, 0]} />
            </BarChart></ResponsiveContainer>
          </div><p className="stat-mini mb-0">Recorded intake dates, including days with no submissions.</p>
        </Panel></div>
        <div className="col-lg-5"><Panel title="Claim classification" action={<span className="stat-mini">All records</span>}>
          {data.classifications.length ? <div className="overview-classification">
            <div className="overview-donut"><ResponsiveContainer width="100%" height="100%"><PieChart><Pie data={data.classifications} dataKey="value" nameKey="name" innerRadius={40} outerRadius={62} paddingAngle={2}>{data.classifications.map((item) => <Cell key={item.name} fill={COLORS[item.name] || '#64748B'} />)}</Pie><Tooltip contentStyle={tooltipStyle} /></PieChart></ResponsiveContainer></div>
            <ul className="overview-legend">{data.classifications.map((item) => <li key={item.name}><span><span className="overview-legend-dot" style={{ background: COLORS[item.name] || '#64748B' }} />{item.name}</span><strong>{item.value}</strong></li>)}</ul>
          </div> : <p className="text-muted small mb-0">No claims recorded yet.</p>}
        </Panel></div>
      </div>
      <div className="row g-3">
        <div className="col-lg-7"><Panel title="Verification queue" action={<button className="btn btn-sm btn-outline-soft" onClick={() => navigate('/scanner')}>Open scanner</button>}>
          {!data.queue.length && <p className="small text-muted mb-0">No unverified claims waiting.</p>}
          {data.queue.map((claim) => <button className="overview-record" key={claim.claim_id} onClick={() => navigate(stagePath(claim.claim_id, claim.stage))}>
            <div className="d-flex justify-content-between align-items-start gap-2"><strong className="overview-record-title">{claim.text}</strong><ThreatPriorityIndicator level={claim.priority} /></div>
            <div className="stat-mini mt-1">{claim.claim_id} · {claim.analyst || 'Unassigned'} · {claim.stage.replace('_', ' ')}{claim.media_type ? ` · ${claim.media_type}` : ''}</div>
          </button>)}
        </Panel></div>
        <div className="col-lg-5"><Panel title="Priority alerts" action={<button className="btn btn-sm btn-outline-soft" onClick={() => navigate('/warning')}>View all alerts</button>}>
          {!data.alerts.length && <p className="small text-muted mb-0">No active alerts. Alerts are internal review leads.</p>}
          {data.alerts.map((alert) => <button className="overview-record" key={alert.id} onClick={() => navigate(`/warning?alert=${encodeURIComponent(alert.id)}`)}>
            <div className="d-flex justify-content-between gap-2 align-items-start"><strong className="overview-record-title">{alert.title}</strong><ThreatPriorityIndicator level={alert.sev.charAt(0).toUpperCase() + alert.sev.slice(1)} /></div>
            <div className="stat-mini mt-1">{alert.assignee || 'Unassigned'} · {alert.ref}</div>
          </button>)}
        </Panel></div>
      </div>
      <div className="row g-3" id="overview-attention">
        <div className="col-lg-6"><Panel title="Analysis and provider readiness">
          <div className="overview-provider"><span>OpenAI verification and narrative<br /><small className="text-muted">{data.providers.openai.model || 'No model configured'}</small></span><span className={`overview-readiness ${data.providers.openai.ready ? 'ready' : 'blocked'}`}>{data.providers.openai.ready ? 'Configured' : 'Setup required'}</span></div>
          <div className="overview-provider mb-3"><span>Image, audio, and video forensics</span><span className={`overview-readiness ${data.providers.forensic.ready ? 'ready' : 'blocked'}`}>{data.providers.forensic.ready ? 'Configured' : 'Setup required'}</span></div>
          <p className="stat-mini">Configuration status does not test provider availability or account quota.</p>
          {!data.attention.length && <p className="small text-muted mb-0">No failed or blocked latest analysis stages.</p>}
          {data.attention.map((run) => <button className="overview-record" key={run.id} onClick={() => navigate(stagePath(run.claim_id, run.kind))}><strong>{run.claim_id} · {run.kind}</strong><span className="stat-mini d-block">{run.error || run.status}</span></button>)}
        </Panel></div>
        <div className="col-lg-6"><Panel title="Recent reports" action={<button className="btn btn-sm btn-outline-soft" onClick={() => navigate('/reports')}>Report library</button>}>
          {!data.reports.length && <p className="small text-muted mb-0">No intelligence reports yet. Start with a claim investigation.</p>}
          {data.reports.map((report) => <button className="overview-record" key={report.id} onClick={() => navigate(`/reports?report=${report.id}`)}><div className="d-flex justify-content-between gap-2"><strong>{report.title}</strong><span className="badge-soft">{report.status}</span></div><span className="stat-mini">Report #{report.id} · v{report.version}</span></button>)}
        </Panel></div>
      </div>
      <Panel title="Recent investigation activity" action={<span className="stat-mini">{dateLabel}</span>}>
        {!data.activity.length && <p className="small text-muted mb-0">No case or report activity in this window.</p>}
        <div className="overview-activity">{data.activity.map((event) => <button className="overview-record" key={event.id} onClick={() => navigate(event.path)}><strong>{event.title}</strong><span className="stat-mini d-block">{event.reference} · {event.actor || 'System'} · {time(event.created_at)}</span></button>)}</div>
      </Panel>
      <p className="stat-mini mb-2">Snapshot updated {time(data.generated_at)} ({data.timezone}). Queue totals cover all records; the selected window applies to intake and activity.</p>
    </>}
  </div>;
}
