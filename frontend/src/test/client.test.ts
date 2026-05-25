import { vi, describe, it, expect, beforeEach } from 'vitest';

// vi.hoisted ensures these are initialized before the vi.mock factory runs
const { mockGet, mockPost } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
}));

vi.mock('axios', () => ({
  default: {
    create: vi.fn(() => ({ get: mockGet, post: mockPost })),
  },
}));

import {
  searchArtists,
  searchGenres,
  startGame,
  getClip,
  autocomplete,
  submitGuess,
  skipAttempt,
} from '../api/client';

describe('API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('searchArtists', () => {
    it('calls GET /api/search/artists with q param', async () => {
      mockGet.mockResolvedValue({ data: [] });
      await searchArtists('drake');
      expect(mockGet).toHaveBeenCalledWith('/api/search/artists', { params: { q: 'drake' } });
    });

    it('returns the response data', async () => {
      const artists = [{ id: '1', name: 'Drake', picture_url: '' }];
      mockGet.mockResolvedValue({ data: artists });
      expect(await searchArtists('drake')).toEqual(artists);
    });
  });

  describe('searchGenres', () => {
    it('calls GET /api/search/genres with q param', async () => {
      mockGet.mockResolvedValue({ data: [] });
      await searchGenres('pop');
      expect(mockGet).toHaveBeenCalledWith('/api/search/genres', { params: { q: 'pop' } });
    });

    it('calls with empty string for initial load', async () => {
      mockGet.mockResolvedValue({ data: [] });
      await searchGenres('');
      expect(mockGet).toHaveBeenCalledWith('/api/search/genres', { params: { q: '' } });
    });
  });

  describe('startGame', () => {
    it('sends themes and limit when limit is defined', async () => {
      mockPost.mockResolvedValue({ data: { session_id: 'abc', pool_size: 50 } });
      const themes = [{ type: 'decade' as const, value: '90s' }];
      await startGame(themes, 25);
      expect(mockPost).toHaveBeenCalledWith('/api/game/start', { themes, limit: 25 });
    });

    it('omits limit key when limit is undefined', async () => {
      mockPost.mockResolvedValue({ data: { session_id: 'abc', pool_size: 50 } });
      const themes = [{ type: 'decade' as const, value: '90s' }];
      await startGame(themes, undefined);
      expect(mockPost).toHaveBeenCalledWith('/api/game/start', { themes });
    });

    it('returns session_id and pool_size', async () => {
      mockPost.mockResolvedValue({ data: { session_id: 'xyz', pool_size: 42 } });
      const result = await startGame([], undefined);
      expect(result).toEqual({ session_id: 'xyz', pool_size: 42 });
    });
  });

  describe('getClip', () => {
    it('calls GET with session ID in the path', async () => {
      mockGet.mockResolvedValue({ data: { preview_url: 'url', allowed_duration: 1, attempt: 1 } });
      await getClip('session-abc');
      expect(mockGet).toHaveBeenCalledWith('/api/game/session-abc/clip');
    });
  });

  describe('autocomplete', () => {
    it('calls GET with session ID in path and q param', async () => {
      mockGet.mockResolvedValue({ data: [] });
      await autocomplete('session-abc', 'bohemian');
      expect(mockGet).toHaveBeenCalledWith('/api/game/session-abc/autocomplete', {
        params: { q: 'bohemian' },
      });
    });
  });

  describe('submitGuess', () => {
    it('calls POST with session ID in path and song_id in body', async () => {
      mockPost.mockResolvedValue({ data: { correct: false, attempt: 2, game_over: false } });
      await submitGuess('session-abc', 'song-42');
      expect(mockPost).toHaveBeenCalledWith('/api/game/session-abc/guess', {
        song_id: 'song-42',
      });
    });

    it('returns the guess response', async () => {
      const response = { correct: true, attempt: 1, game_over: true };
      mockPost.mockResolvedValue({ data: response });
      expect(await submitGuess('s', '1')).toEqual(response);
    });
  });

  describe('skipAttempt', () => {
    it('calls POST to the skip endpoint', async () => {
      mockPost.mockResolvedValue({ data: { attempt: 2, game_over: false } });
      await skipAttempt('session-abc');
      expect(mockPost).toHaveBeenCalledWith('/api/game/session-abc/skip');
    });
  });
});
