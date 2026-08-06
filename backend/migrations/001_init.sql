-- Tiendas (maestro importado desde BASE TIENDAS.xlsx)
CREATE TABLE IF NOT EXISTS tiendas (
  edp INTEGER PRIMARY KEY,
  glosa TEXT NOT NULL,
  distrito TEXT,
  jefe_zonal TEXT,
  zona TEXT,
  ciudad TEXT,
  region TEXT,
  ubicacion TEXT,
  administracion TEXT,
  status TEXT,
  cadena_original TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Superadmin y admins (mismo login para ambos, distinguidos por rol)
CREATE TABLE IF NOT EXISTS admins (
  id SERIAL PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  nombre TEXT,
  rol TEXT NOT NULL DEFAULT 'admin' CHECK (rol IN ('superadmin', 'admin')),
  debe_cambiar_password BOOLEAN NOT NULL DEFAULT true,
  creado_por INTEGER REFERENCES admins(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  ultimo_uso_en TIMESTAMPTZ
);

-- Maestro de productos: código (7 díg.) + talla (2 díg.) -> descripción y foto.
-- Clave compuesta porque la descripción/foto puede variar por talla del mismo código.
CREATE TABLE IF NOT EXISTS productos_maestro (
  codigo VARCHAR(7) NOT NULL,
  talla VARCHAR(2) NOT NULL,
  descripcion TEXT NOT NULL,
  foto_url TEXT,
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (codigo, talla)
);

-- Reglas de talla por prefijo del código de producto: traduce la talla cruda
-- (2 díg. sacados del EAN13) a la talla real, ya que la escala depende del
-- tipo de artículo. Mapeo directo prefijo+cruda -> real (sin fórmula fija)
-- para poder cargar la tabla de reglas tal cual la entregue el negocio.
CREATE TABLE IF NOT EXISTS reglas_talla (
  id SERIAL PRIMARY KEY,
  prefijo TEXT NOT NULL,
  talla_cruda VARCHAR(2) NOT NULL,
  talla_real TEXT NOT NULL,
  descripcion_regla TEXT,
  UNIQUE (prefijo, talla_cruda)
);

CREATE TABLE IF NOT EXISTS inventarios (
  id SERIAL PRIMARY KEY,
  numero_inventario TEXT UNIQUE NOT NULL,
  edp INTEGER NOT NULL REFERENCES tiendas(edp),
  clave_hash TEXT NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado', 'exportado')),
  creado_por_admin_id INTEGER NOT NULL REFERENCES admins(id),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en TIMESTAMPTZ
);

-- Cada persona que entra a capturar con tienda+clave, identificada por alias
-- y con su rango de tax asignado (1-100, 101-200, ...).
CREATE TABLE IF NOT EXISTS participantes (
  id SERIAL PRIMARY KEY,
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  tax_min INTEGER NOT NULL,
  tax_max INTEGER NOT NULL,
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (inventario_id, alias)
);

CREATE TABLE IF NOT EXISTS taxes (
  id SERIAL PRIMARY KEY,
  inventario_id INTEGER NOT NULL REFERENCES inventarios(id) ON DELETE CASCADE,
  participante_id INTEGER NOT NULL REFERENCES participantes(id) ON DELETE CASCADE,
  numero_tax INTEGER NOT NULL,
  estado TEXT NOT NULL DEFAULT 'abierto' CHECK (estado IN ('abierto', 'cerrado')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  cerrado_en TIMESTAMPTZ,
  UNIQUE (inventario_id, numero_tax)
);

-- Cada escaneo/ingreso manual queda como fila propia (permite editar, sumar,
-- restar o borrar sin tocar el resto); la vista de tax y la del admin
-- consolidan sumando cantidad agrupado por (codigo, talla).
CREATE TABLE IF NOT EXISTS capturas (
  id SERIAL PRIMARY KEY,
  tax_id INTEGER NOT NULL REFERENCES taxes(id) ON DELETE CASCADE,
  codigo VARCHAR(7) NOT NULL,
  talla VARCHAR(2) NOT NULL,
  ean13_original VARCHAR(13),
  cantidad INTEGER NOT NULL DEFAULT 1 CHECK (cantidad > 0),
  reconocido BOOLEAN NOT NULL,
  descripcion_snapshot TEXT,
  foto_url_snapshot TEXT,
  origen TEXT NOT NULL DEFAULT 'scan' CHECK (origen IN ('scan', 'manual')),
  creado_en TIMESTAMPTZ NOT NULL DEFAULT now(),
  actualizado_en TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_participantes_inventario ON participantes(inventario_id);
CREATE INDEX IF NOT EXISTS idx_taxes_inventario ON taxes(inventario_id);
CREATE INDEX IF NOT EXISTS idx_taxes_participante ON taxes(participante_id);
CREATE INDEX IF NOT EXISTS idx_capturas_tax ON capturas(tax_id);
CREATE INDEX IF NOT EXISTS idx_capturas_codigo_talla ON capturas(codigo, talla);
CREATE INDEX IF NOT EXISTS idx_reglas_talla_prefijo ON reglas_talla(prefijo);
