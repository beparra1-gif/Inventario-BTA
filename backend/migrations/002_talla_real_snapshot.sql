-- La lista de capturas mostraba el dígito crudo de la talla (el que viene
-- del código de barra, ej. "07") en vez de la talla real ("44") porque
-- nunca se guardaba la traducción de reglas_talla al momento de capturar.
-- Mismo patrón que descripcion_snapshot/foto_url_snapshot: se guarda un
-- snapshot al capturar, no se recalcula con un join cada vez.
ALTER TABLE capturas ADD COLUMN IF NOT EXISTS talla_real_snapshot TEXT;
