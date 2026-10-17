import { render, screen } from '@testing-library/react';
import App from './App';

test('renders secure login gate', async () => {
  render(<App />);
  expect(await screen.findByText(/Establish secure session/i)).toBeInTheDocument();
  expect(screen.getByText(/NarrativeShield/i)).toBeInTheDocument();
});
