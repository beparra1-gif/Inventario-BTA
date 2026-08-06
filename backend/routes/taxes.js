import { Router } from 'express';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

async function exigirAdmin(req, res) {
  const adminId = Number(req.body?.adminId);
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) {
    res.status(403).json({ error: 'requiere_admin' });
    return null;
  }
  return admin;
}

// Abre (o retoma si ya existe) un número de tax dentro del rango asignado
// al participante. numero_tax es único por inventario (no por participante)
// así que si otro participante ya lo abrió, falla por la constraint UNIQUE.
router.post('/', manejarAsync(async (req, res) => {
  const participanteId = Number(req.body?.participanteId);
  const numeroTax = Number(req.body?.numeroTax);
  if (!Number.isInteger(participanteId) || !Number.isInteger(numeroTax)) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  const participante = (
    await pool.query(
      `SELECT p.*, i.estado AS inventario_estado FROM participantes p
       JOIN inventarios i ON i.id = p.inventario_id WHERE p.id = $1`,
      [participanteId]
    )
  ).rows[0];
  if (!participante) return res.status(404).json({ error: 'participante_no_encontrado' });
  if (participante.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });
  if (numeroTax < participante.tax_min || numeroTax > participante.tax_max) {
    return res.status(400).json({ error: 'numero_tax_fuera_de_rango' });
  }

  const existente = (
    await pool.query('SELECT * FROM taxes WHERE inventario_id = $1 AND numero_tax = $2', [
      participante.inventario_id,
      numeroTax,
    ])
  ).rows[0];
  if (existente) {
    if (existente.participante_id !== participanteId) {
      return res.status(409).json({ error: 'tax_ya_usado_por_otro_participante' });
    }
    return res.json(existente);
  }

  const nuevo = (
    await pool.query(
      `INSERT INTO taxes (inventario_id, participante_id, numero_tax) VALUES ($1, $2, $3) RETURNING *`,
      [participante.inventario_id, participanteId, numeroTax]
    )
  ).rows[0];

  req.app.locals.io.to(`inventario:${participante.inventario_id}`).emit('tax:abierto', nuevo);
  res.status(201).json(nuevo);
}));

router.post('/:id/cerrar', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const resultado = await pool.query(
    `UPDATE taxes SET estado = 'cerrado', cerrado_en = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'tax_no_encontrado' });

  const tax = resultado.rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:cerrado', tax);
  res.json(tax);
}));

// El admin corrige un tax puntual: lo reabre (por si lo cerraron por error o
// hay que agregar algo) sin tener que reabrir todo el inventario.
router.post('/:id/reabrir', manejarAsync(async (req, res) => {
  if (!(await exigirAdmin(req, res))) return;
  const id = Number(req.params.id);
  const resultado = await pool.query(
    `UPDATE taxes SET estado = 'abierto', cerrado_en = NULL WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'tax_no_encontrado' });

  const tax = resultado.rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:abierto', tax);
  res.json(tax);
}));

// El propio capturador reinicia su tax en curso (borra todas las capturas
// pero deja el tax abierto, sin tener que pasar por el admin) para volver a
// empezar ese número desde cero si se equivocó feo.
router.delete('/:id/capturas', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const tax = (await pool.query('SELECT inventario_id FROM taxes WHERE id = $1', [id])).rows[0];
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });

  await pool.query('DELETE FROM capturas WHERE tax_id = $1', [id]);
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:reiniciado', { id });
  res.status(204).end();
}));

// El admin borra un tax completo (sus capturas se van con él, ON DELETE
// CASCADE) para que el mismo participante lo vuelva a capturar desde cero
// — libera el número para que se pueda reabrir de nuevo.
router.delete('/:id', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const id = Number(req.params.id);
  const resultado = await pool.query('DELETE FROM taxes WHERE id = $1 RETURNING inventario_id, numero_tax', [id]);
  if (!resultado.rows.length) return res.status(404).json({ error: 'tax_no_encontrado' });

  const { inventario_id: inventarioId, numero_tax: numeroTax } = resultado.rows[0];
  req.app.locals.io.to(`inventario:${inventarioId}`).emit('tax:eliminado', { id, numeroTax });
  res.status(204).end();
}));

export default router;
