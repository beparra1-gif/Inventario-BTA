import { Router } from 'express';
import pool from '../db.js';
import { agruparCapturas } from '../utils/ean13.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { urlFotoMinuscula } from '../utils/fotos.js';

const router = Router();

// agruparCapturas (backend/utils/ean13.js) — reusado tal cual por el
// frontend — espera `descripcion`/`tallaReal`, pero las filas de la tabla
// guardan `descripcion_snapshot`/`talla_real_snapshot`. GET /agrupado ya
// hacía este alias en el SQL; estos otros endpoints devuelven la fila cruda
// (INSERT/SELECT *) así que había que aliasearla acá también, si no el
// nombre y la talla real nunca llegaban a la lista de captura en vivo.
function conAlias(fila) {
  return { ...fila, descripcion: fila.descripcion_snapshot, tallaReal: fila.talla_real_snapshot };
}

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
  res.json(resultado.rows.map(conAlias));
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

  const nuevaConAlias = conAlias(nueva);
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:nueva', nuevaConAlias);
  if (!nueva.reconocido) await revisarAlertaErrores(req.app.locals.io, tax);
  res.status(201).json(nuevaConAlias);
}));

// Cada escaneo/ingreso manual queda como fila propia y así se muestra
// mientras el tax está abierto (en el orden en que se fue capturando, sin
// sumar de una) — recién se agrupa/suma para la vista de un tax cerrado,
// el resumen del admin y el export. Por eso editar/borrar acá es por fila
// puntual (su propio id), no por grupo de codigo+talla.
router.put('/:id', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const cantidad = Number(req.body?.cantidad);
  if (!Number.isInteger(id) || !Number.isInteger(cantidad) || cantidad <= 0) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  const fila = (await pool.query('SELECT tax_id FROM capturas WHERE id = $1', [id])).rows[0];
  if (!fila) return res.status(404).json({ error: 'captura_no_encontrada' });
  const tax = await obtenerTaxConInventario(fila.tax_id);
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });
  if (tax.estado !== 'abierto') return res.status(409).json({ error: 'tax_cerrado' });

  const actualizada = (
    await pool.query(
      'UPDATE capturas SET cantidad = $1, actualizado_en = now() WHERE id = $2 RETURNING *',
      [cantidad, id]
    )
  ).rows[0];

  const actualizadaConAlias = conAlias(actualizada);
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:actualizada', actualizadaConAlias);
  res.json(actualizadaConAlias);
}));

router.delete('/:id', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  if (!Number.isInteger(id)) return res.status(400).json({ error: 'id_invalido' });

  const fila = (await pool.query('SELECT tax_id FROM capturas WHERE id = $1', [id])).rows[0];
  if (!fila) return res.status(404).json({ error: 'captura_no_encontrada' });
  const tax = await obtenerTaxConInventario(fila.tax_id);
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });
  if (tax.estado !== 'abierto') return res.status(409).json({ error: 'tax_cerrado' });

  await pool.query('DELETE FROM capturas WHERE id = $1', [id]);
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('captura:eliminada', { id });
  res.status(204).end();
}));

export default router;
