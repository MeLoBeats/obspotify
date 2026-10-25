import { m } from 'motion/react'
import { useProgress } from '../hooks/useProgress'
import { formatTime } from '../lib/format'
import type { NowPlaying } from '../lib/types'
import PlayPauseIcon from './PlayPauseIcon'
import ProgressBar from './ProgressBar'

/**
 * Carte affichant la musique : pochette, titre, artistes, état lecture/pause,
 * temps écoulé / durée totale et barre de progression.
 *
 * `m` (au lieu de `motion`) est la version allégée de Framer Motion :
 * elle fonctionne avec <LazyMotion> (voir App.tsx) pour réduire le bundle.
 */
export default function TrackCard({ track }: { track: NowPlaying }) {
  const { positionMs, percent } = useProgress(track)

  return (
    <m.div
      // Animation d'entrée / de sortie (pilotée par <AnimatePresence> dans App.tsx).
      initial={{ opacity: 0, x: -40, scale: 0.96 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: -40, scale: 0.96 }}
      transition={{ type: 'spring', stiffness: 260, damping: 26 }}
      className="m-6 flex w-[420px] items-center gap-4 rounded-2xl bg-black/60 p-3 text-white shadow-xl backdrop-blur-md"
    >
      {/* Pochette (fond gris si absente), légèrement assombrie en pause */}
      <div
        className={`size-20 shrink-0 overflow-hidden rounded-xl bg-white/10 transition-opacity duration-300 ${
          track.is_playing ? 'opacity-100' : 'opacity-60'
        }`}
      >
        {track.cover && <img src={track.cover} alt="" className="size-full object-cover" />}
      </div>

      <div className="flex min-w-0 flex-1 flex-col gap-1.5">
        <div className="min-w-0">
          {/* `truncate` coupe proprement avec "…" les titres trop longs */}
          <p className="truncate text-lg font-semibold leading-tight">{track.title}</p>
          <p className="truncate text-sm text-white/70">{track.artists.join(', ')}</p>
        </div>

        <ProgressBar value={percent} />

        {/* Ligne du bas : icône lecture/pause, temps écoulé à gauche, durée totale à droite */}
        <div className="flex items-center gap-2 text-xs tabular-nums text-white/70">
          <PlayPauseIcon playing={track.is_playing} />
          <span>{formatTime(positionMs)}</span>
          <span className="ml-auto">{formatTime(track.duration_ms)}</span>
        </div>
      </div>
    </m.div>
  )
}
