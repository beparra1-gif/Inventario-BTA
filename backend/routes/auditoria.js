import { Router } from 'express';
import pool from '../db.js';
import { agruparCapturas } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

// Admin, superadmin y auditor pueden todos usar este panel — estas rutas
// son exactamente lo que el auditor puede hacer (consultar y validar tax
// cerrados), así que alcanza con ser cualquier cuenta válida de admins, no
// hace falta un rol específico.
async function exigirCuentaValida(req, res) {
  const id = Number(req.query.auditorId ?? req.body?.auditorId);
  const cuenta = (await pool.query('SELECT id, rol FROM admins WHERE id = $1', [id])).rows[0];
  if (!cuenta) {
    res.status(403).json({ error: 'no_autorizado' });
    return null;
  }
  return cuenta;
}

// Tax de un inventario (cualquier estado) con quién capturó cada uno,
// cuánto se capturó realmente y el estado de validación — para elegir cuál
// revisar. La UI se enfoca en los cerrados (solo esos tiene sentido
// validar), pero se devuelven todos para dar contexto completo.
router.get('/inventarios/:id/taxes', manejarAsync(async (req, res) => {
  if (!(await exigirCuentaValida(req, res))) return;

  const inventarioId = Number(req.params.id);
  const { rows } = await pool.query(
    `SELECT t.id, t.numero_tax, t.nombre, t.estado, t.cantidad_validada, t.validado_en,
            p.alias, p.nombre AS participante_nombre,
            COALESCE(SUM(c.cantidad), 0)::int AS cantidad_capturada
     FROM taxes t
     JOIN participantes p ON p.id = t.participante_id
     LEFT JOIN capturas c ON c.tax_id = t.id
     WHERE t.inventario_id = $1
     GROUP BY t.id, p.id
     ORDER BY t.numero_tax`,
    [inventarioId]
  );
  res.json(rows);
}));

// Detalle de un tax puntual: lo capturado agrupado por código+talla (con
// nombre, para poder revisarlo artículo por artículo antes de confirmar).
router.get('/taxes/:id', manejarAsync(async (req, res) => {
  if (!(await exigirCuentaValida(req, res))) return;

  const id = Number(req.params.id);
  const tax = (
    await pool.query(
      `SELECT t.id, t.numero_tax, t.nombre, t.estado, t.cantidad_validada, t.validado_en, t.inventario_id,
              p.alias, p.nombre AS participante_nombre
       FROM taxes t JOIN participantes p ON p.id = t.participante_id
       WHERE t.id = $1`,
      [id]
    )
  ).rows[0];
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });

  const capturas = (
    await pool.query(
      `SELECT codigo, talla, cantidad, reconocido, descripcion_snapshot AS descripcion, talla_real_snapshot AS "tallaReal"
       FROM capturas WHERE tax_id = $1`,
      [id]
    )
  ).rows;
  const consolidado = agruparCapturas(capturas);
  const cantidadCapturada = consolidado.reduce((acc, i) => acc + i.cantidad, 0);

  res.json({ ...tax, consolidado, cantidadCapturada });
}));

// Confirma (o marca inconsistencia) el total de un tax cerrado: quien
// audita cuenta físicamente y escribe cuánto dio. Si no calza con lo
// capturado, se avisa en vivo a quien esté mirando el panel admin de ese
// inventario, y el capturador lo ve la próxima vez que entre a su perfil
// (queda guardado en el tax, no depende de estar conectado en ese momento).
router.post('/taxes/:id/validar', manejarAsync(async (req, res) => {
  const cuenta = await exigirCuentaValida(req, res);
  if (!cuenta) return;

  const id = Number(req.params.id);
  const cantidadValidada = Number(req.body?.cantidadValidada);
  if (!Number.isInteger(cantidadValidada) || cantidadValidada < 0) {
    return res.status(400).json({ error: 'cantidad_invalida' });
  }

  const tax = (
    await pool.query(
      `SELECT t.*, p.alias, p.nombre AS participante_nombre
       FROM taxes t JOIN participantes p ON p.id = t.participante_id WHERE t.id = $1`,
      [id]
    )
  ).rows[0];
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.estado !== 'cerrado') return res.status(409).json({ error: 'tax_no_esta_cerrado' });

  const { rows } = await pool.query('SELECT COALESCE(SUM(cantidad), 0)::int AS total FROM capturas WHERE tax_id = $1', [id]);
  const cantidadCapturada = rows[0].total;

  const actualizado = (
    await pool.query(
      `UPDATE taxes SET cantidad_validada = $1, validado_en = now(), validado_por_admin_id = $2 WHERE id = $3 RETURNING *`,
      [cantidadValidada, cuenta.id, id]
    )
  ).rows[0];

  const inconsistente = cantidadValidada !== cantidadCapturada;
  if (inconsistente) {
    req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('auditoria:inconsistencia', {
      taxId: id,
      numeroTax: tax.numero_tax,
      alias: tax.alias,
      nombre: tax.participante_nombre,
      cantidadCapturada,
      cantidadValidada,
    });
  }

  res.json({ ...actualizado, cantidadCapturada, inconsistente });
}));

export default router;
