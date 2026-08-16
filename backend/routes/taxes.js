import { Router } from 'express';
import pool from '../db.js';
import { manejarAsync } from '../utils/manejarAsync.js';
import { registrarEvento } from '../utils/bitacora.js';

const router = Router();

// Abre (o retoma si ya existe) un número de tax dentro del rango asignado
// al participante. numero_tax es único por inventario (no por participante)
// así que si otro participante ya lo abrió, falla por la constraint UNIQUE.
router.post('/', manejarAsync(async (req, res) => {
  const participanteId = Number(req.body?.participanteId);
  const numeroTax = Number(req.body?.numeroTax);
  const nombre = req.body?.nombre ? String(req.body.nombre).trim().slice(0, 120) || null : null;
  if (!Number.isInteger(participanteId) || !Number.isInteger(numeroTax)) {
    return res.status(400).json({ error: 'datos_invalidos' });
  }

  const participante = (
    await pool.query(
      `SELECT p.*, i.estado AS inventario_estado FROM participantes p
       JOIN inventarios i ON i.id = p.inventario_id WHERE p.id = $1`,
      [participanteId]
    )
  ).rows[0];
  if (!participante) return res.status(404).json({ error: 'participante_no_encontrado' });
  if (participante.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });
  if (numeroTax < participante.tax_min || numeroTax > participante.tax_max) {
    return res.status(400).json({ error: 'numero_tax_fuera_de_rango' });
  }

  const existente = (
    await pool.query('SELECT * FROM taxes WHERE inventario_id = $1 AND numero_tax = $2', [
      participante.inventario_id,
      numeroTax,
    ])
  ).rows[0];
  if (existente) {
    if (existente.participante_id !== participanteId) {
      return res.status(409).json({ error: 'tax_ya_usado_por_otro_participante' });
    }
    return res.json(existente);
  }

  const nuevo = (
    await pool.query(
      `INSERT INTO taxes (inventario_id, participante_id, numero_tax, nombre) VALUES ($1, $2, $3, $4) RETURNING *`,
      [participante.inventario_id, participanteId, numeroTax, nombre]
    )
  ).rows[0];

  req.app.locals.io.to(`inventario:${participante.inventario_id}`).emit('tax:abierto', nuevo);
  res.status(201).json(nuevo);
}));

router.post('/:id/cerrar', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const resultado = await pool.query(
    `UPDATE taxes SET estado = 'cerrado', cerrado_en = now() WHERE id = $1 RETURNING *`,
    [id]
  );
  if (!resultado.rows.length) return res.status(404).json({ error: 'tax_no_encontrado' });

  const tax = resultado.rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:cerrado', tax);
  res.json(tax);
}));

async function obtenerTaxConInventario(taxId) {
  const { rows } = await pool.query(
    `SELECT t.*, i.estado AS inventario_estado FROM taxes t JOIN inventarios i ON i.id = t.inventario_id WHERE t.id = $1`,
    [taxId]
  );
  return rows[0] ?? null;
}

// Autoriza tanto al admin (cualquier tax) como al propio capturador dueño de
// ese tax (solo mientras el inventario siga abierto) — así el capturador
// puede corregir lo suyo sin depender del admin, pero no puede tocar el de
// otro ni reabrir algo si el admin ya cerró todo el inventario.
async function autorizarSobreTax(req, res, tax) {
  const adminId = Number(req.body?.adminId ?? req.query.adminId);
  if (Number.isInteger(adminId)) {
    const admin = (await pool.query('SELECT id, rol FROM admins WHERE id = $1', [adminId])).rows[0];
    // Auditor no administra tax de otros — solo consulta y valida (ver
    // routes/auditoria.js).
    if (admin && admin.rol !== 'auditor') return true;
  }
  const participanteId = Number(req.body?.participanteId ?? req.query.participanteId);
  if (Number.isInteger(participanteId) && participanteId === tax.participante_id) {
    if (tax.inventario_estado !== 'abierto') {
      res.status(409).json({ error: 'inventario_cerrado' });
      return false;
    }
    return true;
  }
  res.status(403).json({ error: 'no_autorizado' });
  return false;
}

// Reabre un tax cerrado (por si lo cerraron por error o hay que agregar
// algo) sin tener que reabrir todo el inventario.
router.post('/:id/reabrir', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const tax = await obtenerTaxConInventario(id);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (!(await autorizarSobreTax(req, res, tax))) return;

  const resultado = await pool.query(
    `UPDATE taxes SET estado = 'abierto', cerrado_en = NULL WHERE id = $1 RETURNING *`,
    [id]
  );
  const actualizado = resultado.rows[0];
  req.app.locals.io.to(`inventario:${actualizado.inventario_id}`).emit('tax:abierto', actualizado);
  res.json(actualizado);
}));

// El propio capturador (o el admin) reinicia un tax: borra todas sus
// capturas y lo deja abierto, para volver a empezar ese número desde cero
// si se equivocó feo — funciona tanto si el tax seguía abierto como si ya
// lo había cerrado (en ese caso también lo reabre).
router.delete('/:id/capturas', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const tax = await obtenerTaxConInventario(id);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });

  await pool.query('DELETE FROM capturas WHERE tax_id = $1', [id]);
  const actualizado = (
    await pool.query(`UPDATE taxes SET estado = 'abierto', cerrado_en = NULL WHERE id = $1 RETURNING *`, [id])
  ).rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:reiniciado', { id });
  res.json(actualizado);
}));

// El capturador (o el admin) le pone/cambia el nombre o ubicación al tax
// que tiene asignado (ej. "Bodega 2") — solo para identificarlo mejor en
// las listas, no afecta la numeración ni el rango.
router.put('/:id/nombre', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const nombre = req.body?.nombre != null ? String(req.body.nombre).trim().slice(0, 120) || null : null;

  const tax = await obtenerTaxConInventario(id);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (tax.inventario_estado !== 'abierto') return res.status(409).json({ error: 'inventario_cerrado' });

  const actualizado = (await pool.query('UPDATE taxes SET nombre = $1 WHERE id = $2 RETURNING *', [nombre, id])).rows[0];
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:actualizado', actualizado);
  res.json(actualizado);
}));

// Borra un tax completo (sus capturas se van con él, ON DELETE CASCADE) —
// libera el número para que se pueda volver a abrir desde cero.
router.delete('/:id', manejarAsync(async (req, res) => {
  const id = Number(req.params.id);
  const tax = await obtenerTaxConInventario(id);
  if (!tax) return res.status(404).json({ error: 'tax_no_encontrado' });
  if (!(await autorizarSobreTax(req, res, tax))) return;

  await pool.query('DELETE FROM taxes WHERE id = $1', [id]);
  req.app.locals.io.to(`inventario:${tax.inventario_id}`).emit('tax:eliminado', { id, numeroTax: tax.numero_tax });
  const adminId = Number(req.body?.adminId ?? req.query.adminId);
  registrarEvento({
    inventarioId: tax.inventario_id,
    adminId: Number.isInteger(adminId) ? adminId : null,
    tipo: 'borrar_tax',
    detalle: `Tax ${tax.numero_tax}`,
  });
  res.status(204).end();
}));

export default router;
