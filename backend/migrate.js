import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import pool from './db.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const migrationsDir = path.join(__dirname, 'migrations');

async function migrar() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      id TEXT PRIMARY KEY,
      aplicada_en TIMESTAMPTZ NOT NULL DEFAULT now()
    )
  `);

  const aplicadas = new Set(
    (await pool.query('SELECT id FROM schema_migrations')).rows.map((r) => r.id)
  );

  const archivos = fs.readdirSync(migrationsDir).filter((f) => f.endsWith('.sql')).sort();

  for (const archivo of archivos) {
    if (aplicadas.has(archivo)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, archivo), 'utf8');
    console.log(`Aplicando migración ${archivo}...`);
    await pool.query('BEGIN');
    try {
      await pool.query(sql);
      await pool.query('INSERT INTO schema_migrations (id) VALUES ($1)', [archivo]);
      await pool.query('COMMIT');
    } catch (error) {
      await pool.query('ROLLBACK');
      throw error;
    }
  }

  console.log('Migraciones al día.');
  await pool.end();
}

migrar().catch((error) => {
  console.error('Error migrando:', error);
  process.exit(1);
});
