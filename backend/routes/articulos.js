import { Router } from 'express';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { urlFotoMinuscula } from '../utils/fotos.js';

const router = Router();

// Usado tanto por captura por escaneo como manual: dado codigo+talla_cruda
// (ya parseados en el frontend con parseEAN13/parseArticuloManual), busca en
// productos_maestro (existe = reconocido) y en reglas_talla la talla real a
// mostrar. El frontend arma el fallback minúscula/mayúscula de la foto,
// fotoUrl acá es solo el primer intento (ver backend/utils/fotos.js).
router.get('/validar', manejarAsync(async (req, res) => {
  const codigo = String(req.query.codigo ?? '').trim();
  const talla = String(req.query.talla ?? '').trim();

  if (!/^\d{7}$/.test(codigo) || !/^\d{2}$/.test(talla)) {
    return res.status(400).json({ error: 'codigo_o_talla_invalidos' });
  }

  const [producto, regla] = await Promise.all([
    pool.query('SELECT descripcion FROM productos_maestro WHERE codigo = $1 AND talla = $2', [codigo, talla]),
    pool.query('SELECT talla_real FROM reglas_talla WHERE prefijo = $1 AND talla_cruda = $2', [codigo, talla]),
  ]);

  res.json({
    codigo,
    tallaCruda: talla,
    reconocido: producto.rows.length > 0,
    descripcion: producto.rows[0]?.descripcion ?? null,
    tallaReal: regla.rows[0]?.talla_real ?? null,
    tallaUnica: talla === '01',
    fotoUrl: urlFotoMinuscula(codigo),
  });
}));

export default router;
