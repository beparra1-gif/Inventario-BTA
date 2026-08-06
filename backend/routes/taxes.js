import { Router } from 'express';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

// Abre (o retoma si ya existe) un número de tax dentro del rango asignado
// al participante. numero_tax es único por inventario (no por participante)
// así que si otro participante ya lo abrió, falla por la constraint UNIQUE.
router.post('/', manejarAsync(async (req, res) => {
  const participanteId = Number(req.body?.participanteId);
  const numeroTax = Number(req.body?.numeroTax);
  if (!Number.isInteger(participanteId) || !Number.isInteger(numeroTax)) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  const participante = (await pool.query('SELECT * FROM participantes WHERE id = $1', [participanteId])).rows[0];
  if (!participante) return res.status(404).json({ error: 'participante_no_encontrado' });
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

export default router;
