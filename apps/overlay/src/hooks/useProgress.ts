import { useEffect, useState } from 'react'
import type { NowPlaying } from '../lib/types'

/**
 * Renvoie la position estimée dans la piste (en ms) et son pourcentage (0-100),
 * mis à jour en continu.
 *
 * L'API n'est interrogée que toutes les quelques secondes : entre deux réponses,
 * on estime la position nous-mêmes = progress_ms + temps écoulé depuis la lecture.
 * Chaque nouvelle réponse recale la valeur (donc pas de dérive).
 */
export function useProgress(track: NowPlaying): { positionMs: number; percent: number } {
  const [now, setNow] = useState(() => Date.now())

  useEffect(() => {
    if (!track.is_playing) return // en pause : plus de mise à jour, la barre se fige
    const timer = setInterval(() => setNow(Date.now()), 250)
    return () => clearInterval(timer)
  }, [track.is_playing])

  const elapsed = track.is_playing ? Math.max(0, now - track.fetched_at) : 0
  const positionMs = track.duration_ms
    ? Math.min(track.progress_ms + elapsed, track.duration_ms)
    : track.progress_ms
  const percent = track.duration_ms ? (positionMs / track.duration_ms) * 100 : 0

  return { positionMs, percent }
}
