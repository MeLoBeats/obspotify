/**
 * API obspotify : récupère la musique en cours sur Spotify pour l'overlay OBS.
 *
 * Routes :
 *   GET /health               -> vérifie que l'API tourne
 *   GET /spotify/login?key=…  -> démarre la connexion Spotify (protégée par ADMIN_KEY)
 *   GET /callback             -> retour de Spotify après autorisation (OAuth)
 *   GET /spotify/now-playing  -> musique en cours (appelée par l'overlay)
 *
 * Variables d'environnement (.env) :
 *   DB_FILE_NAME           ex: file:db.sqlite
 *   SPOTIFY_CLIENT_ID      identifiant de l'app Spotify
 *   SPOTIFY_CLIENT_SECRET  secret de l'app Spotify
 *   SPOTIFY_REDIRECT_URI   (optionnel) défaut http://127.0.0.1:8000/callback
 *                          doit être EXACTEMENT celle déclarée dans le dashboard Spotify
 *   ADMIN_KEY              mot de passe pour utiliser /spotify/login
 *   CORS_ORIGIN            (optionnel) origine autorisée pour l'overlay, défaut "*"
 *   PORT                   (optionnel) défaut 8000
 */
import 'dotenv/config'
import { drizzle } from 'drizzle-orm/libsql'
import { serve } from '@hono/node-server'
import { Hono } from 'hono'
import { cors } from 'hono/cors'
import { deleteCookie, getCookie, setCookie } from 'hono/cookie'
import { tokensTable } from './db/schema.js'
import { randomBytes, timingSafeEqual } from 'node:crypto'

// ---------------------------------------------------------------------------
// Configuration
// ---------------------------------------------------------------------------

/** Lit une variable d'environnement obligatoire, ou arrête le serveur avec un message clair. */
function requireEnv(name: string): string {
  const value = process.env[name]
  if (!value) {
    throw new Error(`Variable d'environnement manquante : ${name} (voir le fichier .env)`)
  }
  return value
}

const SPOTIFY_CLIENT_ID = requireEnv('SPOTIFY_CLIENT_ID')
const SPOTIFY_CLIENT_SECRET = requireEnv('SPOTIFY_CLIENT_SECRET')
const ADMIN_KEY = requireEnv('ADMIN_KEY')
const DB_FILE_NAME = requireEnv('DB_FILE_NAME')
const REDIRECT_URI = process.env.SPOTIFY_REDIRECT_URI ?? 'http://127.0.0.1:8000/callback'
const PORT = Number(process.env.PORT ?? 8000)

const SPOTIFY_TOKEN_URL = 'https://accounts.spotify.com/api/token'
const SPOTIFY_AUTHORIZE_URL = 'https://accounts.spotify.com/authorize'
const SPOTIFY_PLAYER_URL = 'https://api.spotify.com/v1/me/player?additional_types=episode'

/** Permission demandée à l'utilisateur : lire ce qu'il est en train d'écouter. */
const SPOTIFY_SCOPE = 'user-read-playback-state'

/** Un seul compte Spotify => une seule ligne en base, toujours avec cet id. */
const TOKEN_ROW_ID = 1

/** On rafraîchit le token 60 s avant son expiration réelle, par sécurité. */
const TOKEN_EXPIRY_MARGIN_MS = 60_000

/** Durée max d'attente d'une réponse de Spotify avant d'abandonner. */
const SPOTIFY_TIMEOUT_MS = 5_000

/** Durée pendant laquelle on réutilise la dernière réponse de now-playing (évite de spammer Spotify). */
const NOW_PLAYING_CACHE_MS = 1_500

const app = new Hono()
const db = drizzle(DB_FILE_NAME)

// CORS : nécessaire si la page d'overlay est servie depuis une autre origine que l'API.
// Les infos de now-playing sont publiques (titre, artistes, pochette), "*" est acceptable.
app.use('/spotify/now-playing', cors({ origin: process.env.CORS_ORIGIN ?? '*' }))

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

