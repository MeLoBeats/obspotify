# ---------------------------------------------------------------------------
# Image de l'overlay : build Vite puis fichiers statiques servis par nginx.
# ---------------------------------------------------------------------------

# --- Étape 1 : build (produit dist/)
FROM node:22-slim AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

# Laisser vide = l'overlay appelle l'API sur la même origine (via Caddy).
# Peut être surchargé : docker compose build --build-arg VITE_API_URL=https://...
ARG VITE_API_URL=""
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

# --- Étape 2 : serveur web minimal
FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html

EXPOSE 80
