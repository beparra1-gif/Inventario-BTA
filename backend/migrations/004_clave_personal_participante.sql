-- Cada capturador tiene su propia clave numérica en vez de compartir la
-- clave del inventario — evita que se mezclen o que alguien capture bajo
-- el perfil de otra persona por error. La clave del inventario deja de
-- ser obligatoria para entrar a capturar (sigue existiendo por compatibilidad
-- con inventarios ya creados, pero el acceso real ahora es alias+clave_hash
-- de participantes).
ALTER TABLE participantes ADD COLUMN IF NOT EXISTS clave_hash TEXT;
ALTER TABLE inventarios ALTER COLUMN clave_hash DROP NOT NULL;
