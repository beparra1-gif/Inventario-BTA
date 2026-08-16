-- Nota opcional al marcar una diferencia como revisada (por qué se aceptó:
-- se encontró en bodega, producto dado de baja, error de tipeo, etc.).
ALTER TABLE stock_revisiones ADD COLUMN IF NOT EXISTS nota TEXT;

-- Tolerancia por inventario: diferencias con |diferencia| <= tolerancia no
-- exigen validación ni cuentan como "diferencia" en los reportes. Default 0
-- mantiene el comportamiento actual para todo inventario que no la fije.
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS tolerancia_diferencia INTEGER NOT NULL DEFAULT 0;

-- Bitácora de acciones sensibles por inventario (cerrar/reabrir/borrar,
-- borrar tax, validar tax, marcar revisado, cargar stock) — antes estas
-- acciones no dejaban ningún rastro más allá del estado final.
-- ON DELETE SET NULL (no CASCADE): si se borra el inventario, el evento
-- "se borró" tiene que sobrevivir para que la bitácora sirva de algo — el
-- detalle guarda el número de inventario como texto para poder ubicarlo
-- igual una vez que la fila real ya no existe.
CREATE TABLE IF NOT EXISTS eventos_auditoria (
  id SERIAL PRIMARY KEY,
  inventario_id INTEGER REFERENCES inventarios(id) ON DELETE SET NULL,
  admin_id INTEGER REFERENCES admins(id),
  tipo TEXT NOT NULL,
  detalle TEXT,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_eventos_auditoria_inventario ON eventos_auditoria(inventario_id, creado_en DESC);

-- Notificaciones persistentes para admin/superadmin — hoy las alertas
-- (inconsistencia, solicitud de modificación, errores de captura) solo
-- viajan por Socket.io: si nadie tiene la pestaña abierta en ese momento,
-- se pierden. Estado de leído compartido entre todos los admins (no por
-- persona) — más simple, alcanza para un equipo chico.
CREATE TABLE IF NOT EXISTS notificaciones (
  id SERIAL PRIMARY KEY,
  tipo TEXT NOT NULL,
  mensaje TEXT NOT NULL,
  inventario_id INTEGER REFERENCES inventarios(id) ON DELETE CASCADE,
  leido_en TIMESTAMPTZ,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notificaciones_creado ON notificaciones(creado_en DESC);
