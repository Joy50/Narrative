import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import FactVerification from './FactVerification';
import EvidenceVault from './EvidenceVault';
import Reports from './Reports';
import RumorScanner from './RumorScanner';
import { request } from '../api/client';
import { rumorGet } from '../api/rumor';

const mockNavigate = jest.fn();
let mockParams = new URLSearchParams();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useSearchParams: () => [mockParams, jest.fn()] }));
jest.mock('../api/client', () => ({ request: jest.fn(), readSession: jest.fn(), refreshSession: jest.fn() }));
jest.mock('../api/rumor', () => ({
  ...jest.requireActual('../api/rumor'), rumorGet: jest.fn(), rumorSend: jest.fn(),
}));
jest.mock('../context/AppContext', () => ({ useApp: () => ({ notify: jest.fn(), ready: true, user: { name: 'Analyst' } }) }));
jest.mock('../components/WorkflowWorkspace', () => () => <div>Pick an investigation claim</div>);
jest.mock('../components/WorkflowPanel', () => ({ __esModule: true,
  default: ({ claimId }) => <div data-testid="linked-workflow">{claimId}</div>, AnalysisOutput: () => null,
}));

beforeEach(() => { jest.clearAllMocks(); mockParams = new URLSearchParams(); });

test('verification without a selected record opens a picker instead of a demo claim', () => {
  render(<FactVerification />);
  expect(screen.getByText('Pick an investigation claim')).toBeTruthy();
  expect(rumorGet).not.toHaveBeenCalled();
});

test('evidence deep link loads the exact original and preserves return links', async () => {
  mockParams = new URLSearchParams('evidence=23');
  request.mockResolvedValue({ ok: true, data: { stats: {}, results: [{
    id: 23, evidence_id: 'EV-000023', name: 'original.wav', size: 100, sha256: 'hash', integrity: 'Verified',
    claim_id: 'CL-23', case_reference: 'INV-23', media_type: 'audio', events: [], created_at: '2026-10-17T00:00:00Z',
  }] } });
  render(<EvidenceVault />);
  await screen.findByText('Open claim CL-23');
  expect(request.mock.calls[0][0]).toContain('id=23');
  fireEvent.click(screen.getByText('Open claim CL-23'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/verify?id=CL-23');
  fireEvent.click(screen.getByText('Open case INV-23'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/cases?case=INV-23');
  fireEvent.click(screen.getByText("Analyze this claim's media"));
  expect(mockNavigate).toHaveBeenLastCalledWith('/forensic?claim=CL-23');
});

test('report references open their case, claim, and exact original', async () => {
  mockParams = new URLSearchParams('report=8');
  const report = { id: 8, title: 'Linked report', status: 'draft', version: 1, language: 'en', case_reference: 'INV-8',
    summary: 'Summary', findings: 'Findings', recommendations: 'Review', can_edit: true, revisions: [], events: [],
    source_snapshot: { claims: [{ id: 1, claim_id: 'CL-8', text: 'Recorded claim', status: 'Unverified' }],
      evidence: [{ id: 9, name: 'record.mp4', integrity: 'Verified', sha256: 'hash' }] } };
  request.mockImplementation((path) => Promise.resolve({ ok: true, data: path.endsWith('/8/') ? report : { results: [report], stats: {}, can_review: false } }));
  render(<Reports />);
  await screen.findByText('Open case INV-8');
  fireEvent.click(screen.getByText('Open case INV-8'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/cases?case=INV-8');
  fireEvent.click(screen.getByText('CL-8 · Unverified'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/verify?id=CL-8');
  fireEvent.click(screen.getByText('record.mp4 · Verified'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/vault?evidence=9');
});

test('scanner finds a deep-linked claim outside the default page and sends that claim onward', async () => {
  mockParams = new URLSearchParams('claim=CL-TARGET');
  rumorGet.mockImplementation((path) => {
    const rows = path.startsWith('claims/') ? [{ id: 99, claim_id: 'CL-TARGET', text: 'The selected media claim', language: 'English', source: 'Public', status: 'Unverified', priority: 'High', media_type: 'video' }] : [];
    return Promise.resolve({ ok: true, data: path === 'overview/' ? {} : { results: rows, count: rows.length } });
  });
  render(<RumorScanner />);
  await waitFor(() => expect(screen.getByTestId('linked-workflow').textContent).toBe('CL-TARGET'));
  expect(rumorGet.mock.calls.some(([path]) => path.startsWith('claims/') && path.includes('q=CL-TARGET'))).toBe(true);
  fireEvent.click(screen.getByText('Send media to deepfake analysis'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/forensic?claim=CL-TARGET');
  fireEvent.click(screen.getByText('Request AI Council review'));
  expect(mockNavigate).toHaveBeenLastCalledWith('/council?claim=CL-TARGET');
});
