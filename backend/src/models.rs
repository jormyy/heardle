use chrono::{DateTime, Utc};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Song {
    pub id: String,
    pub title: String,
    pub artist: String,
    pub album: String,
    pub album_art_url: String,
    pub preview_url: String,
    pub rank: u64,
}

pub fn top_n_by_popularity(mut songs: Vec<Song>, n: usize) -> Vec<Song> {
    songs.sort_unstable_by(|a, b| b.rank.cmp(&a.rank));
    songs.truncate(n);
    songs
}

/// Returns true if the title is a non-original version (acoustic, live, remix, etc.).
/// Matches any parenthetical containing a version keyword anywhere inside it,
/// except `(Original Mix)` which is kept as the canonical EDM release.
pub fn is_version_track(title: &str) -> bool {
    use std::sync::OnceLock;
    static RE_VERSION: OnceLock<regex::Regex> = OnceLock::new();
    static RE_ORIGINAL_MIX: OnceLock<regex::Regex> = OnceLock::new();
    let re_version = RE_VERSION.get_or_init(|| {
        regex::Regex::new(
            r"(?i)[\(\[][^\)\]]*\b(acoustic|live|remix|remaster(?:ed)?|radio\s*edit|extended|instrumental|demo|edit|mix)\b[^\)\]]*[\)\]]",
        )
        .unwrap()
    });
    let re_original_mix = RE_ORIGINAL_MIX.get_or_init(|| {
        regex::Regex::new(r"(?i)\(original\s+mix\)").unwrap()
    });
    re_version.is_match(title) && !re_original_mix.is_match(title)
}

/// Strips version markers from a title and lowercases it for grouping.
/// e.g. "Hotline Bling (Acoustic Version)" -> "hotline bling"
fn normalize_title(title: &str) -> String {
    use std::sync::OnceLock;
    static RE: OnceLock<regex::Regex> = OnceLock::new();
    let re = RE.get_or_init(|| {
        regex::Regex::new(
            r"(?i)\s*[\(\[](acoustic|live|remix|remaster(?:ed)?|radio\s*edit|extended|instrumental|demo|original\s*mix|version|edit|mix|feat\.?|ft\.?|\d{4})[^\)\]]*[\)\]]",
        )
        .unwrap()
    });
    re.replace_all(title, "").trim().to_lowercase()
}

