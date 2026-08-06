// Mismo origen de fotos que buscador-precio (Documents/GitHub/buscador-precio/fotos,
// repo público github.com/beparra1-gif/buscador-precio) — decisión confirmada
// por el usuario (2026-08-06): en vez de duplicar ~400MB de imágenes en este
// repo o depender de una carpeta que solo existe en un computador (lo que
// rompía en cualquier servidor real), se apunta directo al
// raw.githubusercontent.com de ese repo. Misma lógica de fallback que usa
// buscador-precio del lado del cliente: probar minúscula, si falla probar
// mayúscula (se resuelve en el frontend con <img onError>, ver
// src/pantallas/PantallaCaptura.jsx).
const BASE_FOTOS = 'https://raw.githubusercontent.com/beparra1-gif/buscador-precio/main/fotos';

export function urlFotoMinuscula(codigo) {
  return `${BASE_FOTOS}/${codigo}.jpg`;
}

export function urlFotoMayuscula(codigo) {
  return `${BASE_FOTOS}/${codigo}.JPG`;
}
