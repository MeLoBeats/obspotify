/**
 * Configuration de l'overlay. Tout se règle via l'URL de la source navigateur OBS,
 * par exemple :
 *   http://localhost:5173/?api=https://api.monsite.fr&poll=2000&hidePaused=1
 */
const params = new URLSearchParams(window.location.search)

/** URL de base de l'API, sans slash final. Vide = même origine (proxy). */
export const API_URL = (params.get('api') ?? import.meta.env.VITE_API_URL ?? '').replace(/\/$/, '')

/** Intervalle d'interrogation de l'API en ms (minimum 1000 pour ménager Spotify). */
export const POLL_MS = Math.max(1000, Number(params.get('poll')) || 3000)

/** Si "1", la carte disparaît quand la musique est en pause (par défaut elle reste affichée). */
export const HIDE_PAUSED = params.get('hidePaused') === '1'
