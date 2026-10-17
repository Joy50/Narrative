import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { rumorGet, rumorSend } from '../api/rumor';
import { request } from '../api/client';
import { useApp } from '../context/AppContext';

const TYPES = [
  { id: 'url', icon: 'fa-link', title: 'URL', desc: 'Web page or post' },
  { id: 'text', icon: 'fa-file-lines', title: 'Text', desc: 'Claim or excerpt' },
  { id: 'media', icon: 'fa-photo-video', title: 'Media', desc: 'Image · audio · video' },
];

const EMPTY = {
  url: '',
  language: 'Bangla (বাংলা)',
  platform: 'Facebook',
  text: '',
  textSource: '',
  description: '',
  sourceUrl: '',
  priority: 'High',
  notes: '',
};

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function fileKind(file) {
  if (file.type.startsWith('video/')) return { cls: 'fi-video', icon: 'fa-video' };
  if (file.type.startsWith('image/')) return { cls: 'fi-image', icon: 'fa-image' };
  if (file.type.startsWith('audio/')) return { cls: 'fi-audio', icon: 'fa-volume-up' };
  return { cls: 'fi-doc', icon: 'fa-file' };
}

export default function SubmitContent() {
  const { user, notify } = useApp();
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const [type, setType] = useState('url');
  const [form, setForm] = useState(EMPTY);
  const [files, setFiles] = useState([]);
  const [authorized, setAuthorized] = useState(true);
  const [dragover, setDragover] = useState(false);
  const [status, setStatus] = useState('idle');
  const [recent, setRecent] = useState([]);
  const [recentError, setRecentError] = useState('');
  useEffect(() => {
    let cancelled = false;
    rumorGet('claims/?page_size=3').then((result) => {
      if (cancelled) return;
      if (result.ok) setRecent(result.data.results || []);
      else setRecentError('Recent submissions could not be loaded.');
    });
    return () => { cancelled = true; };
  }, []);

  const hasContent = type === 'url'
    ? Boolean(form.url.trim())
    : type === 'text'
      ? Boolean(form.text.trim())
      : files.length > 0;

  const step = status === 'done' ? 4 : authorized && hasContent ? 3 : 2;

  const checks = useMemo(() => ([
    { ok: true, title: 'Source authorization', desc: 'Approved public source · platform rules respected', icon: 'fa-check-circle', tone: 'ci-ok' },
    {
      ok: type !== 'media' || files.length > 0,
      title: 'File type & size',
      desc: files[0] ? `${files[0].type || 'file'} · ${formatSize(files[0].size)} · within 500 MB limit` : type === 'media' ? 'Choose an original image, audio, or video file up to 500 MB' : 'No file required for text or URL intake',
      icon: type === 'media' && !files.length ? 'fa-clock' : 'fa-check-circle',
      tone: type === 'media' && !files.length ? 'ci-pending' : 'ci-ok',
    },
    { ok: false, title: 'Malware scan', desc: 'Not configured; uploaded files are not malware scanned', icon: 'fa-clock', tone: 'ci-pending' },
    { ok: false, title: 'SHA‑256 hash & provenance', desc: 'Calculated from original bytes and recorded at upload', icon: 'fa-clock', tone: 'ci-pending' },
  ]), [files, type]);

  const setField = (key) => (e) => setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const addFiles = (list) => {
    const incoming = Array.from(list || []);
    const accepted = incoming.filter((file) => file.size <= 500 * 1024 * 1024);
    if (accepted.length !== incoming.length) notify('Files over 500 MB were skipped');
    setFiles((prev) => [...prev, ...accepted]);
  };

  const submit = async () => {
    if (!authorized || !hasContent || status === 'busy') return;
    setStatus('busy');
    if (type === 'media') {
      const remaining = [...files];
      let firstClaim = '';
      for (const file of files) {
        const body = new FormData();
        body.append('file', file);
        body.append('source_url', form.sourceUrl);
        body.append('notes', [form.description, form.notes].filter(Boolean).join('\n'));
        body.append('source_kind', 'media');
        body.append('description', form.description);
        body.append('priority', form.priority);
        body.append('source', form.platform || 'Media intake');
        const result = await request('/api/rumor/intake/', { method: 'POST', body });
        if (!result.ok) {
          setFiles(remaining); setStatus('idle');
          notify('Upload stopped. Successfully submitted files are in Rumor Scanner with linked originals; retry the remaining files.');
          return;
        }
        firstClaim = firstClaim || result.data?.created?.[0]?.claim_id || '';
        remaining.shift();
      }
      setFiles([]); setStatus('done');
      notify('Media added to Rumor Scanner with linked originals and investigation cases.');
      navigate(firstClaim ? `/scanner?claim=${encodeURIComponent(firstClaim)}` : '/scanner');
      return;
    }
    const result = await rumorSend('intake/', {
      body: {
        source_kind: type,
        text: form.text || form.description,
        url: type === 'url' ? form.url : form.sourceUrl,
        platform: form.platform,
        language: form.language,
        priority: form.priority,
        notes: form.notes,
        source: form.textSource || form.platform || 'Authorized public intake',
      },
    });
    if (!result.ok) {
      setStatus('idle');
      notify(result.data?.detail || 'Rumor app could not store this intake');
      return;
    }
    const created = result.data?.created_count || 0;
    const dups = result.data?.duplicate_count || 0;
    setStatus('done');
    notify(created ? `${created} claim(s) added to Rumor Scanner${dups ? ` · ${dups} duplicate(s) merged` : ''}` : 'Already present in the rumor queue');
    const first = result.data?.created?.[0]?.claim_id || result.data?.duplicates?.[0]?.claim_id;
    setTimeout(() => navigate(first ? `/scanner?claim=${first}` : '/scanner'), 900);
  };

  const clear = () => {
    setForm(EMPTY);
    setFiles([]);
    setAuthorized(true);
    setStatus('idle');
    notify('Draft cleared');
  };

  return (
    <>
      <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mb-3">
        <span className="mode-badge mb-online"><i className="fas fa-wifi me-1" />ONLINE MODE</span>
        <button className="btn btn-outline-soft" onClick={() => navigate('/scanner')}>
          <i className="fas fa-arrow-left me-1" />Back to scanner
        </button>
      </div>

      <div className="steps-flow">
        {[
          [1, 'Select type'],
          [2, 'Provide content'],
          [3, 'Validate & authorize'],
          [4, 'Submit'],
        ].map(([n, label]) => (
          <span key={n} className={`step ${step > n ? 'done' : step === n ? 'current' : ''}`}>
            <span className="num">{step > n ? <i className="fas fa-check" /> : n}</span>
            {label}
          </span>
        ))}
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between align-items-center">
              <span><i className="fas fa-edit" /> Submission details</span>
              <span className="badge-soft">Intake form</span>
            </div>
            <div className="p-4">
              <label className="form-label-clean">Content type <span className="req">*</span></label>
              <div className="type-tabs mb-4">
                {TYPES.map((item) => (
                  <div key={item.id} role="button" tabIndex={0} className={`type-card ${type === item.id ? 'active' : ''}`} onClick={() => setType(item.id)} onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setType(item.id); } }}>
                    <i className={`fas ${item.icon}`} />
                    <div className="tc-title">{item.title}</div>
                    <div className="tc-desc">{item.desc}</div>
                  </div>
                ))}
              </div>

              {type === 'url' && (
                <>
                  <div className="mb-3">
                    <label className="form-label-clean">Source URL <span className="req">*</span></label>
                    <div className="input-group">
                      <span className="input-group-text">
                        <i className="fas fa-globe" />
                      </span>
                      <input type="url" className="form-control" value={form.url} onChange={setField('url')} placeholder="https://example.com/article-or-post" />
                    </div>
                    <div className="form-text-help"><i className="fas fa-info-circle me-1" />Public sources only. Private or authenticated pages are not permitted.</div>
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label-clean">Language</label>
                      <select className="form-select" value={form.language} onChange={setField('language')}>
                        <option>Auto-detect</option>
                        <option>Bangla (বাংলা)</option>
                        <option>English</option>
                        <option>Banglish</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label-clean">Source platform</label>
                      <select className="form-select" value={form.platform} onChange={setField('platform')}>
                        <option>Facebook</option>
                        <option>X / Twitter</option>
                        <option>TikTok</option>
                        <option>YouTube</option>
                        <option>News website</option>
                        <option>Blog</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                </>
              )}

              {type === 'text' && (
                <>
                  <div className="mb-3">
                    <label className="form-label-clean">Claim or text content <span className="req">*</span></label>
                    <textarea className="form-control" rows="6" maxLength={20000} value={form.text} onChange={setField('text')} placeholder="Paste the claim, caption, or text excerpt to be verified…" />
                    <div className="form-text-help"><i className="fas fa-info-circle me-1" />Maximum 20,000 characters. Original text preserved exactly as submitted.</div>
                  </div>
                  <div className="row g-3 mb-3">
                    <div className="col-md-6">
                      <label className="form-label-clean">Language</label>
                      <select className="form-select" value={form.language} onChange={setField('language')}>
                        <option>Auto-detect</option>
                        <option>Bangla (বাংলা)</option>
                        <option>English</option>
                        <option>Banglish</option>
                      </select>
                    </div>
                    <div className="col-md-6">
                      <label className="form-label-clean">Original source (optional)</label>
                      <input type="url" className="form-control" value={form.textSource} onChange={setField('textSource')} placeholder="https://…" />
                    </div>
                  </div>
                </>
              )}

              {type === 'media' && (
                <>
                  <div className="mb-3">
                    <label className="form-label-clean">Upload media <span className="req">*</span></label>
                    <div
                      className={`drop-zone ${dragover ? 'dragover' : ''}`}
                      onClick={() => inputRef.current?.click()}
                      onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
                      onDragLeave={() => setDragover(false)}
                      onDrop={(e) => { e.preventDefault(); setDragover(false); addFiles(e.dataTransfer.files); }}
                    >
                      <i className="fas fa-cloud-upload-alt" />
                      <div className="dz-title">Drop files here or click to browse</div>
                      <div className="dz-desc">Image · audio · video · max 500 MB per file</div>
                      <input ref={inputRef} type="file" multiple accept="image/*,audio/*,video/*" hidden onChange={(e) => addFiles(e.target.files)} />
                    </div>
                  </div>
                  {files.map((file, index) => {
                    const kind = fileKind(file);
                    return (
                      <div className="file-item" key={`${file.name}-${index}`}>
                        <div className={`fi-icon ${kind.cls}`}><i className={`fas ${kind.icon}`} /></div>
                        <div style={{ flex: 1 }}>
                          <div className="fi-name">{file.name}</div>
                          <div className="fi-meta">{formatSize(file.size)} · queued for upload</div>
                        </div>
                        <i className="fas fa-times fi-remove" onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))} />
                      </div>
                    );
                  })}
                  <div className="row g-3 mb-3 mt-1">
                    <div className="col-md-6">
                      <label className="form-label-clean">Media description (optional)</label>
                      <input type="text" className="form-control" value={form.description} onChange={setField('description')} placeholder="e.g. rally footage shared on Facebook" />
                    </div>
                    <div className="col-md-6">
                      <label className="form-label-clean">Original source URL (optional)</label>
                      <input type="url" className="form-control" value={form.sourceUrl} onChange={setField('sourceUrl')} placeholder="https://…" />
                    </div>
                  </div>
                </>
              )}

              <hr style={{ margin: '1.25rem 0' }} />

              <div className="row g-3 mb-3">
                <div className="col-md-6">
                  <div className="form-label-clean">Investigation</div>
                  <p className="small text-muted">Submissions create or reuse their claim investigation. To add evidence to an existing case, open that case and use Add evidence.</p>
                </div>
                <div className="col-md-6">
                  <label className="form-label-clean">Priority hint</label>
                  <select className="form-select" value={form.priority} onChange={setField('priority')}>
                    <option>Normal</option>
                    <option>High</option>
                    <option>Critical</option>
                    <option>Low</option>
                  </select>
                  <div className="form-text-help">Priority is recalculated by the platform after analysis.</div>
                </div>
              </div>

              <div className="mb-3">
                <label className="form-label-clean">Analyst notes (optional)</label>
                <textarea className="form-control" rows="3" value={form.notes} onChange={setField('notes')} placeholder="Context, why this content is being submitted, or specific concerns…" />
              </div>

              <div className="auth-warning mb-4">
                <i className="fas fa-shield-halved me-1" />
                <strong>Authorization confirmation.</strong> By submitting this content, you confirm that the source is public, that you are authorized to collect it under applicable law and platform rules, and that it does not contain private messages, personal data obtained without consent, or content protected by a legal restriction.
              </div>

              <div className="form-check mb-4">
                <input className="form-check-input" type="checkbox" id="authCheck" checked={authorized} onChange={(e) => setAuthorized(e.target.checked)} />
                <label className="form-check-label" htmlFor="authCheck" style={{ fontSize: '0.82rem' }}>
                  I confirm the above authorization statement and understand this submission will be logged.
                </label>
              </div>

              <div className="d-flex gap-2 flex-wrap">
                <button className="btn btn-primary-soft" disabled={!authorized || !hasContent || status === 'busy'} onClick={submit} style={status === 'done' ? { background: '#2e9e6b' } : undefined}>
                  {status === 'busy' && <><i className="fas fa-spinner fa-spin me-2" />Submitting…</>}
                  {status === 'done' && <><i className="fas fa-check me-2" />Submitted</>}
                  {status === 'idle' && <><i className="fas fa-paper-plane me-2" />Submit content</>}
                </button>
                <button className="btn btn-outline-soft" onClick={() => notify('Draft saved locally')}><i className="fas fa-save me-1" />Save draft</button>
                <button className="btn btn-outline-soft" onClick={clear}><i className="fas fa-times me-1" />Clear</button>
              </div>
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between"><span><i className="fas fa-clipboard-check" /> Intake validation</span><span className="badge-soft">4 checks</span></div>
            <div className="p-3">
              {checks.map((item) => (
                <div className="checklist-item" key={item.title}>
                  <div className={`ci-status ${item.tone}`}><i className={`fas ${item.icon}`} /></div>
                  <div>
                    <div className="ci-title">{item.title}</div>
                    <div className="ci-desc">{item.desc}</div>
                  </div>
                </div>
              ))}
              <div className="legal-note mt-3">
                <i className="fas fa-info-circle me-1" />
                Original bytes are stored unchanged in the evidence vault. Only references, checksums, and metadata are kept in the transactional database.
              </div>
            </div>
          </div>

          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-fingerprint" /> Provenance capture</div>
            <div className="p-3">
              {[
                ['Submitted by', user?.name || 'Operator'],
                ['Submission timestamp', 'Auto · UTC'],
                ['Source timestamp', 'Captured if available'],
                ['SHA‑256', 'Computed at intake'],
                ['Custody event', 'Recorded'],
              ].map(([label, value]) => (
                <div className="d-flex justify-content-between align-items-center py-2 border-bottom" key={label}>
                  <span className="small text-muted">{label}</span>
                  <span className="small fw-semibold">{value}</span>
                </div>
              ))}
              <div className="small text-muted mt-2" style={{ fontSize: '0.7rem' }}>
                <i className="fas fa-info-circle me-1" />Unknown values stored as NULL — never invented.
              </div>
            </div>
          </div>

          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-gears" /> Post‑submission pipeline</div>
            <div className="p-3">
              {[
                'Create or find the claim in Rumor Scanner',
                'Create or reuse its investigation case',
                'Store uploaded originals with SHA-256 and provenance',
                'Assign an analyst or AI Council from the scanner',
                'Run verification and any required media analysis',
                'Review narratives and internal alerts',
                'Prepare an intelligence report draft',
              ].map((line, i) => (
                <div className="d-flex align-items-start mb-2" style={{ fontSize: '0.78rem' }} key={line}>
                  <span className="badge-soft me-2" style={{ minWidth: 22, textAlign: 'center' }}>{i + 1}</span>
                  <span className="text-muted">{line}</span>
                </div>
              ))}
            </div>
          </div>

          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean"><span><i className="fas fa-history" /> Recent scanner submissions</span></div>
            <div className="p-3">
              {recentError && <p className="small text-muted">{recentError}</p>}
              {!recentError && !recent.length && <p className="small text-muted">No recent submissions available.</p>}
              {recent.map((row) => <button type="button" className="overview-record" key={row.id} onClick={() => navigate(`/scanner?claim=${encodeURIComponent(row.claim_id)}`)}><strong>{row.claim_id}</strong><div className="small">{row.text}</div><span className="stat-mini">{row.workflow_stage} · {row.status}</span></button>)}
              <div className="text-end mt-2">
                <button className="btn btn-link small p-0 link-cyan" onClick={() => navigate('/scanner')}>
                  View all submissions <i className="fas fa-arrow-right ms-1" />
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
