import { Router } from 'express';
import { importarTiendas } from '../scripts/importar-tiendas.js';
import { importarProductos } from '../scripts/importar-productos.js';

const router = Router();

// TODO: proteger con auth de admin cuando exista (backend/routes/auth.js,
// pendiente) — hoy queda abierto igual que el resto de la API porque no hay
// login todavía. Maestro.csv trae ~593k filas: /productos puede tardar.

router.post('/tiendas', async (req, res) => {
  try {
    const resumen = await importarTiendas();
    res.json(resumen);
  } catch (error) {
    console.error('Error importando tiendas:', error);
    res.status(500).json({ error: 'error_importando_tiendas' });
  }
});

router.post('/productos', async (req, res) => {
  try {
    const resumen = await importarProductos();
    res.json(resumen);
  } catch (error) {
    console.error('Error importando productos:', error);
    res.status(500).json({ error: 'error_importando_productos' });
  }
});

export default router;
