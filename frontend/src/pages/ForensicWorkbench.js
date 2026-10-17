import { useMemo, useRef, useState } from 'react';
import { ForensicMediaViewer } from '../components/ui';
import { useApp } from '../context/AppContext';

const TABS = ['Detectors', 'Metadata', 'Annotations', 'Timeline'];
const FRAMES = ['00:00', '00:18', '00:36', '00:58', '01:22', '01:47', '02:10', '02:35', '02:45'];

export default function ForensicWorkbench() {
  const { notify } = useApp();
  const [tab, setTab] = useState('Detectors');
  const [frame, setFrame] = useState(3);
  const [playing, setPlaying] = useState(false);
  const [notes, setNotes] = useState('Frame 1420: optical-flow break at speaker jawline. Treat detector scores as uncalibrated indicators.');
  const [fileName, setFileName] = useState('rally_video.mp4');
  const fileRef = useRef(null);
  const waves = useMemo(() => Array.from({ length: 72 }, (_, i) => ({
    h: 12 + ((i * 17) % 48),
    kind: i % 11 === 0 ? 'suspicious' : i % 3 === 0 ? 'speech' : '',
  })), []);

  return (
    <>
      <div className="d-flex justify-content-end gap-2 mb-3">
        <button className="btn btn-outline-soft" onClick={() => notify('Findings export prepared')}><i className="fas fa-file-export me-1" />Export findings</button>
        <button className="btn btn-primary-soft" onClick={() => notify('Forensic pipeline started')}><i className="fas fa-play me-1" />Run analysis</button>
      </div>

      <input ref={fileRef} type="file" accept="image/*,video/*,audio/*" hidden onChange={(e) => {
        const file = e.target.files?.[0];
        if (file) { setFileName(file.name); notify(`${file.name} queued for forensic inspection`); }
      }} />
      <div className="drop-zone mb-4" onClick={() => fileRef.current?.click()} onKeyDown={(e) => e.key === 'Enter' && fileRef.current?.click()} role="button" tabIndex={0}>
        <i className="fas fa-cloud-arrow-up" />
        <div className="dz-title">Upload image, video, or audio</div>
        <div className="dz-desc">Originals are hashed on ingest. Model outputs are forensic indicators, not proof of authenticity.</div>
      </div>

      <div className="card-stat mb-4 p-0 overflow-hidden">
        <div className="p-3 d-flex justify-content-between align-items-center flex-wrap gap-3">
          <div className="d-flex align-items-center gap-4 flex-wrap">
            <div><div className="small text-muted mb-1">Case</div><div className="fw-semibold">INV-2025-0421</div></div>
            <div><div className="small text-muted mb-1">Evidence</div><div className="fw-semibold">EV-8842 · rally_video.mp4</div></div>
            <div><div className="small text-muted mb-1">Classification</div><span className="badge-soft">RESTRICTED</span></div>
            <div><div className="small text-muted mb-1">Analyst</div><div className="fw-semibold">A. Rahman</div></div>
          </div>
          <div className="d-flex align-items-center gap-2">
            <span className="status-pill s-running"><i className="fas fa-spinner fa-spin me-1" />Analysis running</span>
            <span className="mini-tag"><i className="fas fa-clock me-1" />Started 12 min ago</span>
          </div>
        </div>
      </div>

      <div className="row g-4">
        <div className="col-xl-8">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean d-flex justify-content-between align-items-center">
              <span><i className="fas fa-photo-video" /> Media inspection · Original evidence</span>
              <div className="d-flex gap-2">
                <button className="control-btn active"><i className="fas fa-columns" /></button>
                <button className="control-btn"><i className="fas fa-layer-group" /></button>
                <button className="control-btn"><i className="fas fa-expand" /></button>
              </div>
            </div>
            <div className="p-3">
              <ForensicMediaViewer
                fileName={fileName}
                meta="1920×1080 · 00:02:45 · 24 fps · H.264"
                badge={(
                  <>
                    <span className="overlay-label"><i className="fas fa-lock me-1" />Original evidence · SHA-256 verified</span>
                    <span className="overlay-badge">Frame {1420 + frame} / 3960</span>
                  </>
                )}
              >
                <i className="fas fa-film fa-3x mb-3" style={{ color: 'var(--muted-2)' }} />
              </ForensicMediaViewer>
              <div className="d-flex align-items-center gap-2 mb-2 flex-wrap">
                <button className="control-btn" onClick={() => setFrame((f) => Math.max(0, f - 1))}><i className="fas fa-step-backward" /></button>
                <button className={`control-btn ${playing ? 'active' : ''}`} onClick={() => setPlaying((p) => !p)}>
                  <i className={`fas ${playing ? 'fa-pause' : 'fa-play'}`} />
                </button>
                <button className="control-btn" onClick={() => setFrame((f) => Math.min(FRAMES.length - 1, f + 1))}><i className="fas fa-step-forward" /></button>
                <span className="small text-muted ms-2" style={{ fontFamily: 'monospace' }}>{FRAMES[frame]} / 00:02:45</span>
              </div>
              <div className="timeline-bar">
                <div className="seg" style={{ left: '0%', width: '12%', background: '#2e9e6b' }} />
                <div className="seg" style={{ left: '12%', width: '28%', background: '#d9a23b' }} />
                <div className="seg" style={{ left: '40%', width: '22%', background: '#c74b4b' }} />
                <div className="seg" style={{ left: '62%', width: '20%', background: '#3a7ca5' }} />
                <div className="seg" style={{ left: '82%', width: '18%', background: '#2e9e6b' }} />
                <div className="playhead" style={{ left: `${12 + frame * 9}%` }} />
              </div>
              <div className="frame-strip mt-3">
                {FRAMES.map((t, i) => (
                  <div key={t} className={`frame ${i === frame ? 'active' : ''}`} data-time={t} onClick={() => setFrame(i)}>
                    <i className="fas fa-image" />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean p-0">
              <div className="page-tabs d-flex px-3 pt-2">
                {TABS.map((name) => (
                  <button key={name} className={`nav-link ${tab === name ? 'active' : ''}`} onClick={() => setTab(name)}>{name}</button>
                ))}
              </div>
            </div>
            <div className="p-3">
              {tab === 'Detectors' && (
                <>
                  {[
                    ['Image manipulation detector', 'v2.1.0', 62, '0.62', 'REQUIRES REVIEW', 's-warning', '#a86f1a', '#d9a23b'],
                    ['Video temporal analysis', 'v3.0.2', 84, '0.84', 'REQUIRES REVIEW', 's-warning', '#b33a3a', '#c74b4b'],
                    ['Audio synthesis detector', 'v1.0.0', 31, '0.31', 'LIKELY AUTHENTIC', 's-complete', '#1d6b44', '#2e9e6b'],
                    ['Lip-sync / face consistency', 'v0.9.1', 73, '0.73', 'REQUIRES REVIEW', 's-warning', '#b33a3a', '#c74b4b'],
                  ].map(([name, ver, w, score, status, cls, color, bar]) => (
                    <div className="detector-row" key={name}>
                      <div style={{ flex: 1 }}>
                        <div className="fw-semibold mb-1">{name} <span className="mini-tag">{ver}</span></div>
                        <div className="score-bar" style={{ width: 200 }}><div className="fill" style={{ width: `${w}%`, background: bar }} /></div>
                      </div>
                      <div className="text-end">
                        <div className="fw-semibold" style={{ color }}>{score}</div>
                        <span className={`status-pill ${cls}`}>{status}</span>
                      </div>
                    </div>
                  ))}
                  <div className="alert mt-3 mb-0 small annotation-box">
                    Raw detector scores are <strong>not</strong> probabilities. All findings require human review.
                  </div>
                </>
              )}
              {tab === 'Metadata' && (
                <div className="row g-4">
                  <div className="col-md-6">
                    {[['File name', 'rally_video.mp4'], ['MIME', 'video/mp4'], ['Size', '84.2 MB'], ['Duration', '00:02:45'], ['Codec', 'H.264 / AVC']].map(([k, v]) => (
                      <div className="meta-row" key={k}><span className="label">{k}</span><span className="value">{v}</span></div>
                    ))}
                  </div>
                  <div className="col-md-6">
                    {[['Collected', '2025-01-15 09:42 UTC'], ['Custody events', '3 recorded'], ['Original preserved', 'Yes'], ['Malware scan', 'Clean']].map(([k, v]) => (
                      <div className="meta-row" key={k}><span className="label">{k}</span><span className="value">{v}</span></div>
                    ))}
                    <div className="meta-row d-flex flex-column"><span className="label mb-1">SHA-256</span><span className="evidence-hash">a3f0c8e2b1d47a91e6c0f8d2b4a1c9e7d3f6a8b0c1d2e3f4a5b6c7d8e9f01234</span></div>
                  </div>
                </div>
              )}
              {tab === 'Annotations' && (
                <div className="annotation-box">
                  <strong>Frame 1420 (00:58) — Temporal discontinuity</strong>
                  <div className="mt-1">Optical-flow break at speaker’s jawline. Flagged for lip-sync review. Analyst: A. Rahman</div>
                </div>
              )}
              {tab === 'Timeline' && (
                <div className="timeline-compact">
                  {[['00:00', 'Scene 1 · stable original footage'], ['00:36', 'Scene 2 · compression shift'], ['00:58', 'Manipulation marker · review'], ['01:47', 'Scene 4 · cut + re-encode']].map(([t, d]) => (
                    <div className="node" key={t}><div className="t">{t}</div><div className="d">{d}</div></div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="col-xl-4">
          <div className="card-stat mb-4 p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-wave-square" /> Audio waveform</div>
            <div className="p-3">
              <div className="waveform">
                {waves.map((w, i) => <div key={i} className={`bar ${w.kind}`} style={{ height: w.h }} />)}
                <div style={{ position: 'absolute', top: 0, bottom: 0, width: 2, background: '#e63946', left: '42%' }} />
              </div>
              <div className="stat-mini mt-2">Amber bars = spectral anomalies · cyan = speech</div>
            </div>
          </div>
          <div className="card-stat p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-database" /> Linked evidence</div>
            <div className="p-3">
              {['EV-8842 rally_video.mp4', 'EV-8843 reverse-image match', 'EV-8844 2023 archive clip'].map((item) => (
                <div key={item} className="meta-row"><span className="value">{item}</span><span className="mini-tag">hashed</span></div>
              ))}
              <button className="btn btn-outline-soft w-100 mt-3" onClick={() => notify('Annotation saved to case file')}><i className="fas fa-plus me-1" />Add annotation</button>
            </div>
          </div>
          <div className="card-stat mt-4 p-0 overflow-hidden">
            <div className="card-header-clean"><i className="fas fa-note-sticky" /> Analyst notes</div>
            <div className="p-3">
              <textarea className="form-control mb-2" rows="4" value={notes} onChange={(e) => setNotes(e.target.value)} />
              <div className="legal-note">Detector scores are uncalibrated. A high score is a review lead, not a determination that media is fake.</div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
