/**
 * Icône d'état de lecture : ▶ (lecture) ou ⏸ (pause).
 * SVG inline : aucune dépendance, et la couleur suit le texte (`currentColor`).
 */
export default function PlayPauseIcon({ playing }: { playing: boolean }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" className="size-4 shrink-0" aria-label={playing ? 'Lecture' : 'Pause'}>
      {playing ? (
        <path d="M8 5v14l11-7z" />
      ) : (
        <path d="M6 5h4v14H6zM14 5h4v14h-4z" />
      )}
    </svg>
  )
}
