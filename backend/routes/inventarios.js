import { Router } from 'express';
import pool from '../db.js';
import { hashClave, verificarClave } from '../utils/claves.js';
import { agruparCapturas, generarLineasExportacion, nombreArchivoExportacion } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

function sinClaveHash({ clave_hash, ...resto }) {
  return resto;
}

// Admin: crea un inventario para una tienda y define la clave de acceso que
// van a usar los participantes para entrar a capturar.
router.post('/', manejarAsync(async (req, res) => {
  const numeroInventario = String(req.body?.numeroInventario ?? '').trim();
  const edp = Number(req.body?.edp);
  const clave = String(req.body?.clave ?? '');
  const creadoPorAdminId = Number(req.body?.creadoPorAdminId);

  if (!numeroInventario || !Number.isInteger(edp) || !clave || !Number.isInteger(creadoPorAdminId)) {
    return res.status(400).json({ error: 'datos_incompletos' });
  }

  const claveHash = await hashClave(clave);
  try {
    const resultado = await pool.query(
      `INSERT INTO inventarios (numero_inventario, edp, clave_hash, creado_por_admin_id)
       VALUES ($1, $2, $3, $4) RETURNING *`,
      [numeroInventario, edp, claveHash, creadoPorAdminId]
    );
    res.status(201).json(sinClaveHash(resultado.rows[0]));
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'numero_inventario_ya_existe' });
    if (error.code === '23503') return res.status(400).json({ error: 'tienda_no_encontrada' });
    throw error;
  }
}));

// Participante: para saber si hay algo abierto en esa tienda antes de pedir la clave.
router.get('/abierto/:edp', manejarAsync(async (req, res) => {
  const edp = Number(req.params.edp);
  if (!Number.isInteger(edp)) return res.status(400).json({ error: 'edp_invalido' });

  const resultado = await pool.query(
    `SELECT * FROM inventarios WHERE edp = $1 AND estado = 'abierto' ORDER BY creado_en DESC LIMIT 1`,
    [edp]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'sin_inventario_abierto' });
  res.json(sinClaveHash(resultado.rows[0]));
}));

router.post('/:id/verificar-clave', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const clave = String(req.body?.clave ?? '');

  const resultado = await pool.query('SELECT * FROM inventarios WHERE id = $1', [id]);
  const inventario = resultado.rows[0];
  if (!inventario) return res.status(404).json({ error: 'inventario_no_encontrado' });

  const valida = await verificarClave(clave, inventario.clave_hash);
  if (!valida) return res.status(401).json({ error: 'clave_invalida' });

  res.json(sinClaveHash(inventario));
}));

router.post('/:id/cerrar', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const resultado = await pool.query(
    `UPDATE inventarios SET estado = 'cerrado', cerrado_en = now() WHERE id = $1 AND estado = 'abierto' RETURNING *`,
    [id]
  );
  if (!resultado.rows.length) return res.status(409).json({ error: 'inventario_no_abierto' });
  res.json(sinClaveHash(resultado.rows[0]));
}));

// Admin: progreso en vivo — total de unidades por participante/tax y el
// consolidado codigo+talla de todo el inventario (misma agrupación que usa
// la vista de un tax individual, backend/utils/ean13.js).
router.get('/:id/resumen', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);

  const [participantes, capturas] = await Promise.all([
    pool.query(
      `SELECT p.id, p.alias, p.tax_min, p.tax_max,
              t.id AS tax_id, t.numero_tax, t.estado AS tax_estado,
              COALESCE(SUM(c.cantidad), 0)::int AS unidades
       FROM participantes p
       LEFT JOIN taxes t ON t.participante_id = p.id
       LEFT JOIN capturas c ON c.tax_id = t.id
       WHERE p.inventario_id = $1
       GROUP BY p.id, t.id
       ORDER BY p.alias, t.numero_tax`,
      [id]
    ),
    pool.query(
      `SELECT c.codigo, c.talla, c.cantidad, c.reconocido, c.descripcion_snapshot AS descripcion
       FROM capturas c
       JOIN taxes t ON t.id = c.tax_id
       WHERE t.inventario_id = $1`,
      [id]
    ),
  ]);

  res.json({
    participantes: participantes.rows,
    consolidado: agruparCapturas(capturas.rows),
    totalUnidades: capturas.rows.reduce((acc, c) => acc + c.cantidad, 0),
  });
}));

// Genera el .txt legacy (una línea por unidad) y marca el inventario como exportado.
router.get('/:id/exportar', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);

  const inventario = (await pool.query('SELECT * FROM inventarios WHERE id = $1', [id])).rows[0];
  if (!inventario) return res.status(404).json({ error: 'inventario_no_encontrado' });

  const capturas = (
    await pool.query(
      `SELECT c.codigo, c.talla, c.cantidad FROM capturas c
       JOIN taxes t ON t.id = c.tax_id WHERE t.inventario_id = $1`,
      [id]
    )
  ).rows;

  const lineas = generarLineasExportacion({
    numeroInventario: inventario.numero_inventario,
    edp: inventario.edp,
    capturas,
  });
  const nombreArchivo = nombreArchivoExportacion({
    numeroInventario: inventario.numero_inventario,
    edp: inventario.edp,
  });

  await pool.query(`UPDATE inventarios SET estado = 'exportado' WHERE id = $1`, [id]);

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${nombreArchivo}"`);
  res.send(lineas.join('\n'));
}));

export default router;
