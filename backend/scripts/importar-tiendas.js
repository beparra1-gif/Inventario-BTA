import XLSX from 'xlsx';
import { pathToFileURL } from 'url';
import pool from '../db.js';

// Fuente real confirmada por el usuario (2026-08-06): hoja "DM+BASE DATOS TIENDA"
// de BASE.xlsx. Trae 66 columnas; acá solo se mapean las que ya existen en la
// tabla `tiendas` (ver backend/migrations/001_init.sql y data/maestros/README.md
// para el resto de columnas disponibles en la fuente pero no importadas aún).
const RUTA_XLSX =
  process.env.TIENDAS_XLSX_PATH ||
  'C:\\Users\\bernardo.parra.BATA\\Bata Shoe Organization\\Operaciones Chile - Documentos\\base\\BASE.xlsx';
const NOMBRE_HOJA = process.env.TIENDAS_XLSX_SHEET || 'DM+BASE DATOS TIENDA';

// EDP + GLOSA TIENDA son la llave de emparejamiento (instrucción del usuario);
// el resto se importa por nombre de columna tal cual viene en la hoja.
const MAPEO_COLUMNAS = {
  edp: 'EDP',
  glosa: 'GLOSA TIENDA',
  distrito: 'DISTRITO',
  jefe_zonal: 'JEFE ZONAL',
  zona: 'ZONA',
  ciudad: 'CIUDAD',
  region: 'REGION',
  ubicacion: 'UBICACIÓN',
  administracion: 'ADMINISTRACION',
  status: 'STATUS',
  cadena_original: 'CADENA ORIGINAL',
};

function normalizarEncabezado(valor) {
  return String(valor ?? '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // quita tildes para matchear "UBICACIÓN" con "UBICACION"
    .trim()
    .toUpperCase();
}

function construirIndiceEncabezados(filaEncabezados) {
  const indice = new Map();
  filaEncabezados.forEach((valor, i) => {
    const clave = normalizarEncabezado(valor);
    if (clave && !indice.has(clave)) indice.set(clave, i);
  });
  return indice;
}

function valorCelda(fila, indice, nombreColumna) {
  const i = indice.get(normalizarEncabezado(nombreColumna));
  if (i === undefined) return null;
  const valor = fila[i];
  if (valor === undefined || valor === null || valor === '') return null;
  return String(valor).trim();
}

export async function importarTiendas() {
  console.log(`Leyendo ${RUTA_XLSX} (hoja "${NOMBRE_HOJA}")...`);
  const wb = XLSX.readFile(RUTA_XLSX, { cellDates: false });
  const hoja = wb.Sheets[NOMBRE_HOJA];
  if (!hoja) {
    throw new Error(
      `No existe la hoja "${NOMBRE_HOJA}" en ${RUTA_XLSX}. Hojas disponibles: ${wb.SheetNames.join(', ')}`
    );
  }

  const filas = XLSX.utils.sheet_to_json(hoja, { header: 1, blankrows: false });
  const [encabezados, ...datos] = filas;
  const indice = construirIndiceEncabezados(encabezados);

  for (const columna of Object.values(MAPEO_COLUMNAS)) {
    if (!indice.has(normalizarEncabezado(columna))) {
      throw new Error(`Falta la columna "${columna}" en la hoja "${NOMBRE_HOJA}"`);
    }
  }

  let insertadas = 0;
  let actualizadas = 0;
  let omitidas = 0;
  const advertenciasGlosa = [];

  for (const fila of datos) {
    const edpCrudo = valorCelda(fila, indice, MAPEO_COLUMNAS.edp);
    const edp = Number(edpCrudo);
    const glosa = valorCelda(fila, indice, MAPEO_COLUMNAS.glosa);

    if (!edpCrudo || !Number.isInteger(edp) || !glosa) {
      omitidas++;
      continue;
    }

    const valores = {
      edp,
      glosa,
      distrito: valorCelda(fila, indice, MAPEO_COLUMNAS.distrito),
      jefe_zonal: valorCelda(fila, indice, MAPEO_COLUMNAS.jefe_zonal),
      zona: valorCelda(fila, indice, MAPEO_COLUMNAS.zona),
      ciudad: valorCelda(fila, indice, MAPEO_COLUMNAS.ciudad),
      region: valorCelda(fila, indice, MAPEO_COLUMNAS.region),
      ubicacion: valorCelda(fila, indice, MAPEO_COLUMNAS.ubicacion),
      administracion: valorCelda(fila, indice, MAPEO_COLUMNAS.administracion),
      status: valorCelda(fila, indice, MAPEO_COLUMNAS.status),
      cadena_original: valorCelda(fila, indice, MAPEO_COLUMNAS.cadena_original),
    };

    const existente = await pool.query('SELECT glosa FROM tiendas WHERE edp = $1', [edp]);
    if (existente.rows.length && existente.rows[0].glosa !== glosa) {
      advertenciasGlosa.push(
        `EDP ${edp}: glosa en BD ("${existente.rows[0].glosa}") difiere de la fuente ("${glosa}")`
      );
    }

    const resultado = await pool.query(
      `INSERT INTO tiendas (edp, glosa, distrito, jefe_zonal, zona, ciudad, region, ubicacion, administracion, status, cadena_original, actualizado_en)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, now())
       ON CONFLICT (edp) DO UPDATE SET
         glosa = EXCLUDED.glosa,
         distrito = EXCLUDED.distrito,
         jefe_zonal = EXCLUDED.jefe_zonal,
         zona = EXCLUDED.zona,
         ciudad = EXCLUDED.ciudad,
         region = EXCLUDED.region,
         ubicacion = EXCLUDED.ubicacion,
         administracion = EXCLUDED.administracion,
         status = EXCLUDED.status,
         cadena_original = EXCLUDED.cadena_original,
         actualizado_en = now()
       RETURNING (xmax = 0) AS es_nueva`,
      [
        valores.edp,
        valores.glosa,
        valores.distrito,
        valores.jefe_zonal,
        valores.zona,
        valores.ciudad,
        valores.region,
        valores.ubicacion,
        valores.administracion,
        valores.status,
        valores.cadena_original,
      ]
    );

    if (resultado.rows[0].es_nueva) insertadas++;
    else actualizadas++;
  }

  console.log(`Tiendas: ${insertadas} insertadas, ${actualizadas} actualizadas, ${omitidas} filas omitidas (sin EDP/glosa válidos).`);
  if (advertenciasGlosa.length) {
    console.log(`\n${advertenciasGlosa.length} advertencia(s) de glosa distinta para el mismo EDP:`);
    advertenciasGlosa.forEach((a) => console.log(`  - ${a}`));
  }

  return { insertadas, actualizadas, omitidas, advertenciasGlosa };
}

// Solo corre el import y cierra el pool cuando se ejecuta directo
// (`npm run importar:tiendas`) — cuando se importa desde routes/maestros.js
// el pool lo administra el server y debe quedar vivo.
const esCLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCLI) {
  importarTiendas()
    .catch((error) => {
      console.error('Error importando tiendas:', error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
