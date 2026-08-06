import { Router } from 'express';
import pool from '../db.js';
import { agruparCapturas } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { urlFotoMinuscula } from '../utils/fotos.js';

const router = Router();

router.get('/', manejarAsync(async (req, res) => {
  const taxId = Number(req.query.taxId);
  if (!Number.isInteger(taxId)) return res.status(400).json({ error: 'taxId_requerido' });
  const resultado = await pool.query('SELECT * FROM capturas WHERE tax_id = $1 ORDER BY creado_en DESC', [taxId]);
  res.json(resultado.rows);
}));

router.get('/agrupado', manejarAsync(async (req, res) => {
  const taxId = Number(req.query.taxId);
  if (!Number.isInteger(taxId)) return res.status(400).json({ error: 'taxId_requerido' });
  const filas = (
    await pool.query(
      `SELECT codigo, talla, cantidad, reconocido, descripcion_snapshot AS descripcion FROM capturas WHERE tax_id = $1`,
      [taxId]
    )
  ).rows;
  res.json(agruparCapturas(filas));
}));

// codigo/talla ya vienen parseados desde el frontend (parseEAN13 o
// parseArticuloManual) y validados contra GET /api/articulos/validar antes
// de llegar acá; este endpoint vuelve a resolver descripcion/reconocido
// server-side para el snapshot, no confía en lo que mande el cliente.
router.post('/', manejarAsync(async (req, res) => {
  const taxId = Number(req.body?.taxId);
  const codigo = String(req.body?.codigo ?? '').trim();
  const talla = String(req.body?.talla ?? '').trim();
  const eanOriginal = req.body?.ean13Original ? String(req.body.ean13Original).trim() : null;
  const cantidad = Number(req.body?.cantidad ?? 1);
  const origen = req.body?.origen === 'manual' ? 'manual' : 'scan';

  if (!Number.isInteger(taxId) || !/^\d{7}$/.test(codigo) || !/^\d{2}$/.test(talla) || !Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  const tax = (await pool.query('SELECT * FROM taxes WHERE id = $1', [taxId])).rows[0];
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.estado !== 'abierto') return res.status(409).json({ error: 'tax_cerrado' });

  const producto = (
    await pool.query('SELECT descripcion FROM productos_maestro WHERE codigo = $1 AND talla = $2', [codigo, talla])
  ).rows[0];

  const nueva = (
    await pool.query(
      `INSERT INTO capturas (tax_id, codigo, talla, ean13_original, cantidad, reconocido, descripcion_snapshot, foto_url_snapshot, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
      [
        taxId,
        codigo,
        talla,
        eanOriginal,
        cantidad,
        Boolean(producto),
        producto?.descripcion ?? null,
        urlFotoMinuscula(codigo),
        origen,
      ]
    )
  ).rows[0];

  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:nueva', nueva);
  res.status(201).json(nueva);
}));

router.put('/:id', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isInteger(cantidad) || cantidad <= 0) return res.status(400).json({ error: 'cantidad_invalida' });

  const resultado = await pool.query(
    `UPDATE capturas SET cantidad = $1, actualizado_en = now() WHERE id = $2 RETURNING *`,
    [cantidad, id]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'captura_no_encontrada' });

  const captura = resultado.rows[0];
  const tax = (await pool.query('SELECT inventario_id FROM taxes WHERE id = $1', [captura.tax_id])).rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:actualizada', captura);
  res.json(captura);
}));

router.delete('/:id', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const resultado = await pool.query(
    `DELETE FROM capturas WHERE id = $1 RETURNING tax_id`,
    [id]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'captura_no_encontrada' });

  const tax = (await pool.query('SELECT inventario_id FROM taxes WHERE id = $1', [resultado.rows[0].tax_id])).rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:eliminada', { id });
  res.status(204).end();
}));

export default router;
