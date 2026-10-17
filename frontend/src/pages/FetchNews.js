import { useEffect, useState } from 'react';
import { gpobGet, gpobSend } from '../api/gpob';
import NewsCard from '../components/NewsCard';
import PaginationBar, { listCount, listResults } from '../components/PaginationBar';
import { useApp } from '../context/AppContext';

export default function FetchNews() {
  const { notify } = useApp();
  const [keywords, setKeywords] = useState([]);
  const [keywordCount, setKeywordCount] = useState(0);
  const [publishers, setPublishers] = useState([]);
  const [pages, setPages] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [jobCount, setJobCount] = useState(0);
  const [news, setNews] = useState([]);
  const [newsCount, setNewsCount] = useState(0);
  const [kwPage, setKwPage] = useState(1);
  const [jobPage, setJobPage] = useState(1);
  const [newsPage, setNewsPage] = useState(1);
  const [newsPageSize, setNewsPageSize] = useState(10);
  const [active, setActive] = useState(null);
  const [term, setTerm] = useState('');
  const [extra, setExtra] = useState('');
  const [selectedKw, setSelectedKw] = useState([]);
  const [selectedPubs, setSelectedPubs] = useState([]);
  const [days, setDays] = useState('3');
  const [newsnow, setNewsnow] = useState(true);
  const [google, setGoogle] = useState(true);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    const [kw, pubs, fb, jobList, feed] = await Promise.all([
      gpobGet(`keywords/?page=${kwPage}&page_size=8`),
      gpobGet('publishers/?all=true'),
      gpobGet('facebook-pages/?page_size=100'),
      gpobGet(`fetch/?page=${jobPage}&page_size=6`),
      gpobGet(`news/?days=all&page=${newsPage}&page_size=${newsPageSize}`),
    ]);
    if (kw.ok) {
      const rows = listResults(kw.data);
      setKeywords(rows);
      setKeywordCount(listCount(kw.data));
      if (!selectedKw.length) setSelectedKw(rows.filter((item) => item.is_active).map((item) => item.term));
    }
    if (pubs.ok) {
      setPublishers(listResults(pubs.data));
    }
    if (fb.ok) setPages(listResults(fb.data));
    if (jobList.ok) {
      const rows = listResults(jobList.data);
      setJobs(rows);
      setJobCount(listCount(jobList.data));
      const running = rows.find((item) => item.status === 'running' || item.status === 'pending');
      setActive(running || rows[0] || null);
    }
    if (feed.ok) {
      setNews(listResults(feed.data));
      setNewsCount(listCount(feed.data));
    }
  };

  useEffect(() => { refresh(); }, [kwPage, jobPage, newsPage, newsPageSize]);

  useEffect(() => {
    if (!active || (active.status !== 'running' && active.status !== 'pending')) return undefined;
    const timer = setInterval(async () => {
      const result = await gpobGet(`fetch/${active.id}/`);
      if (result.ok) {
        setActive(result.data);
        if (result.data.status === 'completed' || result.data.status === 'failed') refresh();
      }
    }, 2500);
    return () => clearInterval(timer);
  }, [active?.id, active?.status]);

  const addKeyword = async () => {
    if (!term.trim()) return;
    const result = await gpobSend('keywords/', { body: { term: term.trim(), is_active: true } });
    if (result.ok) {
      setTerm('');
      notify('Keyword added');
      refresh();
    } else notify(result.data?.term?.[0] || 'Could not add keyword');
  };

  const toggleKeyword = async (item) => {
    await gpobSend(`keywords/${item.id}/`, { method: 'PATCH', body: { is_active: !item.is_active } });
    refresh();
  };

  const startFetch = async () => {
    setBusy(true);
    const today = new Date();
    const start = new Date(today);
    start.setDate(today.getDate() - Number(days));
    const merged = [...selectedKw, ...extra.split(',').map((item) => item.trim()).filter(Boolean)];
    const result = await gpobSend('fetch/', {
      body: {
        keywords: merged.join(', '),
        publisher_ids: selectedPubs,
        include_newsnow: newsnow,
        include_google: google,
        start_date: start.toISOString().slice(0, 10),
        end_date: today.toISOString().slice(0, 10),
        categories: pages.filter((item) => item.is_active).map((item) => item.category),
      },
    });
    setBusy(false);
    if (!result.ok) {
      notify(result.data?.error || 'Fetch could not start');
      return;
    }
    notify('Fetch job started');
    setActive(result.data);
    refresh();
  };

  return (
    <div className="row g-4">
      <div className="col-xl-7">
        <div className="card-stat mb-4 p-0 overflow-hidden">
          <div className="card-header-clean">Ingest controls</div>
          <div className="p-3">
            <label className="form-label-clean">Saved keywords</label>
            <div className="d-flex flex-wrap gap-2 mb-3">
              {keywords.map((item) => (
                <button key={item.id} className={`filter-chip ${selectedKw.includes(item.term) ? 'active' : ''}`} onClick={() => setSelectedKw((prev) => prev.includes(item.term) ? prev.filter((t) => t !== item.term) : [...prev, item.term])}>
                  {item.term}{!item.is_active ? ' · paused' : ''}
                </button>
              ))}
            </div>
            <div className="d-flex gap-2 mb-3">
              <input className="form-control" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Add keyword…" />
              <button className="btn btn-outline-soft" onClick={addKeyword}>Add</button>
            </div>
            <label className="form-label-clean">Extra terms</label>
            <input className="form-control mb-3" value={extra} onChange={(e) => setExtra(e.target.value)} placeholder="comma-separated extra terms" />
            <label className="form-label-clean">Window</label>
            <div className="d-flex gap-2 mb-3">
              {['1', '3', '7', '30'].map((item) => (
                <button key={item} className={`filter-chip ${days === item ? 'active' : ''}`} onClick={() => setDays(item)}>{item} days</button>
              ))}
            </div>
            <div className="form-check mb-2">
              <input className="form-check-input" type="checkbox" id="google" checked={google} onChange={(e) => setGoogle(e.target.checked)} />
              <label className="form-check-label" htmlFor="google">Google News RSS (public headlines)</label>
            </div>
            <div className="form-check mb-3">
              <input className="form-check-input" type="checkbox" id="newsnow" checked={newsnow} onChange={(e) => setNewsnow(e.target.checked)} />
              <label className="form-check-label" htmlFor="newsnow">NewsNow watchlist</label>
            </div>
            <button className="btn btn-primary-soft" disabled={busy} onClick={startFetch}>
              {busy ? <><i className="fas fa-spinner fa-spin me-2" />Queuing…</> : <><i className="fas fa-play me-2" />Start fetch</>}
            </button>
          </div>
        </div>

        <div className="card-stat p-0 overflow-hidden">
          <div className="card-header-clean">Publishers</div>
          <div className="p-3 publisher-grid">
            {publishers.map((item) => (
              <label key={item.id} className={`publisher-chip ${selectedPubs.includes(item.id) ? 'active' : ''}`}>
                <input type="checkbox" checked={selectedPubs.includes(item.id)} onChange={() => setSelectedPubs((prev) => prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id])} />
                <span>{item.name}</span>
              </label>
            ))}
          </div>
        </div>
      </div>

      <div className="col-xl-5">
        <div className="card-stat mb-4 p-0 overflow-hidden">
          <div className="card-header-clean d-flex justify-content-between"><span>Live job</span><span className="badge-soft">{active?.status || 'idle'}</span></div>
          <div className="p-3">
            <div className="stat-mini mb-2">{active ? `Found ${active.articles_found} · saved ${active.articles_saved}` : 'No job yet'}</div>
            <pre className="job-log">{active?.log || 'Job output will appear here.'}</pre>
          </div>
        </div>
        <div className="card-stat mb-4 p-0 overflow-hidden">
          <div className="card-header-clean">Keyword library</div>
          <div className="p-3">
            {keywords.map((item) => (
              <div className="queue-item d-flex justify-content-between align-items-center" key={item.id}>
                <div><strong>{item.term}</strong><div className="stat-mini">{item.is_active ? 'active' : 'paused'}</div></div>
                <button className="btn btn-outline-soft" onClick={() => toggleKeyword(item)}>{item.is_active ? 'Pause' : 'Resume'}</button>
              </div>
            ))}
            <PaginationBar page={kwPage} pageSize={8} count={keywordCount} onPage={setKwPage} />
          </div>
        </div>
        <div className="card-stat p-0 overflow-hidden">
          <div className="card-header-clean d-flex justify-content-between"><span>Fetch jobs</span><span className="badge-soft">{jobCount}</span></div>
          <div className="p-3">
            {jobs.map((item) => (
              <button type="button" className="source-db-item" key={item.id} onClick={() => setActive(item)}>
                <div className="d-flex justify-content-between"><span className="mini-tag">{item.status}</span><span className="stat-mini">saved {item.articles_saved}</span></div>
                <div className="source-db-text">{item.keywords || 'All watch terms'}</div>
              </button>
            ))}
            <PaginationBar page={jobPage} pageSize={6} count={jobCount} onPage={setJobPage} />
          </div>
        </div>
      </div>

      <div className="col-12">
        <div className="card-stat p-0 overflow-hidden">
          <div className="card-header-clean d-flex justify-content-between"><span>All ingested news</span><span className="badge-soft">{newsCount}</span></div>
          <div className="p-3">
            {news.map((article) => <NewsCard article={article} key={article.id} />)}
            <PaginationBar page={newsPage} pageSize={newsPageSize} count={newsCount} onPage={setNewsPage} onPageSize={setNewsPageSize} />
          </div>
        </div>
      </div>
    </div>
  );
}
