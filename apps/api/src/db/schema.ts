import { int, sqliteTable, text } from "drizzle-orm/sqlite-core";

/**
 * Table des tokens Spotify.
 *
 * Il n'y a qu'UN SEUL compte Spotify connecté (celui du streamer), donc cette
 * table ne contient qu'UNE SEULE ligne, dont l'id vaut toujours 1
 * (voir `TOKEN_ROW_ID` dans index.ts). On la met à jour avec un "upsert"
 * (insert ou update) au lieu de multiplier les lignes.
 *
 * ⚠️ Après modification de ce fichier, il faut régénérer la migration :
 *    npx drizzle-kit generate && npx drizzle-kit migrate
 *    (ou `npx drizzle-kit push` en dev). Si la table existante pose problème,
 *    supprimez db.sqlite : il suffira de se reconnecter via /spotify/login.
 */
export const tokensTable = sqliteTable("tokens_table", {
  // Clé primaire fixe (pas d'autoincrement) : toujours 1, voir ci-dessus.
  id: int().primaryKey(),

  // Jeton d'accès envoyé à l'API Spotify (valable ~1h).
  // (Plus de .unique() : inutile, et source d'erreurs d'insertion.)
  accessToken: text().notNull(),

  // Jeton permettant d'obtenir un nouveau accessToken sans reconnexion.
  refreshToken: text().notNull(),

  // Date d'expiration de l'accessToken, en millisecondes depuis 1970
  // (comparable directement à Date.now()).
  // (Plus de .unique() : deux tokens peuvent légitimement avoir la même date.)
  expires: int().notNull(),
});
