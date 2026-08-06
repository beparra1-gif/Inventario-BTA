-- Marca que el admin ya revisó el inventario cerrado y quedó conforme
-- (distinto de solo "cerrado" — un inventario puede estar cerrado sin que
-- nadie lo haya verificado todavía). Se limpia si se reabre para corregir
-- algo: al modificarlo deja de reflejar lo que se verificó.
ALTER TABLE inventarios ADD COLUMN IF NOT EXISTS verificado_en TIMESTAMPTZ;
