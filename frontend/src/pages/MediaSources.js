import { useEffect, useState } from 'react';
import { gpobGet, gpobSend } from '../api/gpob';
import PaginationBar, { listCount, listResults } from '../components/PaginationBar';
import { CountryFlag } from '../components/CountryFlag';
import { flagEmoji, matchCountry, searchCountries } from '../data/countries';
import { useApp } from '../context/AppContext';

function CountryField({ name, onPick }) {
  const [open, setOpen] = useState(false);
  const matches = searchCountries(name);

  useEffect(() => {
    if (!name) setOpen(false);
  }, [name]);

  return (
    <div className={`country-picker ${open ? 'open' : ''}`}>
      <input
        className="form-control"
        placeholder="Search country"
        value={name}
        autoComplete="off"
        onChange={(event) => {
          const next = event.target.value;
          const exact = matchCountry(next);
          onPick(exact ? { name: exact.name, code: exact.code } : { name: next, code: '' });
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
      />
      {open && matches.length > 0 && (
        <div className="country-picker-menu">
          {matches.map((item) => (
            <button
              type="button"
              key={item.code}
              className="country-picker-item"
              onMouseDown={(event) => {
                event.preventDefault();
                onPick({ name: item.name, code: item.code });
                setOpen(false);
              }}
            >
              <CountryFlag code={item.code} title={item.name} />
              <span className="flex-grow-1">{item.name}</span>
              <span className="country-code">{item.code}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default function MediaSources() {
  const { notify } = useApp();
  const [tab, setTab] = useState('Publishers');
  const [countries, setCountries] = useState([]);
  const [publishers, setPublishers] = useState([]);
  const [pages, setPages] = useState([]);
  const [countryCount, setCountryCount] = useState(0);
  const [pubCount, setPubCount] = useState(0);
  const [pageCount, setPageCount] = useState(0);
  const [countryPage, setCountryPage] = useState(1);
  const [pubPage, setPubPage] = useState(1);
  const [fbPage, setFbPage] = useState(1);
  const [allCountries, setAllCountries] = useState([]);
  const [countryForm, setCountryForm] = useState({ name: '', flag: '', code: '' });
  const [pubForm, setPubForm] = useState({ name: '', url: '', search_url: '', country: '' });
  const [pageForm, setPageForm] = useState({ name: '', page_id: '', category: 'Politics', country: '' });

  const countryById = (id) => allCountries.find((item) => String(item.id) === String(id)) || countries.find((item) => String(item.id) === String(id));

  const load = async () => {
    const [c, p, f, lookup] = await Promise.all([
      gpobGet(`countries/?page=${countryPage}&page_size=8`),
      gpobGet(`publishers/?page=${pubPage}&page_size=8`),
      gpobGet(`facebook-pages/?page=${fbPage}&page_size=8`),
      gpobGet('countries/?page_size=100'),
    ]);
    if (c.ok) {
      setCountries(listResults(c.data));
      setCountryCount(listCount(c.data));
    }
    if (lookup.ok) {
      const rows = listResults(lookup.data);
      setAllCountries(rows);
      if (!pubForm.country && rows[0]) setPubForm((prev) => ({ ...prev, country: rows[0].id }));
      if (!pageForm.country && rows[0]) setPageForm((prev) => ({ ...prev, country: rows[0].id }));
    }
    if (p.ok) {
      setPublishers(listResults(p.data));
      setPubCount(listCount(p.data));
    }
    if (f.ok) {
      setPages(listResults(f.data));
      setPageCount(listCount(f.data));
    }
  };

  useEffect(() => { load(); }, [countryPage, pubPage, fbPage]);

  const addCountry = async () => {
    if (!countryForm.code) {
      notify('Choose a country so its flag is included');
      return;
    }
    const result = await gpobSend('countries/', {
      body: { name: countryForm.name, code: countryForm.code, flag: flagEmoji(countryForm.code) },
    });
    if (result.ok) {
      notify(`${countryForm.name} added`);
      setCountryForm({ name: '', flag: '', code: '' });
      load();
      return;
    }
    const detail = result.data && Object.values(result.data).flat()[0];
    notify(typeof detail === 'string' ? detail : 'Country could not be saved');
  };
  const addPublisher = async () => {
    const result = await gpobSend('publishers/', { body: pubForm });
    if (result.ok) { notify('Publisher added'); load(); }
    else notify('Publisher could not be saved');
  };
  const addPage = async () => {
    const result = await gpobSend('facebook-pages/', { body: pageForm });
    if (result.ok) { notify('Facebook page added'); load(); }
  };
  const togglePage = async (item) => {
    await gpobSend(`facebook-pages/${item.id}/`, { method: 'PATCH', body: { is_active: !item.is_active } });
    load();
  };

  return (
    <>
      <div className="card-stat mb-4 p-0 settings-card">
        <div className="card-header-clean p-0">
          <div className="page-tabs d-flex px-3 pt-2">
            {['Publishers', 'Countries', 'Facebook pages'].map((name) => (
              <button key={name} className={`nav-link ${tab === name ? 'active' : ''}`} onClick={() => setTab(name)}>{name}</button>
            ))}
          </div>
        </div>
        <div className="p-3">
          {tab === 'Publishers' && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-md-3"><input className="form-control" placeholder="Name" value={pubForm.name} onChange={(e) => setPubForm({ ...pubForm, name: e.target.value })} /></div>
                <div className="col-md-3"><input className="form-control" placeholder="https://…" value={pubForm.url} onChange={(e) => setPubForm({ ...pubForm, url: e.target.value })} /></div>
                <div className="col-md-3"><input className="form-control" placeholder="Search URL with {keyword}" value={pubForm.search_url} onChange={(e) => setPubForm({ ...pubForm, search_url: e.target.value })} /></div>
                <div className="col-md-2">
                  <div className="country-select">
                    <CountryFlag code={countryById(pubForm.country)?.code} flag={countryById(pubForm.country)?.flag} />
                    <select className="form-select" value={pubForm.country} onChange={(e) => setPubForm({ ...pubForm, country: e.target.value })}>
                      {allCountries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="col-md-1"><button className="btn btn-primary-soft w-100" onClick={addPublisher}>Add</button></div>
              </div>
              {publishers.map((item) => (
                <div className="queue-item d-flex justify-content-between" key={item.id}>
                  <div>
                    <strong>{item.name}</strong>
                    <div className="stat-mini d-flex align-items-center gap-1">
                      <CountryFlag code={countryById(item.country)?.code} flag={countryById(item.country)?.flag} title={item.country_name} />
                      <span>{item.country_name} · {item.url}</span>
                    </div>
                  </div>
                  <span className="badge-soft">{item.is_active ? 'active' : 'paused'}</span>
                </div>
              ))}
              <PaginationBar page={pubPage} pageSize={8} count={pubCount} onPage={setPubPage} />
            </>
          )}
          {tab === 'Countries' && (
            <>
              <div className="row g-2 mb-3 align-items-start">
                <div className="col-md-5">
                  <CountryField
                    name={countryForm.name}
                    onPick={(next) => setCountryForm({ name: next.name, code: next.code, flag: flagEmoji(next.code) })}
                  />
                </div>
                <div className="col-md-3">
                  <div className="flag-slot">
                    <CountryFlag code={countryForm.code} title={countryForm.name} />
                    <span>{countryForm.code || 'Flag'}</span>
                  </div>
                </div>
                <div className="col-md-2">
                  <button className="btn btn-primary-soft w-100" disabled={!countryForm.code} onClick={addCountry}>Add country</button>
                </div>
              </div>
              {countries.length === 0 && <div className="text-muted small">No countries yet. Search for one and add it with its flag.</div>}
              <div className="country-grid">
                {countries.map((item) => (
                  <div className="country-tile" key={item.id}>
                    <div className="flag"><CountryFlag code={item.code} flag={item.flag} title={item.name} /></div>
                    <div className="fw-semibold">{item.name}</div>
                    <div className="stat-mini">{item.code} · {item.news_count || 0} articles</div>
                  </div>
                ))}
              </div>
              <PaginationBar page={countryPage} pageSize={8} count={countryCount} onPage={setCountryPage} />
            </>
          )}
          {tab === 'Facebook pages' && (
            <>
              <div className="row g-2 mb-3">
                <div className="col-md-3"><input className="form-control" placeholder="Name" value={pageForm.name} onChange={(e) => setPageForm({ ...pageForm, name: e.target.value })} /></div>
                <div className="col-md-3"><input className="form-control" placeholder="page id" value={pageForm.page_id} onChange={(e) => setPageForm({ ...pageForm, page_id: e.target.value })} /></div>
                <div className="col-md-2">
                  <select className="form-select" value={pageForm.category} onChange={(e) => setPageForm({ ...pageForm, category: e.target.value })}>
                    {['Politics', 'Business', 'Sports', 'Health', 'Technology'].map((item) => <option key={item}>{item}</option>)}
                  </select>
                </div>
                <div className="col-md-2">
                  <div className="country-select">
                    <CountryFlag code={countryById(pageForm.country)?.code} flag={countryById(pageForm.country)?.flag} />
                    <select className="form-select" value={pageForm.country} onChange={(e) => setPageForm({ ...pageForm, country: e.target.value })}>
                      {allCountries.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
                    </select>
                  </div>
                </div>
                <div className="col-md-2"><button className="btn btn-primary-soft" onClick={addPage}>Add page</button></div>
              </div>
              {pages.map((item) => (
                <div className="queue-item d-flex justify-content-between align-items-center" key={item.id}>
                  <div><strong>{item.name}</strong><div className="stat-mini">{item.category} · facebook.com/{item.page_id}</div></div>
                  <button className="btn btn-outline-soft" onClick={() => togglePage(item)}>{item.is_active ? 'Pause' : 'Resume'}</button>
                </div>
              ))}
              <PaginationBar page={fbPage} pageSize={8} count={pageCount} onPage={setFbPage} />
            </>
          )}
        </div>
      </div>
    </>
  );
}
