import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { gpobGet } from '../api/gpob';
import { CountryFlag } from '../components/CountryFlag';
import NewsCard from '../components/NewsCard';
import PaginationBar, { listCount, listResults } from '../components/PaginationBar';
import { useApp } from '../context/AppContext';

export default function GlobalMedia() {
  const navigate = useNavigate();
  const { notify } = useApp();
  const [overview, setOverview] = useState(null);
  const [news, setNews] = useState([]);
  const [count, setCount] = useState(0);
  const [days, setDays] = useState('all');
  const [sentiment, setSentiment] = useState('');
  const [country, setCountry] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const load = async () => {
    const ov = await gpobGet('overview/');
    if (ov.ok) setOverview(ov.data);
    const qs = new URLSearchParams({ days, page: String(page), page_size: String(pageSize) });
    if (sentiment) qs.set('sentiment', sentiment);
    if (country) qs.set('country', country);
    const feed = await gpobGet(`news/?${qs.toString()}`);
    if (feed.ok) {
      setNews(listResults(feed.data));
      setCount(listCount(feed.data));
    } else notify(feed.data?.detail || 'Media API unavailable. Start Django on 8001.');
  };

  useEffect(() => { load(); }, [days, sentiment, country, page, pageSize]);

  const countries = overview?.countries || [];

  return (
    <>
      <div className="d-flex justify-content-end gap-2 mb-3 flex-wrap">
        <button className="btn btn-outline-soft" onClick={() => navigate('/fetch')}><i className="fas fa-satellite-dish me-1" />Fetch news</button>
        <button className="btn btn-outline-soft" onClick={() => navigate('/media-stats')}><i className="fas fa-chart-bar me-1" />Statistics</button>
        <button className="btn btn-primary-soft" onClick={() => navigate('/media-search')}><i className="fas fa-search me-1" />Search corpus</button>
      </div>

      <div className="row g-3 mb-4">
        {[
          ['Articles stored', overview?.articles ?? '—', 'full public corpus', 'fa-globe'],
          ['Ingested today', overview?.today ?? '—', 'publication date', 'fa-calendar-day'],
          ['Publishers', overview?.publishers ?? '—', 'Bangladesh + global', 'fa-newspaper'],
          ['Active keywords', overview?.keywords ?? '—', 'watch terms', 'fa-key'],
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

      <div className="card-stat mb-4 p-0 overflow-hidden">
        <div className="card-header-clean">Country coverage</div>
        <div className="p-3 country-grid">
          {countries.map((item) => (
            <button key={item.id} className={`country-tile ${String(country) === String(item.id) ? 'active' : ''}`} onClick={() => { setCountry(String(country) === String(item.id) ? '' : String(item.id)); setPage(1); }}>
              <div className="flag"><CountryFlag code={item.code} flag={item.flag} title={item.name} /></div>
              <div className="fw-semibold">{item.name}</div>
              <div className="stat-mini">{item.news_count || 0} articles</div>
            </button>
          ))}
        </div>
      </div>

      <div className="card-stat p-0 overflow-hidden">
        <div className="card-header-clean d-flex justify-content-between align-items-center flex-wrap gap-2">
          <span>All news</span>
          <div className="d-flex gap-2 flex-wrap">
            {['', 'Positive', 'Neutral', 'Negative'].map((item) => (
              <button key={item || 'all'} className={`filter-chip ${sentiment === item ? 'active' : ''}`} onClick={() => { setSentiment(item); setPage(1); }}>{item || 'All sentiment'}</button>
            ))}
            {['all', '1', '3', '7', '30'].map((item) => (
              <button key={item} className={`filter-chip ${days === item ? 'active' : ''}`} onClick={() => { setDays(item); setPage(1); }}>{item === 'all' ? 'All dates' : `${item}d`}</button>
            ))}
          </div>
        </div>
        <div className="p-3">
          {news.length === 0 && <div className="text-muted small">No articles in this window. Run Fetch News or seed the media corpus.</div>}
          {news.map((article) => <NewsCard article={article} key={article.id} />)}
          <PaginationBar page={page} pageSize={pageSize} count={count} onPage={setPage} onPageSize={setPageSize} />
        </div>
      </div>
    </>
  );
}
