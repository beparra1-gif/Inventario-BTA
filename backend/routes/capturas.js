import { Router } from 'express';
import pool from '../db.js';
import { agruparCapturas } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { urlFotoMinuscula } from '../utils/fotos.js';

const router = Router();

// Un tax puede seguir "abierto" en la fila de taxes aunque el admin ya haya
// cerrado el inventario completo (cerrar inventario no cascadea a los taxes)
// — sin este chequeo, alguien con la app abierta en otro dispositivo podría
// seguir agregando capturas después del cierre y distorsionar el conteo.
async function obtenerTaxConInventario(taxId) {
  const { rows } = await pool.query(
    `SELECT t.*, i.estado AS inventario_estado
     FROM taxes t JOIN inventarios i ON i.id = t.inventario_id
     WHERE t.id = $1`,
    [taxId]
  );
  return rows[0] ?? null;
}

// Avisa al admin (mientras esté mirando este inventario) cada vez que un
// capturador suma otros UMBRAL artículos no reconocidos en total — no en
// cada uno, para no inundarlo de alertas si la persona sigue escaneando
// cosas que genuinamente no están en el maestro.
const UMBRAL_ALERTA_ERRORES = 5;

async function revisarAlertaErrores(io, tax) {
  const { rows } = await pool.query(
    `SELECT p.alias, p.nombre,
            COALESCE(SUM(c.cantidad) FILTER (WHERE c.reconocido = false), 0)::int AS total_no_reconocidas
     FROM participantes p
     LEFT JOIN taxes t ON t.participante_id = p.id
     LEFT JOIN capturas c ON c.tax_id = t.id
     WHERE p.id = $1
     GROUP BY p.id`,
    [tax.participante_id]
  );
  const total = rows[0]?.total_no_reconocidas ?? 0;
  if (total > 0 && total % UMBRAL_ALERTA_ERRORES === 0) {
    io.to(`inventario:${tax.inventario_id}`).emit('alerta:capturador-errores', {
      participanteId: tax.participante_id,
      alias: rows[0].alias,
      nombre: rows[0].nombre,
      totalErrores: total,
    });
  }
}

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
      `SELECT codigo, talla, cantidad, reconocido, descripcion_snapshot AS descripcion, talla_real_snapshot AS "tallaReal"
       FROM capturas WHERE tax_id = $1`,
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

  const tax = await obtenerTaxConInventario(taxId);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });
  if (tax.estado !== 'abierto') return res.status(409).json({ error: 'tax_cerrado' });

  const [producto, regla] = await Promise.all([
    pool.query('SELECT descripcion FROM productos_maestro WHERE codigo = $1 AND talla = $2', [codigo, talla]),
    pool.query('SELECT talla_real FROM reglas_talla WHERE prefijo = $1 AND talla_cruda = $2', [codigo, talla]),
  ]);

  const nueva = (
    await pool.query(
      `INSERT INTO capturas (tax_id, codigo, talla, ean13_original, cantidad, reconocido, descripcion_snapshot, foto_url_snapshot, talla_real_snapshot, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) RETURNING *`,
      [
        taxId,
        codigo,
        talla,
        eanOriginal,
        cantidad,
        Boolean(producto.rows[0]),
        producto.rows[0]?.descripcion ?? null,
        urlFotoMinuscula(codigo),
        regla.rows[0]?.talla_real ?? null,
        origen,
      ]
    )
  ).rows[0];

  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:nueva', nueva);
  if (!nueva.reconocido) await revisarAlertaErrores(req.app.locals.io, tax);
  res.status(201).json(nueva);
}));

// La lista de captura trabaja agrupada (codigo+talla), pero cada escaneo
// quedó como fila propia — estos dos endpoints operan sobre el grupo
// completo de una vez (editar cantidad total / borrar todo) en vez de que
// el cliente tenga que manejar filas individuales, así "editar" y
// "eliminar" son un solo tap. Van *antes* de las rutas /:id para que
// Express no interprete "grupo" como un id.
router.delete('/grupo', manejarAsync(async (req, res) => {
  const taxId = Number(req.query.taxId);
  const codigo = String(req.query.codigo ?? '');
  const talla = String(req.query.talla ?? '');
  if (!Number.isInteger(taxId) || !codigo || !talla) return res.status(400).json({ error: 'datos_invalidos' });

  const tax = await obtenerTaxConInventario(taxId);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });

  await pool.query('DELETE FROM capturas WHERE tax_id = $1 AND codigo = $2 AND talla = $3', [taxId, codigo, talla]);
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:eliminada', { codigo, talla });
  res.status(204).end();
}));

router.put('/grupo', manejarAsync(async (req, res) => {
  const taxId = Number(req.body?.taxId);
  const codigo = String(req.body?.codigo ?? '');
  const talla = String(req.body?.talla ?? '');
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isInteger(taxId) || !codigo || !talla || !Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  const tax = await obtenerTaxConInventario(taxId);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });

  const filaExistente = (
    await pool.query(
      'SELECT * FROM capturas WHERE tax_id = $1 AND codigo = $2 AND talla = $3 ORDER BY creado_en DESC LIMIT 1',
      [taxId, codigo, talla]
    )
  ).rows[0];
  if (!filaExistente) return res.status(404).json({ error: 'grupo_no_encontrado' });

  // Colapsa todas las filas del grupo en una sola con la cantidad exacta
  // que se pidió — se pierde el detalle de escaneo por fila (no se muestra
  // en la UI igual), pero mantiene reconocido/descripcion/foto/talla real.
  await pool.query('DELETE FROM capturas WHERE tax_id = $1 AND codigo = $2 AND talla = $3', [taxId, codigo, talla]);
  const nueva = (
    await pool.query(
      `INSERT INTO capturas (tax_id, codigo, talla, cantidad, reconocido, descripcion_snapshot, foto_url_snapshot, talla_real_snapshot, origen)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, 'manual') RETURNING *`,
      [
        taxId,
        codigo,
        talla,
        cantidad,
        filaExistente.reconocido,
        filaExistente.descripcion_snapshot,
        filaExistente.foto_url_snapshot,
        filaExistente.talla_real_snapshot,
      ]
    )
  ).rows[0];

  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:actualizada', nueva);
  res.json(nueva);
}));

export default router;
