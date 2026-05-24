import { useState } from 'react';
import ThemeSelector from './components/ThemeSelector';
import GameScreen from './components/GameScreen';
import EndScreen from './components/EndScreen';
import type { Song, Theme } from './types';

type Screen =
  | { type: 'select'; savedThemes: Theme[]; savedLimit: number | undefined }
  | { type: 'playing'; sessionId: string; previewUrl: string; startTime: number; themes: Theme[]; limit: number | undefined }
  | { type: 'end'; won: boolean; answer: Song; attempts: number; elapsedMs: number; themes: Theme[]; limit: number | undefined };

export default function App() {
  const [screen, setScreen] = useState<Screen>({ type: 'select', savedThemes: [], savedLimit: undefined });

  function handleStart(sessionId: string, previewUrl: string, themes: Theme[], limit: number | undefined) {
    setScreen({ type: 'playing', sessionId, previewUrl, startTime: Date.now(), themes, limit });
  }

  function handleEnd(won: boolean, answer: Song, attempts: number, elapsedMs: number) {
    if (screen.type !== 'playing') return;
    setScreen({ type: 'end', won, answer, attempts, elapsedMs, themes: screen.themes, limit: screen.limit });
  }

  function handlePlayAgain() {
    if (screen.type !== 'end') return;
    setScreen({ type: 'select', savedThemes: screen.themes, savedLimit: screen.limit });
  }

  if (screen.type === 'playing') {
    return (
      <GameScreen
        sessionId={screen.sessionId}
        previewUrl={screen.previewUrl}
        startTime={screen.startTime}
        onEnd={handleEnd}
      />
    );
  }

  if (screen.type === 'end') {
    return (
      <EndScreen
        won={screen.won}
        answer={screen.answer}
        attempts={screen.attempts}
        elapsedMs={screen.elapsedMs}
        onPlayAgain={handlePlayAgain}
      />
    );
  }

  return <ThemeSelector onStart={handleStart} initialThemes={screen.savedThemes} initialLimit={screen.savedLimit} />;
}
