import { Router } from 'express';
import multer from 'multer';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { importarTiendas } from '../scripts/importar-tiendas.js';
import { importarProductos } from '../scripts/importar-productos.js';

const router = Router();
const subida = multer({ storage: multer.memoryStorage(), limits: { fileSize: 60 * 1024 * 1024 } });

// Sin sesiones en esta app: el superadmin manda su propio id en el form y se
// revalida el rol contra la BD antes de dejarlo tocar el maestro completo.
async function exigirAdmin(req, res) {
  const adminId = Number(req.body?.adminId);
  const admin = (await pool.query('SELECT rol FROM admins WHERE id = $1', [adminId])).rows[0];
  if (!admin) {
    res.status(403).json({ error: 'requiere_admin' });
    return null;
  }
  return admin;
}

// Reemplaza los importadores de línea de comandos (npm run importar:*): el
// superadmin sube el .xlsx/.csv desde el panel en vez de que alguien tenga
// que correr un script apuntado a una ruta que solo existe en su computador
// (ver data/maestros/README.md) — así se puede refrescar el maestro sin
// depender de un deploy ni de acceso a terminal.
router.post('/tiendas', subida.single('archivo'), manejarAsync(async (req, res) => {
  if (!(await exigirAdmin(req, res))) return;
  if (!req.file) return res.status(400).json({ error: 'archivo_requerido' });

  const resumen = await importarTiendas({ buffer: req.file.buffer });
  res.json(resumen);
}));

// 593k filas puede tardar más de lo que aguanta una request HTTP normal —
// se responde apenas empieza y el avance/resultado se emite por Socket.io
// a la room "admin" (el panel se suscribe al entrar).
router.post('/productos', subida.single('archivo'), manejarAsync(async (req, res) => {
  const admin = await exigirAdmin(req, res);
  if (!admin) return;
  if (!req.file) return res.status(400).json({ error: 'archivo_requerido' });

  const io = req.app.locals.io;
  const buffer = req.file.buffer;
  res.status(202).json({ iniciado: true });

  importarProductos({
    buffer,
    onProgreso: (procesadas) => io.to('admin').emit('maestros:productos:progreso', { procesadas }),
  })
    .then((resumen) => io.to('admin').emit('maestros:productos:completado', resumen))
    .catch((error) => {
      console.error('Error importando productos (subido por admin):', error);
      io.to('admin').emit('maestros:productos:error', { error: 'error_importando' });
    });
}));

export default router;
