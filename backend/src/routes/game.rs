use axum::{
    extract::{Path, Query, State},
    Json,
};
use chrono::Utc;
use rand::seq::SliceRandom;
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    error::AppError,
    models::{deduplicate_versions, is_version_track, top_n_by_popularity, GameSession, GameStatus, Song, Theme, ThemeType, CLIP_DURATIONS},
    state::AppState,
};

// --- Request/response types ---

#[derive(Deserialize)]
pub struct StartGameRequest {
    pub themes: Vec<Theme>,
    /// If set, pool is trimmed to the top N songs by popularity before a song is picked.
    pub limit: Option<usize>,
}

#[derive(Serialize)]
pub struct StartGameResponse {
    pub session_id: Uuid,
    pub pool_size: usize,
}

#[derive(Serialize)]
pub struct ClipResponse {
    pub preview_url: String,
    pub allowed_duration: f32,
    pub attempt: u8,
}

#[derive(Deserialize)]
pub struct AutocompleteQuery {
    pub q: Option<String>,
}

#[derive(Serialize)]
pub struct AutocompleteResult {
    pub id: String,
    pub title: String,
    pub artist: String,
}

#[derive(Deserialize)]
pub struct GuessRequest {
    pub song_id: String,
}

#[derive(Serialize)]
pub struct GuessResponse {
    pub correct: bool,
    pub attempt: u8,
    pub game_over: bool,
    pub answer: Option<Song>,
}

#[derive(Serialize)]
pub struct SkipResponse {
    pub attempt: u8,
    pub game_over: bool,
    pub answer: Option<Song>,
}

// --- Handlers ---

pub async fn start_game(
    State(state): State<AppState>,
    Json(body): Json<StartGameRequest>,
) -> Result<Json<StartGameResponse>, AppError> {
    // No themes = general mode
    let themes = if body.themes.is_empty() {
        vec![Theme { theme_type: ThemeType::General, value: String::new() }]
    } else {
        body.themes
    };

    let mut pool: Vec<Song> = vec![];
    let mut seen_ids = std::collections::HashSet::new();

    for theme in &themes {
        let cache_key = theme_cache_key(theme);
        let songs = match state.get_cached_songs(&cache_key) {
            Some(cached) => cached,
            None => {
                let fetched = fetch_songs_for_theme(&state, theme).await?;
                state.set_cached_songs(cache_key, fetched.clone());
                fetched
            }
        };
        for song in songs {
            if seen_ids.insert(song.id.clone()) {
                pool.push(song);
            }
        }
    }

    if pool.is_empty() {
        return Err(AppError::BadRequest("no songs found for the selected themes".into()));
    }

    let pool: Vec<Song> = pool.into_iter().filter(|s| !is_version_track(&s.title)).collect();
    let pool = deduplicate_versions(pool);

    let pool = if let Some(n) = body.limit {
        top_n_by_popularity(pool, n)
    } else {
        pool
    };

    let song = pool
        .choose(&mut rand::thread_rng())
        .cloned()
        .unwrap();

    let session = GameSession {
        session_id: Uuid::new_v4(),
        song,
        song_pool: pool,
        attempt: 1,
        status: GameStatus::InProgress,
        started_at: Utc::now(),
    };

    let session_id = session.session_id;
    let pool_size = session.song_pool.len();
    state.sessions.insert(session_id, session);

    Ok(Json(StartGameResponse { session_id, pool_size }))
}

pub async fn get_clip(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
) -> Result<Json<ClipResponse>, AppError> {
    let session = state
        .sessions
        .get(&session_id)
        .ok_or_else(|| AppError::NotFound("session not found".into()))?;

    if session.status != GameStatus::InProgress {
        return Err(AppError::BadRequest("game is already over".into()));
    }

    let attempt = session.attempt as usize;
    let allowed_duration = CLIP_DURATIONS[attempt - 1];

    Ok(Json(ClipResponse {
        preview_url: session.song.preview_url.clone(),
        allowed_duration,
        attempt: session.attempt,
    }))
}

pub async fn autocomplete(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Query(params): Query<AutocompleteQuery>,
) -> Result<Json<Vec<AutocompleteResult>>, AppError> {
    let q = params.q.unwrap_or_default().to_lowercase();
    let session = state
        .sessions
        .get(&session_id)
        .ok_or_else(|| AppError::NotFound("session not found".into()))?;

    let results = session
        .song_pool
        .iter()
        .filter(|s| {
            q.is_empty()
                || s.title.to_lowercase().contains(&q)
                || s.artist.to_lowercase().contains(&q)
        })
        .take(10)
        .map(|s| AutocompleteResult {
            id: s.id.clone(),
            title: s.title.clone(),
            artist: s.artist.clone(),
        })
        .collect();

    Ok(Json(results))
}

