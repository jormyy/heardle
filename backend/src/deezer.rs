use crate::models::Song;
use anyhow::Result;
use reqwest::Client;
use serde::Deserialize;

// --- Deezer API response types ---

#[derive(Deserialize)]
struct DeezerSearchResponse {
    data: Vec<DeezerTrack>,
}

#[derive(Deserialize)]
struct DeezerTrack {
    id: u64,
    title: String,
    preview: String,
    #[serde(default)]
    rank: u64,
    artist: DeezerArtistShort,
    album: DeezerAlbumShort,
}

#[derive(Deserialize)]
struct DeezerArtistShort {
    name: String,
}

#[derive(Deserialize)]
struct DeezerAlbumShort {
    title: String,
    cover_medium: String,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct DeezerArtistResult {
    pub id: u64,
    pub name: String,
    pub picture_medium: String,
}

use serde::Serialize;

#[derive(Deserialize)]
struct DeezerArtistSearchResponse {
    data: Vec<DeezerArtistResult>,
}

#[derive(Deserialize, Serialize, Clone)]
pub struct DeezerGenre {
    pub id: u64,
    pub name: String,
}

#[derive(Deserialize)]
struct DeezerGenreResponse {
    data: Vec<DeezerGenre>,
}

// --- Client ---

pub struct DeezerClient {
    client: Client,
}

impl DeezerClient {
    pub fn new() -> Self {
        Self { client: Client::new() }
    }

    pub async fn search_artists(&self, query: &str) -> Result<Vec<DeezerArtistResult>> {
        let url = format!(
            "https://api.deezer.com/search/artist?q={}&limit=10",
            urlencoding::encode(query)
        );
        let resp: DeezerArtistSearchResponse = self.client.get(&url).send().await?.json().await?;
        Ok(resp.data)
    }

    pub async fn get_genres(&self) -> Result<Vec<DeezerGenre>> {
        let resp: DeezerGenreResponse = self
            .client
            .get("https://api.deezer.com/genre")
            .send()
            .await?
            .json()
            .await?;
        // filter out the catch-all "All" genre (id=0)
        Ok(resp.data.into_iter().filter(|g| g.id != 0).collect())
    }

    pub async fn get_tracks_by_artist_id(&self, artist_id: u64) -> Result<Vec<Song>> {
        let url = format!(
            "https://api.deezer.com/artist/{}/top?limit=100",
            artist_id
        );
        let resp: DeezerSearchResponse = self.client.get(&url).send().await?.json().await?;
        Ok(resp.data.into_iter().filter_map(track_to_song).collect())
    }

    pub async fn get_tracks_by_genre(&self, genre_id: u64) -> Result<Vec<Song>> {
        let url = format!("https://api.deezer.com/chart/{}/tracks?limit=100", genre_id);
        let resp: DeezerSearchResponse = self.client.get(&url).send().await?.json().await?;
        Ok(resp.data.into_iter().filter_map(track_to_song).collect())
    }

    pub async fn get_general_tracks(&self) -> Result<Vec<Song>> {
        let resp: DeezerSearchResponse = self
            .client
            .get("https://api.deezer.com/search?q=top&order=RANKING&limit=100")
            .send()
            .await?
            .json()
            .await?;
        Ok(resp.data.into_iter().filter_map(track_to_song).collect())
    }

    // Deezer has no native year filter in search, so we query "<decade> hits"
    // which surfaces editorially relevant tracks for that era.
    pub async fn get_tracks_by_decade(&self, decade: &str) -> Result<Vec<Song>> {
        let query = format!("{} hits", decade);
        let url = format!(
            "https://api.deezer.com/search?q={}&limit=100",
            urlencoding::encode(&query)
        );
        let resp: DeezerSearchResponse = self.client.get(&url).send().await?.json().await?;
        Ok(resp.data.into_iter().filter_map(track_to_song).collect())
    }
}

fn track_to_song(track: DeezerTrack) -> Option<Song> {
    if track.preview.is_empty() {
        return None;
    }
    Some(Song {
        id: track.id.to_string(),
        title: track.title,
        artist: track.artist.name,
        album: track.album.title,
        album_art_url: track.album.cover_medium,
        preview_url: track.preview,
        rank: track.rank,
    })
}
