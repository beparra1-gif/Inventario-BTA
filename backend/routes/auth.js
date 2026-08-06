import { Router } from 'express';
import pool from '../db.js';
import { hashClave, verificarClave } from '../utils/claves.js';
import { manejarAsync } from '../utils/manejarAsync.js';

const router = Router();

function datosPublicos(admin) {
  return {
    id: admin.id,
    email: admin.email,
    nombre: admin.nombre,
    rol: admin.rol,
    debeCambiarPassword: admin.debe_cambiar_password,
  };
}

// Login de superadmin/admin (mismo formulario para ambos, distinguidos por
// `rol`). Los usuarios de captura no pasan por acá: entran con tienda+clave
// del inventario (ver routes/inventarios.js).
router.post('/login', manejarAsync(async (req, res) => {
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  if (!email || !password) return res.status(400).json({ error: 'email_o_password_faltante' });

  const resultado = await pool.query('SELECT * FROM admins WHERE email = $1', [email]);
  const admin = resultado.rows[0];
  if (!admin || !(await verificarClave(password, admin.password_hash))) {
    return res.status(401).json({ error: 'credenciales_invalidas' });
  }

  await pool.query('UPDATE admins SET ultimo_uso_en = now() WHERE id = $1', [admin.id]);
  res.json(datosPublicos(admin));
}));

// La tabla admins no trae ninguna fila seed (a propósito, no hay una
// contraseña de fábrica escrita en el código/migraciones). Este endpoint es
// la única forma de crear el primer superadmin después de desplegar, y se
// autodesactiva apenas exista un admin: no sirve para nada más que el
// arranque en limpio.
router.get('/necesita-configuracion', manejarAsync(async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM admins');
  res.json({ necesitaConfiguracion: rows[0].total === 0 });
}));

router.post('/configuracion-inicial', manejarAsync(async (req, res) => {
  const { rows } = await pool.query('SELECT COUNT(*)::int AS total FROM admins');
  if (rows[0].total > 0) return res.status(409).json({ error: 'ya_configurado' });

  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const password = String(req.body?.password ?? '');
  const nombre = String(req.body?.nombre ?? '').trim() || null;
  if (!email || password.length < 8) {
    return res.status(400).json({ error: 'email_o_password_invalidos' });
  }

  const passwordHash = await hashClave(password);
  const admin = (
    await pool.query(
      `INSERT INTO admins (email, password_hash, nombre, rol, debe_cambiar_password)
       VALUES ($1, $2, $3, 'superadmin', false) RETURNING *`,
      [email, passwordHash, nombre]
    )
  ).rows[0];

  res.status(201).json(datosPublicos(admin));
}));

// Un superadmin invita a otro admin (rol 'admin' por defecto). Sin sesiones
// en esta app, el llamador manda su propio id y se revalida el rol contra
// la BD, no se confía en lo que diga el cliente sobre sí mismo.
router.post('/admins', manejarAsync(async (req, res) => {
  const solicitanteId = Number(req.body?.solicitanteId);
  const email = String(req.body?.email ?? '').trim().toLowerCase();
  const nombre = String(req.body?.nombre ?? '').trim() || null;
  const rol = req.body?.rol === 'superadmin' ? 'superadmin' : 'admin';

  const solicitante = (await pool.query('SELECT rol FROM admins WHERE id = $1', [solicitanteId])).rows[0];
  if (solicitante?.rol !== 'superadmin') return res.status(403).json({ error: 'requiere_superadmin' });
  if (!email) return res.status(400).json({ error: 'email_requerido' });

  const passwordTemporal = Math.random().toString(36).slice(2, 10);
  const passwordHash = await hashClave(passwordTemporal);

  try {
    const nuevo = (
      await pool.query(
        `INSERT INTO admins (email, password_hash, nombre, rol, creado_por)
         VALUES ($1, $2, $3, $4, $5) RETURNING *`,
        [email, passwordHash, nombre, rol, solicitanteId]
      )
    ).rows[0];
    res.status(201).json({ ...datosPublicos(nuevo), passwordTemporal });
  } catch (error) {
    if (error.code === '23505') return res.status(409).json({ error: 'email_ya_existe' });
    throw error;
  }
}));

router.post('/cambiar-password', manejarAsync(async (req, res) => {
  const adminId = Number(req.body?.adminId);
  const passwordActual = String(req.body?.passwordActual ?? '');
  const passwordNueva = String(req.body?.passwordNueva ?? '');
  if (passwordNueva.length < 8) return res.status(400).json({ error: 'password_nueva_muy_corta' });

  const admin = (await pool.query('SELECT * FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin || !(await verificarClave(passwordActual, admin.password_hash))) {
    return res.status(401).json({ error: 'password_actual_invalida' });
  }

  const nuevoHash = await hashClave(passwordNueva);
  const actualizado = (
    await pool.query(
      `UPDATE admins SET password_hash = $1, debe_cambiar_password = false WHERE id = $2 RETURNING *`,
      [nuevoHash, adminId]
    )
  ).rows[0];

  res.json(datosPublicos(actualizado));
}));

export default router;
