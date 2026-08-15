-- Cruce contra el archivo de cierre de stock (externo al sistema): el
-- admin sube un .txt con codigo;talla;cantidad y esto se compara contra lo
-- capturado. Un solo set de referencia vigente por inventario (se
-- reemplaza entero cada vez que se vuelve a cargar un archivo).
CREATE TABLE IF NOT EXISTS stock_referencia (
  id SERIAL PRIMARY KEY,
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
  codigo VARCHAR(7) NOT NULL,
  talla VARCHAR(2) NOT NULL,
  cantidad INTEGER NOT NULL DEFAULT 0,
  UNIQUE (inventario_id, codigo, talla)
);
CREATE INDEX IF NOT EXISTS idx_stock_referencia_inventario ON stock_referencia(inventario_id);

ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS stock_cargado_en TIMESTAMPTZ;
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS stock_cargado_por_admin_id INTEGER REFERENCES admins(id);

-- Marca que el admin ya revisó la diferencia de un código+talla puntual —
-- aparte de stock_referencia porque una diferencia puede existir aunque el
-- código no esté en el archivo de stock (se capturó algo que el stock dice
-- que no debería existir), o viceversa.
CREATE TABLE IF NOT EXISTS stock_revisiones (
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
  codigo VARCHAR(7) NOT NULL,
  talla VARCHAR(2) NOT NULL,
  revisado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  revisado_por_admin_id INTEGER REFERENCES admins(id),
  PRIMARY KEY (inventario_id, codigo, talla)
);
