import { Router } from 'express';
import pool from '../db.js';
import { verificarClave } from '../utils/claves.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

const RANGO_TAX = 100;

// Entrada de un participante a capturar: tienda+clave ya se validó en la
// pantalla anterior (routes/inventarios.js), pero se revalida acá porque el
// alias/rango de tax se crea en este endpoint. Alias nuevo -> siguiente
// rango de 100 disponible (1-100, 101-200, ...); alias existente -> reusa
// el que ya tenía.
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

    const existente = (
      await cliente.query('SELECT * FROM participantes WHERE inventario_id = $1 AND alias = $2', [
        inventarioId,
        alias,
      ])
    ).rows[0];
    if (existente) {
      await cliente.query('COMMIT');
      return res.json(existente);
    }

    const { rows } = await cliente.query(
      'SELECT COUNT(*)::int AS total FROM participantes WHERE inventario_id = $1',
      [inventarioId]
    );
    const taxMin = rows[0].total * RANGO_TAX + 1;
    const taxMax = taxMin + RANGO_TAX - 1;

    const nuevo = (
      await cliente.query(
        `INSERT INTO participantes (inventario_id, alias, tax_min, tax_max)
         VALUES ($1, $2, $3, $4) RETURNING *`,
        [inventarioId, alias, taxMin, taxMax]
      )
    ).rows[0];

    await cliente.query('COMMIT');
    res.status(201).json(nuevo);
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}));

router.get('/:id/taxes', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const resultado = await pool.query('SELECT * FROM taxes WHERE participante_id = $1 ORDER BY numero_tax', [id]);
  res.json(resultado.rows);
}));

export default router;
