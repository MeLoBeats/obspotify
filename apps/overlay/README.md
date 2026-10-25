# obspotify overlay

Overlay OBS qui affiche la musique Spotify en cours (pochette, titre, artistes, barre de progression).
Stack : React 19 + Vite + Tailwind v4 + `motion` (Framer Motion, version allégée via `LazyMotion`).

## Lancer

```bash
npm install
npm run dev      # http://localhost:5173 (proxy /spotify -> http://127.0.0.1:8000)
npm run build    # génère dist/ (fichiers statiques à servir)
```

L'API (`apps/api`) doit tourner et Spotify doit être connecté (`/spotify/login?key=ADMIN_KEY`).

## Ajouter dans OBS

1. Sources -> **+** -> **Navigateur**.
2. URL : `http://localhost:5173/` (dev) ou l'URL où vous servez `dist/`.
3. Largeur ~ 500, hauteur ~ 150 (la carte fait 420 px de large + marges).
4. Le fond est transparent par défaut : ne collez **pas** de CSS personnalisé qui mettrait un fond.

## Réglages (paramètres d'URL)

| Paramètre    | Défaut  | Rôle                                                      |
| ------------ | ------- | --------------------------------------------------------- |
| `api`        | *(vide)*| URL de l'API si elle n'est pas sur la même origine        |
| `poll`       | `3000`  | Fréquence d'interrogation de l'API en ms (minimum 1000)   |
| `hidePaused` | `0`     | `1` = masquer la carte quand la musique est en pause (sinon elle reste) |

Exemple : `http://localhost:5173/?api=https://api.monsite.fr&poll=2000&hidePaused=1`

Variable de build optionnelle : `VITE_API_URL` (voir `.env.example`). Le paramètre `?api=` est prioritaire.
Si l'overlay et l'API sont sur des origines différentes, l'API autorise déjà le CORS sur `now-playing`.

## Structure

```
src/
├── main.tsx                 point d'entrée React
├── App.tsx                  affiche/masque la carte, anime les changements de piste
├── index.css                import Tailwind + fond transparent (indispensable pour OBS)
├── components/
│   ├── TrackCard.tsx        la carte (pochette, titre, artistes) + animations
│   ├── PlayPauseIcon.tsx    icône ▶ / ⏸ (SVG inline)
│   └── ProgressBar.tsx      barre de progression
├── hooks/
│   ├── useNowPlaying.ts     interroge l'API en boucle (garde la dernière valeur si erreur)
│   └── useProgress.ts       estime la progression entre deux réponses de l'API
└── lib/
    ├── config.ts            lecture des paramètres d'URL
    ├── format.ts            ms -> "m:ss"
    └── types.ts             type de la réponse de l'API
```

## Comment ça marche

- `useNowPlaying` appelle `GET /spotify/now-playing` toutes les `poll` ms.
- `useProgress` calcule la position = `progress_ms` + temps écoulé depuis `fetched_at`, rafraîchie
  toutes les 250 ms, donc la barre est fluide sans surcharger Spotify.
- `App` utilise `key={track.id}` : un changement de piste déclenche l'animation de sortie puis d'entrée.
- En pause, la carte reste affichée (pochette atténuée, icône ⏸, barre figée). Avec `?hidePaused=1`, elle disparaît.
- Rien ne joue / Spotify non connecté : rien n'est affiché (transparent).
- La ligne du bas montre l'icône ▶/⏸, le temps écoulé (gauche) et la durée totale (droite).

## Personnaliser le style

Tout est en classes Tailwind dans `TrackCard.tsx` (couleurs, taille, flou, arrondis)
et `ProgressBar.tsx` (couleur `bg-emerald-400`). Les animations sont dans les props
`initial` / `animate` / `exit` / `transition` de `TrackCard`.
