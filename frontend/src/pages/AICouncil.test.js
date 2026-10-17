import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import AICouncil from './AICouncil';
import { rumorGet, rumorSend } from '../api/rumor';

jest.mock('../api/rumor', () => ({ rumorGet: jest.fn(), rumorSend: jest.fn() }));
jest.mock('../context/AppContext', () => ({ useApp: () => ({ notify: jest.fn() }) }));
jest.mock('react-router-dom', () => ({
  useNavigate: () => jest.fn(),
  useSearchParams: () => [new URLSearchParams('claim=CL-TEST')],
}));

const run = {
  id: 42, claim_id: 'CL-TEST', status: 'completed', snapshot: { text: 'Test claim', engine: 'local-rules-v1' },
  agents: [{ name: 'Claim Agent', role: 'Segmentation', status: 'complete', body: 'One claim' }],
  checks: ['Human review required'], draft: 'Unverified draft', created_at: '2026-10-17T00:00:00Z', assessment: null,
};

beforeEach(() => {
  jest.clearAllMocks();
  rumorGet.mockResolvedValue({ ok: true, data: { results: [], next: null } });
});

test('starts a backend run and saves its draft once', async () => {
  rumorSend.mockResolvedValueOnce({ ok: true, data: run })
    .mockResolvedValueOnce({ ok: true, data: { ...run, assessment: 9, case: 3 } });
  render(<AICouncil />);
  await screen.findByText(/No council run selected/);
  fireEvent.click(screen.getByText('Run new council'));
  await screen.findByText('Unverified draft');
  expect(rumorSend).toHaveBeenCalledWith('council/', { body: { claim_id: 'CL-TEST' } });
  fireEvent.click(screen.getByText('Save draft to case file'));
  await screen.findByText('Draft saved for review');
  expect(screen.getByText('Draft saved for review').disabled).toBe(true);
  expect(rumorSend).toHaveBeenLastCalledWith('council/42/accept/');
  expect(screen.getByText('Review saved draft')).toBeTruthy();
  expect(screen.getByText('Open case file')).toBeTruthy();
});

test('loads persisted history and reports a missing claim', async () => {
  rumorGet.mockResolvedValue({ ok: true, data: { results: [run], next: null } });
  rumorSend.mockResolvedValue({ ok: false, status: 404 });
  render(<AICouncil />);
  await screen.findByText('Unverified draft');
  fireEvent.click(screen.getByText('Run history'));
  expect(screen.getByText(/#42 · CL-TEST/)).toBeTruthy();
  fireEvent.click(screen.getByText('Run new council'));
  await waitFor(() => expect(screen.getByRole('alert').textContent).toContain('Claim not found'));
});
