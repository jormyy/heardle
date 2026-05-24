mod deezer;
mod error;
mod models;
mod routes;
mod state;

use axum::{
    routing::{get, post},
    Router,
};
use state::AppState;
use tower_http::cors::{Any, CorsLayer};

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt::init();

    let state = AppState::new();

    let app = Router::new()
        .route("/api/search/artists", get(routes::search::search_artists))
        .route("/api/search/genres", get(routes::search::search_genres))
        .route("/api/search/decades", get(routes::search::list_decades))
        .route("/api/game/start", post(routes::game::start_game))
        .route("/api/game/:id/clip", get(routes::game::get_clip))
        .route("/api/game/:id/autocomplete", get(routes::game::autocomplete))
        .route("/api/game/:id/guess", post(routes::game::submit_guess))
        .route("/api/game/:id/skip", post(routes::game::skip_attempt))
        .layer(
            CorsLayer::new()
                .allow_origin(Any)
                .allow_methods(Any)
                .allow_headers(Any),
        )
        .with_state(state);

    let port = std::env::var("PORT").unwrap_or_else(|_| "8080".to_string());
    let listener = tokio::net::TcpListener::bind(format!("0.0.0.0:{port}")).await.unwrap();
    tracing::info!("listening on {}", listener.local_addr().unwrap());
    axum::serve(listener, app).await.unwrap();
}
