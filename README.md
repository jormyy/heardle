# Heardle

A music guessing game where players identify songs from progressively longer audio clips. Select a theme — by artist, genre, or decade — then try to name the track in as few attempts as possible.

## How it works

Each round, the game picks a random song from the selected theme pool and plays an increasingly long clip:

| Attempt | Duration |
|---------|----------|
| 1       | 1s       |
| 2       | 2s       |
| 3       | 4s       |
| 4       | 7s       |
| 5       | 11s      |
| 6       | 16s      |

Type-ahead autocomplete lets you search within the current song pool. Guess correctly or exhaust all six attempts to end the round.

Songs are pulled from the Deezer API. Alternate versions (acoustic, live, remix, remastered, etc.) are filtered out, keeping only original releases. An optional Top N filter (10, 25, or 50) limits the pool to the most popular tracks.

## Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS
- **Backend**: Rust (Axum, Tokio), in-memory state with 1-hour song cache
- **Data**: Deezer API
- **Hosting**: Vercel (frontend), Railway (backend)

## Development

### Prerequisites

- Node.js (for frontend)
- Rust toolchain (for backend)

### Frontend

```bash
cd frontend
npm install
npm run dev        # http://localhost:5173
npm run build
npm run test
```

Set `VITE_API_URL` to point at the backend (defaults to `http://localhost:8080`).

### Backend

```bash
cd backend
cargo run          # http://localhost:8080
cargo test
```

| Variable   | Default   | Description        |
|------------|-----------|--------------------|
| `PORT`     | `8080`    | Server listen port |
| `RUST_LOG` | —         | Log level          |

## API

All endpoints are prefixed with `/api`.

**Search**

- `GET /api/search/artists?q=` — artist search
- `GET /api/search/genres?q=` — genre search
- `GET /api/search/decades` — static decade list

**Game**

- `POST /api/game/start` — create session, returns `{session_id, pool_size}`
- `GET /api/game/:id/clip` — get clip URL and allowed duration for current attempt
- `GET /api/game/:id/autocomplete?q=` — search within song pool
- `POST /api/game/:id/guess` — submit guess
- `POST /api/game/:id/skip` — skip current attempt

## Deployment

The backend is containerized via the root `Dockerfile` and deployed to Railway. The frontend deploys to Vercel with the root directory set to `frontend/` in the Vercel dashboard.
