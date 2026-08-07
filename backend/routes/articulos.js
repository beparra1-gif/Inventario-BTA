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

// Para el ingreso manual: dado solo el código, trae todas las tallas que
// existen para ese artículo en el maestro (cruda + real ya traducida) para
// que el usuario elija de una lista en vez de tener que adivinar/escribir
// la talla cruda de a dos dígitos. Si el código no está en el maestro
// (artículo no reconocido) no hay tallas que ofrecer — el frontend cae de
// vuelta al campo de talla libre en ese caso.
router.get('/tallas', manejarAsync(async (req, res) => {
  const codigo = String(req.query.codigo ?? '').trim();
  if (!/^\d{7}$/.test(codigo)) return res.status(400).json({ error: 'codigo_invalido' });

  const [productos, reglas] = await Promise.all([
    pool.query('SELECT talla, descripcion FROM productos_maestro WHERE codigo = $1 ORDER BY talla', [codigo]),
    pool.query('SELECT talla_cruda, talla_real FROM reglas_talla WHERE prefijo = $1', [codigo]),
  ]);
  if (!productos.rows.length) return res.status(404).json({ error: 'articulo_no_encontrado' });

  const mapaReglas = new Map(reglas.rows.map((r) => [r.talla_cruda, r.talla_real]));
  const tallas = productos.rows.map((p) => ({
    tallaCruda: p.talla,
    tallaReal: mapaReglas.get(p.talla) ?? null,
    tallaUnica: p.talla === '01' && !mapaReglas.has(p.talla),
  }));

  res.json({
    codigo,
    descripcion: productos.rows[0]?.descripcion ?? null,
    fotoUrl: urlFotoMinuscula(codigo),
    tallas,
  });
}));

export default router;
