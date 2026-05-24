import { useState, useEffect, useRef } from 'react';
import { searchArtists, searchGenres, startGame, getClip } from '../api/client';
import type { Theme } from '../types';

interface Props {
  onStart: (sessionId: string, previewUrl: string, themes: Theme[], limit: number | undefined) => void;
  initialThemes?: Theme[];
  initialLimit?: number | undefined;
}

const DECADES = ['60s', '70s', '80s', '90s', '2000s', '2010s', '2020s'];
const LIMIT_OPTIONS = [
  { label: 'All songs', value: undefined },
  { label: 'Top 10', value: 10 },
  { label: 'Top 25', value: 25 },
  { label: 'Top 50', value: 50 },
];

export default function ThemeSelector({ onStart, initialThemes = [], initialLimit = undefined }: Props) {
  const [selectedThemes, setSelectedThemes] = useState<Theme[]>(initialThemes);
  const [limit, setLimit] = useState<number | undefined>(initialLimit);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Artist search
  const [artistQuery, setArtistQuery] = useState('');
  const [artistResults, setArtistResults] = useState<{ id: string; name: string; picture_url: string }[]>([]);
  const [artistOpen, setArtistOpen] = useState(false);
  const artistRef = useRef<HTMLDivElement>(null);

  // Genre search
  const [genreQuery, setGenreQuery] = useState('');
  const [genreResults, setGenreResults] = useState<{ id: string; name: string }[]>([]);
  const [genreOpen, setGenreOpen] = useState(false);
  const genreRef = useRef<HTMLDivElement>(null);

  // Load initial genres
  useEffect(() => {
    searchGenres('').then(setGenreResults).catch(() => {});
  }, []);

  // Debounced artist search
  useEffect(() => {
    if (!artistQuery.trim()) {
      setArtistResults([]);
      setArtistOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await searchArtists(artistQuery).catch(() => []);
      setArtistResults(results);
      setArtistOpen(results.length > 0);
    }, 300);
    return () => clearTimeout(timer);
  }, [artistQuery]);

  // Debounced genre search
  useEffect(() => {
    const timer = setTimeout(async () => {
      const results = await searchGenres(genreQuery).catch(() => []);
      setGenreResults(results);
    }, 200);
    return () => clearTimeout(timer);
  }, [genreQuery]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (artistRef.current && !artistRef.current.contains(e.target as Node)) {
        setArtistOpen(false);
      }
      if (genreRef.current && !genreRef.current.contains(e.target as Node)) {
        setGenreOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  function addTheme(theme: Theme) {
    const exists = selectedThemes.some(
      (t) => t.type === theme.type && t.value === theme.value
    );
    if (!exists) setSelectedThemes((prev) => [...prev, theme]);
  }

  function removeTheme(theme: Theme) {
    setSelectedThemes((prev) =>
      prev.filter((t) => !(t.type === theme.type && t.value === theme.value))
    );
  }

  function isSelected(theme: Theme) {
    return selectedThemes.some((t) => t.type === theme.type && t.value === theme.value);
  }

  async function handlePlay() {
    setLoading(true);
    setError('');
    try {
      const { session_id } = await startGame(selectedThemes, limit);
      const clip = await getClip(session_id);
      onStart(session_id, clip.preview_url, selectedThemes, limit);
    } catch {
      setError('Failed to start game. Please try again.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-2xl">
        <h1 className="text-4xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50 mb-2">
          Heardle
        </h1>
        <p className="text-zinc-500 dark:text-zinc-400 mb-10">
          Pick one or more themes to build your song pool, then play.
        </p>

        <div className="space-y-8">
          {/* Artist */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Artist
            </h2>
            <div ref={artistRef} className="relative">
              <input
                type="text"
                value={artistQuery}
                onChange={(e) => setArtistQuery(e.target.value)}
                onFocus={() => artistResults.length > 0 && setArtistOpen(true)}
                placeholder="Search artists..."
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              />
              {artistOpen && (
                <ul className="absolute z-10 w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
                  {artistResults.map((a) => (
                    <li key={a.id}>
                      <button
                        onClick={() => {
                          addTheme({ type: 'artist', value: a.id, label: a.name });
                          setArtistQuery('');
                          setArtistOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center gap-3"
                      >
                        {a.picture_url && (
                          <img
                            src={a.picture_url}
                            alt={a.name}
                            className="w-8 h-8 rounded-full object-cover flex-shrink-0"
                          />
                        )}
                        <span className="flex-1">{a.name}</span>
                        {isSelected({ type: 'artist', value: a.name }) && (
                          <span className="text-xs text-zinc-400">added</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Genre */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Genre
            </h2>
            <div ref={genreRef} className="relative">
              <input
                type="text"
                value={genreQuery}
                onChange={(e) => {
                  setGenreQuery(e.target.value);
                  setGenreOpen(true);
                }}
                onFocus={() => setGenreOpen(true)}
                placeholder="Search genres..."
                className="w-full px-4 py-2.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-600 text-sm focus:outline-none focus:ring-2 focus:ring-zinc-400 dark:focus:ring-zinc-600"
              />
              {genreOpen && genreResults.length > 0 && (
                <ul className="absolute z-10 w-full mt-1 max-h-52 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg">
                  {genreResults.map((g) => (
                    <li key={g.id}>
                      <button
                        onClick={() => {
                          addTheme({ type: 'genre', value: g.id, label: g.name });
                          setGenreQuery('');
                          setGenreOpen(false);
                        }}
                        className="w-full text-left px-4 py-2.5 text-sm text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 dark:hover:bg-zinc-800 flex items-center justify-between"
                      >
                        {g.name}
                        {isSelected({ type: 'genre', value: g.id }) && (
                          <span className="text-xs text-zinc-400">added</span>
                        )}
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </section>

          {/* Decade */}
          <section>
            <h2 className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500 mb-3">
              Decade
            </h2>
            <div className="flex flex-wrap gap-2">
              {DECADES.map((d) => {
                const selected = isSelected({ type: 'decade', value: d });
                return (
                  <button
                    key={d}
                    onClick={() =>
                      selected
                        ? removeTheme({ type: 'decade', value: d })
                        : addTheme({ type: 'decade', value: d })
                    }
                    className={`px-4 py-1.5 rounded-full text-sm border transition-colors ${
                      selected
                        ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 border-transparent'
                        : 'bg-transparent text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </section>

          {/* Selected themes */}
          {selectedThemes.length > 0 && (
            <div className="flex flex-wrap gap-2 pt-2">
              {selectedThemes.map((t) => (
                <span
                  key={`${t.type}:${t.value}`}
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300"
                >
                  <span className="text-zinc-400 dark:text-zinc-500 capitalize">{t.type}</span>
                  {t.label ?? t.value}
                  <button
                    onClick={() => removeTheme(t)}
                    className="ml-0.5 text-zinc-400 hover:text-zinc-600 dark:hover:text-zinc-200"
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}

          {/* Popularity filter */}
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-xs text-zinc-400 dark:text-zinc-500">Pool size</span>
            <div className="flex flex-wrap gap-1.5">
              {LIMIT_OPTIONS.map((opt) => (
                <button
                  key={String(opt.value)}
                  onClick={() => setLimit(opt.value)}
                  className={`px-3 py-1 rounded-full text-xs border transition-colors ${
                    limit === opt.value
                      ? 'bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 border-transparent'
                      : 'text-zinc-500 dark:text-zinc-400 border-zinc-200 dark:border-zinc-700 hover:border-zinc-400 dark:hover:border-zinc-500'
                  }`}
                >
                  {opt.label}
                </button>
              ))}
              <input
                type="number"
                min={1}
                placeholder="Custom"
                value={limit !== undefined && !LIMIT_OPTIONS.some(o => o.value === limit) ? limit : ''}
                onChange={(e) => {
                  const n = parseInt(e.target.value, 10);
                  setLimit(isNaN(n) || n < 1 ? undefined : n);
                }}
                className="w-20 px-2 py-1 rounded-full text-xs border border-zinc-200 dark:border-zinc-700 bg-transparent text-zinc-700 dark:text-zinc-300 placeholder-zinc-400 dark:placeholder-zinc-600 focus:outline-none focus:border-zinc-400 dark:focus:border-zinc-500 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              />
            </div>
          </div>

          {error && <p className="text-sm text-red-500">{error}</p>}

          <button
            onClick={handlePlay}
            disabled={loading}
            className="w-full py-3 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-sm font-medium disabled:opacity-30 disabled:cursor-not-allowed hover:opacity-90 transition-opacity"
          >
            {loading ? 'Loading...' : 'Play'}
          </button>
        </div>
      </div>
    </div>
  );
}