pub async fn submit_guess(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
    Json(body): Json<GuessRequest>,
) -> Result<Json<GuessResponse>, AppError> {
    let mut session = state
        .sessions
        .get_mut(&session_id)
        .ok_or_else(|| AppError::NotFound("session not found".into()))?;

    if session.status != GameStatus::InProgress {
        return Err(AppError::BadRequest("game is already over".into()));
    }

    let correct = session.song.id == body.song_id;

    if correct {
        session.status = GameStatus::Won;
        let answer = session.song.clone();
        return Ok(Json(GuessResponse {
            correct: true,
            attempt: session.attempt,
            game_over: true,
            answer: Some(answer),
        }));
    }

    session.attempt += 1;
    let game_over = session.attempt > 6;

    if game_over {
        session.status = GameStatus::Lost;
        let answer = session.song.clone();
        return Ok(Json(GuessResponse {
            correct: false,
            attempt: session.attempt - 1,
            game_over: true,
            answer: Some(answer),
        }));
    }

    Ok(Json(GuessResponse {
        correct: false,
        attempt: session.attempt,
        game_over: false,
        answer: None,
    }))
}

pub async fn skip_attempt(
    State(state): State<AppState>,
    Path(session_id): Path<Uuid>,
) -> Result<Json<SkipResponse>, AppError> {
    let mut session = state
        .sessions
        .get_mut(&session_id)
        .ok_or_else(|| AppError::NotFound("session not found".into()))?;

    if session.status != GameStatus::InProgress {
        return Err(AppError::BadRequest("game is already over".into()));
    }

    session.attempt += 1;
    let game_over = session.attempt > 6;

    if game_over {
        session.status = GameStatus::Lost;
        let answer = session.song.clone();
        return Ok(Json(SkipResponse {
            attempt: session.attempt - 1,
            game_over: true,
            answer: Some(answer),
        }));
    }

    Ok(Json(SkipResponse {
        attempt: session.attempt,
        game_over: false,
        answer: None,
    }))
}

// --- Helpers ---

fn theme_cache_key(theme: &Theme) -> String {
    match theme.theme_type {
        ThemeType::General => "general".to_string(),
        ThemeType::Artist => format!("artist:{}", theme.value),
        ThemeType::Genre => format!("genre:{}", theme.value),
        ThemeType::Decade => format!("decade:{}", theme.value),
    }
}

