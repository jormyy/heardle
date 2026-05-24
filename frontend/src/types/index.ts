export interface Song {
  id: string;
  title: string;
  artist: string;
  album: string;
  album_art_url: string;
  preview_url: string;
}

export interface Theme {
  type: 'artist' | 'genre' | 'decade';
  value: string;   // artist/genre: Deezer ID — decade: string like "90s"
  label?: string;  // human-readable name for display in pills
}

export interface ClipInfo {
  preview_url: string;
  allowed_duration: number;
  attempt: number;
}

export interface AutocompleteResult {
  id: string;
  title: string;
  artist: string;
}

export interface GuessResponse {
  correct: boolean;
  attempt: number;
  game_over: boolean;
  answer?: Song;
}

export interface SkipResponse {
  attempt: number;
  game_over: boolean;
  answer?: Song;
}

export const CLIP_DURATIONS = [1, 2, 4, 7, 11, 16];
