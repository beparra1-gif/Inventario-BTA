import { Router } from 'express';
import pool from '../db.js';
import { agruparCapturas } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { crearNotificacion } from '../utils/notificaciones.js';
import { registrarEvento } from '../utils/bitacora.js';
import { obtenerFilasDiferencia } from './stock.js';
import { urlFotoMinuscula } from '../utils/fotos.js';

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
    crearNotificacion({
      tipo: 'auditoria-inconsistencia',
      mensaje: `Tax ${tax.numero_tax} de ${tax.participante_nombre || tax.alias} no calza — capturado ${cantidadCapturada}, validado ${cantidadValidada}`,
      inventarioId: tax.inventario_id,
    });
  }
  registrarEvento({
    inventarioId: tax.inventario_id,
    adminId: cuenta.id,
    tipo: 'validar_tax',
    detalle: `Tax ${tax.numero_tax}: validado en ${cantidadValidada}, capturado ${cantidadCapturada}${inconsistente ? ' (inconsistente)' : ''}`,
  });

  res.json({ ...actualizado, cantidadCapturada, inconsistente });
}));

// Cruza TODOS los inventarios de una tienda que hayan tenido un stock
// teórico cargado (en cualquier estado) y muestra qué código+talla se
// repite con diferencia entre ellos — para pillar patrones (mismo SKU
// fallando inventario tras inventario) que revisando uno por uno no se ve.
router.get('/historico/:edp', manejarAsync(async (req, res) => {
  if (!(await exigirCuentaValida(req, res))) return;

  const edp = Number(req.params.edp);
  if (!Number.isInteger(edp)) return res.status(400).json({ error: 'edp_invalido' });

  const inventarios = (
    await pool.query(
      `SELECT id, numero_inventario, tolerancia_diferencia, creado_en, estado
       FROM inventarios WHERE edp = $1 AND stock_cargado_en IS NOT NULL ORDER BY creado_en`,
      [edp]
    )
  ).rows;

  const mapa = new Map();
  for (const inv of inventarios) {
    const filas = await obtenerFilasDiferencia(inv.id);
    for (const f of filas) {
      const diferencia = f.cantidad_capturada - f.cantidad_stock;
      if (Math.abs(diferencia) <= (inv.tolerancia_diferencia ?? 0)) continue;
      const clave = `${f.codigo}-${f.talla}`;
      const entrada = mapa.get(clave) ?? { codigo: f.codigo, talla: f.talla, apariciones: 0, sumaDiferencia: 0, inventarios: [] };
      entrada.apariciones += 1;
      entrada.sumaDiferencia += diferencia;
      entrada.inventarios.push({
        inventarioId: inv.id,
        numeroInventario: inv.numero_inventario,
        estado: inv.estado,
        fecha: inv.creado_en,
        diferencia,
      });
      mapa.set(clave, entrada);
    }
  }

  const codigos = [...new Set([...mapa.values()].map((e) => e.codigo))];
  const [productos, reglas] = await Promise.all([
    codigos.length
      ? pool.query('SELECT codigo, talla, descripcion FROM productos_maestro WHERE codigo = ANY($1)', [codigos])
      : Promise.resolve({ rows: [] }),
    codigos.length
      ? pool.query('SELECT prefijo, talla_cruda, talla_real FROM reglas_talla WHERE prefijo = ANY($1)', [codigos])
      : Promise.resolve({ rows: [] }),
  ]);
  const mapaDescripcion = new Map(productos.rows.map((p) => [`${p.codigo}-${p.talla}`, p.descripcion]));
  const mapaTallaReal = new Map(reglas.rows.map((r) => [`${r.prefijo}-${r.talla_cruda}`, r.talla_real]));

  const articulos = [...mapa.values()]
    .map((e) => ({
      ...e,
      tallaReal: mapaTallaReal.get(`${e.codigo}-${e.talla}`) ?? null,
      descripcion: mapaDescripcion.get(`${e.codigo}-${e.talla}`) ?? null,
      fotoUrl: urlFotoMinuscula(e.codigo),
    }))
    .sort((a, b) => b.apariciones - a.apariciones || Math.abs(b.sumaDiferencia) - Math.abs(a.sumaDiferencia));

  res.json({ inventariosAnalizados: inventarios.length, articulos });
}));

export default router;