async fn fetch_songs_for_theme(state: &AppState, theme: &Theme) -> Result<Vec<Song>, AppError> {
    match theme.theme_type {
        ThemeType::General => Ok(state.deezer.get_general_tracks().await?),
        ThemeType::Artist => {
            let artist_id: u64 = theme
                .value
                .parse()
                .map_err(|_| AppError::BadRequest("invalid artist id".into()))?;
            Ok(state.deezer.get_tracks_by_artist_id(artist_id).await?)
        }
        ThemeType::Genre => {
            // theme.value is the genre id
            let genre_id: u64 = theme
                .value
                .parse()
                .map_err(|_| AppError::BadRequest("invalid genre id".into()))?;
            Ok(state.deezer.get_tracks_by_genre(genre_id).await?)
        }
        ThemeType::Decade => Ok(state.deezer.get_tracks_by_decade(&theme.value).await?),
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use axum::{
        body::Body,
        http::{Request, StatusCode},
        routing::{get, post},
        Router,
    };
    use chrono::Utc;
    use http_body_util::BodyExt;
    use serde_json::{json, Value};
    use tower::ServiceExt;

    fn make_song(id: &str, title: &str, artist: &str) -> Song {
        Song {
            id: id.to_string(),
            title: title.to_string(),
            artist: artist.to_string(),
            album: "Test Album".to_string(),
            album_art_url: "http://example.com/art.jpg".to_string(),
            preview_url: "http://example.com/preview.mp3".to_string(),
            rank: 0,
        }
    }

    fn insert_session(
        state: &AppState,
        song: Song,
        pool: Vec<Song>,
        attempt: u8,
        status: GameStatus,
    ) -> Uuid {
        let id = Uuid::new_v4();
        state.sessions.insert(
            id,
            GameSession {
                session_id: id,
                song,
                song_pool: pool,
                attempt,
                status,
                started_at: Utc::now(),
            },
        );
        id
    }

    fn test_app(state: AppState) -> Router {
        Router::new()
            .route("/api/game/start", post(start_game))
            .route("/api/game/:id/clip", get(get_clip))
            .route("/api/game/:id/autocomplete", get(autocomplete))
            .route("/api/game/:id/guess", post(submit_guess))
            .route("/api/game/:id/skip", post(skip_attempt))
            .with_state(state)
    }

    async fn body_json(body: Body) -> Value {
        let bytes = body.collect().await.unwrap().to_bytes();
        serde_json::from_slice(&bytes).unwrap()
    }

    // --- start_game ---

    #[tokio::test]
    async fn test_start_game_success() {
        let state = AppState::new();
        state.set_cached_songs(
            "artist:TestArtist".to_string(),
            vec![
                make_song("1", "Song One", "TestArtist"),
                make_song("2", "Song Two", "TestArtist"),
            ],
        );

        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/game/start")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"themes": [{"type": "artist", "value": "TestArtist"}]}).to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert!(json["session_id"].is_string());
        assert_eq!(json["pool_size"], 2);
    }

    #[tokio::test]
    async fn test_start_game_empty_themes_uses_general() {
        let state = AppState::new();
        // Pre-populate the general cache so Deezer isn't called
        state.set_cached_songs("general".to_string(), vec![
            make_song("1", "Chart Hit", "Popular Artist"),
            make_song("2", "Another Hit", "Famous Artist"),
        ]);

        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/game/start")
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"themes": []}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["pool_size"], 2);
    }

    #[tokio::test]
    async fn test_start_game_deduplicates_overlapping_songs() {
        let state = AppState::new();
        // song "1" appears in both theme pools
        state.set_cached_songs(
            "artist:ArtistA".to_string(),
            vec![make_song("1", "Shared", "A"), make_song("2", "Only A", "A")],
        );
        state.set_cached_songs(
            "artist:ArtistB".to_string(),
            vec![make_song("1", "Shared", "A"), make_song("3", "Only B", "B")],
        );

        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri("/api/game/start")
                    .header("content-type", "application/json")
                    .body(Body::from(
                        json!({"themes": [
                            {"type": "artist", "value": "ArtistA"},
                            {"type": "artist", "value": "ArtistB"}
                        ]})
                        .to_string(),
                    ))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["pool_size"], 3); // 1, 2, 3 — not 4
    }

    // --- get_clip ---

    #[tokio::test]
    async fn test_get_clip_correct_durations() {
        let expected = [1.0, 2.0, 4.0, 7.0, 11.0, 16.0];
        for (i, &duration) in expected.iter().enumerate() {
            let state = AppState::new();
            let song = make_song("1", "Song", "Artist");
            let attempt = (i + 1) as u8;
            let id = insert_session(&state, song.clone(), vec![song], attempt, GameStatus::InProgress);

            let json = body_json(
                test_app(state)
                    .oneshot(
                        Request::builder()
                            .uri(format!("/api/game/{}/clip", id))
                            .body(Body::empty())
                            .unwrap(),
                    )
                    .await
                    .unwrap()
                    .into_body(),
            )
            .await;

            assert_eq!(json["allowed_duration"], duration, "attempt {attempt}");
            assert_eq!(json["attempt"], attempt);
        }
    }

    #[tokio::test]
    async fn test_get_clip_unknown_session_returns_404() {
        let state = AppState::new();
        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/api/game/{}/clip", Uuid::new_v4()))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::NOT_FOUND);
    }

    #[tokio::test]
    async fn test_get_clip_finished_game_returns_400() {
        let state = AppState::new();
        let song = make_song("1", "Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 1, GameStatus::Won);

        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .uri(format!("/api/game/{}/clip", id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    // --- autocomplete ---

    #[tokio::test]
    async fn test_autocomplete_filters_by_title() {
        let state = AppState::new();
        let song = make_song("1", "Bohemian Rhapsody", "Queen");
        let pool = vec![
            make_song("1", "Bohemian Rhapsody", "Queen"),
            make_song("2", "Bohemian Like You", "Dandy Warhols"),
            make_song("3", "Stairway to Heaven", "Led Zeppelin"),
        ];
        let id = insert_session(&state, song, pool, 1, GameStatus::InProgress);

        let json = body_json(
            test_app(state)
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/game/{}/autocomplete?q=bohemian", id))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
                .into_body(),
        )
        .await;

        assert_eq!(json.as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_autocomplete_filters_by_artist() {
        let state = AppState::new();
        let song = make_song("1", "Bohemian Rhapsody", "Queen");
        let pool = vec![
            make_song("1", "Bohemian Rhapsody", "Queen"),
            make_song("2", "We Will Rock You", "Queen"),
            make_song("3", "Stairway to Heaven", "Led Zeppelin"),
        ];
        let id = insert_session(&state, song, pool, 1, GameStatus::InProgress);

        let json = body_json(
            test_app(state)
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/game/{}/autocomplete?q=queen", id))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
                .into_body(),
        )
        .await;

        assert_eq!(json.as_array().unwrap().len(), 2);
    }

    #[tokio::test]
    async fn test_autocomplete_empty_query_returns_all() {
        let state = AppState::new();
        let song = make_song("1", "Song", "Artist");
        let pool = vec![
            make_song("1", "Song One", "Artist A"),
            make_song("2", "Song Two", "Artist B"),
            make_song("3", "Song Three", "Artist C"),
        ];
        let id = insert_session(&state, song, pool, 1, GameStatus::InProgress);

        let json = body_json(
            test_app(state)
                .oneshot(
                    Request::builder()
                        .uri(format!("/api/game/{}/autocomplete", id))
                        .body(Body::empty())
                        .unwrap(),
                )
                .await
                .unwrap()
                .into_body(),
        )
        .await;

        assert_eq!(json.as_array().unwrap().len(), 3);
    }

    // --- submit_guess ---

    #[tokio::test]
    async fn test_submit_correct_guess_wins() {
        let state = AppState::new();
        let song = make_song("42", "Correct Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 1, GameStatus::InProgress);

        let response = test_app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/guess", id))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"song_id": "42"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["correct"], true);
        assert_eq!(json["game_over"], true);
        assert!(json["answer"].is_object());
        assert_eq!(state.sessions.get(&id).unwrap().status, GameStatus::Won);
    }

    #[tokio::test]
    async fn test_submit_wrong_guess_increments_attempt() {
        let state = AppState::new();
        let song = make_song("42", "Correct Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 1, GameStatus::InProgress);

        let response = test_app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/guess", id))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"song_id": "99"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["correct"], false);
        assert_eq!(json["game_over"], false);
        assert_eq!(json["attempt"], 2);
        assert!(json["answer"].is_null());
        assert_eq!(state.sessions.get(&id).unwrap().attempt, 2);
    }

    #[tokio::test]
    async fn test_sixth_wrong_guess_loses() {
        let state = AppState::new();
        let song = make_song("42", "Correct Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 6, GameStatus::InProgress);

        let response = test_app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/guess", id))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"song_id": "99"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["correct"], false);
        assert_eq!(json["game_over"], true);
        assert!(json["answer"].is_object());
        assert_eq!(state.sessions.get(&id).unwrap().status, GameStatus::Lost);
    }

    #[tokio::test]
    async fn test_guess_on_finished_game_returns_400() {
        let state = AppState::new();
        let song = make_song("42", "Correct Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 1, GameStatus::Won);

        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/guess", id))
                    .header("content-type", "application/json")
                    .body(Body::from(json!({"song_id": "42"}).to_string()))
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }

    // --- skip_attempt ---

    #[tokio::test]
    async fn test_skip_increments_attempt() {
        let state = AppState::new();
        let song = make_song("1", "Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 1, GameStatus::InProgress);

        let response = test_app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/skip", id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["attempt"], 2);
        assert_eq!(json["game_over"], false);
        assert!(json["answer"].is_null());
        assert_eq!(state.sessions.get(&id).unwrap().attempt, 2);
    }

    #[tokio::test]
    async fn test_sixth_skip_loses() {
        let state = AppState::new();
        let song = make_song("1", "Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 6, GameStatus::InProgress);

        let response = test_app(state.clone())
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/skip", id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::OK);
        let json = body_json(response.into_body()).await;
        assert_eq!(json["game_over"], true);
        assert!(json["answer"].is_object());
        assert_eq!(state.sessions.get(&id).unwrap().status, GameStatus::Lost);
    }

    #[tokio::test]
    async fn test_skip_on_finished_game_returns_400() {
        let state = AppState::new();
        let song = make_song("1", "Song", "Artist");
        let id = insert_session(&state, song.clone(), vec![song], 1, GameStatus::Lost);

        let response = test_app(state)
            .oneshot(
                Request::builder()
                    .method("POST")
                    .uri(format!("/api/game/{}/skip", id))
                    .body(Body::empty())
                    .unwrap(),
            )
            .await
            .unwrap();

        assert_eq!(response.status(), StatusCode::BAD_REQUEST);
    }
}
