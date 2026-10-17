import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Area, Bar, BarChart, CartesianGrid, Cell, ComposedChart, Line, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { gpobGet } from '../api/gpob';
import { rumorGet } from '../api/rumor';
import { IntelligenceMetricCard, ThreatPriorityIndicator } from '../components/ui';

const TREND = [
  { label: 'T-11', claims: 42 }, { label: 'T-10', claims: 55 }, { label: 'T-9', claims: 48 },
  { label: 'T-8', claims: 61 }, { label: 'T-7', claims: 78 }, { label: 'T-6', claims: 70 },
  { label: 'T-5', claims: 84 }, { label: 'T-4', claims: 91 }, { label: 'T-3', claims: 88 },
  { label: 'T-2', claims: 104 }, { label: 'T-1', claims: 97 }, { label: 'Now', claims: 112 },
];
const CLASSES = [
  { name: 'Unverified', value: 47, color: '#64748B' },
  { name: 'Misleading', value: 18, color: '#F59E0B' },
  { name: 'Synthetic', value: 9, color: '#38BDF8' },
  { name: 'Supported', value: 31, color: '#10B981' },
  { name: 'False / refuted', value: 12, color: '#EF4444' },
];

const tooltipStyle = { background: '#FFFFFF', border: '1px solid #D9EDE3', color: '#163B32', borderRadius: 12, fontSize: 12, boxShadow: '0 10px 28px rgba(20, 83, 45, 0.08)' };

export default function Dashboard() {
  const navigate = useNavigate();
  const [media, setMedia] = useState(null);
  const [alerts, setAlerts] = useState(null);

  useEffect(() => {
    gpobGet('statistics/?period=7').then((result) => { if (result.ok) setMedia(result.data); });
    rumorGet('alerts/').then((result) => { if (result.ok) setAlerts(result.data); });
  }, []);

  const series = media?.series || [];
  const trend = media?.trend || '—';
  const delta = media?.delta ?? 0;

  return (
    <div className="overview-fit">
      <div className="row g-2">
        {[
          ['Awaiting verification', '47', '12 high priority', 'fa-clock', 'warning', 'kpi-amber'],
          ['High-priority alerts', alerts ? String((alerts.overview?.critical || 0) + (alerts.overview?.high || 0)) : '—', alerts ? `${alerts.overview?.unassigned ?? 0} unassigned` : 'loading', 'fa-bell', 'critical', 'kpi-coral'],
          ['Active investigations', '23', '5 critical', 'fa-folder-open', 'info', 'kpi-sky'],
          ['Verified false claims', '12', 'human-reviewed', 'fa-ban', 'violet', 'kpi-violet'],
        ].map(([label, value, hint, icon, tone, pastel]) => (
          <div className="col-xl-3 col-md-6" key={label}>
            <IntelligenceMetricCard label={label} value={value} hint={hint} icon={icon} tone={tone} pastel={pastel} />
          </div>
        ))}
      </div>

      <div className="row g-3">
        <div className="col-lg-7">
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between">
              <span>Claim volume · 12 intervals</span>
              <span className="stat-mini">Observed intake, not a truth score</span>
            </div>
            <div className="px-3 pt-2 pb-1" style={{ height: 148 }}>
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={TREND}>
                  <CartesianGrid stroke="#D9EDE3" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#4B6B60', fontSize: 11 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={tooltipStyle} cursor={{ fill: 'rgba(5,150,105,0.06)' }} />
                  <Bar dataKey="claims" fill="#059669" radius={[6, 6, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>
        <div className="col-lg-5">
          <div className="card-stat p-0 overflow-hidden h-100">
            <div className="card-header-clean">Classification mix</div>
            <div className="p-3">
              <div className="d-flex align-items-center gap-3">
                <div style={{ width: 110, height: 110, flexShrink: 0 }}>
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={CLASSES} dataKey="value" nameKey="name" innerRadius={34} outerRadius={50} paddingAngle={2}>
                        {CLASSES.map((item) => <Cell key={item.name} fill={item.color} />)}
                      </Pie>
                      <Tooltip contentStyle={tooltipStyle} />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-grow-1">
                  {CLASSES.map((item) => (
                    <div className="d-flex justify-content-between small mb-1" key={item.name}>
                      <span><span className="dot" style={{ background: item.color, boxShadow: 'none' }} />{item.name}</span>
                      <span>{item.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="row g-3 overview-body flex-grow-1">
        <div className="col-lg-7 d-flex">
          <div className="card-stat p-0 overflow-hidden w-100 d-flex flex-column">
            <div className="card-header-clean d-flex justify-content-between align-items-center flex-wrap gap-2">
              <span>Media time series · 7 days</span>
              <div className="d-flex align-items-center gap-2">
                <span className="stat-mini">{media ? `${media.total} articles · ${delta > 0 ? '+' : ''}${delta} vs prior · ${trend}` : 'Loading corpus…'}</span>
                <button className="btn btn-sm btn-outline-soft" onClick={() => navigate('/media-stats')}>Insights</button>
              </div>
            </div>
            <div className="px-3 pt-2 pb-1 flex-grow-1" style={{ minHeight: 148 }}>
              {series.length === 0 ? (
                <div className="stat-mini p-3">No dated articles in this window.</div>
              ) : (
                <ResponsiveContainer width="100%" height="100%">
                  <ComposedChart data={series}>
                    <CartesianGrid stroke="#D9EDE3" vertical={false} />
                    <XAxis dataKey="label" tick={{ fill: '#4B6B60', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                    <YAxis allowDecimals={false} tick={{ fill: '#4B6B60', fontSize: 11 }} axisLine={false} tickLine={false} width={28} />
                    <Tooltip contentStyle={tooltipStyle} />
                    <Area type="monotone" dataKey="articles" name="Articles" stroke="#3B82F6" fill="rgba(59,130,246,0.16)" strokeWidth={2} />
                    <Line type="monotone" dataKey="ma3" name="3-day average" stroke="#0D9488" strokeWidth={2} dot={false} />
                  </ComposedChart>
                </ResponsiveContainer>
              )}
            </div>
            <div className="px-3 pb-2 stat-mini">3-day average · not a forecast</div>
          </div>
        </div>

        <div className="col-lg-5 d-flex">
          <div className="card-stat p-0 overflow-hidden w-100 d-flex flex-column">
            <div className="card-header-clean d-flex justify-content-between">
              <span>Upcoming top 5 alerts</span>
              <button className="btn btn-sm btn-outline-soft" onClick={() => navigate('/warning')}>Alert analysis</button>
            </div>
            <div className="p-2 flex-grow-1">
              {!alerts && <div className="stat-mini p-2">Loading alert analysis…</div>}
              {alerts && (alerts.alerts || []).length === 0 && <div className="stat-mini p-2">No active watch alerts.</div>}
              {(alerts?.alerts || []).slice(0, 5).map((alert, index) => (
                <div className="queue-item overview-alert" key={alert.id} onClick={() => navigate(`/warning?alert=${encodeURIComponent(alert.id)}`)}>
                  <div className="d-flex align-items-start gap-2">
                    <span className="overview-rank">{index + 1}</span>
                    <div className="flex-grow-1" style={{ minWidth: 0 }}>
                      <div className="d-flex justify-content-between gap-2 align-items-start">
                        <strong className="overview-alert-title">{alert.title}</strong>
                        <ThreatPriorityIndicator level={alert.sev[0].toUpperCase() + alert.sev.slice(1)} />
                      </div>
                      <div className="stat-mini mt-1">{alert.due} · review {alert.score} · {alert.meta}</div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
