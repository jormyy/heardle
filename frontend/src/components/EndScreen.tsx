import type { Song } from '../types';

interface Props {
  won: boolean;
  answer: Song;
  attempts: number;
  elapsedMs: number;
  onPlayAgain: () => void;
}

export default function EndScreen({ won, answer, attempts, elapsedMs, onPlayAgain }: Props) {
  const seconds = Math.round(elapsedMs / 1000);

  return (
    <div className="min-h-screen bg-white dark:bg-zinc-950 flex flex-col items-center justify-center px-4">
      <div className="w-full max-w-sm text-center space-y-8">
        {/* Result label */}
        <p className="text-xs font-semibold uppercase tracking-widest text-zinc-400 dark:text-zinc-500">
          {won ? 'Nice one' : 'Better luck next time'}
        </p>

        {/* Album art */}
        {answer.album_art_url && (
          <img
            src={answer.album_art_url}
            alt={answer.album}
            className="w-48 h-48 rounded-xl mx-auto object-cover shadow-md"
          />
        )}

        {/* Song info */}
        <div className="space-y-1">
          <h2 className="text-xl font-semibold text-zinc-900 dark:text-zinc-50">{answer.title}</h2>
          <p className="text-zinc-500 dark:text-zinc-400">{answer.artist}</p>
          <p className="text-xs text-zinc-400 dark:text-zinc-600">{answer.album}</p>
        </div>

        {/* Stats */}
        <p className="text-sm text-zinc-500 dark:text-zinc-400">
          {won
            ? `Guessed in ${attempts} ${attempts === 1 ? 'attempt' : 'attempts'} · ${seconds}s`
            : `The song was not guessed after 6 attempts`}
        </p>

        {/* Actions */}
        <div className="flex flex-col gap-3">
          <button
            onClick={onPlayAgain}
            className="w-full py-3 rounded-lg bg-zinc-900 dark:bg-zinc-50 text-zinc-50 dark:text-zinc-900 text-sm font-medium hover:opacity-90 transition-opacity"
          >
            Play Again
          </button>
          <a
            href={`https://www.deezer.com/search/${encodeURIComponent(`${answer.title} ${answer.artist}`)}`}
            target="_blank"
            rel="noopener noreferrer"
            className="w-full py-3 rounded-lg border border-zinc-200 dark:border-zinc-800 text-zinc-700 dark:text-zinc-300 text-sm hover:bg-zinc-50 dark:hover:bg-zinc-900 transition-colors"
          >
            Listen on Deezer ↗
          </a>
        </div>
      </div>
    </div>
  );
}