/** Réponse de now-playing. La forme est TOUJOURS la même, pour simplifier l'overlay. */
interface NowPlaying {
  /** false si Spotify n'est pas connecté ou si le token est invalide. */
  authenticated: boolean
  /** true uniquement si la musique est en train de jouer (false si en pause). */
  is_playing: boolean
  /** Identifiant de la piste : l'overlay s'en sert pour détecter un changement de musique. */
  id: string | null
  title: string | null
  artists: string[]
  cover: string | null
  /** Position actuelle dans la piste (ms). */
  progress_ms: number
  /** Durée totale de la piste (ms). */
  duration_ms: number
  /** Moment (Date.now()) où l'info a été lue chez Spotify : permet d'animer la barre côté overlay. */
  fetched_at: number
  /** Code d'erreur éventuel (ex: "refresh_failed"). */
  error?: string
}

/** Résultat interne : un corps de réponse + le code HTTP à renvoyer. */
interface NowPlayingResult {
  status: 200 | 401 | 500 | 503
  body: NowPlaying
}

/** Forme (partielle) de la réponse du endpoint /api/token de Spotify. */
interface SpotifyTokenResponse {
  access_token: string
  expires_in: number
  refresh_token?: string
}

// ---------------------------------------------------------------------------
// Utilitaires
// ---------------------------------------------------------------------------

/** Construit une réponse "rien à afficher" (non connecté, rien ne joue, erreur…). */
function emptyPlayback(authenticated: boolean, error?: string): NowPlaying {
  return {
    authenticated,
    is_playing: false,
    id: null,
    title: null,
    artists: [],
    cover: null,
    progress_ms: 0,
    duration_ms: 0,
    fetched_at: Date.now(),
    ...(error ? { error } : {}),
  }
}

/** Compare deux chaînes en temps constant (évite les attaques par mesure du temps de réponse). */
function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a)
  const bufB = Buffer.from(b)
  return bufA.length === bufB.length && timingSafeEqual(bufA, bufB)
}

/**
 * Appelle le endpoint /api/token de Spotify.
 * Sert aux deux cas : échange du "code" OAuth contre des tokens (grant_type=authorization_code)
 * et renouvellement d'un token expiré (grant_type=refresh_token).
 */
async function requestSpotifyToken(params: Record<string, string>): Promise<SpotifyTokenResponse> {
  const res = await fetch(SPOTIFY_TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      // Spotify exige "client_id:client_secret" encodé en base64.
      Authorization:
        'Basic ' + Buffer.from(`${SPOTIFY_CLIENT_ID}:${SPOTIFY_CLIENT_SECRET}`).toString('base64'),
    },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
  })

  if (!res.ok) {
    throw new Error(`Spotify token error ${res.status}: ${await res.text()}`)
  }
  return (await res.json()) as SpotifyTokenResponse
}

/** Enregistre les tokens en base : crée la ligne si elle n'existe pas, sinon la met à jour (upsert). */
async function saveTokens(accessToken: string, refreshToken: string, expiresInSeconds: number) {
  const values = {
    accessToken,
    refreshToken,
    expires: Date.now() + expiresInSeconds * 1000,
  }
  await db
    .insert(tokensTable)
    .values({ id: TOKEN_ROW_ID, ...values })
    .onConflictDoUpdate({ target: tokensTable.id, set: values })
}

/** Lit la ligne de tokens (undefined si Spotify n'a jamais été connecté). */
async function loadTokens() {
  const [token] = await db.select().from(tokensTable).limit(1)
  return token
}

/**
 * Renouvelle l'access token avec le refresh token.
 *
 * Verrou : si plusieurs requêtes arrivent en même temps alors que le token est expiré
 * (l'overlay interroge l'API en boucle), on ne lance qu'UN seul renouvellement
 * et tout le monde attend le même résultat. Sinon Spotify pourrait invalider
 * un refresh token pendant qu'un autre appel l'utilise encore.
 */
