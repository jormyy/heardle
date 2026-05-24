import { useState, useRef, useEffect } from 'react';
import { autocomplete, submitGuess, skipAttempt } from '../api/client';
import type { AutocompleteResult, Song } from '../types';
import { CLIP_DURATIONS } from '../types';

interface Props {
  sessionId: string;
  previewUrl: string;
  onEnd: (won: boolean, answer: Song, attempts: number, elapsedMs: number) => void;
  startTime: number;
}

export default function GameScreen({ sessionId, previewUrl, onEnd, startTime }: Props) {
  const [attempt, setAttempt] = useState(1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState('');
  const [suggestions, setSuggestions] = useState<AutocompleteResult[]>([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [feedback, setFeedback] = useState<'wrong' | null>(null);
  const [guessedIds, setGuessedIds] = useState<Set<string>>(new Set());

  const audioRef = useRef<HTMLAudioElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const allowedDuration = CLIP_DURATIONS[attempt - 1];

  // Close dropdown on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Debounced autocomplete
  useEffect(() => {
    if (!query.trim()) {
      setSuggestions([]);
      setDropdownOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      const results = await autocomplete(sessionId, query).catch(() => []);
      const filtered = results.filter((r) => !guessedIds.has(r.id));
      setSuggestions(filtered);
      setDropdownOpen(filtered.length > 0);
    }, 200);
    return () => clearTimeout(timer);
  }, [query, sessionId]);

  function handlePlay() {
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    audio.currentTime = 0;
    audio.play();
    setIsPlaying(true);
  }

  function handleTimeUpdate() {
    const audio = audioRef.current;
    if (!audio) return;
    const elapsed = audio.currentTime;
    if (elapsed >= allowedDuration) {
      audio.pause();
      audio.currentTime = 0;
      setIsPlaying(false);
      setProgress(0);
    } else {
      setProgress(elapsed / allowedDuration);
    }
  }

  async function handleGuess(result: AutocompleteResult) {
    setDropdownOpen(false);
    setQuery('');
    setSuggestions([]);
    setGuessedIds((prev) => new Set(prev).add(result.id));

    const res = await submitGuess(sessionId, result.id).catch(() => null);
    if (!res) return;

    if (res.correct && res.answer) {
      onEnd(true, res.answer, res.attempt, Date.now() - startTime);
      return;
    }

    if (res.game_over && res.answer) {
      onEnd(false, res.answer, res.attempt, Date.now() - startTime);
      return;
    }

    // Wrong guess — show feedback, advance attempt
    setFeedback('wrong');
    setTimeout(() => setFeedback(null), 800);
    setAttempt(res.attempt);
    setProgress(0);
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  async function handleSkip() {
    const res = await skipAttempt(sessionId).catch(() => null);
    if (!res) return;

    if (res.game_over && res.answer) {
      onEnd(false, res.answer, res.attempt, Date.now() - startTime);
      return;
    }

    setAttempt(res.attempt);
    setProgress(0);
    setIsPlaying(false);
    if (audioRef.current) audioRef.current.currentTime = 0;
  }

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-md space-y-10">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900 dark:text-zinc-50">
            Heardle
          </h1>
        </div>

        {/* Attempt tracker */}
        <div className="flex gap-1.5 justify-center">
          {CLIP_DURATIONS.map((_, i) => {
            const n = i + 1;
            const isPast = n < attempt;
            const isCurrent = n === attempt;
            return (
              <div
                key={n}
                className={`h-1.5 flex-1 rounded-full transition-colors ${
                  isPast
                    ? 'bg-zinc-300 dark:bg-zinc-600'
                    : isCurrent
                    ? 'bg-zinc-900 dark:bg-zinc-50'
                    : 'bg-zinc-100 dark:bg-zinc-800'
                }`}
              />
            );
          })}
        </div>

        {/* Attempt label */}
        <p className="text-center text-xs text-zinc-400 dark:text-zinc-500 -mt-6">
          Attempt {attempt} of 6
        </p>

        {/* Audio player */}
        <div className="space-y-4">
          <audio
            ref={audioRef}
            src={previewUrl}
            onTimeUpdate={handleTimeUpdate}
            onEnded={() => { setIsPlaying(false); setProgress(0); }}
          />

          {/* Progress bar */}
          <div className="w-full h-1 bg-zinc-100 dark:bg-zinc-800 rounded-full overflow-hidden">
            <div
              className="h-full bg-zinc-900 dark:bg-zinc-50 rounded-full transition-none"
              style={{ width: `${progress * 100}%` }}
            />
          </div>

          {/* Play button */}
          <div className="flex justify-center">
            <button
              onClick={handlePlay}
              className="w-14 h-14 rounded-full border-2 border-zinc-900 dark:border-zinc-50 flex items-center justify-center text-zinc-900 dark:text-zinc-50 hover:bg-zinc-900 hover:text-white dark:hover:bg-zinc-50 dark:hover:text-zinc-900 transition-colors"
            >
              {isPlaying ? (
                // Pause icon
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <rect x="6" y="4" width="4" height="16" rx="1" />
                  <rect x="14" y="4" width="4" height="16" rx="1" />
                </svg>
              ) : (
                // Play icon
                <svg className="w-5 h-5 translate-x-0.5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M5 3l14 9-14 9V3z" />
                </svg>
              )}
            </button>
          </div>
        </div>

        {/* Guess input */}
        <div ref={dropdownRef} className="relative">
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={() => suggestions.length > 0 && setDropdownOpen(true)}
            placeholder="Search for a song..."
            className={`w-full px-4 py-3 rounded-lg border text-sm focus:outline-none focus:ring-2 transition-colors
              ${feedback === 'wrong'
                ? 'border-red-400 dark:border-red-500 bg-red-50 dark:bg-red-950/20 focus:ring-red-300'
                : 'border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 focus:ring-zinc-400 dark:focus:ring-zinc-600'
              }
              text-zinc-900 dark:text-zinc-50 placeholder-zinc-400 dark:placeholder-zinc-600`}
          />
          {dropdownOpen && suggestions.length > 0 && (
            <ul className="absolute z-10 w-full mt-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-lg overflow-hidden">
              {suggestions.map((s) => (
                <li key={s.id}>
                  <button
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => handleGuess(s)}
                    className="w-full text-left px-4 py-3 hover:bg-zinc-50 dark:hover:bg-zinc-800"
                  >
                    <p className="text-sm text-zinc-900 dark:text-zinc-50">{s.title}</p>
                    <p className="text-xs text-zinc-400 dark:text-zinc-500 mt-0.5">{s.artist}</p>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        {/* Skip button */}
        <div className="flex justify-center">
          <button
            onClick={handleSkip}
            className="text-sm text-zinc-400 dark:text-zinc-500 hover:text-zinc-600 dark:hover:text-zinc-300 transition-colors"
          >
            Skip →
          </button>
        </div>
      </div>
    </div>
  );
}
