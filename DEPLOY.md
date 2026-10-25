# Déploiement sur Ubuntu 22.04

Architecture : le Caddy déjà présent sur le serveur (`~/apps/caddy`, réseau Docker `caddy_net`, ports 80/443)
envoie le trafic vers `api` (Hono) et `overlay` (nginx) de ce projet. Ces deux services ne publient aucun port.

## 1. Prérequis

- Un serveur Ubuntu 22.04 et un **nom de domaine** dont l'enregistrement DNS (A) pointe vers l'IP du serveur.
  Spotify exige du HTTPS pour l'adresse de retour OAuth, et Caddy obtient le certificat tout seul.
- Dans le [dashboard Spotify](https://developer.spotify.com/dashboard), ajouter la Redirect URI :
  `https://VOTRE_DOMAINE/callback`

## 2. Installer Docker

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER   # puis se reconnecter
```

## 3. Pare-feu

```bash
sudo ufw allow OpenSSH && sudo ufw allow 80 && sudo ufw allow 443 && sudo ufw enable
```

## 4. Configurer

Copier le projet sur le serveur (git clone, scp…), puis :

```bash
cp .env.example .env                     # renseigner DOMAIN
cp apps/api/.env.example apps/api/.env.production   # renseigner SPOTIFY_CLIENT_ID/SECRET et ADMIN_KEY
# (apps/overlay/.env.production : VITE_API_URL reste vide)
```

## 5. Lancer

```bash
docker compose up -d --build
docker compose ps          # api doit passer en "healthy"
docker compose logs -f api
```

## 5 bis. Déclarer le site dans le Caddy existant

Ajouter le bloc du [Caddyfile](Caddyfile) de ce dépôt (avec votre domaine) à la fin de
`/home/ubuntu/apps/caddy/conf/Caddyfile`, puis recharger Caddy sans coupure :

```bash
docker exec caddy-caddy-1 caddy reload --config /etc/caddy/Caddyfile
```

## 6. Connecter Spotify (une seule fois)

Ouvrir `https://VOTRE_DOMAINE/spotify/login?key=VOTRE_ADMIN_KEY` et accepter.

## 7. OBS

Source Navigateur -> `https://VOTRE_DOMAINE/` (largeur ~500, hauteur ~150).

## Maintenance

- Mise à jour : `git pull && docker compose up -d --build`
- Logs : `docker compose logs -f`
- Les tokens sont dans le volume `api_data` : ne le supprimez pas
  (`docker compose down` le garde, `docker compose down -v` l'efface).
- Les certificats sont gérés par l'autre projet Caddy.
