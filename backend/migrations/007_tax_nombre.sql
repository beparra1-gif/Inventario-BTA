-- Nombre/ubicación libre para identificar un tax más allá del número (ej.
-- "Bodega 2", "Vitrina hombre") — ayuda a revisar y detectar cambios.
ALTER TABLE taxes ADD COLUMN IF NOT EXISTS nombre TEXT;
