import { useEffect, useMemo, useState } from 'react';
import { Area, CartesianGrid, ComposedChart, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import PaginationBar, { pageSlice } from '../components/PaginationBar';
import { CountryFlag } from '../components/CountryFlag';
import { IntelligenceMetricCard } from '../components/ui';
import { readSession } from '../api/client';
import { exportGpobUrl, gpobGet } from '../api/gpob';

const tooltipStyle = { background: '#FFFFFF', border: '1px solid #D9EDE3', color: '#163B32', borderRadius: 12, fontSize: 12 };

export default function MediaStats() {
  const [period, setPeriod] = useState('7');
  const [stats, setStats] = useState(null);
  const [mode, setMode] = useState('volume');
  const [page, setPage] = useState(1);
  const pageSize = 6;

  useEffect(() => {
    gpobGet(`statistics/?period=${period}`).then((result) => { if (result.ok) setStats(result.data); });
  }, [period]);

  const download = async () => {
    const session = readSession();
    const response = await fetch(exportGpobUrl(), { headers: { Authorization: `Bearer ${session?.access || ''}` } });
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.headers.get('Content-Disposition')?.includes('docx') ? 'narrativeshield-media.docx' : 'narrativeshield-media.txt';
    link.click();
    URL.revokeObjectURL(url);
  };

  const sentiment = stats?.sentiment || {};
  const total = stats?.total || 1;
  const series = stats?.series || [];
  const peakLabel = useMemo(() => {
    if (!stats?.peak_day) return 'No peak yet';
    const match = series.find((row) => row.date === stats.peak_day);
    return match ? `${match.label} · ${stats.peak_count}` : stats.peak_day;
  }, [stats, series]);
  const delta = stats?.delta ?? 0;
  const trendLabel = stats?.trend === 'rising' ? 'Rising vs first half' : stats?.trend === 'easing' ? 'Easing vs first half' : 'Stable across window';

  return (
    <>
      <div className="d-flex justify-content-between flex-wrap gap-2 mb-3">
        <div className="d-flex gap-2 flex-wrap">
          {['3', '7', '14', '30'].map((item) => (
            <button key={item} className={`filter-chip ${period === item ? 'active' : ''}`} onClick={() => setPeriod(item)}>{item} days</button>
          ))}
        </div>
        <button className="btn btn-primary-soft" onClick={download}><i className="fas fa-file-word me-2" />Export corpus</button>
      </div>

      <div className="row g-3 mb-4">
        <div className="col-xl-3 col-md-6">
          <IntelligenceMetricCard label="Articles in window" value={stats?.total ?? '—'} hint={`${stats?.scope || 'Global'} · ${period}d`} icon="fa-newspaper" />
        </div>
        <div className="col-xl-3 col-md-6">
          <IntelligenceMetricCard
            label="vs prior window"
            value={stats ? `${delta > 0 ? '+' : ''}${delta}` : '—'}
            hint={`Previous ${stats?.previous_total ?? 0} articles`}
            icon="fa-arrow-right-arrow-left"
            tone={delta > 0 ? 'warning' : delta < 0 ? 'success' : 'info'}
          />
        </div>
        <div className="col-xl-3 col-md-6">
          <IntelligenceMetricCard label="Peak publication day" value={stats?.peak_count ?? 0} hint={peakLabel} icon="fa-chart-line" tone="warning" />
        </div>
        <div className="col-xl-3 col-md-6">
          <IntelligenceMetricCard label="Volume trend" value={stats?.trend || '—'} hint={trendLabel} icon="fa-wave-square" />
        </div>
      </div>

      <div className="card-stat mb-4 p-0 overflow-hidden">
        <div className="card-header-clean d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>Time series · daily ingest</span>
          <div className="d-flex gap-2">
            <button className={`filter-chip ${mode === 'volume' ? 'active' : ''}`} onClick={() => setMode('volume')}>Volume + 3-day MA</button>
            <button className={`filter-chip ${mode === 'sentiment' ? 'active' : ''}`} onClick={() => setMode('sentiment')}>Sentiment over time</button>
          </div>
        </div>
        <div className="p-3" style={{ height: 280 }}>
          {series.length === 0 ? (
            <div className="text-muted small p-4">No dated articles in this window. Fetch news or widen the period.</div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={series}>
                <CartesianGrid stroke="#D9EDE3" vertical={false} />
                <XAxis dataKey="label" tick={{ fill: '#4B6B60', fontSize: 11 }} axisLine={false} tickLine={false} interval="preserveStartEnd" />
                <YAxis allowDecimals={false} tick={{ fill: '#4B6B60', fontSize: 11 }} axisLine={false} tickLine={false} width={36} />
                <Tooltip contentStyle={tooltipStyle} />
                <Legend wrapperStyle={{ fontSize: 12, color: '#4B6B60' }} />
                {mode === 'volume' ? (
                  <>
                    <Area type="monotone" dataKey="articles" name="Articles" stroke="#3B82F6" fill="rgba(59,130,246,0.16)" strokeWidth={2} />
                    <Line type="monotone" dataKey="ma3" name="3-day average" stroke="#0D9488" strokeWidth={2} dot={false} />
                  </>
                ) : (
                  <>
                    <Area type="monotone" dataKey="negative" name="Negative" stackId="s" stroke="#F97373" fill="rgba(249,115,115,0.28)" />
                    <Area type="monotone" dataKey="neutral" name="Neutral" stackId="s" stroke="#3B82F6" fill="rgba(59,130,246,0.18)" />
                    <Area type="monotone" dataKey="positive" name="Positive" stackId="s" stroke="#059669" fill="rgba(5,150,105,0.22)" />
                  </>
                )}
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="px-3 pb-3 stat-mini">Counts follow publication date. The moving average is a smoothing aid, not a forecast.</div>
      </div>

      <div className="row g-4">
        <div className="col-lg-5">
          <div className="card-stat p-0 overflow-hidden h-100">
            <div className="card-header-clean">Sentiment mix</div>
            <div className="p-3">
              {Object.entries(sentiment).map(([label, value]) => (
                <div className="mb-3" key={label}>
                  <div className="d-flex justify-content-between small mb-1"><span>{label}</span><span>{value}</span></div>
                  <div className="score-bar"><div className="fill" style={{ width: `${Math.round((value / total) * 100)}%`, background: label === 'Negative' ? 'var(--red)' : label === 'Positive' ? 'var(--green)' : 'var(--info)' }} /></div>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div className="col-lg-7">
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean">Country comparison</div>
            <div className="p-3">
              {pageSlice(stats?.comparison || [], page, pageSize).map((row) => (
                <div className="queue-item" key={row.country}>
                  <div className="d-flex justify-content-between">
                    <strong className="d-inline-flex align-items-center gap-2">
                      <CountryFlag code={row.code} flag={row.flag} title={row.country} />
                      {row.country}
                    </strong>
                    <span className="badge-soft">{row.total}</span>
                  </div>
                  <div className="stat-mini mt-1">+{row.positive} / −{row.negative} / ○{row.neutral} · top {row.top_publisher} · latest {row.latest}</div>
                </div>
              ))}
              <PaginationBar page={page} pageSize={pageSize} count={(stats?.comparison || []).length} onPage={setPage} />
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
