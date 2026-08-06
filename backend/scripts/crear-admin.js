import pool from '../db.js';
import { hashClave } from '../utils/claves.js';

// Alternativa a POST /api/auth/configuracion-inicial para cuando sí hay
// acceso a shell en el servidor (droplet, consola local) — por ejemplo para
// crear un admin adicional sin pasar por otro admin ya logueado.
// Uso: node scripts/crear-admin.js correo@ejemplo.com "clave segura" "Nombre" [admin|superadmin]
const [, , email, password, nombre, rol = 'superadmin'] = process.argv;

if (!email || !password || password.length < 8) {
  console.error('Uso: node scripts/crear-admin.js correo@ejemplo.com "clave (min 8 caracteres)" "Nombre" [admin|superadmin]');
  process.exit(1);
}

const passwordHash = await hashClave(password);
try {
  const { rows } = await pool.query(
    `INSERT INTO admins (email, password_hash, nombre, rol)
     VALUES ($1, $2, $3, $4) RETURNING id, email, rol`,
    [email.trim().toLowerCase(), passwordHash, nombre?.trim() || null, rol === 'superadmin' ? 'superadmin' : 'admin']
  );
  console.log('Admin creado:', rows[0]);
} catch (error) {
  if (error.code === '23505') console.error(`Ya existe un admin con el correo ${email}`);
  else console.error('Error creando admin:', error);
  process.exitCode = 1;
} finally {
  await pool.end();
}
