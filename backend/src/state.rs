use crate::{deezer::DeezerClient, models::{GameSession, Song}};
use chrono::{DateTime, Duration, Utc};
use dashmap::DashMap;
use std::sync::Arc;
use uuid::Uuid;

pub struct CacheEntry {
    pub songs: Vec<Song>,
    pub cached_at: DateTime<Utc>,
}

#[derive(Clone)]
pub struct AppState {
    pub sessions: Arc<DashMap<Uuid, GameSession>>,
    pub song_cache: Arc<DashMap<String, CacheEntry>>,
    pub deezer: Arc<DeezerClient>,
}

impl AppState {
    pub fn new() -> Self {
        Self {
            sessions: Arc::new(DashMap::new()),
            song_cache: Arc::new(DashMap::new()),
            deezer: Arc::new(DeezerClient::new()),
        }
    }

    pub fn get_cached_songs(&self, key: &str) -> Option<Vec<Song>> {
        let entry = self.song_cache.get(key)?;
        if Utc::now() - entry.cached_at < Duration::hours(1) {
            Some(entry.songs.clone())
        } else {
            None
        }
    }

    pub fn set_cached_songs(&self, key: String, songs: Vec<Song>) {
        self.song_cache.insert(key, CacheEntry { songs, cached_at: Utc::now() });
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn make_song(id: &str) -> Song {
        Song {
            id: id.to_string(),
            title: "Test Song".to_string(),
            artist: "Test Artist".to_string(),
            album: "Test Album".to_string(),
            album_art_url: "http://example.com/art.jpg".to_string(),
            preview_url: "http://example.com/preview.mp3".to_string(),
            rank: 0,
        }
    }

    #[test]
    fn test_cache_miss_returns_none() {
        let state = AppState::new();
        assert!(state.get_cached_songs("unknown:key").is_none());
    }

    #[test]
    fn test_cache_hit_returns_songs() {
        let state = AppState::new();
        let songs = vec![make_song("1"), make_song("2")];
        state.set_cached_songs("artist:Drake".to_string(), songs);

        let result = state.get_cached_songs("artist:Drake").unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].id, "1");
        assert_eq!(result[1].id, "2");
    }

    #[test]
    fn test_cache_overwrite() {
        let state = AppState::new();
        state.set_cached_songs("artist:Drake".to_string(), vec![make_song("1")]);
        state.set_cached_songs("artist:Drake".to_string(), vec![make_song("2"), make_song("3")]);

        let result = state.get_cached_songs("artist:Drake").unwrap();
        assert_eq!(result.len(), 2);
        assert_eq!(result[0].id, "2");
    }

    #[test]
    fn test_different_keys_are_independent() {
        let state = AppState::new();
        state.set_cached_songs("artist:Drake".to_string(), vec![make_song("1")]);
        state.set_cached_songs("genre:Pop".to_string(), vec![make_song("2"), make_song("3")]);

        assert_eq!(state.get_cached_songs("artist:Drake").unwrap().len(), 1);
        assert_eq!(state.get_cached_songs("genre:Pop").unwrap().len(), 2);
    }

    #[test]
    fn test_cache_empty_songs_list() {
        let state = AppState::new();
        state.set_cached_songs("key:empty".to_string(), vec![]);
        let result = state.get_cached_songs("key:empty").unwrap();
        assert!(result.is_empty());
    }

    #[test]
    fn test_cache_get_is_idempotent() {
        let state = AppState::new();
        state.set_cached_songs("key".to_string(), vec![make_song("1"), make_song("2")]);

        let first = state.get_cached_songs("key").unwrap();
        let second = state.get_cached_songs("key").unwrap();
        assert_eq!(first.len(), second.len());
        assert_eq!(first[0].id, second[0].id);
        assert_eq!(first[1].id, second[1].id);
    }

    #[test]
    fn test_cache_returns_independent_clone() {
        let state = AppState::new();
        state.set_cached_songs("key".to_string(), vec![make_song("orig")]);

        // Mutating the returned vec should not affect the cache
        let mut retrieved = state.get_cached_songs("key").unwrap();
        retrieved.clear();

        let still_cached = state.get_cached_songs("key").unwrap();
        assert_eq!(still_cached.len(), 1);
        assert_eq!(still_cached[0].id, "orig");
    }
}
