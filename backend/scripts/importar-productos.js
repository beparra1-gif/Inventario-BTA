import fs from 'fs';
import readline from 'readline';
import { pathToFileURL } from 'url';
import pool from '../db.js';

// Fuente real confirmada por el usuario (2026-08-06): I:\Ti\Auditoria\MaestroTiendas\Maestro.csv
// (593.515 filas, separador ";", columnas PRD_CODIGO;PRD_DESCRPOS;PRD_TALLA).
//
// PRD_CODIGO (9 díg.) = codigo (7 díg.) + talla_cruda (2 díg.) — verificado contra
// los mismos dígitos 11-12 que extrae parseEAN13 (backend/utils/ean13.js). Un mismo
// código de 7 dígitos puede repetir talla_cruda con distinta talla_real que otro
// código (la escala depende del artículo) — se probó agrupar por prefijos de 2 a 7
// dígitos y solo el código completo da un mapeo 100% consistente (ver
// data/maestros/README.md). Por eso `reglas_talla.prefijo` acá es el código
// completo, no una familia corta — decisión confirmada por el usuario.
const RUTA_CSV = process.env.PRODUCTOS_CSV_PATH || 'I:\\Ti\\Auditoria\\MaestroTiendas\\Maestro.csv';
const TAMANO_LOTE = 1000;

function parsearLinea(linea) {
  // Formato observado: "PRD_CODIGO";"PRD_DESCRPOS";"PRD_TALLA"; (con ; final
  // que deja un 4to campo vacío). Los valores no traen ";" ni comillas internas.
  const campos = linea.split(';').map((c) => c.trim().replace(/^"|"$/g, ''));
  const [prdCodigo, prdDescripcion, prdTalla] = campos;
  return { prdCodigo, prdDescripcion, prdTalla };
}

function construirValoresSQL(columnasPorFila, filas) {
  const parametros = [];
  const grupos = filas.map((fila, i) => {
    const base = i * columnasPorFila;
    const marcadores = Array.from({ length: columnasPorFila }, (_, j) => `$${base + j + 1}`);
    parametros.push(...fila);
    return `(${marcadores.join(', ')})`;
  });
  return { texto: grupos.join(', '), parametros };
}

async function insertarLoteProductos(lote) {
  if (!lote.length) return;
  const filas = lote.map((p) => [p.codigo, p.talla, p.descripcion]);
  const { texto, parametros } = construirValoresSQL(3, filas);
  await pool.query(
    `INSERT INTO productos_maestro (codigo, talla, descripcion, actualizado_en)
     SELECT codigo, talla, descripcion, now() FROM (VALUES ${texto}) AS v(codigo, talla, descripcion)
     ON CONFLICT (codigo, talla) DO UPDATE SET
       descripcion = EXCLUDED.descripcion,
       actualizado_en = now()`,
    parametros
  );
}

async function insertarLoteReglas(lote) {
  if (!lote.length) return;
  const filas = lote.map((r) => [r.prefijo, r.talla_cruda, r.talla_real, 'Derivado de Maestro.csv (código completo)']);
  const { texto, parametros } = construirValoresSQL(4, filas);
  await pool.query(
    `INSERT INTO reglas_talla (prefijo, talla_cruda, talla_real, descripcion_regla)
     SELECT prefijo, talla_cruda, talla_real, descripcion_regla FROM (VALUES ${texto}) AS v(prefijo, talla_cruda, talla_real, descripcion_regla)
     ON CONFLICT (prefijo, talla_cruda) DO UPDATE SET talla_real = EXCLUDED.talla_real`,
    parametros
  );
}

export async function importarProductos() {
  console.log(`Leyendo ${RUTA_CSV}...`);
  const flujo = readline.createInterface({
    input: fs.createReadStream(RUTA_CSV, { encoding: 'latin1' }),
    crlfDelay: Infinity,
  });

  let esEncabezado = true;
  let procesadas = 0;
  let omitidas = 0;
  let loteProductos = [];
  let loteReglas = [];

  for await (const linea of flujo) {
    if (esEncabezado) {
      esEncabezado = false;
      continue;
    }
    if (!linea.trim()) continue;

    const { prdCodigo, prdDescripcion, prdTalla } = parsearLinea(linea);
    if (!prdCodigo || !/^\d{9}$/.test(prdCodigo) || !prdDescripcion || !prdTalla) {
      omitidas++;
      continue;
    }

    const codigo = prdCodigo.slice(0, 7);
    const tallaCruda = prdCodigo.slice(7, 9);

    loteProductos.push({ codigo, talla: tallaCruda, descripcion: prdDescripcion });
    loteReglas.push({ prefijo: codigo, talla_cruda: tallaCruda, talla_real: prdTalla });
    procesadas++;

    if (loteProductos.length >= TAMANO_LOTE) {
      await insertarLoteProductos(loteProductos);
      await insertarLoteReglas(loteReglas);
      loteProductos = [];
      loteReglas = [];
      if (procesadas % 50000 === 0) console.log(`  ${procesadas} filas procesadas...`);
    }
  }

  await insertarLoteProductos(loteProductos);
  await insertarLoteReglas(loteReglas);

  console.log(`Productos: ${procesadas} filas importadas, ${omitidas} filas omitidas (PRD_CODIGO no tiene 9 dígitos o faltan datos).`);

  return { procesadas, omitidas };
}

// Solo corre el import y cierra el pool cuando se ejecuta directo
// (`npm run importar:productos`) — cuando se importa desde routes/maestros.js
// el pool lo administra el server y debe quedar vivo.
const esCLI = process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href;
if (esCLI) {
  importarProductos()
    .catch((error) => {
      console.error('Error importando productos:', error);
      process.exitCode = 1;
    })
    .finally(() => pool.end());
}
