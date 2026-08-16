import { Router } from 'express';
import multer from 'multer';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { urlFotoMinuscula } from '../utils/fotos.js';
import { registrarEvento } from '../utils/bitacora.js';

const router = Router();
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });

// Cruce de cierre: solo admin/superadmin (no auditor — el auditor valida
// tax uno por uno, esto es una herramienta de gestión aparte).
async function exigirGestor(adminId) {
  if (!Number.isInteger(adminId)) return null;
  const admin = (await pool.query('SELECT id, rol FROM admins WHERE id = $1', [adminId])).rows[0];
  return admin && admin.rol !== 'auditor' ? admin : null;
}

// El archivo trae "codigo;talla;cantidad" (el stock teórico de la tienda,
// el mismo formato que usa el .txt que exporta este sistema) — una línea
// por unidad física o ya con la cantidad sumada, cualquiera de los dos
// casos se soporta sumando todo por código+talla acá mismo.
export function parsearStock(texto) {
  const porClave = new Map();
  for (const lineaCruda of texto.split(/\r?\n/)) {
    const linea = lineaCruda.trim();
    if (!linea) continue;
    const partes = linea.split(';').map((p) => p.trim()).filter(Boolean);
    if (partes.length < 3) continue;
    const [codigo, talla, cantidadTexto] = partes;
    if (!/^\d{1,7}$/.test(codigo) || !/^\d{1,2}$/.test(talla)) continue;
    const cantidad = Number(cantidadTexto);
    if (!Number.isFinite(cantidad) || cantidad <= 0) continue;
    const clave = `${codigo.padStart(7, '0')}-${talla.padStart(2, '0')}`;
    const previo = porClave.get(clave);
    porClave.set(clave, {
      codigo: codigo.padStart(7, '0'),
      talla: talla.padStart(2, '0'),
      cantidad: (previo?.cantidad ?? 0) + cantidad,
    });
  }
  return [...porClave.values()];
}

// Base del cruce: lo capturado (agrupado por código+talla, de todos los tax
// del inventario) contra el stock teórico cargado, por FULL OUTER JOIN para
// no perder artículos que solo están de un lado. Reusada tanto por el
// reporte completo (con foto/descr./detalle por tax) como por el conteo
// rápido de pendientes que usa el gate de "cerrar inventario".
export async function obtenerFilasDiferencia(inventarioId) {
  const { rows } = await pool.query(
    `SELECT COALESCE(cap.codigo, st.codigo) AS codigo,
            COALESCE(cap.talla, st.talla) AS talla,
            COALESCE(cap.cantidad, 0)::int AS cantidad_capturada,
            COALESCE(st.cantidad, 0)::int AS cantidad_stock,
            rev.revisado_en, rev.nota
     FROM (
       SELECT c.codigo, c.talla, SUM(c.cantidad)::int AS cantidad
       FROM capturas c JOIN taxes t ON t.id = c.tax_id
       WHERE t.inventario_id = $1
       GROUP BY c.codigo, c.talla
     ) cap
     FULL OUTER JOIN (
       SELECT codigo, talla, cantidad FROM stock_referencia WHERE inventario_id = $1
     ) st ON st.codigo = cap.codigo AND st.talla = cap.talla
     LEFT JOIN stock_revisiones rev
       ON rev.inventario_id = $1
      AND rev.codigo = COALESCE(cap.codigo, st.codigo)
      AND rev.talla = COALESCE(cap.talla, st.talla)
     ORDER BY COALESCE(cap.codigo, st.codigo), COALESCE(cap.talla, st.talla)`,
    [inventarioId]
  );
  return rows;
}

// Cuántas diferencias (más allá de la tolerancia del inventario) quedan sin
// marcar "revisado" — usado por POST /api/inventarios/:id/cerrar para
// exigir que se hayan validado antes de poder cerrar. Si nunca se cargó un
// stock teórico para este inventario no se exige nada.
export async function contarDiferenciasPendientes(inventarioId, tolerancia = 0) {
  const tieneStock = (
    await pool.query('SELECT 1 FROM stock_referencia WHERE inventario_id = $1 LIMIT 1', [inventarioId])
  ).rows.length > 0;
  if (!tieneStock) return 0;

  const filas = await obtenerFilasDiferencia(inventarioId);
  return filas.filter((f) => Math.abs(f.cantidad_capturada - f.cantidad_stock) > tolerancia && !f.revisado_en).length;
}

