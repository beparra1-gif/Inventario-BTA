import { Router } from 'express';
import pool from '../db.js';
import { verificarClave } from '../utils/claves.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

const RANGO_TAX = 100;

// Alias nuevo -> siguiente rango de 100 disponible (1-100, 101-200, ...);
// alias existente -> reusa el que ya tenía (así se puede seguir capturando
// desde otro dispositivo entrando con el mismo alias). Se llama tanto desde
// el alta que hace el admin de antemano como desde la entrada del propio
// participante (POST /, con clave). `nombre` es opcional y solo se guarda
// al crear (no pisa el nombre ya guardado si el alias ya existía).
async function obtenerOCrearParticipante(cliente, inventarioId, alias, nombre = null) {
  const existente = (
    await cliente.query('SELECT * FROM participantes WHERE inventario_id = $1 AND alias = $2', [
      inventarioId,
      alias,
    ])
  ).rows[0];
  if (existente) return existente;

  const { rows } = await cliente.query(
    'SELECT COUNT(*)::int AS total FROM participantes WHERE inventario_id = $1',
    [inventarioId]
  );
  const taxMin = rows[0].total * RANGO_TAX + 1;
  const taxMax = taxMin + RANGO_TAX - 1;

  return (
    await cliente.query(
      `INSERT INTO participantes (inventario_id, alias, nombre, tax_min, tax_max)
       VALUES ($1, $2, $3, $4, $5) RETURNING *`,
      [inventarioId, alias, nombre, taxMin, taxMax]
    )
  ).rows[0];
}

// Entrada de un participante a capturar: tienda+clave ya se validó en la
// pantalla anterior (routes/inventarios.js), pero se revalida acá porque el
// alias/rango de tax se crea en este endpoint.
router.post('/', manejarAsync(async (req, res) => {
  const inventarioId = Number(req.body?.inventarioId);
  const clave = String(req.body?.clave ?? '');
  const alias = String(req.body?.alias ?? '').trim();

  if (!Number.isInteger(inventarioId) || !clave || !alias) {
    return res.status(400).json({ error: 'datos_incompletos' });
  }

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');

    const inventario = (
      await cliente.query('SELECT * FROM inventarios WHERE id = $1 FOR UPDATE', [inventarioId])
    ).rows[0];
    if (!inventario || inventario.estado !== 'abierto') {
      await cliente.query('ROLLBACK');
      return res.status(409).json({ error: 'inventario_no_disponible' });
    }
    if (!(await verificarClave(clave, inventario.clave_hash))) {
      await cliente.query('ROLLBACK');
      return res.status(401).json({ error: 'clave_invalida' });
    }

    const participante = await obtenerOCrearParticipante(cliente, inventarioId, alias);
    await cliente.query('COMMIT');
    res.status(201).json(participante);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}));

// El admin arma de antemano la lista de perfiles de captura (nombre/inicial
// que va a teclear cada persona) para que no tengan que inventarse un alias
// al llegar — mismo rango automático de 100 que el alta por clave. No pide
// la clave del inventario: quien llama ya está autenticado como admin.
router.post('/admin', manejarAsync(async (req, res) => {
  const inventarioId = Number(req.body?.inventarioId);
  const adminId = Number(req.body?.adminId);
  const alias = String(req.body?.alias ?? '').trim();
  const nombre = req.body?.nombre ? String(req.body.nombre).trim() : null;

  if (!Number.isInteger(inventarioId) || !alias) return res.status(400).json({ error: 'datos_incompletos' });

  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const participante = await obtenerOCrearParticipante(cliente, inventarioId, alias, nombre);
    await cliente.query('COMMIT');
    res.status(201).json(participante);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}));

// El admin quita a alguien del roster — se lleva sus taxes/capturas
// (ON DELETE CASCADE) porque el alias deja de existir, así que si esa
// persona ya había capturado algo hay que avisarle antes de confirmar
// (lo hace el frontend, esto solo ejecuta).
router.delete('/:id', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const id = Number(req.params.id);
  const resultado = await pool.query('DELETE FROM participantes WHERE id = $1 RETURNING id', [id]);
  if (!resultado.rows.length) return res.status(404).json({ error: 'participante_no_encontrado' });
  res.status(204).end();
}));

router.get('/:id/taxes', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const resultado = await pool.query('SELECT * FROM taxes WHERE participante_id = $1 ORDER BY numero_tax', [id]);
  res.json(resultado.rows);
}));

// Lo que ve el participante al volver a su perfil: cuánto lleva capturado
// en total y cuántos artículos no reconocidos (y su suma) para que sepa si
// tiene que revisar algo antes de seguir.
router.get('/:id/resumen', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT
       COALESCE(SUM(c.cantidad), 0)::int AS total_unidades,
       COALESCE(SUM(c.cantidad) FILTER (WHERE c.reconocido = false), 0)::int AS unidades_no_reconocidas,
       COUNT(*) FILTER (WHERE c.reconocido = false)::int AS filas_no_reconocidas
     FROM taxes t
     LEFT JOIN capturas c ON c.tax_id = t.id
     WHERE t.participante_id = $1`,
    [id]
  );
  res.json({
    totalUnidades: rows[0].total_unidades,
    unidadesNoReconocidas: rows[0].unidades_no_reconocidas,
    filasNoReconocidas: rows[0].filas_no_reconocidas,
  });
}));

export default router;
