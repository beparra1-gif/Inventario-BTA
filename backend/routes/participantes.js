import { Router } from 'express';
import pool from '../db.js';
import { hashClave, verificarClave, generarClaveProvisoria } from '../utils/claves.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

const RANGO_TAX = 100;

function sinClaveHash({ clave_hash, clave_texto, ...resto }) {
  return resto;
}

// Alias nuevo -> siguiente rango de 100 disponible (1-100, 101-200, ...) +
// clave numérica propia (para que cada persona tenga la suya, no una
// compartida). Alias existente -> se reusa tal cual (la clave ya asignada
// no se toca) para poder seguir capturando desde otro dispositivo — se
// devuelve su clave_texto guardada, no una nueva.
async function obtenerOCrearParticipante(cliente, inventarioId, alias, nombre = null) {
  const existente = (
    await cliente.query('SELECT * FROM participantes WHERE inventario_id = $1 AND alias = $2', [
      inventarioId,
      alias,
    ])
  ).rows[0];
  if (existente) return { participante: existente, claveEnClaro: existente.clave_texto };

  const { rows } = await cliente.query(
    'SELECT COUNT(*)::int AS total FROM participantes WHERE inventario_id = $1',
    [inventarioId]
  );
  const taxMin = rows[0].total * RANGO_TAX + 1;
  const taxMax = taxMin + RANGO_TAX - 1;

  const claveEnClaro = generarClaveProvisoria();
  const claveHash = await hashClave(claveEnClaro);

  const participante = (
    await cliente.query(
      `INSERT INTO participantes (inventario_id, alias, nombre, tax_min, tax_max, clave_hash, clave_texto)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [inventarioId, alias, nombre, taxMin, taxMax, claveHash, claveEnClaro]
    )
  ).rows[0];

  return { participante, claveEnClaro };
}

// Login del capturador: sigla (alias) + su clave numérica personal — ya no
// se pide la clave compartida del inventario, cada perfil tiene la suya
// (ver migración 004) para que nadie use por error el perfil de otro. No
// exige que el inventario esté "abierto": si lo cerró el admin, el
// capturador igual puede entrar a ver en modo solo lectura — cada endpoint
// que sí escribe (abrir tax, capturar, etc.) rechaza aparte si corresponde.
router.post('/login', manejarAsync(async (req, res) => {
  const inventarioId = Number(req.body?.inventarioId);
  const alias = String(req.body?.alias ?? '').trim();
  const clave = String(req.body?.clave ?? '');

  if (!Number.isInteger(inventarioId) || !alias || !clave) {
    return res.status(400).json({ error: 'datos_incompletos' });
  }

  const inventario = (await pool.query('SELECT id FROM inventarios WHERE id = $1', [inventarioId])).rows[0];
  if (!inventario) return res.status(404).json({ error: 'inventario_no_encontrado' });

  const participante = (
    await pool.query('SELECT * FROM participantes WHERE inventario_id = $1 AND alias = $2', [inventarioId, alias])
  ).rows[0];
  if (!participante || !(await verificarClave(clave, participante.clave_hash))) {
    return res.status(401).json({ error: 'credenciales_invalidas' });
  }

  res.json(sinClaveHash(participante));
}));

// El admin arma de antemano la lista de perfiles de captura (nombre
// completo -> alias derivado en el frontend) para que no tengan que
// inventarse nada al llegar — mismo rango automático de 100 tax. No pide
// clave: quien llama ya está autenticado como admin.
router.post('/admin', manejarAsync(async (req, res) => {
  const inventarioId = Number(req.body?.inventarioId);
  const adminId = Number(req.body?.adminId);
  const alias = String(req.body?.alias ?? '').trim();
  const nombre = req.body?.nombre ? String(req.body.nombre).trim() : null;

  if (!Number.isInteger(inventarioId) || !alias) return res.status(400).json({ error: 'datos_incompletos' });

  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    const { participante, claveEnClaro } = await obtenerOCrearParticipante(cliente, inventarioId, alias, nombre);
    await cliente.query('COMMIT');
    res.status(201).json({ ...sinClaveHash(participante), clave: claveEnClaro });
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }
}));

// El admin resetea la clave de alguien (perdida, olvidada, o de un perfil
// creado antes de que la clave quedara guardada en texto — ver migración
// 005) sin tener que borrar el perfil completo y perder todo lo que ya
// capturó: solo cambia la clave, el resto queda intacto.
router.post('/:id/regenerar-clave', manejarAsync(async (req, res) => {
  const adminId = Number(req.body?.adminId);
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const id = Number(req.params.id);
  const claveEnClaro = generarClaveProvisoria();
  const claveHash = await hashClave(claveEnClaro);
  const resultado = await pool.query(
    'UPDATE participantes SET clave_hash = $1, clave_texto = $2 WHERE id = $3 RETURNING *',
    [claveHash, claveEnClaro, id]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'participante_no_encontrado' });
  res.json({ ...sinClaveHash(resultado.rows[0]), clave: claveEnClaro });
}));

// El admin quita a alguien del roster — se lleva sus taxes/capturas
// (ON DELETE CASCADE) porque el alias deja de existir, así que si esa
// persona ya había capturado algo hay que avisarle antes de confirmar
// (lo hace el frontend, esto solo ejecuta).
router.delete('/:id', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  const admin = (await pool.query('SELECT id FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) return res.status(403).json({ error: 'requiere_admin' });

  const id = Number(req.params.id);
  const resultado = await pool.query('DELETE FROM participantes WHERE id = $1 RETURNING id', [id]);
  if (!resultado.rows.length) return res.status(404).json({ error: 'participante_no_encontrado' });
  res.status(204).end();
}));

// Lo que ve el participante al volver a su perfil: total capturado, detalle
// por cada tax que haya tocado (para que vea de un vistazo qué lleva en
// cada número) y cuántos artículos no reconocidos (y su suma) para saber
// si tiene que revisar algo antes de seguir.
router.get('/:id/resumen', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const [totales, porTax] = await Promise.all([
    pool.query(
      `SELECT
         COALESCE(SUM(c.cantidad), 0)::int AS total_unidades,
         COALESCE(SUM(c.cantidad) FILTER (WHERE c.reconocido = false), 0)::int AS unidades_no_reconocidas,
         COUNT(*) FILTER (WHERE c.reconocido = false)::int AS filas_no_reconocidas
       FROM taxes t
       LEFT JOIN capturas c ON c.tax_id = t.id
       WHERE t.participante_id = $1`,
      [id]
    ),
    pool.query(
      `SELECT t.id AS tax_id, t.numero_tax, t.estado,
              COALESCE(SUM(c.cantidad), 0)::int AS unidades,
              COALESCE(SUM(c.cantidad) FILTER (WHERE c.reconocido = false), 0)::int AS unidades_no_reconocidas
       FROM taxes t
       LEFT JOIN capturas c ON c.tax_id = t.id
       WHERE t.participante_id = $1
       GROUP BY t.id
       ORDER BY t.numero_tax`,
      [id]
    ),
  ]);
  res.json({
    totalUnidades: totales.rows[0].total_unidades,
    unidadesNoReconocidas: totales.rows[0].unidades_no_reconocidas,
    filasNoReconocidas: totales.rows[0].filas_no_reconocidas,
    taxes: porTax.rows,
  });
}));

// El capturador pide que el admin le reabra algo — típicamente porque el
// inventario está cerrado (modo solo lectura) y necesita corregir un tax.
// No cambia nada en la base, solo avisa por Socket.io a quien esté mirando
// ese inventario en el panel admin en ese momento.
router.post('/:id/solicitar-modificacion', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const numeroTax = Number.isInteger(Number(req.body?.numeroTax)) && req.body?.numeroTax != null ? Number(req.body.numeroTax) : null;

  const participante = (await pool.query('SELECT * FROM participantes WHERE id = $1', [id])).rows[0];
  if (!participante) return res.status(404).json({ error: 'participante_no_encontrado' });

  req.app.locals.io.to(`inventario:${participante.inventario_id}`).emit('solicitud:modificar', {
    participanteId: participante.id,
    alias: participante.alias,
    nombre: participante.nombre,
    numeroTax,
  });
  res.status(204).end();
}));

export default router;
