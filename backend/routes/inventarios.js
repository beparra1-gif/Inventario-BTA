import { Router } from 'express';
import pool from '../db.js';
import { agruparCapturas, generarLineasExportacion, nombreArchivoExportacion } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

function sinClaveHash({ clave_hash, ...resto }) {
  return resto;
}

async function obtenerAdmin(adminId) {
  if (!Number.isInteger(adminId)) return null;
  return (await pool.query('SELECT rol FROM admins WHERE id = $1', [adminId])).rows[0] ?? null;
}

// Admin: crea un inventario para una tienda. Ya no pide/genera una clave
// compartida — cada capturador tiene la suya propia (ver routes/participantes.js,
// migración 004). El acceso de participantes es solo EDP + su alias/clave personal.
router.post('/', manejarAsync(async (req, res) => {
  const numeroInventario = String(req.body?.numeroInventario ?? '').trim();
  const edp = Number(req.body?.edp);
  const creadoPorAdminId = Number(req.body?.creadoPorAdminId);

  if (!numeroInventario || !Number.isInteger(edp) || !Number.isInteger(creadoPorAdminId)) {
    return res.status(400).json({ error: 'datos_incompletos' });
  }

  try {
    const resultado = await pool.query(
      `INSERT INTO inventarios (numero_inventario, edp, creado_por_admin_id)
       VALUES ($1, $2, $3) RETURNING *`,
      [numeroInventario, edp, creadoPorAdminId]
    );
    res.status(201).json(sinClaveHash(resultado.rows[0]));
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'numero_inventario_ya_existe' });
    if (error.code === '23503') return res.status(400).json({ error: 'tienda_no_encontrada' });
    throw error;
  }
}));

// Admin: "revisar inventarios realizados" — busca por número, glosa o EDP de
// tienda, trae todos los estados (no solo abiertos). Sin query trae los
// últimos 30. Un admin normal solo ve los inventarios que él mismo creó; el
// superadmin ve todos (ver también /recientes, misma regla).
router.get('/', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  const admin = await obtenerAdmin(adminId);
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const busqueda = String(req.query.q ?? '').trim();
  const condiciones = [];
  const parametros = [];
  if (busqueda) {
    parametros.push(`%${busqueda}%`);
    condiciones.push(`(i.numero_inventario ILIKE $${parametros.length} OR t.glosa ILIKE $${parametros.length} OR CAST(i.edp AS TEXT) LIKE $${parametros.length})`);
  }
  if (admin.rol !== 'superadmin') {
    parametros.push(adminId);
    condiciones.push(`i.creado_por_admin_id = $${parametros.length}`);
  }
  const whereSql = condiciones.length ? `WHERE ${condiciones.join(' AND ')}` : '';

  const resultado = await pool.query(
    `SELECT i.id, i.numero_inventario, i.edp, i.estado, i.creado_en, i.cerrado_en, t.glosa AS tienda_glosa
     FROM inventarios i JOIN tiendas t ON t.edp = i.edp
     ${whereSql}
     ORDER BY i.creado_en DESC LIMIT 30`,
    parametros
  );
  res.json(resultado.rows);
}));

// Admin: vista rápida del menú principal — últimos N inventarios con el total
// de unidades capturadas y quiénes participaron, sin tener que entrar a
// "Revisar inventarios" y buscar uno por uno.
router.get('/recientes', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  const admin = await obtenerAdmin(adminId);
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const limite = Math.min(Number(req.query.limite) || 2, 10);
  const parametros = [limite];
  let filtroCreador = '';
  if (admin.rol !== 'superadmin') {
    parametros.push(adminId);
    filtroCreador = 'WHERE i.creado_por_admin_id = $2';
  }

  const resultado = await pool.query(
    `SELECT i.id, i.numero_inventario, i.edp, i.estado, i.creado_en, i.cerrado_en, t.glosa AS tienda_glosa,
            COALESCE(cap.total_unidades, 0)::int AS total_unidades,
            COALESCE(personas.nombres, '{}') AS personas
     FROM inventarios i
     JOIN tiendas t ON t.edp = i.edp
     LEFT JOIN LATERAL (
       SELECT SUM(c.cantidad) AS total_unidades
       FROM capturas c JOIN taxes tx ON tx.id = c.tax_id WHERE tx.inventario_id = i.id
     ) cap ON true
     LEFT JOIN LATERAL (
       SELECT array_agg(DISTINCT COALESCE(p.nombre, p.alias)) AS nombres
       FROM participantes p WHERE p.inventario_id = i.id
     ) personas ON true
     ${filtroCreador}
     ORDER BY i.creado_en DESC
     LIMIT $1`,
    parametros
  );
  res.json(resultado.rows);
}));

