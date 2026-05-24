import axios from 'axios';
import type { Theme, ClipInfo, AutocompleteResult, GuessResponse, SkipResponse } from '../types';

const api = axios.create({
  baseURL: import.meta.env.VITE_API_URL ?? 'http://localhost:8080',
});

export async function searchArtists(q: string) {
  const { data } = await api.get<{ id: string; name: string; picture_url: string }[]>(
    '/api/search/artists',
    { params: { q } }
  );
  return data;
}

export async function searchGenres(q: string) {
  const { data } = await api.get<{ id: string; name: string }[]>('/api/search/genres', {
    params: { q },
  });
  return data;
}

export async function listDecades() {
  const { data } = await api.get<string[]>('/api/search/decades');
  return data;
}

export async function startGame(themes: Theme[], limit?: number) {
  const { data } = await api.post<{ session_id: string; pool_size: number }>('/api/game/start', {
    themes,
    ...(limit !== undefined && { limit }),
  });
  return data;
}

export async function getClip(sessionId: string) {
  const { data } = await api.get<ClipInfo>(`/api/game/${sessionId}/clip`);
  return data;
}

export async function autocomplete(sessionId: string, q: string) {
  const { data } = await api.get<AutocompleteResult[]>(
    `/api/game/${sessionId}/autocomplete`,
    { params: { q } }
  );
  return data;
}

export async function submitGuess(sessionId: string, songId: string) {
  const { data } = await api.post<GuessResponse>(`/api/game/${sessionId}/guess`, {
    song_id: songId,
  });
  return data;
}

export async function skipAttempt(sessionId: string) {
  const { data } = await api.post<SkipResponse>(`/api/game/${sessionId}/skip`);
  return data;
}
