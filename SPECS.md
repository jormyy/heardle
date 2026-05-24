# Heardle Clone — Specs

## Overview
A music guessing game inspired by Heardle. Players listen to progressively longer audio clips of a song and try to identify it in as few attempts as possible. No daily limit — play on demand, as many rounds as you want.

---

## Tech Stack

| Layer | Choice |
|---|---|
| Frontend | React + Vite (TypeScript) |
| Backend | Rust (Axum) — in-memory state |
| Frontend Hosting | Vercel |
| Backend Hosting | Railway |
| Audio | Deezer API |

No database — all state is held in memory on the Rust server.

---

## Themes
Players choose one or more themes before starting a game. The song pool is the **union** of all selected themes (deduped).

### Theme Categories
- **Artist** — songs from a specific artist (searchable)
- **Genre** — songs filtered by genre, e.g. hip-hop, rock, pop (searchable)
- **Decade** — songs from a specific decade, e.g. 90s, 2000s (searchable)

Players can mix and match across categories (e.g. "Drake" + "Hip-Hop" + "2010s"). Duplicate songs across themes are ignored.

Themes are powered by Deezer API filtering.

---

## Gameplay
- On-demand (no daily mode)
- Solo only
- No difficulty settings — one standard mode
- A random song is selected from the combined theme pool
- Players hear progressively longer clips: **1s → 2s → 4s → 7s → 11s → 16s** (6 attempts max)
- Clip duration is enforced client-side via HTML5 audio (no server-side slicing)
- Each wrong guess or skip reveals the next clip
- Game ends on a correct guess or after all 6 attempts

---

## Guessing
- Text input with **real-time autocomplete** that searches within the current theme's song pool only
- Players must select from autocomplete results (no free-text guessing)

---

## Audio Playback
- Deezer API provides free 30-second MP3 preview URLs
- Backend returns the preview URL + allowed duration per attempt
- Client uses HTML5 audio to enforce the clip length
- Simple **progress bar** shown during playback (may be upgraded to waveform visualizer later)

---

## End of Round Screen
Shown after a win or loss:
- Song title + artist
- Album art
- Number of attempts used
- Time taken (win: "You guessed this song in X seconds", loss: "You failed")
- "Play Again" button
- Link to the full song (e.g. Deezer)

---

## No Persistence
- No user accounts
- No score tracking, history, or stats
- No result sharing

---

## Data Models

### Core Structs (Rust)

```rust
Song {
  id: String,           // Deezer ID
  title: String,
  artist: String,
  album: String,
  album_art_url: String,
  preview_url: String,  // 30s Deezer MP3
}

Theme {
  type: "artist" | "genre" | "decade",
  value: String,        // e.g. "Drake", "hip-hop", "2010s"
}

GameSession {
  session_id: UUID,
  song: Song,           // the answer
  song_pool: Vec<Song>, // used for autocomplete
  attempt: u8,          // 1–6
  status: "in_progress" | "won" | "lost",
  started_at: DateTime,
}
```

### In-Memory State

- **Song cache** — Deezer results keyed by theme query, with a TTL to avoid redundant API calls
- **Game sessions** — keyed by session ID (UUID)

### Clip Durations

| Attempt | Allowed Duration |
|---|---|
| 1 | 1s |
| 2 | 2s |
| 3 | 4s |
| 4 | 7s |
| 5 | 11s |
| 6 | 16s |

---

## API Endpoints

```
GET  /api/search/artists?q={}         Search artists on Deezer
GET  /api/search/genres?q={}          Search genres on Deezer
GET  /api/search/decades              Returns static list (60s–2020s)

POST /api/game/start                  Start a new game
     body:    { themes: Theme[] }
     returns: { session_id, pool_size }

GET  /api/game/:id/clip               Get current clip info
     returns: { preview_url, allowed_duration, attempt }

GET  /api/game/:id/autocomplete?q={}  Search songs in pool for guessing
     returns: [{ id, title, artist }]

POST /api/game/:id/guess              Submit a guess
     body:    { song_id: String }
     returns: { correct, attempt, game_over, answer?: Song }

POST /api/game/:id/skip               Skip current attempt
     returns: { attempt, game_over, answer?: Song }
```

---

## UI Flow

1. **Theme Selection** — pick one or more themes across artist/genre/decade categories, hit Play
2. **Game** — play button, progress bar, guess input with autocomplete, skip button, attempt tracker (shows current attempt out of 6)
3. **End Screen** — win/loss result, song title + artist + album art, time taken, Play Again button

---

## Target Audience
Public app, primarily used among friends.
