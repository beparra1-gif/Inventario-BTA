import pool from '../db.js';

// Persiste la misma alerta que se emite por Socket.io (alerta:capturador-errores,
// solicitud:modificar, auditoria:inconsistencia) para que quede disponible
// aunque nadie tuviera el panel admin abierto en el momento — se lee luego
// desde la campanita del header (GET /api/notificaciones).
export async function crearNotificacion({ tipo, mensaje, inventarioId }) {
  try {
    await pool.query(
      `INSERT INTO notificaciones (tipo, mensaje, inventario_id) VALUES ($1, $2, $3)`,
      [tipo, mensaje, inventarioId ?? null]
    );
  } catch (error) {
    console.error('No se pudo guardar la notificación:', error);
  }
}
