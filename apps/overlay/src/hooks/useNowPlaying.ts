import { useEffect, useState } from 'react'
import { API_URL, POLL_MS } from '../lib/config'
import type { NowPlaying } from '../lib/types'

/**
 * Interroge l'API en boucle et renvoie la dernière musique connue.
 *
 * - En cas d'erreur réseau, on GARDE la dernière valeur (pas de clignotement
 *   de l'overlay à cause d'un hoquet de connexion).
 * - Un AbortController annule la requête en cours si le composant est démonté.
 * - `setTimeout` récursif (et non `setInterval`) : on attend la fin d'une requête
 *   avant de planifier la suivante, donc pas d'empilement si l'API est lente.
 */
export function useNowPlaying(): NowPlaying | null {
  const [data, setData] = useState<NowPlaying | null>(null)

  useEffect(() => {
    const controller = new AbortController()
    let timer: ReturnType<typeof setTimeout>

    async function poll() {
      try {
        const res = await fetch(`${API_URL}/spotify/now-playing`, { signal: controller.signal })
        // L'API renvoie toujours le même JSON, même en erreur (401/503) : on le lit dans tous les cas.
        setData((await res.json()) as NowPlaying)
      } catch {
        // Réseau coupé ou requête annulée : on conserve l'état précédent.
      }
      if (!controller.signal.aborted) timer = setTimeout(poll, POLL_MS)
    }

    poll()
    return () => {
      controller.abort()
      clearTimeout(timer)
    }
  }, [])

  return data
}
