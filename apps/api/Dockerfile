# ---------------------------------------------------------------------------
# Image de l'API (Hono + Drizzle + SQLite/libsql).
# Debian "slim" (et non alpine) : les binaires natifs de libsql y sont fournis.
# ---------------------------------------------------------------------------

# --- Étape 1 : installation des dépendances et compilation TypeScript -> dist/
FROM node:22-slim AS build
WORKDIR /app

# On copie d'abord uniquement les manifestes : tant qu'ils ne changent pas,
# Docker réutilise le cache et n'exécute pas `npm ci` à chaque build.
COPY package.json package-lock.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
RUN npm run build

# --- Étape 2 : image finale d'exécution
FROM node:22-slim
WORKDIR /app
ENV NODE_ENV=production

# On garde toutes les dépendances (drizzle-kit inclus) car le démarrage
# applique les migrations de la base avant de lancer le serveur.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY package.json drizzle.config.ts ./
COPY drizzle ./drizzle

# Dossier de la base SQLite : monté comme volume dans compose.yml pour que les
# tokens Spotify survivent aux redémarrages / mises à jour du conteneur.
RUN mkdir /data && chown node:node /data

# Ne pas tourner en root.
USER node

EXPOSE 8000

# Vérifie régulièrement que l'API répond (utilisé par `docker compose ps`).
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8000/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

# 1) applique les migrations (crée la table des tokens au premier lancement)
# 2) démarre le serveur
CMD ["sh", "-c", "npx drizzle-kit migrate && node dist/index.js"]