/// Keeps only the most popular version of each unique (title, artist) pair.
pub fn deduplicate_versions(songs: Vec<Song>) -> Vec<Song> {
    use std::collections::HashMap;
    let mut best: HashMap<(String, String), Song> = HashMap::new();
    for song in songs {
        let key = (normalize_title(&song.title), song.artist.to_lowercase());
        let entry = best.entry(key).or_insert_with(|| song.clone());
        if song.rank > entry.rank {
            *entry = song;
        }
    }
    best.into_values().collect()
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ThemeType {
    General,
    Artist,
    Genre,
    Decade,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Theme {
    #[serde(rename = "type")]
    pub theme_type: ThemeType,
    pub value: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum GameStatus {
    InProgress,
    Won,
    Lost,
}

#[derive(Debug, Clone)]
pub struct GameSession {
    pub session_id: Uuid,
    pub song: Song,
    pub song_pool: Vec<Song>,
    pub attempt: u8,
    pub status: GameStatus,
    pub started_at: DateTime<Utc>,
}

pub const CLIP_DURATIONS: [f32; 6] = [1.0, 2.0, 4.0, 7.0, 11.0, 16.0];

#[cfg(test)]
mod tests {
    use super::*;

    fn make_song(id: &str, rank: u64) -> Song {
        Song {
            id: id.to_string(),
            title: format!("Song {id}"),
            artist: "Artist".to_string(),
            album: "Album".to_string(),
            album_art_url: String::new(),
            preview_url: String::new(),
            rank,
        }
    }

    #[test]
    fn test_top_n_returns_highest_ranked() {
        let songs = vec![
            make_song("a", 100),
            make_song("b", 500),
            make_song("c", 300),
            make_song("d", 800),
            make_song("e", 200),
        ];
        let top = top_n_by_popularity(songs, 3);
        assert_eq!(top.len(), 3);
        assert_eq!(top[0].id, "d"); // rank 800
        assert_eq!(top[1].id, "b"); // rank 500
        assert_eq!(top[2].id, "c"); // rank 300
    }

    #[test]
    fn test_top_n_larger_than_pool_returns_all() {
        let songs = vec![make_song("a", 100), make_song("b", 200)];
        let top = top_n_by_popularity(songs, 10);
        assert_eq!(top.len(), 2);
    }

    #[test]
    fn test_top_n_zero_returns_empty() {
        let songs = vec![make_song("a", 100), make_song("b", 200)];
        let top = top_n_by_popularity(songs, 0);
        assert!(top.is_empty());
    }

    #[test]
    fn test_top_n_empty_input_returns_empty() {
        let top = top_n_by_popularity(vec![], 5);
        assert!(top.is_empty());
    }

    #[test]
    fn test_is_version_track_detects_variants() {
        assert!(is_version_track("Song (Acoustic)"));
        assert!(is_version_track("Song (Acoustic Version)"));
        assert!(is_version_track("Song (Live at Wembley)"));
        assert!(is_version_track("Song (Remix)"));
        assert!(is_version_track("Song (Club Mix)"));
        assert!(is_version_track("Song (Radio Edit)"));
        assert!(is_version_track("Song (Remastered)"));
        assert!(is_version_track("Song (Instrumental)"));
        assert!(is_version_track("Song (Extended Mix)"));
    }

    #[test]
    fn test_is_version_track_passes_originals() {
        assert!(!is_version_track("Hotline Bling"));
        assert!(!is_version_track("Song (feat. Someone)"));
        assert!(!is_version_track("Song (Original Mix)"));
        assert!(!is_version_track("Mr. Brightside"));
    }

    #[test]
    fn test_deduplicate_keeps_highest_ranked_version() {
        let songs = vec![
            Song { id: "1".into(), title: "Hotline Bling".into(), artist: "Drake".into(), rank: 900, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
            Song { id: "2".into(), title: "Hotline Bling (Acoustic Version)".into(), artist: "Drake".into(), rank: 200, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
            Song { id: "3".into(), title: "Hotline Bling (Live)".into(), artist: "Drake".into(), rank: 100, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
        ];
        let result = deduplicate_versions(songs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "1");
        assert_eq!(result[0].rank, 900);
    }

    #[test]
    fn test_deduplicate_keeps_distinct_songs() {
        let songs = vec![
            Song { id: "1".into(), title: "Song A".into(), artist: "Artist X".into(), rank: 500, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
            Song { id: "2".into(), title: "Song B".into(), artist: "Artist X".into(), rank: 400, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
        ];
        let result = deduplicate_versions(songs);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_deduplicate_different_artists_same_title() {
        let songs = vec![
            Song { id: "1".into(), title: "Hallelujah".into(), artist: "Leonard Cohen".into(), rank: 800, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
            Song { id: "2".into(), title: "Hallelujah".into(), artist: "Jeff Buckley".into(), rank: 900, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
        ];
        let result = deduplicate_versions(songs);
        assert_eq!(result.len(), 2);
    }

    #[test]
    fn test_deduplicate_strips_remaster() {
        let songs = vec![
            Song { id: "1".into(), title: "Bohemian Rhapsody".into(), artist: "Queen".into(), rank: 1000, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
            Song { id: "2".into(), title: "Bohemian Rhapsody (Remastered 2011)".into(), artist: "Queen".into(), rank: 300, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
        ];
        let result = deduplicate_versions(songs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "1");
    }

    #[test]
    fn test_top_n_preserves_order_by_rank_descending() {
        let songs = vec![
            make_song("a", 50),
            make_song("b", 900),
            make_song("c", 450),
        ];
        let top = top_n_by_popularity(songs, 3);
        assert!(top[0].rank >= top[1].rank);
        assert!(top[1].rank >= top[2].rank);
    }

    #[test]
    fn test_is_version_track_square_brackets() {
        assert!(is_version_track("Song [Live]"));
        assert!(is_version_track("Song [Acoustic]"));
        assert!(is_version_track("Song [Remix]"));
        assert!(is_version_track("Song [Extended Mix]"));
    }

    #[test]
    fn test_is_version_track_demo() {
        assert!(is_version_track("Song (Demo)"));
        assert!(is_version_track("Song (Demo Version)"));
    }

    #[test]
    fn test_is_version_track_case_insensitive() {
        assert!(is_version_track("Song (ACOUSTIC)"));
        assert!(is_version_track("Song (LIVE AT WEMBLEY)"));
        assert!(is_version_track("Song (REMASTERED 2011)"));
    }

    #[test]
    fn test_deduplicate_empty_input() {
        let result = deduplicate_versions(vec![]);
        assert!(result.is_empty());
    }

    #[test]
    fn test_deduplicate_single_song() {
        let songs = vec![Song {
            id: "1".into(),
            title: "Alone".into(),
            artist: "Heart".into(),
            rank: 500,
            album: "".into(),
            album_art_url: "".into(),
            preview_url: "".into(),
        }];
        let result = deduplicate_versions(songs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "1");
    }

    #[test]
    fn test_deduplicate_prefers_higher_rank_regardless_of_input_order() {
        // Higher-ranked remaster appears second — should still win
        let songs = vec![
            Song { id: "low".into(), title: "Song A".into(), artist: "Artist".into(), rank: 100, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
            Song { id: "high".into(), title: "Song A (Remastered)".into(), artist: "Artist".into(), rank: 900, album: "".into(), album_art_url: "".into(), preview_url: "".into() },
        ];
        let result = deduplicate_versions(songs);
        assert_eq!(result.len(), 1);
        assert_eq!(result[0].id, "high");
        assert_eq!(result[0].rank, 900);
    }

    #[test]
    fn test_clip_durations_has_six_entries() {
        assert_eq!(CLIP_DURATIONS.len(), 6);
    }

    #[test]
    fn test_clip_durations_are_strictly_ascending() {
        for i in 0..CLIP_DURATIONS.len() - 1 {
            assert!(
                CLIP_DURATIONS[i] < CLIP_DURATIONS[i + 1],
                "CLIP_DURATIONS[{}]={} should be less than CLIP_DURATIONS[{}]={}",
                i, CLIP_DURATIONS[i], i + 1, CLIP_DURATIONS[i + 1]
            );
        }
    }

    #[test]
    fn test_clip_durations_starts_at_one_second() {
        assert_eq!(CLIP_DURATIONS[0], 1.0);
    }
}