// Cada carga reemplaza entera la referencia vigente del inventario — un
// reintento o una corrección del archivo no debe dejar basura mezclada de
// la carga anterior.
router.post('/:inventarioId/cargar', subida.single('archivo'), manejarAsync(async (req, res) => {
  const adminId = Number(req.body?.adminId);
  if (!(await exigirGestor(adminId))) return res.status(403).json({ error: 'requiere_admin' });
  if (!req.file) return res.status(400).json({ error: 'archivo_requerido' });

  const inventarioId = Number(req.params.inventarioId);
  const filas = parsearStock(req.file.buffer.toString('utf8'));
  if (!filas.length) return res.status(400).json({ error: 'archivo_vacio_o_invalido' });

  const cliente = await pool.connect();
  try {
    await cliente.query('BEGIN');
    await cliente.query('DELETE FROM stock_referencia WHERE inventario_id = $1', [inventarioId]);
    for (const f of filas) {
      await cliente.query(
        `INSERT INTO stock_referencia (inventario_id, codigo, talla, cantidad) VALUES ($1, $2, $3, $4)`,
        [inventarioId, f.codigo, f.talla, f.cantidad]
      );
    }
    await cliente.query(
      `UPDATE inventarios SET stock_cargado_en = now(), stock_cargado_por_admin_id = $1 WHERE id = $2`,
      [adminId, inventarioId]
    );
    await cliente.query('COMMIT');
  } catch (error) {
    await cliente.query('ROLLBACK');
    throw error;
  } finally {
    cliente.release();
  }

  registrarEvento({
    inventarioId,
    adminId,
    tipo: 'cargar_stock_teorico',
    detalle: `${filas.length} código+talla cargados`,
  });

  res.json({ filasCargadas: filas.length });
}));

// Cruce completo con foto/descripción y, para cada código+talla con
// diferencia, en qué tax (y quién lo capturó) — para ir directo a
// corregirlo desde el reporte. Incluye la tolerancia del inventario para
// que el frontend aplique el mismo criterio en todas sus estadísticas.
router.get('/:inventarioId/diferencias', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  if (!(await exigirGestor(adminId))) return res.status(403).json({ error: 'requiere_admin' });

  const inventarioId = Number(req.params.inventarioId);

  const inventario = (
    await pool.query('SELECT stock_cargado_en, tolerancia_diferencia FROM inventarios WHERE id = $1', [inventarioId])
  ).rows[0];

  const rows = await obtenerFilasDiferencia(inventarioId);

  const codigos = [...new Set(rows.map((r) => r.codigo))];
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

  const conDiferencia = rows.filter((r) => r.cantidad_capturada !== r.cantidad_stock);
  const detallePorClave = new Map();
  if (conDiferencia.length) {
    const { rows: detalle } = await pool.query(
      `SELECT c.codigo, c.talla, t.id AS tax_id, t.numero_tax, t.nombre AS tax_nombre, t.estado AS tax_estado,
              p.id AS participante_id, p.alias, p.nombre AS participante_nombre,
              SUM(c.cantidad)::int AS cantidad
       FROM capturas c
       JOIN taxes t ON t.id = c.tax_id
       JOIN participantes p ON p.id = t.participante_id
       WHERE t.inventario_id = $1
       GROUP BY c.codigo, c.talla, t.id, p.id
       ORDER BY t.numero_tax`,
      [inventarioId]
    );
    for (const d of detalle) {
      const clave = `${d.codigo}-${d.talla}`;
      const lista = detallePorClave.get(clave) ?? [];
      lista.push({
        taxId: d.tax_id,
        numeroTax: d.numero_tax,
        taxNombre: d.tax_nombre,
        taxEstado: d.tax_estado,
        participanteId: d.participante_id,
        alias: d.alias,
        nombre: d.participante_nombre,
        cantidad: d.cantidad,
      });
      detallePorClave.set(clave, lista);
    }
  }

  const resultado = rows.map((r) => {
    const clave = `${r.codigo}-${r.talla}`;
    return {
      codigo: r.codigo,
      talla: r.talla,
      tallaReal: mapaTallaReal.get(clave) ?? null,
      descripcion: mapaDescripcion.get(clave) ?? null,
      fotoUrl: urlFotoMinuscula(r.codigo),
      cantidadCapturada: r.cantidad_capturada,
      cantidadStock: r.cantidad_stock,
      diferencia: r.cantidad_capturada - r.cantidad_stock,
      revisadoEn: r.revisado_en,
      nota: r.nota,
      tax: detallePorClave.get(clave) ?? [],
    };
  });

  res.json({
    stockCargadoEn: inventario?.stock_cargado_en ?? null,
    tolerancia: inventario?.tolerancia_diferencia ?? 0,
    items: resultado,
  });
}));

