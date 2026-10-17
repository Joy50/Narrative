import { useEffect, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { rumorGet } from '../api/rumor';
import { copy } from '../data/i18n';
import { useApp } from '../context/AppContext';

const GROUPS = [
  {
    label: { en: 'Operations', bn: 'অপারেশন' },
    items: [
      { to: '/', icon: 'fa-gauge-high', key: 'dashboard' },
      { to: '/scanner', icon: 'fa-magnifying-glass', key: 'scanner' },
      { to: '/verify', icon: 'fa-check-double', key: 'verify' },
      { to: '/forensic', icon: 'fa-clapperboard', key: 'forensic' },
      { to: '/explorer', icon: 'fa-diagram-project', key: 'explorer' },
      { to: '/warning', icon: 'fa-bell', key: 'warning' },
    ],
  },
  {
    label: { en: 'Investigations', bn: 'তদন্ত' },
    items: [
      { to: '/cases', icon: 'fa-folder-open', key: 'cases' },
      { to: '/vault', icon: 'fa-box-archive', key: 'vault' },
      { to: '/council', icon: 'fa-users-gear', key: 'council' },
      { to: '/reports', icon: 'fa-file-lines', key: 'reports' },
    ],
  },
  {
    label: { en: 'Media ingest', bn: 'মিডিয়া ইনজেস্ট' },
    items: [
      { to: '/media', icon: 'fa-globe', key: 'media' },
      { to: '/fetch', icon: 'fa-satellite-dish', key: 'fetch' },
      { to: '/media-search', icon: 'fa-search', key: 'mediaSearch' },
      { to: '/media-stats', icon: 'fa-chart-column', key: 'mediaStats' },
      { to: '/submit', icon: 'fa-cloud-arrow-up', key: 'submit' },
    ],
  },
  {
    label: { en: 'System', bn: 'সিস্টেম' },
    items: [
      { to: '/sources', icon: 'fa-sliders', key: 'sources' },
      { to: '/admin', icon: 'fa-user-shield', key: 'admin' },
    ],
  },
];

function pathInGroup(pathname, items) {
  return items.some((item) => (item.to === '/' ? pathname === '/' : pathname === item.to || pathname.startsWith(`${item.to}/`)));
}

const TITLES = {
  '/': { en: ['Intelligence Overview', 'Queues, investigations, and classification'], bn: ['ইন্টেলিজেন্স ওভারভিউ', 'কিউ, তদন্ত ও শ্রেণিবিন্যাস'] },
  '/scanner': { en: ['Rumor Scanner', 'Claim extraction, clustering, and triage'], bn: ['গুজব স্ক্যানার', 'দাবি নিষ্কাশন ও ট্রায়াজ'] },
  '/verify': { en: ['Claim Verification', 'Evidence-linked assessment workspace'], bn: ['দাবি যাচাই', 'প্রমাণভিত্তিক মূল্যায়ন'] },
  '/forensic': { en: ['Deepfake Analysis', 'Forensic indicators · not a verdict'], bn: ['ডিপফেক বিশ্লেষণ', 'ফরেনসিক সূচক · রায় নয়'] },
  '/explorer': { en: ['Narrative Analysis', 'Observed clusters and public propagation'], bn: ['ন্যারেটিভ বিশ্লেষণ', 'ক্লাস্টার ও প্রচার'] },
  '/warning': { en: ['Alert Analysis', 'Review priority from live rumor intake'], bn: ['সতর্কতা বিশ্লেষণ', 'লাইভ ইনটেক থেকে পর্যালোচনা অগ্রাধিকার'] },
  '/cases': { en: ['Investigation Cases', 'Lifecycle, assignment, and review'], bn: ['তদন্ত কেস', 'জীবনচক্র ও অ্যাসাইনমেন্ট'] },
  '/vault': { en: ['Evidence Repository', 'Hashed originals and custody events'], bn: ['প্রমাণ ভাণ্ডার', 'হ্যাশকৃত মূল ও কাস্টডি'] },
  '/council': { en: ['AI Council', 'Multi-agent analysis under human control'], bn: ['এআই কাউন্সিল', 'মানব-নিয়ন্ত্রিত বিশ্লেষণ'] },
  '/reports': { en: ['Intelligence Reports', 'Versioned bilingual products'], bn: ['গোয়েন্দা প্রতিবেদন', 'দ্বিভাষিক সংস্করণ'] },
  '/media': { en: ['Global Media', 'Country feeds and public headlines'], bn: ['গ্লোবাল মিডিয়া', 'দেশভিত্তিক ফিড'] },
  '/fetch': { en: ['Fetch News', 'Keyword ingest and job status'], bn: ['নিউজ ফেচ', 'কীওয়ার্ড ইনজেস্ট'] },
  '/media-search': { en: ['Media Search', 'Full-text search of ingested corpus'], bn: ['মিডিয়া সার্চ', 'কর্পাস অনুসন্ধান'] },
  '/media-stats': { en: ['Media Insights', 'Time-series volume, sentiment, and country comparison'], bn: ['মিডিয়া ইনসাইটস', 'সময় সিরিজ, সেন্টিমেন্ট ও তুলনা'] },
  '/submit': { en: ['Submit Content', 'Authorized public-source intake'], bn: ['কন্টেন্ট জমা', 'অনুমোদিত পাবলিক ইনটেক'] },
  '/sources': { en: ['System Settings', 'Publishers, countries, and page registry'], bn: ['সিস্টেম সেটিংস', 'প্রকাশক ও রেজিস্ট্রি'] },
  '/admin': { en: ['Administration', 'Operators, connectors, and audit'], bn: ['প্রশাসন', 'অপারেটর ও অডিট'] },
};

export default function Layout() {
  const { user, lang, setLang, logout, toasts, ready } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const t = copy[lang];
  const title = TITLES[location.pathname] || TITLES['/'];
  const [heading, sub] = title[lang];
  const [collapsed, setCollapsed] = useState(false);
  const [openGroups, setOpenGroups] = useState(() => {
    const active = GROUPS.find((group) => pathInGroup(location.pathname, group.items));
    return { [active?.label.en || 'Operations']: true };
  });
  const [query, setQuery] = useState('');
  const [range, setRange] = useState('7d');
  const [openNotify, setOpenNotify] = useState(false);
  const [openProfile, setOpenProfile] = useState(false);
  const [watchAlerts, setWatchAlerts] = useState([]);

  useEffect(() => {
    document.title = `${heading} · NarrativeShield`;
  }, [heading]);

  useEffect(() => {
    const active = GROUPS.find((group) => pathInGroup(location.pathname, group.items));
    if (active) setOpenGroups((prev) => ({ ...prev, [active.label.en]: true }));
  }, [location.pathname]);

  useEffect(() => {
    if (!ready) return;
    rumorGet('alerts/').then((result) => {
      if (result.ok) setWatchAlerts((result.data?.alerts || []).slice(0, 3));
    });
  }, [ready, location.pathname]);

  const toggleGroup = (id) => {
    setOpenGroups((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const search = (event) => {
    event.preventDefault();
    if (!query.trim()) return;
    navigate(`/scanner?q=${encodeURIComponent(query.trim())}`);
  };

  return (
    <div className="app-shell">
      <aside className={`sidebar d-flex flex-column ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand d-flex align-items-center justify-content-between">
          <div className="d-flex align-items-center gap-2">
            <span className="brand-mark"><img src={`${process.env.PUBLIC_URL}/logo.png`} alt="NarrativeShield" /></span>
            <span>{t.brand}</span>
          </div>
          <button className="btn btn-outline-soft" onClick={() => setCollapsed((v) => !v)} aria-label="Collapse navigation">
            <i className={`fas ${collapsed ? 'fa-angles-right' : 'fa-angles-left'}`} />
          </button>
        </div>
        <nav className="nav flex-column mt-1 flex-grow-1 overflow-auto">
          {GROUPS.map((group) => {
            const id = group.label.en;
            const open = collapsed || !!openGroups[id];
            const current = pathInGroup(location.pathname, group.items);
            return (
              <div key={id} className={`nav-drawer-block ${open ? 'open' : ''} ${current ? 'current' : ''}`}>
                <button
                  type="button"
                  className="nav-group-btn"
                  onClick={() => toggleGroup(id)}
                  aria-expanded={open}
                  aria-controls={`nav-${id}`}
                >
                  <span>{group.label[lang]}</span>
                  <i className={`fas fa-chevron-down nav-chevron ${open ? 'open' : ''}`} />
                </button>
                <div id={`nav-${id}`} className={`nav-drawer ${open ? 'open' : ''}`}>
                  <div className="nav-drawer-inner">
                    {group.items.map((link) => (
                      <NavLink key={link.to} to={link.to} end={link.to === '/'} className="nav-link" title={t.nav[link.key]}>
                        <i className={`fas ${link.icon}`} />
                        <span>{t.nav[link.key]}</span>
                      </NavLink>
                    ))}
                  </div>
                </div>
              </div>
            );
          })}
        </nav>
        <div className="p-3 mt-auto small sidebar-footer">
          <i className="fas fa-lock me-1" />
          <span>{t.airgapped}</span>
        </div>
      </aside>

      <div className="app-main">
        <div className={`main-content ${location.pathname === '/' ? 'overview-shell' : ''}`}>
          <div className="top-bar">
            <div className="d-flex justify-content-between align-items-start flex-wrap gap-3">
              <div>
                <h1 className="mb-0 top-bar-title">{heading}</h1>
                <span className="text-muted small">{sub}</span>
              </div>
              <div className="d-flex align-items-center gap-2 flex-wrap">
                <form className="global-search" onSubmit={search}>
                  <i className="fas fa-search" />
                  <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={lang === 'bn' ? 'দাবি, URL বা কেস খুঁজুন' : 'Search claims, URLs, or cases'} />
                </form>
                <select className="form-select" style={{ width: 92 }} value={range} onChange={(e) => setRange(e.target.value)}>
                  <option value="24h">24h</option>
                  <option value="7d">7d</option>
                  <option value="30d">30d</option>
                </select>
                <div className="language-switch btn-group" role="group">
                  <button type="button" className={`btn btn-outline-soft ${lang === 'en' ? 'active' : ''}`} onClick={() => setLang('en')}>EN</button>
                  <button type="button" className={`btn btn-outline-soft ${lang === 'bn' ? 'active' : ''}`} onClick={() => setLang('bn')}>বাং</button>
                </div>
                <span className="health-chip"><span className="live-dot" />Healthy</span>
                <div className="position-relative">
                  <button className="notify-btn" onClick={() => { setOpenNotify((v) => !v); setOpenProfile(false); }} aria-label="Notifications">
                    <i className="fas fa-bell" />
                    <span className="notify-dot" />
                  </button>
                  {openNotify && (
                    <div className="dropdown-panel">
                      <div className="fw-semibold mb-2">Alert analysis</div>
                      {watchAlerts.length === 0 && <div className="stat-mini mb-2">No active watch alerts.</div>}
                      {watchAlerts.map((alert) => (
                        <button
                          type="button"
                          key={alert.id}
                          className="btn btn-link link-cyan small p-0 d-block text-start mb-2"
                          onClick={() => { setOpenNotify(false); navigate(`/warning?alert=${encodeURIComponent(alert.id)}`); }}
                        >
                          {alert.title}
                        </button>
                      ))}
                      <button className="btn btn-link link-cyan small p-0 mt-1" onClick={() => { setOpenNotify(false); navigate('/warning'); }}>Open alert analysis</button>
                    </div>
                  )}
                </div>
                <div className="position-relative">
                  <button className="profile-btn" onClick={() => { setOpenProfile((v) => !v); setOpenNotify(false); }}>
                    <i className="fas fa-user-circle me-1" />{user.name}
                  </button>
                  {openProfile && (
                    <div className="dropdown-panel">
                      <div className="fw-semibold">{user.name}</div>
                      <div className="stat-mini mb-2">{user.role} · {user.clearance || 'RESTRICTED'}</div>
                      <button className="btn btn-outline-soft w-100" onClick={logout}>{t.logout}</button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          <Outlet />

          <footer className="page-footer d-flex justify-content-between align-items-center flex-wrap gap-2">
            <div><i className="fas fa-shield-halved me-2" />{t.classification}</div>
            <div><i className="fas fa-lock me-2" />Evidence originals are hashed with SHA-256</div>
          </footer>
        </div>
      </div>

      <div className="position-fixed bottom-0 end-0 p-3" style={{ zIndex: 20 }}>
        {toasts.map((toast) => (
          <div key={toast.id} className="toast-soft mb-2">{toast.message}</div>
        ))}
      </div>
    </div>
  );
}
