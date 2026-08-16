import pool from '../db.js';

// Deja constancia de una acción sensible sobre un inventario. No se espera
// (await) desde las rutas que llaman esto en el camino feliz de la
// respuesta — un fallo acá no debe tumbar la acción real, así que cada
// caller decide si esperar o no; esta función misma nunca lanza.
export async function registrarEvento({ inventarioId, adminId, tipo, detalle }) {
  try {
    await pool.query(
      `INSERT INTO eventos_auditoria (inventario_id, admin_id, tipo, detalle) VALUES ($1, $2, $3, $4)`,
      [inventarioId ?? null, adminId ?? null, tipo, detalle ?? null]
    );
  } catch (error) {
    console.error('No se pudo registrar evento de auditoría:', error);
  }
}