let refreshInFlight: Promise<string> | null = null

function refreshAccessToken(currentRefreshToken: string): Promise<string> {
  refreshInFlight ??= (async () => {
    const data = await requestSpotifyToken({
      grant_type: 'refresh_token',
      refresh_token: currentRefreshToken,
    })
    // Spotify ne renvoie pas toujours un nouveau refresh token : sinon on garde l'ancien.
    await saveTokens(data.access_token, data.refresh_token ?? currentRefreshToken, data.expires_in)
    return data.access_token
  })().finally(() => {
    refreshInFlight = null // libère le verrou, succès ou échec
  })
  return refreshInFlight
}

// ---------------------------------------------------------------------------
// Connexion Spotify (OAuth)
// ---------------------------------------------------------------------------

/**
 * Étape 1 : redirige vers la page d'autorisation Spotify.
 * Protégée par ADMIN_KEY (/spotify/login?key=…) : sinon n'importe qui pourrait
 * connecter SON compte Spotify et remplacer le vôtre.
 */
app.get('/spotify/login', (c) => {
  if (!safeEqual(c.req.query('key') ?? '', ADMIN_KEY)) {
    return c.json({ error: 'unauthorized' }, 401)
  }

  // "state" : valeur aléatoire gardée en cookie, vérifiée au retour (protection CSRF).
  const state = randomBytes(16).toString('hex')

  setCookie(c, 'spotify_oauth_state', state, {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'Lax',
    path: '/',
    maxAge: 600, // 10 minutes pour finir la connexion
  })

  const params = new URLSearchParams({
    response_type: 'code',
    client_id: SPOTIFY_CLIENT_ID,
    redirect_uri: REDIRECT_URI,
    scope: SPOTIFY_SCOPE,
    state,
  })
  return c.redirect(`${SPOTIFY_AUTHORIZE_URL}?${params}`)
})

/** Étape 2 : Spotify nous renvoie ici avec un "code" que l'on échange contre des tokens. */
app.get('/callback', async (c) => {
  // L'utilisateur a cliqué sur "Refuser" chez Spotify.
  const spotifyError = c.req.query('error')
  if (spotifyError) {
    return c.json({ error: spotifyError }, 400)
  }

  const code = c.req.query('code')
  const returnedState = c.req.query('state')
  const expectedState = getCookie(c, 'spotify_oauth_state')

  // Le state renvoyé doit être identique à celui stocké dans le cookie.
  if (!code || !returnedState || !expectedState || !safeEqual(returnedState, expectedState)) {
    return c.json({ error: 'state_mismatch' }, 400)
  }
  deleteCookie(c, 'spotify_oauth_state', { path: '/' }) // usage unique

  try {
    const data = await requestSpotifyToken({
      grant_type: 'authorization_code',
      code,
      redirect_uri: REDIRECT_URI,
    })

    if (!data.refresh_token) {
      throw new Error('Spotify n\'a pas renvoyé de refresh_token')
    }

    await saveTokens(data.access_token, data.refresh_token, data.expires_in)
  } catch (error) {
    console.error(error)
    return c.text('Erreur lors de la connexion Spotify', 500)
  }

  return c.text('Spotify connecté avec succès')
})

// ---------------------------------------------------------------------------
// Musique en cours
// ---------------------------------------------------------------------------

/** Dernière réponse réussie, réutilisée pendant NOW_PLAYING_CACHE_MS. */
let cache: { at: number; body: NowPlaying } | null = null

/** Si Spotify nous limite (HTTP 429), on n'appelle plus l'API avant cet instant (Date.now()). */
let rateLimitedUntil = 0

/** Requête Spotify en cours : les appels simultanés la partagent au lieu d'en lancer plusieurs. */
let nowPlayingInFlight: Promise<NowPlayingResult> | null = null

