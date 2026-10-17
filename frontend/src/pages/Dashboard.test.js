import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import Dashboard from './Dashboard';
import { rumorGet } from '../api/rumor';

const mockNavigate = jest.fn();
let mockRange = '7d';
jest.mock('react-router-dom', () => ({ useNavigate: () => mockNavigate, useOutletContext: () => ({ range: mockRange }) }));
jest.mock('../api/rumor', () => ({ rumorGet: jest.fn() }));
jest.mock('recharts', () => {
  const React = require('react');
  const Container = ({ children }) => <div>{children}</div>;
  return { ResponsiveContainer: Container, BarChart: Container, PieChart: Container, Pie: Container,
    Bar: () => null, Cell: () => null, CartesianGrid: () => null, Tooltip: () => null, XAxis: () => null, YAxis: () => null };
});
const data = {
  generated_at: '2026-10-17T12:00:00Z', timezone: 'Asia/Dhaka', days: 7,
  totals: { claims: 3, unverified: 2, unassigned: 1, active_cases: 1, high_priority_alerts: 0,
    draft_reports: 1, pending_reports: 0, council_runs: 2, analysis_attention: 0 },
  stages: [{ key: 'verification', label: 'Verification', count: 2 }], intake: [{ label: '17 Oct', claims: 3 }],
  classifications: [{ name: 'Unverified', value: 2 }], queue: [{ claim_id: 'CL-TEST', text: 'A current claim', priority: 'High', stage: 'verification' }],
  alerts: [], attention: [], reports: [{ id: 8, title: 'Current report', status: 'draft', version: 1 }], activity: [],
  providers: { openai: { ready: true, model: 'test-model' }, forensic: { ready: false } },
};
beforeEach(() => { jest.clearAllMocks(); mockRange = '7d'; rumorGet.mockResolvedValue({ ok: true, data }); });

test('loads live queues and opens the exact claim and report', async () => {
  render(<Dashboard />);
  await screen.findByText('A current claim');
  expect(rumorGet).toHaveBeenCalledWith('intelligence-overview/?days=7');
  expect(screen.getByText('3 total claims')).toBeTruthy();
  fireEvent.click(screen.getByText('A current claim'));
  expect(mockNavigate).toHaveBeenCalledWith('/verify?id=CL-TEST');
  fireEvent.click(screen.getByText('Current report'));
  expect(mockNavigate).toHaveBeenCalledWith('/reports?report=8');
  expect(screen.getByText('Setup required')).toBeTruthy();
});

test('reloads when the shared date range changes', async () => {
  const { rerender } = render(<Dashboard />);
  await screen.findByText('A current claim');
  mockRange = '30d';
  rerender(<Dashboard />);
  await waitFor(() => expect(rumorGet).toHaveBeenCalledWith('intelligence-overview/?days=30'));
});

test('shows an error and retries without displaying invented totals', async () => {
  rumorGet.mockResolvedValueOnce({ ok: false, data: { detail: 'API unavailable' } });
  render(<Dashboard />);
  await screen.findByRole('alert');
  expect(screen.queryByText('3 total claims')).toBeNull();
  fireEvent.click(screen.getByText('Retry'));
  await screen.findByText('A current claim');
});
