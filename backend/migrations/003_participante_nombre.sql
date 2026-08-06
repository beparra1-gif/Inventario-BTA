-- El admin arma el roster por nombre completo (ej. "Javier Mena") y el
-- alias de login se deriva sólo ("jmena") — se guarda el nombre aparte para
-- que el admin siga reconociendo a cada persona en el panel, no solo el
-- alias corto, y para poder desambiguar cuando dos nombres derivan al
-- mismo alias (ej. "Javier Mena" y "Jose Mena" -> "jmena").
ALTER TABLE participantes ADD COLUMN IF NOT EXISTS nombre TEXT;
