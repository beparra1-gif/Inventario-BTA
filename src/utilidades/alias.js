// "Javier Mena" -> "jmena": inicial del primer nombre + último apellido,
// todo en minúscula y sin tildes/espacios. Con el que loguea el capturador
// junto a la clave del inventario — el admin solo escribe el nombre.
export function derivarAlias(nombreCompleto) {
  // NFD separa "é" en "e" + acento combinante; soloLetras() se encarga de
  // botar el acento (y cualquier otro no-letra) al filtrar solo a-z.
  const limpio = String(nombreCompleto ?? '').normalize('NFD').trim().toLowerCase();
  const partes = limpio.split(/\s+/).filter(Boolean);
  if (partes.length === 0) return '';
  const soloLetras = (s) => s.replace(/[^a-z]/g, '');
  if (partes.length === 1) return soloLetras(partes[0]);
  return soloLetras(partes[0][0] + partes[partes.length - 1]);
}

// Si el alias derivado ya está en uso (dos personas con la misma inicial +
// apellido) le agrega un número al final hasta que quede libre.
export function aliasDisponible(aliasBase, aliasesExistentes) {
  if (!aliasesExistentes.includes(aliasBase)) return aliasBase;
  let n = 2;
  while (aliasesExistentes.includes(`${aliasBase}${n}`)) n++;
  return `${aliasBase}${n}`;
}
