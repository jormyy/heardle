import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import EndScreen from '../components/EndScreen';
import type { Song } from '../types';

const song: Song = {
  id: '1',
  title: 'Bohemian Rhapsody',
  artist: 'Queen',
  album: 'A Night at the Opera',
  album_art_url: 'http://example.com/art.jpg',
  preview_url: 'http://example.com/preview.mp3',
};

describe('EndScreen', () => {
  it('shows win message on correct guess', () => {
    render(<EndScreen won answer={song} attempts={2} elapsedMs={5000} onPlayAgain={() => {}} />);
    expect(screen.getByText('Nice one')).toBeInTheDocument();
  });

  it('shows loss message when not guessed', () => {
    render(<EndScreen won={false} answer={song} attempts={6} elapsedMs={30000} onPlayAgain={() => {}} />);
    expect(screen.getByText('Better luck next time')).toBeInTheDocument();
  });

  it('displays song title and artist', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={3000} onPlayAgain={() => {}} />);
    expect(screen.getByText('Bohemian Rhapsody')).toBeInTheDocument();
    expect(screen.getByText('Queen')).toBeInTheDocument();
  });

  it('shows attempt count and elapsed seconds on win', () => {
    render(<EndScreen won answer={song} attempts={3} elapsedMs={12000} onPlayAgain={() => {}} />);
    expect(screen.getByText(/3 attempts/)).toBeInTheDocument();
    expect(screen.getByText(/12s/)).toBeInTheDocument();
  });

  it('uses singular "attempt" when guessed on first try', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={2000} onPlayAgain={() => {}} />);
    expect(screen.getByText(/1 attempt/)).toBeInTheDocument();
    expect(screen.queryByText(/1 attempts/)).not.toBeInTheDocument();
  });

  it('shows failure message (not attempt count) on loss', () => {
    render(<EndScreen won={false} answer={song} attempts={6} elapsedMs={30000} onPlayAgain={() => {}} />);
    expect(screen.getByText(/not guessed after 6 attempts/)).toBeInTheDocument();
  });

  it('shows album art', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={1000} onPlayAgain={() => {}} />);
    expect(screen.getByRole('img')).toHaveAttribute('src', song.album_art_url);
  });

  it('calls onPlayAgain when Play Again is clicked', async () => {
    const onPlayAgain = vi.fn();
    render(<EndScreen won answer={song} attempts={1} elapsedMs={1000} onPlayAgain={onPlayAgain} />);
    await userEvent.click(screen.getByRole('button', { name: /play again/i }));
    expect(onPlayAgain).toHaveBeenCalledOnce();
  });

  it('renders a Deezer link', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={1000} onPlayAgain={() => {}} />);
    expect(screen.getByRole('link', { name: /deezer/i })).toHaveAttribute('href', expect.stringContaining('deezer.com'));
  });

  it('Deezer link URL contains encoded song title and artist', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={1000} onPlayAgain={() => {}} />);
    const link = screen.getByRole('link', { name: /deezer/i });
    const href = link.getAttribute('href') ?? '';
    expect(href).toContain(encodeURIComponent('Bohemian Rhapsody Queen'));
  });

  it('shows the album name', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={1000} onPlayAgain={() => {}} />);
    expect(screen.getByText('A Night at the Opera')).toBeInTheDocument();
  });

  it('does not render an img when album_art_url is empty', () => {
    const noArt = { ...song, album_art_url: '' };
    render(<EndScreen won answer={noArt} attempts={1} elapsedMs={1000} onPlayAgain={() => {}} />);
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });

  it('rounds elapsed time to nearest second', () => {
    render(<EndScreen won answer={song} attempts={1} elapsedMs={1499} onPlayAgain={() => {}} />);
    expect(screen.getByText(/1s/)).toBeInTheDocument();
  });

  it('shows "Better luck next time" regardless of elapsed time on loss', () => {
    render(<EndScreen won={false} answer={song} attempts={6} elapsedMs={0} onPlayAgain={() => {}} />);
    expect(screen.getByText('Better luck next time')).toBeInTheDocument();
  });
});
