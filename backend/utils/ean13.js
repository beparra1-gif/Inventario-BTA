// Regla confirmada con datos reales de tienda 230 (inventario 22594):
// EAN 2861336000076 -> se descarta dígito 1 (2), dígitos 2-8 (7) son el
// código de producto (8613360), dígitos 9-10 se descartan (00), dígitos
// 11-12 son la talla cruda (07), dígito 13 (verificador) se descarta.
// codigo+talla = 861336007, que coincide exacto con la "COPIA PARA TXT"
// del Excel de captura y con la línea real del INV_BTA_22594_230.txt.

export function parseEAN13(codigoBarras) {
  const valor = String(codigoBarras ?? '').trim();
  if (!/^\d{13}$/.test(valor)) {
    return { valido: false, motivo: 'longitud' };
  }
  const codigoProducto = valor.slice(1, 8);
  const tallaCruda = valor.slice(10, 12);
  return {
    valido: true,
    codigoProducto,
    tallaCruda,
    codigoCombinado: codigoProducto + tallaCruda,
  };
}

// Regla confirmada por el usuario (2026-08-06): la talla cruda "01" se muestra
// como "talla única" en captura manual en vez de la talla real que traduciría
// reglas_talla, porque para varios artículos ese "01" no representa un punto
// real de la escala de tallas.
export function parseArticuloManual(codigoProducto, talla) {
  const codigo = String(codigoProducto ?? '').trim();
  const tallaStr = String(talla ?? '').trim().padStart(2, '0');
  if (!/^\d{7}$/.test(codigo)) return { valido: false, motivo: 'codigo_invalido' };
  if (!/^\d{2}$/.test(tallaStr)) return { valido: false, motivo: 'talla_invalida' };
  return {
    valido: true,
    codigoProducto: codigo,
    tallaCruda: tallaStr,
    codigoCombinado: codigo + tallaStr,
    tallaUnica: tallaStr === '01',
  };
}

// Consolida capturas individuales (una fila por escaneo/ingreso) sumando
// cantidad por (codigo, talla) — usado tanto en la vista de un tax como en
// el total del admin para todo el inventario. El frontend agrega acá mismo
// filas "optimistas" (reconocido: null, mientras espera la respuesta del
// servidor) para que la cantidad suba al toque sin esperar la red — si el
// grupo ya tiene una fila confirmada, se prefiere esa por sobre la
// pendiente para no hacer parpadear datos que ya se conocían.
export function agruparCapturas(capturas) {
  const mapa = new Map();
  for (const c of capturas) {
    const clave = `${c.codigo}-${c.talla}`;
    const actual = mapa.get(clave);
    if (!actual) {
      mapa.set(clave, {
        codigo: c.codigo,
        talla: c.talla,
        cantidad: c.cantidad,
        reconocido: c.reconocido,
        descripcion: c.descripcion ?? null,
        tallaReal: c.tallaReal ?? null,
      });
      continue;
    }
    actual.cantidad += c.cantidad;
    if (actual.reconocido === null && c.reconocido !== null && c.reconocido !== undefined) {
      actual.reconocido = c.reconocido;
      actual.descripcion = c.descripcion ?? null;
      actual.tallaReal = c.tallaReal ?? null;
    }
  }
  return [...mapa.values()];
}

// Una línea por código+talla, con la cantidad total ya sumada (no una línea
// por unidad física repetida) — así si 3 capturadores escanean el mismo
// artículo y talla, el .txt queda compacto en vez de tener la misma línea
// decenas de veces.
export function generarLineasExportacion({ numeroInventario, edp, capturas }) {
  return agruparCapturas(capturas).map(
    (c) => `${numeroInventario};${edp};${c.codigo}${c.talla};${c.cantidad};`
  );
}

export function nombreArchivoExportacion({ numeroInventario, edp }) {
  return `INV_BTA_${numeroInventario}_${edp}.txt`;
}
