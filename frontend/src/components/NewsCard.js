import { useState } from 'react';
import { gpobGet } from '../api/gpob';
import { CountryFlag } from './CountryFlag';

const NAMED_ENTITIES = {
  nbsp: ' ', amp: '&', lt: '<', gt: '>', quot: '"', apos: "'",
  lsquo: '\u2018', rsquo: '\u2019', ldquo: '\u201c', rdquo: '\u201d',
  mdash: '\u2014', ndash: '\u2013', hellip: '\u2026',
};

function decodeText(value) {
  return (value || '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&(#x?[0-9a-fA-F]+|[a-zA-Z]+);/g, (match, entity) => {
      if (entity[0] === '#') {
        const code = entity[1].toLowerCase() === 'x' ? parseInt(entity.slice(2), 16) : parseInt(entity.slice(1), 10);
        return Number.isFinite(code) ? String.fromCodePoint(code) : match;
      }
      return NAMED_ENTITIES[entity] ?? match;
    })
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function sentimentClass(sentiment) {
  if (sentiment === 'Negative') return 'v-refuted';
  if (sentiment === 'Positive') return 'v-supported';
  return 'v-unverified';
}

export default function NewsCard({ article }) {
  const [open, setOpen] = useState(false);
  const [detail, setDetail] = useState(null);
  const [loading, setLoading] = useState(false);
  const item = detail || article;

  const toggle = async () => {
    const next = !open;
    setOpen(next);
    if (!next || detail || loading) return;
    setLoading(true);
    const result = await gpobGet(`news/${article.id}/`);
    setLoading(false);
    if (result.ok) setDetail(result.data);
  };

  const plain = (text) => decodeText(text);
  const body = plain(item.body);
  const summary = plain(item.summary);
  const showSummary = summary && summary !== body && !body.startsWith(summary);
  const showBody = Boolean(body);

  return (
    <article className={`claim-card news-card ${open ? 'active' : ''}`}>
      <div
        className="news-card-head"
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={toggle}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggle();
          }
        }}
      >
        <div className="d-flex justify-content-between gap-3 flex-wrap">
          <div>
            <div className="fw-semibold ink d-flex align-items-start gap-2">
              <CountryFlag code={item.country_code} flag={item.country_flag} title={item.country_name} />
              <span>{item.title}</span>
            </div>
            <div className="stat-mini mt-1">{item.publisher_name} · {item.country_name} · {item.publication_date}</div>
          </div>
          <div className="d-flex gap-1 align-items-start flex-wrap">
            {item.sentiment && <span className={`status-pill ${sentimentClass(item.sentiment)}`}>{item.sentiment}</span>}
            {item.category && <span className="mini-tag">{item.category}</span>}
            <button
              type="button"
              className="btn btn-outline-soft news-detail-btn"
              onClick={(event) => {
                event.stopPropagation();
                toggle();
              }}
              onKeyDown={(event) => event.stopPropagation()}
            >
              {open ? 'Hide details' : 'View details'}
            </button>
          </div>
        </div>
      </div>

      {open && (
        <div className="news-detail">
          {loading && <div className="stat-mini">Loading article…</div>}
          {showSummary && <p className="news-summary">{summary}</p>}
          {showBody && <p className="news-body">{body}</p>}
          {!showSummary && !showBody && <p className="stat-mini">No article text is stored for this item.</p>}
          <div className="news-detail-grid">
            <div>
              <div className="news-detail-label">Publisher</div>
              <div className="news-detail-value">{item.publisher_name || '—'}</div>
            </div>
            <div>
              <div className="news-detail-label">Country</div>
              <div className="news-detail-value d-flex align-items-center gap-2">
                <CountryFlag code={item.country_code} flag={item.country_flag} title={item.country_name} />
                <span>{item.country_name || '—'}</span>
              </div>
            </div>
            <div>
              <div className="news-detail-label">Published</div>
              <div className="news-detail-value">{item.publication_date || '—'}</div>
            </div>
            <div>
              <div className="news-detail-label">Keyword</div>
              <div className="news-detail-value">{item.matched_keyword || '—'}</div>
            </div>
            <div>
              <div className="news-detail-label">Intake</div>
              <div className="news-detail-value">{item.source_kind || '—'}</div>
            </div>
          </div>
          {item.url && (
            <a className="btn btn-link link-cyan small p-0" href={item.url} target="_blank" rel="noreferrer">
              Open original source
            </a>
          )}
        </div>
      )}
    </article>
  );
}
