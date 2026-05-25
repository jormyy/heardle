import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import App from '../App';
import type { Song, Theme } from '../types';

const mockSong: Song = {
  id: '1',
  title: 'Test Song',
  artist: 'Test Artist',
  album: 'Test Album',
  album_art_url: 'http://example.com/art.jpg',
  preview_url: 'http://example.com/preview.mp3',
};

vi.mock('../components/ThemeSelector', () => ({
  default: ({
    onStart,
    initialThemes,
  }: {
    onStart: (id: string, url: string, themes: Theme[], limit: number | undefined) => void;
    initialThemes?: Theme[];
    initialLimit?: number;
  }) => (
    <div data-testid="theme-selector">
      <span data-testid="initial-themes">{JSON.stringify(initialThemes)}</span>
      <button
        onClick={() =>
          onStart('session-1', 'http://example.com/p.mp3', [{ type: 'decade', value: '90s' }], 25)
        }
      >
        Start
      </button>
    </div>
  ),
}));

vi.mock('../components/GameScreen', () => ({
  default: ({
    onEnd,
  }: {
    onEnd: (won: boolean, answer: Song, attempts: number, elapsedMs: number) => void;
  }) => (
    <div data-testid="game-screen">
      <button onClick={() => onEnd(true, mockSong, 2, 5000)}>Win</button>
      <button onClick={() => onEnd(false, mockSong, 6, 30000)}>Lose</button>
    </div>
  ),
}));

vi.mock('../components/EndScreen', () => ({
  default: ({ won, onPlayAgain }: { won: boolean; onPlayAgain: () => void }) => (
    <div data-testid="end-screen">
      <span data-testid="result">{won ? 'won' : 'lost'}</span>
      <button onClick={onPlayAgain}>Play Again</button>
    </div>
  ),
}));

describe('App', () => {
  it('renders ThemeSelector on initial load', () => {
    render(<App />);
    expect(screen.getByTestId('theme-selector')).toBeInTheDocument();
  });

  it('starts with no saved themes', () => {
    render(<App />);
    expect(screen.getByTestId('initial-themes').textContent).toBe('[]');
  });

  it('transitions to GameScreen after onStart is called', async () => {
    render(<App />);
    await userEvent.click(screen.getByText('Start'));
    expect(screen.getByTestId('game-screen')).toBeInTheDocument();
    expect(screen.queryByTestId('theme-selector')).not.toBeInTheDocument();
  });

  it('transitions to EndScreen with won=true after winning', async () => {
    render(<App />);
    await userEvent.click(screen.getByText('Start'));
    await userEvent.click(screen.getByText('Win'));
    expect(screen.getByTestId('end-screen')).toBeInTheDocument();
    expect(screen.getByTestId('result').textContent).toBe('won');
  });

  it('transitions to EndScreen with won=false after losing', async () => {
    render(<App />);
    await userEvent.click(screen.getByText('Start'));
    await userEvent.click(screen.getByText('Lose'));
    expect(screen.getByTestId('end-screen')).toBeInTheDocument();
    expect(screen.getByTestId('result').textContent).toBe('lost');
  });

  it('returns to ThemeSelector with saved themes after Play Again', async () => {
    render(<App />);
    await userEvent.click(screen.getByText('Start'));
    await userEvent.click(screen.getByText('Win'));
    await userEvent.click(screen.getByText('Play Again'));
    expect(screen.getByTestId('theme-selector')).toBeInTheDocument();
    expect(screen.getByTestId('initial-themes').textContent).toContain('90s');
  });

  it('does not show GameScreen or EndScreen on initial load', () => {
    render(<App />);
    expect(screen.queryByTestId('game-screen')).not.toBeInTheDocument();
    expect(screen.queryByTestId('end-screen')).not.toBeInTheDocument();
  });
});
