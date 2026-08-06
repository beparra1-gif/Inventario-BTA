import { Router } from 'express';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

router.get('/', manejarAsync(async (req, res) => {
  const busqueda = String(req.query.q ?? '').trim();
  if (busqueda) {
    const resultado = await pool.query(
      `SELECT edp, glosa, distrito, zona, ciudad FROM tiendas
       WHERE glosa ILIKE $1 OR CAST(edp AS TEXT) LIKE $2
       ORDER BY edp LIMIT 30`,
      [`%${busqueda}%`, `${busqueda}%`]
    );
    return res.json(resultado.rows);
  }
  const resultado = await pool.query('SELECT edp, glosa, distrito, zona, ciudad FROM tiendas ORDER BY edp LIMIT 100');
  res.json(resultado.rows);
}));

router.get('/:edp', manejarAsync(async (req, res) => {
  const edp = Number(req.params.edp);
  if (!Number.isInteger(edp)) return res.status(400).json({ error: 'edp_invalido' });

  const resultado = await pool.query('SELECT * FROM tiendas WHERE edp = $1', [edp]);
  if (!resultado.rows.length) return res.status(404).json({ error: 'tienda_no_encontrada' });
  res.json(resultado.rows[0]);
}));

export default router;
