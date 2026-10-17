import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { casesGet, casesSend, mapCase } from '../api/cases';
import PaginationBar, { listCount, listResults } from '../components/PaginationBar';
import { EmptyState } from '../components/ui';
import { useApp } from '../context/AppContext';
import WorkflowPanel from '../components/WorkflowPanel';

const ACTION_META = {
  triage: { label: 'Mark triaged', icon: 'fa-filter' },
  start_analysis: { label: 'Start analysis', icon: 'fa-search' },
  submit_review: { label: 'Submit analyst review', icon: 'fa-clipboard-check' },
  escalate: { label: 'Escalate to supervisor', icon: 'fa-user-tie' },
  approve: { label: 'Approve case', icon: 'fa-check' },
  publish: { label: 'Publish finding', icon: 'fa-bullhorn' },
  request_evidence: { label: 'Request more evidence', icon: 'fa-triangle-exclamation', danger: true },
  return_analysis: { label: 'Return to analysis', icon: 'fa-rotate-left' },
  return_review: { label: 'Return to analyst', icon: 'fa-rotate-left' },
  reopen: { label: 'Reopen case', icon: 'fa-folder-open' },
  close: { label: 'Close case', icon: 'fa-box-archive' },
  assign: { label: 'Assign to me', icon: 'fa-user' },
};

const EMPTY_STATS = {
  total: 0,
  open: 0,
  mine: 0,
  critical: 0,
  awaiting_review: 0,
  new_triaged: 0,
  in_analysis: 0,
  supervisor: 0,
  approved_published: 0,
  needs_reopened: 0,
};

