import { useEffect, useState } from 'react';
import { gpobGet } from '../api/gpob';
import { CountryFlag } from '../components/CountryFlag';
import NewsCard from '../components/NewsCard';
import PaginationBar, { listCount, listResults } from '../components/PaginationBar';

export default function MediaSearch() {
  const [query, setQuery] = useState('Bangladesh');
  const [sentiment, setSentiment] = useState('');
  const [country, setCountry] = useState('');
  const [countries, setCountries] = useState([]);
  const [results, setResults] = useState([]);
  const [count, setCount] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  useEffect(() => {
    gpobGet('countries/?page_size=100').then((result) => {
      if (result.ok) setCountries(listResults(result.data));
    });
  }, []);

  const search = async (event, nextPage = page, nextSize = pageSize) => {
    event?.preventDefault();
    const qs = new URLSearchParams({
      q: query,
      days: 'all',
      page: String(nextPage),
      page_size: String(nextSize),
    });
    if (sentiment) qs.set('sentiment', sentiment);
    if (country) qs.set('country', country);
    const result = await gpobGet(`news/?${qs.toString()}`);
    if (result.ok) {
      setResults(listResults(result.data));
      setCount(listCount(result.data));
    }
  };

  useEffect(() => { search(undefined, page, pageSize); }, [page, pageSize, sentiment, country]);

  return (
    <>
      <form className="card-stat p-3 mb-4" onSubmit={(event) => { setPage(1); search(event, 1, pageSize); }}>
        <div className="row g-3 align-items-end">
          <div className="col-md-6">
            <label className="form-label-clean">Query</label>
            <input className="form-control" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="title, summary, publisher, country, keyword…" />
          </div>
          <div className="col-md-3">
            <label className="form-label-clean">Country</label>
            <div className="country-select">
              <CountryFlag
                code={countries.find((item) => String(item.id) === String(country))?.code}
                flag={countries.find((item) => String(item.id) === String(country))?.flag}
              />
              <select className="form-select" value={country} onChange={(e) => { setCountry(e.target.value); setPage(1); }}>
                <option value="">All countries</option>
                {countries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
              </select>
            </div>
          </div>
          <div className="col-md-3">
            <label className="form-label-clean">Sentiment</label>
            <select className="form-select" value={sentiment} onChange={(e) => { setSentiment(e.target.value); setPage(1); }}>
              <option value="">Any</option>
              <option>Positive</option>
              <option>Neutral</option>
              <option>Negative</option>
            </select>
          </div>
        </div>
        <button className="btn btn-primary-soft mt-3" type="submit"><i className="fas fa-search me-2" />Search all news</button>
      </form>
      <div className="stat-mini mb-3">{count} matches across the full corpus</div>
      {results.map((article) => <NewsCard article={article} key={article.id} />)}
      <PaginationBar page={page} pageSize={pageSize} count={count} onPage={setPage} onPageSize={setPageSize} />
    </>
  );
}