// Participante: para saber si hay algo abierto en esa tienda antes de mostrar el login.
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

// Perfiles de captura ya creados para este inventario (por el admin de
// antemano o por participantes que ya entraron) — se usa tanto para que un
// participante elija/reconecte su perfil como para el roster del admin. Con
// ?adminId= de un admin válido, también trae la clave en texto (antes solo
// se podía ver una vez al crearla, ahora el admin la puede consultar
// siempre — ver migración 005).
router.get('/:id/participantes', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const admin = await obtenerAdmin(Number(req.query.adminId));
  const columnas = admin
    ? 'id, alias, nombre, tax_min, tax_max, clave_texto AS clave'
    : 'id, alias, nombre, tax_min, tax_max';
  const resultado = await pool.query(
    `SELECT ${columnas} FROM participantes WHERE inventario_id = $1 ORDER BY alias`,
    [id]
  );
  res.json(resultado.rows);
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

// Cerrado (o ya exportado) no admite más capturas — el admin lo reabre acá
// puntualmente cuando hay que corregir algo, y lo vuelve a cerrar cuando
// termine. Mientras está cerrado nadie puede capturar (ver routes/capturas.js
// y routes/taxes.js), ni siquiera con la clave — solo el admin lo ve/toca.
router.post('/:id/reabrir', manejarAsync(async (req, res) => {
  const adminId = Number(req.body?.adminId);
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const id = Number(req.params.id);
  const resultado = await pool.query(
    `UPDATE inventarios SET estado = 'abierto', cerrado_en = NULL WHERE id = $1 AND estado IN ('cerrado', 'exportado') RETURNING *`,
    [id]
  );
  if (!resultado.rows.length) return res.status(409).json({ error: 'inventario_no_estaba_cerrado' });
  res.json(sinClaveHash(resultado.rows[0]));
}));

// Admin: progreso en vivo — total de unidades por participante/tax y el
// consolidado codigo+talla de todo el inventario (misma agrupación que usa
// la vista de un tax individual, backend/utils/ean13.js).
router.get('/:id/resumen', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);

  const [participantes, capturas] = await Promise.all([
    pool.query(
      `SELECT p.id, p.alias, p.nombre, p.tax_min, p.tax_max,
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
      `SELECT c.codigo, c.talla, c.cantidad, c.reconocido, c.descripcion_snapshot AS descripcion, c.talla_real_snapshot AS "tallaReal"
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

// Genera el .txt (una línea por código+talla, cantidad sumada) y marca el inventario como exportado.
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

// Admin: borra un inventario completo (participantes/taxes/capturas se van
// con él por ON DELETE CASCADE) — para sacar pruebas o cargas por error. No
// se puede deshacer, por eso el frontend pide confirmación antes de llamar.
router.delete('/:id', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  if (!Number.isInteger(adminId)) return res.status(403).json({ error: 'requiere_admin' });
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const id = Number(req.params.id);
  const resultado = await pool.query('DELETE FROM inventarios WHERE id = $1 RETURNING id', [id]);
  if (!resultado.rows.length) return res.status(404).json({ error: 'inventario_no_encontrado' });
  res.status(204).end();
}));

export default router;
