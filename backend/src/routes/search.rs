use axum::{extract::{Query, State}, Json};
use serde::{Deserialize, Serialize};

use crate::{error::AppError, state::AppState};

#[derive(Deserialize)]
pub struct SearchQuery {
    pub q: Option<String>,
}

#[derive(Serialize)]
pub struct ArtistResult {
    pub id: String,
    pub name: String,
    pub picture_url: String,
}

#[derive(Serialize)]
pub struct GenreResult {
    pub id: String,
    pub name: String,
}

pub async fn search_artists(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<ArtistResult>>, AppError> {
    let q = params.q.unwrap_or_default();
    if q.trim().is_empty() {
        return Ok(Json(vec![]));
    }
    let results = state.deezer.search_artists(&q).await?;
    Ok(Json(
        results
            .into_iter()
            .map(|a| ArtistResult {
                id: a.id.to_string(),
                name: a.name,
                picture_url: a.picture_medium,
            })
            .collect(),
    ))
}

pub async fn search_genres(
    State(state): State<AppState>,
    Query(params): Query<SearchQuery>,
) -> Result<Json<Vec<GenreResult>>, AppError> {
    let q = params.q.unwrap_or_default().to_lowercase();
    let all_genres = state.deezer.get_genres().await?;
    let filtered = all_genres
        .into_iter()
        .filter(|g| q.is_empty() || g.name.to_lowercase().contains(&q))
        .map(|g| GenreResult { id: g.id.to_string(), name: g.name })
        .collect();
    Ok(Json(filtered))
}

pub async fn list_decades() -> Json<Vec<&'static str>> {
    Json(vec!["60s", "70s", "80s", "90s", "2000s", "2010s", "2020s"])
}
