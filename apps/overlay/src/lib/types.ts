/** Réponse de GET /spotify/now-playing (doit rester identique à l'interface NowPlaying de l'API). */
export interface NowPlaying {
  authenticated: boolean
  is_playing: boolean
  /** Identifiant de la piste : change quand la musique change. */
  id: string | null
  title: string | null
  artists: string[]
  cover: string | null
  /** Position dans la piste au moment `fetched_at` (ms). */
  progress_ms: number
  duration_ms: number
  /** Moment (Date.now() côté serveur) où l'info a été lue chez Spotify. */
  fetched_at: number
  error?: string
}
