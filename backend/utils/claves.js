import bcrypt from 'bcryptjs';
import crypto from 'crypto';

export async function hashClave(clave) {
  return bcrypt.hash(String(clave), 10);
}

export async function verificarClave(clave, hash) {
  if (!clave || !hash) return false;
  return bcrypt.compare(String(clave), hash);
}

// PIN de 6 dígitos: fácil de compartir de palabra o por WhatsApp con el
// equipo de tienda — usado como clave provisoria de un inventario y como
// password temporal de un admin invitado.
export function generarClaveProvisoria() {
  return String(crypto.randomInt(100000, 1000000));
}