router.post('/:inventarioId/revisar', manejarAsync(async (req, res) => {
  const adminId = Number(req.body?.adminId);
  if (!(await exigirGestor(adminId))) return res.status(403).json({ error: 'requiere_admin' });

  const inventarioId = Number(req.params.inventarioId);
  const codigo = String(req.body?.codigo ?? '').trim();
  const talla = String(req.body?.talla ?? '').trim();
  const nota = req.body?.nota ? String(req.body.nota).trim().slice(0, 500) || null : null;
  if (!/^\d{7}$/.test(codigo) || !/^\d{2}$/.test(talla)) return res.status(400).json({ error: 'datos_invalidos' });

  await pool.query(
    `INSERT INTO stock_revisiones (inventario_id, codigo, talla, revisado_en, revisado_por_admin_id, nota)
     VALUES ($1, $2, $3, now(), $4, $5)
     ON CONFLICT (inventario_id, codigo, talla) DO UPDATE SET revisado_en = now(), revisado_por_admin_id = $4, nota = $5`,
    [inventarioId, codigo, talla, adminId, nota]
  );
  registrarEvento({
    inventarioId,
    adminId,
    tipo: 'marcar_revisado',
    detalle: `${codigo}-${talla}${nota ? `: ${nota}` : ''}`,
  });
  res.status(204).end();
}));

// Mismo reporte que /diferencias pero en CSV, para que pérdidas/región
// pueda juntar varios inventarios en una planilla — el .txt de "Exportar
// inventario" es la captura cruda, esto es el análisis ya cruzado.
router.get('/:inventarioId/exportar', manejarAsync(async (req, res) => {
  const adminId = Number(req.query.adminId);
  if (!(await exigirGestor(adminId))) return res.status(403).json({ error: 'requiere_admin' });

  const inventarioId = Number(req.params.inventarioId);
  const inventario = (await pool.query('SELECT numero_inventario FROM inventarios WHERE id = $1', [inventarioId])).rows[0];
  if (!inventario) return res.status(404).json({ error: 'inventario_no_encontrado' });

  const rows = await obtenerFilasDiferencia(inventarioId);
  const codigos = [...new Set(rows.map((r) => r.codigo))];
  const productos = codigos.length
    ? await pool.query('SELECT codigo, talla, descripcion FROM productos_maestro WHERE codigo = ANY($1)', [codigos])
    : { rows: [] };
  const mapaDescripcion = new Map(productos.rows.map((p) => [`${p.codigo}-${p.talla}`, p.descripcion]));

  const encabezado = 'codigo;talla;descripcion;capturado;stock;diferencia;revisado;nota';
  const lineas = rows.map((r) => {
    const descripcion = (mapaDescripcion.get(`${r.codigo}-${r.talla}`) ?? '').replace(/;/g, ',');
    const nota = (r.nota ?? '').replace(/;/g, ',');
    return [
      r.codigo,
      r.talla,
      descripcion,
      r.cantidad_capturada,
      r.cantidad_stock,
      r.cantidad_capturada - r.cantidad_stock,
      r.revisado_en ? 'si' : 'no',
      nota,
    ].join(';');
  });

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="diferencias-${inventario.numero_inventario}.csv"`);
  res.send([encabezado, ...lineas].join('\n'));
}));

export default router;
