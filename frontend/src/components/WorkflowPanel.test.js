import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import WorkflowPanel from './WorkflowPanel';
import { rumorGet, rumorSend } from '../api/rumor';

const mockNavigate = jest.fn();
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate }));
jest.mock('../api/rumor', () => ({ rumorGet: jest.fn(), rumorSend: jest.fn() }));
jest.mock('../api/client', () => ({ request: jest.fn() }));
jest.mock('../context/AppContext', () => ({ useApp: () => ({ notify: jest.fn() }) }));

const workflow = { claim_id: 'CL-TEST', text: 'A test claim', stage: 'verification', media_type: '',
  handling_mode: 'analyst', assigned_to: null, analyst: '', case: 'INV-TEST', cluster: '', report_id: null,
  originals: [], analyses: [], alert: null };

beforeEach(() => {
  jest.clearAllMocks();
  rumorGet.mockImplementation((path) => Promise.resolve({ ok: true, data: path === 'analysts/' ? [{ id: 7, name: 'Analyst', username: 'analyst' }] : workflow }));
});

test('assigns an investigation to a selected analyst', async () => {
  rumorSend.mockResolvedValue({ ok: true, data: workflow });
  render(<WorkflowPanel claimId="CL-TEST" />);
  await screen.findByText('No analysis has run. Assign an analyst or use AI Council to begin.');
  fireEvent.change(screen.getByLabelText('Assign investigation'), { target: { value: '7' } });
  fireEvent.click(screen.getByText('Assign investigation', { selector: 'button' }));
  await waitFor(() => expect(rumorSend).toHaveBeenCalledWith('workflow/CL-TEST/assign/', { body: { mode: 'analyst', user_id: 7 } }));
});

test('shows real source links and missing provider errors', async () => {
  const data = { ...workflow, analyses: [
    { id: 3, kind: 'verification', provider: 'OpenAI', status: 'completed', created_at: '2026-10-17T00:00:00Z',
      result: { summary: 'Research findings', citations: [{ title: 'Primary source', url: 'https://example.org/source' }] } },
    { id: 4, kind: 'forensic', provider: 'forensic-service', status: 'needs_configuration', created_at: '2026-10-17T00:01:00Z', error: 'Configure the forensic service.', result: {} },
  ] };
  rumorGet.mockImplementation((path) => Promise.resolve({ ok: true, data: path === 'analysts/' ? [] : data }));
  render(<WorkflowPanel claimId="CL-TEST" />);
  await screen.findByText('Research findings');
  expect(screen.getByRole('link', { name: 'Primary source' }).getAttribute('href')).toBe('https://example.org/source');
  expect(screen.getByText('Configure the forensic service.')).toBeTruthy();
});

test('routes analyzed media to deepfake analysis', async () => {
  rumorSend.mockResolvedValue({ ok: true, data: { ...workflow, media_type: 'video', analyses: [{ status: 'completed' }] } });
  render(<WorkflowPanel claimId="CL-TEST" />);
  await screen.findByText('Research and verify with OpenAI');
  fireEvent.click(screen.getByText('Research and verify with OpenAI'));
  await waitFor(() => expect(mockNavigate).toHaveBeenCalledWith('/forensic?claim=CL-TEST'));
});
