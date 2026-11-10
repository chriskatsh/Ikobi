import knexFactory from 'knex';

export function createDb(dbConfig) {
  const isSqlite = dbConfig.client === 'better-sqlite3';
  return knexFactory({
    client: dbConfig.client,
    connection: isSqlite ? dbConfig.connection : { timezone: 'Z', ...dbConfig.connection },
    useNullAsDefault: isSqlite,
    pool: isSqlite
      ? { min: 1, max: 1 }
      : {
          min: 0,
          max: 8,
          // Tout en UTC côté base, quel que soit le fuseau du serveur.
          afterCreate: (conn, done) => conn.query("SET time_zone = '+00:00'", (err) => done(err, conn)),
        },
  });
}

// Insère une ligne et renvoie son id, quel que soit le moteur (MySQL ou SQLite).
export async function insertId(q) {
  const r = await q;
  return Array.isArray(r) ? (typeof r[0] === 'object' ? r[0].id : r[0]) : r;
}
