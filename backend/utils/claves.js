import bcrypt from 'bcryptjs';

export async function hashClave(clave) {
  return bcrypt.hash(String(clave), 10);
}

export async function verificarClave(clave, hash) {
  if (!clave || !hash) return false;
  return bcrypt.compare(String(clave), hash);
}
