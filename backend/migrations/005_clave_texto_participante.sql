-- El hash bcrypt de clave_hash no se puede revertir: una vez creado el
-- perfil, nadie (ni el admin) podía volver a ver el PIN si lo perdía. Como
-- son PINs numéricos cortos para coordinar al personal de tienda (no
-- credenciales sensibles), se guarda también en texto plano para que el
-- admin pueda consultarlo cuando lo necesite.
ALTER TABLE participantes ADD COLUMN IF NOT EXISTS clave_texto TEXT;
