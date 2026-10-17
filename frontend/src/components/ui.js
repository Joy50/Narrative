export function IntelligenceMetricCard({ label, value, hint, icon, tone = 'info', pastel = '' }) {
  const color = tone === 'critical' ? 'var(--red)' : tone === 'warning' ? 'var(--amber)' : tone === 'success' ? 'var(--emerald)' : tone === 'violet' ? 'var(--violet)' : 'var(--blue)';
  return (
    <div className={`card-stat kpi-card ${pastel}`.trim()}>
      <div className="card-body d-flex justify-content-between align-items-center">
        <div>
          <div className="stat-label">{label}</div>
          <div className="stat-value">{value}</div>
          {hint && <span className="badge-soft mt-1 d-inline-block">{hint}</span>}
        </div>
        <span className="kpi-icon"><i className={`fas ${icon} stat-icon`} style={{ color }} /></span>
      </div>
    </div>
  );
}

export function VerificationStatusBadge({ status }) {
  const map = {
    Supported: ['v-supported', 'fa-circle-check'],
    Verified: ['v-supported', 'fa-circle-check'],
    Unverified: ['v-unverified', 'fa-clock'],
    Misleading: ['v-misleading', 'fa-triangle-exclamation'],
    'Out of Context': ['v-ctx', 'fa-shuffle'],
    'Synthetic Media': ['v-synthetic', 'fa-robot'],
    False: ['v-refuted', 'fa-xmark'],
    Refuted: ['v-refuted', 'fa-xmark'],
    'Satire / Parody': ['v-ctx', 'fa-masks-theater'],
  };
  const [cls, icon] = map[status] || ['v-unverified', 'fa-circle'];
  return <span className={`verdict-badge ${cls}`}><i className={`fas ${icon} me-1`} />{status}</span>;
}

export function ThreatPriorityIndicator({ level }) {
  const tone = level === 'Critical' ? 'sev-critical' : level === 'High' ? 'sev-high' : level === 'Medium' ? 'sev-medium' : 'sev-low';
  return <span className={`sev-badge ${tone}`}>{level}</span>;
}

export function EmptyState({ title, body, icon = 'fa-inbox' }) {
  return (
    <div className="text-center py-5 text-muted">
      <i className={`fas ${icon} mb-2`} style={{ fontSize: '1.4rem' }} />
      <div className="fw-semibold">{title}</div>
      <div className="small">{body}</div>
    </div>
  );
}

export function EvidenceSourceCard({ name, snippet, meta, stance, stanceClass }) {
  return (
    <div className="evidence-card">
      <div className="d-flex justify-content-between align-items-start mb-1">
        <span className="fw-semibold ink">{name}</span>
        {stance && <span className={`stance-tag ${stanceClass}`}>{stance}</span>}
      </div>
      <div className="text-muted" style={{ fontSize: '0.82rem', lineHeight: 1.65 }}>{snippet}</div>
      {meta && <div className="stat-mini mt-2">{meta}</div>}
    </div>
  );
}

export function AnalystActivityPanel({ items }) {
  return (
    <>
      {items.map((item) => (
        <div className="activity-item" key={`${item.time}-${item.ref}`}>
          <div className="time">{item.time} ago</div>
          <strong>{item.action}</strong> · {item.ref}
        </div>
      ))}
    </>
  );
}

export function ForensicMediaViewer({ fileName, meta, badge, children }) {
  return (
    <div className="media-viewer mb-3">
      <div className="text-center">
        {children}
        <div>{fileName}</div>
        <div style={{ fontSize: '0.72rem', color: 'var(--muted-2)' }}>{meta}</div>
      </div>
      {badge}
    </div>
  );
}

export function InvestigationDataTable({ columns, rows, onRowClick }) {
  return (
    <div className="p-0">
      <div className="case-row header overview" style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
        {columns.map((col) => <div key={col}>{col}</div>)}
      </div>
      {rows.map((row) => (
        <div className="case-row overview" key={row.id} onClick={() => onRowClick?.(row)} style={{ gridTemplateColumns: `repeat(${columns.length}, 1fr)` }}>
          {row.cells.map((cell, i) => <div key={i}>{cell}</div>)}
        </div>
      ))}
    </div>
  );
}

export function AlertNotificationPanel({ alerts, onSelect }) {
  return (
    <div className="p-3">
      {alerts.map((alert) => (
        <div className={`alert-card ${alert.sev}`} key={alert.title} onClick={() => onSelect?.(alert)}>
          <div className="d-flex justify-content-between">
            <ThreatPriorityIndicator level={alert.sev[0].toUpperCase() + alert.sev.slice(1)} />
            <span className="stat-mini">{alert.time}</span>
          </div>
          <div className="alert-title mt-1">{alert.title}</div>
          <div className="alert-desc">{alert.desc}</div>
        </div>
      ))}
    </div>
  );
}

export function ReportPreview({ title, children }) {
  return (
    <div className="doc-preview">
      <div className="text-center mb-3">
        <div className="stat-mini">NARRATIVESHIELD · INTELLIGENCE PRODUCT</div>
        <div className="small" style={{ color: 'var(--amber)', fontWeight: 600 }}>RESTRICTED — AUTHORIZED RECIPIENTS ONLY</div>
      </div>
      <h1>{title}</h1>
      {children}
    </div>
  );
}

export function SkeletonBlock({ height = 120 }) {
  return <div className="skeleton-block" style={{ height, borderRadius: 10 }} />;
}
