-- Nuevo rol "auditor": mismo login que admin/superadmin (tabla admins),
-- pero con permisos acotados en el backend (solo puede consultar y validar
-- tax cerrados, nada de crear/borrar inventarios ni administrar usuarios).
ALTER TABLE admins DROP CONSTRAINT IF EXISTS admins_rol_check;
ALTER TABLE admins ADD CONSTRAINT admins_rol_check CHECK (rol IN ('superadmin', 'admin', 'auditor'));

-- Validación de un tax cerrado: cuántas unidades contó quien audita (admin
-- o auditor) al revisarlo y cuándo/quién — se compara contra la suma real
-- de capturas para detectar inconsistencias, sin guardar un booleano
-- aparte (se calcula al leer).
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS cantidad_validada INTEGER;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS validado_en TIMESTAMPTZ;
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS validado_por_admin_id INTEGER REFERENCES admins(id);
