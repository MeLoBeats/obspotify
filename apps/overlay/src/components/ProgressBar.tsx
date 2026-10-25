/** Barre de progression fine. `value` va de 0 à 100. */
export default function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-1 w-full overflow-hidden rounded-full bg-white/15">
      {/* La transition linéaire de 250 ms (= pas du timer) rend l'avancement fluide. */}
      <div
        className="h-full rounded-full bg-emerald-400 transition-[width] duration-[250ms] ease-linear"
        style={{ width: `${value}%` }}
      />
    </div>
  )
}