function csvCell(value) {
  const text = String(value ?? '');
  if (/[",\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`;
  return text;
}

export default function Cases() {
  const { notify, ready } = useApp();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const claimParam = params.get('claim') || '';
  const draftParam = params.get('draft') || '';
  const draftSummary = params.get('summary') || '';
  const draftPriority = params.get('priority') || 'Normal';

  const [stats, setStats] = useState(EMPTY_STATS);
  const [rows, setRows] = useState([]);
  const [count, setCount] = useState(0);
  const [selected, setSelected] = useState(null);
  const [focusNumber, setFocusNumber] = useState(params.get('case') || '');
  useEffect(() => {
    if (params.get('case')) setFocusNumber(params.get('case'));
  }, [params]);
  const [bucket, setBucket] = useState('all');
  const [query, setQuery] = useState('');
  const [debounced, setDebounced] = useState('');
  const [page, setPage] = useState(1);
  const [online, setOnline] = useState(true);
  const [busy, setBusy] = useState('');
  const [showNew, setShowNew] = useState(false);
  const [draft, setDraft] = useState({ title: '', summary: '', priority: 'Normal', evidence_count: 1, assign_me: true });
  const [notes, setNotes] = useState('');
  const [tick, setTick] = useState(0);
  const pageSize = 5;

  useEffect(() => {
    const handle = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    setPage(1);
  }, [debounced, bucket]);

  const load = useCallback(async () => {
    const qs = new URLSearchParams({
      page: String(page),
      page_size: String(pageSize),
      q: debounced,
      bucket: bucket === 'all' ? '' : bucket,
    });
    const [overviewRes, listRes] = await Promise.all([
      casesGet('overview/'),
      casesGet(`?${qs.toString()}`),
    ]);
    if (overviewRes.ok) setStats({ ...EMPTY_STATS, ...overviewRes.data });
    if (listRes.ok) {
      setRows(listResults(listRes.data).map(mapCase));
      setCount(listCount(listRes.data));
      setOnline(true);
    } else {
      setOnline(false);
    }
  }, [page, debounced, bucket, tick]);

  useEffect(() => {
    if (ready) load();
  }, [ready, load]);

  useEffect(() => {
    if (!ready || (!claimParam && !draftParam)) return undefined;
    let cancelled = false;
    (async () => {
      const body = claimParam
        ? { claim_id: claimParam }
        : { title: draftParam, summary: draftSummary, priority: draftPriority };
      const opened = await casesSend('open/', { body });
      if (cancelled) return;
      if (!opened.ok) {
        notify(opened.data?.detail || 'Could not open investigation');
        return;
      }
      const mapped = mapCase(opened.data);
      setFocusNumber(mapped.id);
      setSelected(mapped);
      if (mapped.created) notify(`Investigation ${mapped.id} opened`);
      setTick((value) => value + 1);
    })();
    return () => {
      cancelled = true;
    };
  }, [ready, claimParam, draftParam, draftSummary, draftPriority, notify]);

  useEffect(() => {
    if (!focusNumber) return undefined;
    let cancelled = false;
    (async () => {
      const res = await casesGet(`by-number/${encodeURIComponent(focusNumber)}/`);
      if (!cancelled && res.ok) setSelected(mapCase(res.data));
    })();
    return () => {
      cancelled = true;
    };
  }, [focusNumber]);

  useEffect(() => {
    if (focusNumber || selected || !rows.length) return;
    setFocusNumber(rows[0].id);
  }, [rows, focusNumber, selected]);

  useEffect(() => {
    setNotes(selected?.notes || '');
  }, [selected]);

  const chips = [
    ['all', `All (${stats.total})`],
    ['mine', `Assigned to me (${stats.mine})`],
    ['critical', `Critical (${stats.critical})`],
    ['review', `Awaiting review (${stats.awaiting_review})`],
  ];

  const cards = [
    [stats.new_triaged, 'New / Triaged', '#cbdae7'],
    [stats.in_analysis, 'In Analysis', '#4fc3f7'],
    [stats.awaiting_review, 'Awaiting Review', '#d9a23b'],
    [stats.supervisor, 'Supervisor', '#8a5db8'],
    [stats.approved_published, 'Approved / Published', '#2e9e6b'],
    [stats.needs_reopened, 'Needs / Reopened', '#a8621a'],
  ];

  const runAction = async (action) => {
    if (!selected) return;
    setBusy(action);
    const res = await casesSend(`${selected.pk}/transition/`, { body: { action } });
    setBusy('');
    if (!res.ok) {
      notify(res.data?.detail || 'That step is not available');
      return;
    }
    const mapped = mapCase(res.data);
    setSelected(mapped);
    setFocusNumber(mapped.id);
    notify(`${mapped.id} · ${mapped.state}`);
    load();
  };

  const saveNotes = async () => {
    if (!selected || notes === selected.notes) return;
    setBusy('notes');
    const res = await casesSend(`${selected.pk}/`, { method: 'PATCH', body: { notes } });
    setBusy('');
    if (!res.ok) {
      notify(res.data?.detail || 'Notes were not saved');
      return;
    }
    setSelected(mapCase(res.data));
    notify('Case notes saved');
  };

  const createCase = async () => {
    if (!draft.title.trim()) {
      notify('A title is required');
      return;
    }
    setBusy('create');
    const res = await casesSend('', { body: { ...draft, title: draft.title.trim() } });
    setBusy('');
    if (!res.ok) {
      notify(res.data?.detail || 'Investigation was not created');
      return;
    }
    const mapped = mapCase(res.data);
    setShowNew(false);
    setDraft({ title: '', summary: '', priority: 'Normal', evidence_count: 1, assign_me: true });
    setSelected(mapped);
    setFocusNumber(mapped.id);
    notify(`Investigation ${mapped.id} drafted`);
    load();
  };

  const exportList = async () => {
    setBusy('export');
    const qs = new URLSearchParams({ q: debounced, bucket: bucket === 'all' ? '' : bucket });
    const res = await casesGet(`export/?${qs.toString()}`);
    setBusy('');
    if (!res.ok) {
      notify('Case list was not exported');
      return;
    }
    const header = ['case_number', 'title', 'state', 'priority', 'assignee_name', 'updated_label'];
    const lines = [header.join(',')].concat(
      (res.data.results || []).map((row) => header.map((key) => csvCell(row[key])).join(','))
    );
    const blob = new Blob([lines.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'investigation-cases.csv';
    link.click();
    URL.revokeObjectURL(url);
    notify('Case list exported');
  };

  const initials = (name) => (name && name !== 'Unassigned'
    ? name.split(' ').map((part) => part[0]).join('').slice(0, 2)
    : '?');

  return (
    <>
      <div className="d-flex justify-content-end gap-2 mb-3">
        <button className="btn btn-outline-soft" disabled={!!busy} onClick={exportList}>
          <i className={`fas ${busy === 'export' ? 'fa-spinner fa-spin' : 'fa-file-export'} me-1`} />Export list
        </button>
        <button className="btn btn-primary-soft" onClick={() => setShowNew((open) => !open)}>
          <i className="fas fa-plus me-1" />New investigation
        </button>
      </div>

      {showNew && (
        <div className="card-stat mb-4 p-3">
          <div className="fw-semibold mb-2">New investigation</div>
          <div className="row g-2">
            <div className="col-md-6">
              <input className="form-control" placeholder="Title" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} />
            </div>
            <div className="col-md-3">
              <select className="form-select" value={draft.priority} onChange={(e) => setDraft({ ...draft, priority: e.target.value })}>
                {['Critical', 'High', 'Normal', 'Low'].map((level) => <option key={level}>{level}</option>)}
              </select>
            </div>
            <div className="col-md-3">
              <input className="form-control" type="number" min="0" max="999" value={draft.evidence_count} onChange={(e) => setDraft({ ...draft, evidence_count: Number(e.target.value) })} />
            </div>
            <div className="col-12">
              <input className="form-control" placeholder="Short summary" value={draft.summary} onChange={(e) => setDraft({ ...draft, summary: e.target.value })} />
            </div>
          </div>
          <div className="d-flex justify-content-between align-items-center mt-3 flex-wrap gap-2">
            <label className="small text-muted mb-0">
              <input className="form-check-input me-2" type="checkbox" checked={draft.assign_me} onChange={(e) => setDraft({ ...draft, assign_me: e.target.checked })} />
              Assign to me
            </label>
            <button className="btn btn-primary-soft" disabled={!!busy} onClick={createCase}>
              <i className={`fas ${busy === 'create' ? 'fa-spinner fa-spin' : 'fa-folder-plus'} me-1`} />Create case
            </button>
          </div>
        </div>
      )}

      <div className="row g-3 mb-4">
        {cards.map(([n, label, color]) => (
          <div className="col-xl-2 col-md-4 col-6" key={label}>
            <div className="stat-card-mini"><div className="num">{n}</div><div className="lbl">{label}</div><div className="bar" style={{ background: color }} /></div>
          </div>
        ))}
      </div>

      <div className="card-stat mb-4 p-3">
        <div className="row g-2 align-items-center">
          <div className="col-md-5">
            <div className="search-wrap">
              <i className="fas fa-search" />
              <input className="form-control" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Search by case number, title, assignee…" />
            </div>
          </div>
          <div className="col-md-7 d-flex justify-content-md-end flex-wrap gap-2">
            {chips.map(([id, label]) => (
              <button key={id} className={`filter-chip ${bucket === id ? 'active' : ''}`} onClick={() => setBucket(id)}>{label}</button>
            ))}
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between">
              <span><i className="fas fa-list" /> Case registry</span>
              <span className="badge-soft">{stats.total} total · {stats.open} open</span>
            </div>
            <div className="scrollable">
              {!online && <EmptyState title="Case registry unavailable" body="Start the Django API, then reload this desk." />}
              {online && rows.length === 0 && <EmptyState title="No matching cases" body="Adjust the filters or open a new investigation." />}
              {rows.length > 0 && (
                <div className="case-row header"><div>Case</div><div>State</div><div>Assignee</div><div>Priority</div><div>Updated</div><div /></div>
              )}
              {rows.map((row) => (
                <div key={row.id} className={`case-row ${selected?.id === row.id ? 'selected' : ''}`} onClick={() => { setSelected(row); setFocusNumber(row.id); }}>
                  <div>
                    <div className="case-id">{row.id}</div>
                    <div>{row.title}<small className="d-block text-muted">{row.sub}</small></div>
                  </div>
                  <div><span className={`state-badge ${row.scls}`}>{row.state}</span></div>
                  <div className="d-flex align-items-center gap-2"><span className={`avatar ${row.av}`}>{initials(row.who)}</span><span className="small">{row.who}</span></div>
                  <div><span className={`prio ${row.pcls}`} />{row.prio}</div>
                  <div className="stat-mini">{row.when}</div>
                  <div><i className="fas fa-chevron-right" style={{ color: '#b0c7db' }} /></div>
                </div>
              ))}
              <PaginationBar page={page} pageSize={pageSize} count={count} onPage={setPage} />
            </div>
          </div>
        </div>
        <div className="col-xl-4">
          <div className="card-stat p-0 overflow-hidden">
            {!selected && <EmptyState title="No case selected" body="Choose a case to review its lifecycle." />}
            {selected && (
              <>
                <div className="detail-header">
                  <div className="small" style={{ color: '#9fc4dd' }}>{selected.id}</div>
                  <div className="fw-semibold">{selected.title}</div>
                </div>
                <div className="p-3">
                  <div className="meta-row"><span className="label">State</span><span className={`state-badge ${selected.scls}`}>{selected.state}</span></div>
                  <div className="meta-row"><span className="label">Assignee</span><span className="value">{selected.who}</span></div>
                  <div className="meta-row"><span className="label">Priority</span><span className="value">{selected.prio}</span></div>
                  <div className="meta-row"><span className="label">Linked claim</span><span className="value">{selected.claimId || 'None'}</span></div>
                  <label className="stat-mini d-block mt-3 mb-1">Analyst notes</label>
                  <textarea className="form-control mb-2" rows="3" value={notes} onChange={(e) => setNotes(e.target.value)} />
                  <button className="btn btn-outline-soft btn-sm mb-3" disabled={!!busy || notes === selected.notes} onClick={saveNotes}>
                    <i className={`fas ${busy === 'notes' ? 'fa-spinner fa-spin' : 'fa-floppy-disk'} me-1`} />Save notes
                  </button>
                  <div className="d-grid gap-2">
                    <button className="transition-btn primary" disabled={!selected.claimId} onClick={() => navigate(`/forensic?claim=${encodeURIComponent(selected.claimId)}`)}><i className="fas fa-microscope" />Open forensic workbench</button>
                    <button className="transition-btn" onClick={() => navigate(`/vault?case=${encodeURIComponent(selected.id)}`)}>Case evidence repository</button>
                    {selected.claimId && <>
                      <button className="transition-btn" onClick={() => navigate(`/council?claim=${encodeURIComponent(selected.claimId)}`)}>AI Council and reports</button>
                      <button className="transition-btn" onClick={() => navigate(`/explorer?claim=${encodeURIComponent(selected.claimId)}`)}>Narrative analysis</button>
                    </>}
                    <button
                      className="transition-btn"
                      onClick={() => (selected.claimId ? navigate(`/verify?id=${encodeURIComponent(selected.claimId)}`) : notify('This case has no linked claim'))}
                    >
                      <i className="fas fa-check-circle" />Fact verification
                    </button>
                    {selected.actions.map((action) => {
                      const meta = ACTION_META[action];
                      if (!meta) return null;
                      return (
                        <button
                          key={action}
                          className={`transition-btn ${meta.danger ? 'danger' : ''}`}
                          disabled={!!busy}
                          onClick={() => runAction(action)}
                        >
                          <i className={`fas ${busy === action ? 'fa-spinner fa-spin' : meta.icon}`} />
                          {meta.label}
                        </button>
                      );
                    })}
                  </div>
                  {selected.events?.length > 0 && (
                    <div className="mt-3">
                      <div className="stat-mini mb-2">Lifecycle</div>
                      {selected.events.slice(0, 6).map((event) => (
                        <div className="activity-item" key={event.id}>
                          <div className="time">{event.when}</div>
                          <strong>{event.label}</strong>
                          {event.actor_name ? ` · ${event.actor_name}` : ''}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>
      {selected?.claimId && <WorkflowPanel key={selected.claimId} claimId={selected.claimId} onChange={load} />}
    </>
  );
}
