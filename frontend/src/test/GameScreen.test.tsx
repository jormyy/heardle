import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import GameScreen from '../components/GameScreen';
import type { Song } from '../types';

const mockSong: Song = {
  id: '42',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  album: 'A Night at the Opera',
  album_art_url: 'http://example.com/art.jpg',
  preview_url: 'http://example.com/preview.mp3',
};

vi.mock('../api/client', () => ({
  autocomplete: vi.fn().mockResolvedValue([
    { id: '42', title: 'Bohemian Rhapsody', artist: 'Queen' },
    { id: '43', title: 'Bohemian Like You', artist: 'Dandy Warhols' },
  ]),
  submitGuess: vi.fn(),
  skipAttempt: vi.fn(),
}));

// jsdom doesn't implement HTMLMediaElement — stub it
window.HTMLMediaElement.prototype.play = vi.fn().mockResolvedValue(undefined);
window.HTMLMediaElement.prototype.pause = vi.fn();

const defaultProps = {
  sessionId: 'session-1',
  previewUrl: 'http://example.com/preview.mp3',
  startTime: Date.now(),
  onEnd: vi.fn(),
};

describe('GameScreen', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    defaultProps.onEnd = vi.fn();
  });

  it('renders the attempt tracker with 6 bars', () => {
    render(<GameScreen {...defaultProps} />);
    expect(screen.getByText('Attempt 1 of 6')).toBeInTheDocument();
  });

  it('shows "Attempt 1 of 6" on start', () => {
    render(<GameScreen {...defaultProps} />);
    expect(screen.getByText('Attempt 1 of 6')).toBeInTheDocument();
  });

  it('renders a play button', () => {
    render(<GameScreen {...defaultProps} />);
    expect(screen.getByRole('button', { name: '' })).toBeInTheDocument();
  });

  it('renders the guess input', () => {
    render(<GameScreen {...defaultProps} />);
    expect(screen.getByPlaceholderText(/search for a song/i)).toBeInTheDocument();
  });

  it('shows autocomplete suggestions after typing', async () => {
    render(<GameScreen {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search for a song/i), 'boh');
    await waitFor(() => {
      expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
      expect(screen.getByText('Bohemian Like You')).toBeInTheDocument();
    });
  });

  it('calls submitGuess when a suggestion is selected', async () => {
    const { submitGuess } = await import('../api/client');
    vi.mocked(submitGuess).mockResolvedValue({
      correct: false,
      attempt: 2,
      game_over: false,
    });

    render(<GameScreen {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search for a song/i), 'boh');
    await waitFor(() => screen.getByText('Bohemian Rhapsody'));
    await userEvent.click(screen.getByText('Bohemian Rhapsody'));

    expect(submitGuess).toHaveBeenCalledWith('session-1', '42');
  });

  it('advances to attempt 2 after a wrong guess', async () => {
    const { submitGuess } = await import('../api/client');
    vi.mocked(submitGuess).mockResolvedValue({
      correct: false,
      attempt: 2,
      game_over: false,
    });

    render(<GameScreen {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search for a song/i), 'boh');
    await waitFor(() => screen.getByText('Bohemian Rhapsody'));
    await userEvent.click(screen.getByText('Bohemian Rhapsody'));

    await waitFor(() => {
      expect(screen.getByText('Attempt 2 of 6')).toBeInTheDocument();
    });
  });

  it('calls onEnd with won=true on correct guess', async () => {
    const { submitGuess } = await import('../api/client');
    vi.mocked(submitGuess).mockResolvedValue({
      correct: true,
      attempt: 1,
      game_over: true,
      answer: mockSong,
    });

    render(<GameScreen {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search for a song/i), 'boh');
    await waitFor(() => screen.getByText('Bohemian Rhapsody'));
    await userEvent.click(screen.getByText('Bohemian Rhapsody'));

    await waitFor(() => {
      expect(defaultProps.onEnd).toHaveBeenCalledWith(true, mockSong, 1, expect.any(Number));
    });
  });

  it('calls onEnd with won=false when game_over after wrong guess', async () => {
    const { submitGuess } = await import('../api/client');
    vi.mocked(submitGuess).mockResolvedValue({
      correct: false,
      attempt: 6,
      game_over: true,
      answer: mockSong,
    });

    render(<GameScreen {...defaultProps} />);
    await userEvent.type(screen.getByPlaceholderText(/search for a song/i), 'boh');
    await waitFor(() => screen.getByText('Bohemian Rhapsody'));
    await userEvent.click(screen.getByText('Bohemian Rhapsody'));

    await waitFor(() => {
      expect(defaultProps.onEnd).toHaveBeenCalledWith(false, mockSong, 6, expect.any(Number));
    });
  });

  it('calls skipAttempt when skip is clicked', async () => {
    const { skipAttempt } = await import('../api/client');
    vi.mocked(skipAttempt).mockResolvedValue({ attempt: 2, game_over: false });

    render(<GameScreen {...defaultProps} />);
    await userEvent.click(screen.getByText(/skip/i));

    expect(skipAttempt).toHaveBeenCalledWith('session-1');
  });

  it('advances attempt after skip', async () => {
    const { skipAttempt } = await import('../api/client');
    vi.mocked(skipAttempt).mockResolvedValue({ attempt: 2, game_over: false });

    render(<GameScreen {...defaultProps} />);
    await userEvent.click(screen.getByText(/skip/i));

    await waitFor(() => {
      expect(screen.getByText('Attempt 2 of 6')).toBeInTheDocument();
    });
  });

  it('calls onEnd with won=false after final skip', async () => {
    const { skipAttempt } = await import('../api/client');
    vi.mocked(skipAttempt).mockResolvedValue({
      attempt: 6,
      game_over: true,
      answer: mockSong,
    });

    render(<GameScreen {...defaultProps} />);
    await userEvent.click(screen.getByText(/skip/i));

    await waitFor(() => {
      expect(defaultProps.onEnd).toHaveBeenCalledWith(false, mockSong, 6, expect.any(Number));
    });
  });
});
