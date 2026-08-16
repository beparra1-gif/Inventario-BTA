import { Router } from 'express';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

async function exigirCuentaValida(req, res) {
  const id = Number(req.query.adminId ?? req.body?.adminId);
  const cuenta = (await pool.query('SELECT id FROM admins WHERE id = $1', [id])).rows[0];
  if (!cuenta) {
    res.status(403).json({ error: 'no_autorizado' });
    return null;
  }
  return cuenta;
}

// Últimas notificaciones (cualquier cuenta de admins puede verlas — el
// estado de leído es compartido entre todos, no por persona).
router.get('/', manejarAsync(async (req, res) => {
  if (!(await exigirCuentaValida(req, res))) return;
  const { rows } = await pool.query(
    `SELECT n.id, n.tipo, n.mensaje, n.inventario_id, n.leido_en, n.creado_en,
            i.numero_inventario
     FROM notificaciones n
     LEFT JOIN inventarios i ON i.id = n.inventario_id
     ORDER BY n.creado_en DESC
     LIMIT 50`
  );
  res.json(rows);
}));

router.post('/marcar-leidas', manejarAsync(async (req, res) => {
  if (!(await exigirCuentaValida(req, res))) return;
  await pool.query(`UPDATE notificaciones SET leido_en = now() WHERE leido_en IS NULL`);
  res.status(204).end();
}));

export default router;
