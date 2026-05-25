import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import ThemeSelector from '../components/ThemeSelector';

vi.mock('../api/client', () => ({
  searchArtists: vi.fn().mockResolvedValue([
    { id: '1', name: 'Drake', picture_url: '' },
    { id: '2', name: 'Drake Bell', picture_url: '' },
  ]),
  searchGenres: vi.fn().mockResolvedValue([
    { id: '132', name: 'Pop' },
    { id: '116', name: 'Rap/Hip Hop' },
  ]),
  startGame: vi.fn().mockResolvedValue({ session_id: 'abc-123', pool_size: 50 }),
  getClip: vi.fn().mockResolvedValue({
    preview_url: 'http://example.com/preview.mp3',
    allowed_duration: 1,
    attempt: 1,
  }),
}));

describe('ThemeSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders the three theme sections', () => {
    render(<ThemeSelector onStart={() => {}} />);
    expect(screen.getByText('Artist')).toBeInTheDocument();
    expect(screen.getByText('Genre')).toBeInTheDocument();
    expect(screen.getByText('Decade')).toBeInTheDocument();
  });

  it('play button is always enabled', () => {
    render(<ThemeSelector onStart={() => {}} />);
    expect(screen.getByRole('button', { name: /play/i })).not.toBeDisabled();
  });

  it('selecting a decade shows it as a selected pill', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '2010s' }));
    // Text appears in both the decade button and the pill — check there are exactly 2
    expect(screen.getAllByText('2010s')).toHaveLength(2);
  });

  it('clicking a selected decade deselects it', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '90s' }));
    await userEvent.click(screen.getByRole('button', { name: '90s' }));
    // Pill should be gone — text only appears once (in the decade button)
    expect(screen.getAllByText('90s')).toHaveLength(1);
  });

  it('selecting multiple decades shows both as pills', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '80s' }));
    await userEvent.click(screen.getByRole('button', { name: '90s' }));
    // Each appears in its button + its pill = 2 each
    expect(screen.getAllByText('80s')).toHaveLength(2);
    expect(screen.getAllByText('90s')).toHaveLength(2);
  });

  it('removing a theme pill deselects it', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: '2000s' }));
    await userEvent.click(screen.getByText('×'));
    // Pill gone — text only appears once (in the decade button)
    expect(screen.getAllByText('2000s')).toHaveLength(1);
  });

  it('shows artist search results after typing', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    const input = screen.getByPlaceholderText(/search artists/i);
    await userEvent.type(input, 'dra');
    await waitFor(() => {
      expect(screen.getByText('Drake')).toBeInTheDocument();
    });
  });

  it('adds artist theme when a result is clicked', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    const input = screen.getByPlaceholderText(/search artists/i);
    await userEvent.type(input, 'dra');
    await waitFor(() => screen.getByText('Drake'));
    await userEvent.click(screen.getByText('Drake'));
    expect(screen.getByText('Drake')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /play/i })).not.toBeDisabled();
  });

  it('pre-selects initialThemes when provided', () => {
    render(
      <ThemeSelector
        onStart={() => {}}
        initialThemes={[{ type: 'decade', value: '90s' }]}
      />
    );
    // '90s' appears in both the decade button and the pre-selected pill
    expect(screen.getAllByText('90s')).toHaveLength(2);
  });

  it('pre-selects initialLimit when provided', () => {
    render(<ThemeSelector onStart={() => {}} initialLimit={25} />);
    const top25 = screen.getByRole('button', { name: 'Top 25' });
    expect(top25.className).toContain('bg-zinc-900');
  });

  it('calls onStart with session id, preview url, themes, and limit when play is clicked', async () => {
    const onStart = vi.fn();
    render(<ThemeSelector onStart={onStart} />);
    await userEvent.click(screen.getByRole('button', { name: '90s' }));
    await userEvent.click(screen.getByRole('button', { name: /play/i }));
    await waitFor(() => {
      expect(onStart).toHaveBeenCalledWith(
        'abc-123',
        'http://example.com/preview.mp3',
        [{ type: 'decade', value: '90s' }],
        undefined,
      );
    });
  });

  it('disables play button and shows Loading... while request is in-flight', async () => {
    const { startGame } = await import('../api/client');
    // Return a promise that never resolves so the component stays in loading state
    vi.mocked(startGame).mockReturnValueOnce(new Promise(() => {}));

    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /play/i }));

    const btn = screen.getByRole('button', { name: /loading/i });
    expect(btn).toBeDisabled();
  });

  it('shows error message when startGame throws', async () => {
    const { startGame } = await import('../api/client');
    vi.mocked(startGame).mockRejectedValueOnce(new Error('network error'));

    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to start game. Please try again.')).toBeInTheDocument();
    });
  });

  it('shows error message when getClip throws', async () => {
    const { getClip } = await import('../api/client');
    vi.mocked(getClip).mockRejectedValueOnce(new Error('clip error'));

    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: /play/i }));

    await waitFor(() => {
      expect(screen.getByText('Failed to start game. Please try again.')).toBeInTheDocument();
    });
  });

  it('genre dropdown opens on focus and shows results', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await act(async () => {
      screen.getByPlaceholderText(/search genres/i).focus();
    });
    await waitFor(() => {
      expect(screen.getByText('Pop')).toBeInTheDocument();
    });
  });

  it('selecting a genre adds it as a pill', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await act(async () => {
      screen.getByPlaceholderText(/search genres/i).focus();
    });
    await waitFor(() => screen.getByText('Pop'));
    await userEvent.click(screen.getByText('Pop'));
    // The pill appears with the genre name
    expect(screen.getByText('Pop')).toBeInTheDocument();
  });

  it('clicking Top 10 sets it as the active limit', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    await userEvent.click(screen.getByRole('button', { name: 'Top 10' }));
    expect(screen.getByRole('button', { name: 'Top 10' }).className).toContain('bg-zinc-900');
  });

  it('custom limit input sets a numeric limit', async () => {
    render(<ThemeSelector onStart={() => {}} />);
    const customInput = screen.getByPlaceholderText('Custom');
    await userEvent.type(customInput, '15');
    expect((customInput as HTMLInputElement).value).toBe('15');
  });
});