/** Interroge réellement Spotify (sans cache). */
async function fetchNowPlaying(): Promise<NowPlayingResult> {
  // 1. Pas connecté du tout (aucun token en base).
  const token = await loadTokens()
  if (!token) {
    return { status: 200, body: emptyPlayback(false) }
  }

  // 2. Token expiré ou bientôt expiré : on le renouvelle.
  let accessToken = token.accessToken
  if (Date.now() >= token.expires - TOKEN_EXPIRY_MARGIN_MS) {
    try {
      accessToken = await refreshAccessToken(token.refreshToken)
    } catch (error) {
      console.error(error)
      return { status: 401, body: emptyPlayback(false, 'refresh_failed') }
    }
  }

  // 3. Appel à Spotify.
  let res: Response
  try {
    res = await fetch(SPOTIFY_PLAYER_URL, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(SPOTIFY_TIMEOUT_MS),
    })
  } catch (error) {
    // Spotify injoignable ou trop lent.
    console.error(error)
    return { status: 503, body: emptyPlayback(true, 'spotify_unreachable') }
  }

  // 4. Trop de requêtes : on respecte le délai demandé par Spotify.
  if (res.status === 429) {
    const retryAfter = Number(res.headers.get('Retry-After') ?? 5)
    rateLimitedUntil = Date.now() + retryAfter * 1000
    return { status: 503, body: emptyPlayback(true, 'rate_limited') }
  }

  // 5. Token refusé malgré le renouvellement.
  if (res.status === 401) {
    return { status: 401, body: emptyPlayback(false, 'invalid_token') }
  }

  // 6. Connecté, mais rien ne joue / aucun appareil actif.
  if (res.status === 204) {
    return { status: 200, body: emptyPlayback(true) }
  }

  if (!res.ok) {
    return { status: 500, body: emptyPlayback(true, 'spotify_error') }
  }

  // 7. Tout va bien : on extrait ce dont l'overlay a besoin.
  const playback = await res.json()
  const item = playback.item // peut être null (pub) ; peut être un épisode de podcast

  return {
    status: 200,
    body: {
      authenticated: true,
      is_playing: playback.is_playing ?? false,
      id: item?.id ?? null,
      title: item?.name ?? null,
      // Morceau : item.artists. Podcast : on affiche le nom de l'émission.
      artists: item?.artists?.map((a: { name: string }) => a.name) ?? (item?.show?.name ? [item.show.name] : []),
      // Morceau : pochette de l'album. Podcast : image de l'épisode.
      cover: item?.album?.images?.[0]?.url ?? item?.images?.[0]?.url ?? null,
      progress_ms: playback.progress_ms ?? 0,
      duration_ms: item?.duration_ms ?? 0,
      fetched_at: Date.now(),
    },
  }
}

/** Musique en cours, avec cache court et partage des requêtes simultanées. */
app.get('/spotify/now-playing', async (c) => {
  // Cache valide : on répond sans déranger Spotify.
  if (cache && Date.now() - cache.at < NOW_PLAYING_CACHE_MS) {
    return c.json(cache.body)
  }

  // Limité par Spotify : on renvoie la dernière info connue si on en a une.
  if (Date.now() < rateLimitedUntil) {
    return cache ? c.json(cache.body) : c.json(emptyPlayback(true, 'rate_limited'), 503)
  }

  // Une seule requête à la fois vers Spotify, partagée entre tous les appelants.
  nowPlayingInFlight ??= fetchNowPlaying().finally(() => {
    nowPlayingInFlight = null
  })
  const { status, body } = await nowPlayingInFlight

  // On ne met en cache que les succès.
  if (status === 200) {
    cache = { at: Date.now(), body }
  }
  return c.json(body, status)
})

// ---------------------------------------------------------------------------
// Divers
// ---------------------------------------------------------------------------

/** Route de santé (pratique pour Docker / Caddy / vérifier que l'API répond). */
app.get('/health', (c) => c.json({ ok: true }))

serve({
  fetch: app.fetch,
  port: PORT,
}, (info) => {
  console.log(`Server is running on http://localhost:${info.port}`)
})
