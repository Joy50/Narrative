import { BrowserRouter, Navigate, Route, Routes } from 'react-router-dom';
import { AppProvider, useApp } from './context/AppContext';
import Layout from './components/Layout';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import RumorScanner from './pages/RumorScanner';
import ForensicWorkbench from './pages/ForensicWorkbench';
import FactVerification from './pages/FactVerification';
import NarrativeExplorer from './pages/NarrativeExplorer';
import AICouncil from './pages/AICouncil';
import Cases from './pages/Cases';
import Reports from './pages/Reports';
import EarlyWarning from './pages/EarlyWarning';
import EvidenceVault from './pages/EvidenceVault';
import Administration from './pages/Administration';
import SubmitContent from './pages/SubmitContent';
import GlobalMedia from './pages/GlobalMedia';
import FetchNews from './pages/FetchNews';
import MediaSearch from './pages/MediaSearch';
import MediaStats from './pages/MediaStats';
import MediaSources from './pages/MediaSources';

function Guard({ children }) {
  const { user, ready } = useApp();
  if (!ready) {
    return (
      <div className="login-shell d-flex align-items-center justify-content-center">
        <div className="small" style={{ color: 'var(--muted)' }}><i className="fas fa-spinner fa-spin me-2" />Restoring secure session…</div>
      </div>
    );
  }
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

function AppRoutes() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route
        path="/"
        element={(
          <Guard>
            <Layout />
          </Guard>
        )}
      >
        <Route index element={<Dashboard />} />
        <Route path="scanner" element={<RumorScanner />} />
        <Route path="submit" element={<SubmitContent />} />
        <Route path="media" element={<GlobalMedia />} />
        <Route path="fetch" element={<FetchNews />} />
        <Route path="media-search" element={<MediaSearch />} />
        <Route path="media-stats" element={<MediaStats />} />
        <Route path="sources" element={<MediaSources />} />
        <Route path="forensic" element={<ForensicWorkbench />} />
        <Route path="verify" element={<FactVerification />} />
        <Route path="explorer" element={<NarrativeExplorer />} />
        <Route path="council" element={<AICouncil />} />
        <Route path="cases" element={<Cases />} />
        <Route path="reports" element={<Reports />} />
        <Route path="warning" element={<EarlyWarning />} />
        <Route path="vault" element={<EvidenceVault />} />
        <Route path="admin" element={<Administration />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

export default function App() {
  return (
    <AppProvider>
      <BrowserRouter>
        <AppRoutes />
      </BrowserRouter>
    </AppProvider>
  );
}
