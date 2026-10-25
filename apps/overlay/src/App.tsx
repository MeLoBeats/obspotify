import { AnimatePresence, LazyMotion, domAnimation } from 'motion/react'
import TrackCard from './components/TrackCard'
import { useNowPlaying } from './hooks/useNowPlaying'
import { HIDE_PAUSED } from './lib/config'

/**
 * Racine de l'overlay.
 *
 * Règle d'affichage : la carte reste affichée tant qu'il y a une musique, qu'elle
 * joue ou soit en pause (sauf si ?hidePaused=1). Sinon l'écran reste transparent.
 *
 * `key={track.id}` : quand la piste change, React considère que c'est une
 * nouvelle carte -> l'ancienne sort (exit), la nouvelle entre (initial -> animate).
 * `mode="wait"` attend la fin de la sortie avant de faire entrer la suivante.
 */
export default function App() {
  const track = useNowPlaying()

  const visible =
    track !== null &&
    track.authenticated &&
    track.title !== null &&
    (track.is_playing || !HIDE_PAUSED)

  return (
    <LazyMotion features={domAnimation} strict>
      <AnimatePresence mode="wait">
        {visible && <TrackCard key={track.id ?? track.title} track={track} />}
      </AnimatePresence>
    </LazyMotion>
  )
}
