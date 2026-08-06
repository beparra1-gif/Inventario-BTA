# Desplegar Inventario BTA

No tengo `gh`/`doctl`/`vercel` instalados ni credenciales de ninguno de los tres en este entorno, así que las cuentas y los recursos los creas tú desde las consolas web — yo dejé el código listo para que sea copiar/pegar. Pásame las URLs/tokens que se indican en cada paso y termino de conectar todo.

## 1. GitHub

1. Crea un repo vacío en github.com (sin README/gitignore, el repo ya los tiene) — puede ser público o privado, tu decides.
2. Pásame la URL (`https://github.com/tu-usuario/tu-repo.git`) y hago `git remote add origin ...` + push del primer commit que ya dejé listo localmente.

## 2. Base de datos — DigitalOcean Managed PostgreSQL

1. Crea un cluster de PostgreSQL administrado (Databases → Create → PostgreSQL). El plan más chico alcanza para este uso.
2. Copia el "Connection String" (formato `postgres://usuario:password@host:puerto/basededatos?sslmode=require`) — eso va en `DATABASE_URL`.

## 3. Backend — DigitalOcean App Platform

1. Apps → Create App → conecta el repo de GitHub.
2. **Source Directory**: `backend` (el repo tiene frontend en la raíz y backend en `/backend`, son dos apps separadas).
3. App Platform detecta el `Dockerfile` de `backend/` solo — no hace falta buildpack.
4. Variables de entorno (App → Settings → App-Level Environment Variables):
   - `DATABASE_URL` = el connection string del paso 2
   - `FRONTEND_URL` = la URL de Vercel del paso 4 (por ahora déjalo vacío o pon `http://localhost:5173`, lo actualizamos cuando tengas la URL de Vercel — si queda vacío, CORS acepta cualquier origen, lo cual sirve para probar pero hay que fijarlo antes de dejarlo en uso real)
   - `PORT` — no hace falta setearlo, App Platform inyecta el suyo y el servidor ya lo respeta (`process.env.PORT`)
5. Al desplegar, el contenedor corre `node migrate.js && node server.js` — las migraciones se aplican solas en cada deploy (es seguro, `migrate.js` no reaplica lo que ya corrió).
6. **Crear el primer administrador**: una vez que el backend esté arriba, entra a `https://tu-app-backend.ondigitalocean.app/api/health` para confirmar que responde, y después crea el superadmin llamando una vez a:
   ```bash
   curl -X POST https://tu-app-backend.ondigitalocean.app/api/auth/configuracion-inicial \
     -H "Content-Type: application/json" \
     -d '{"email":"tu-correo@ejemplo.com","password":"una-clave-de-al-menos-8-caracteres","nombre":"Tu Nombre"}'
   ```
   Este endpoint se autodesactiva apenas exista un admin — no lo puede usar nadie más después.

## 4. Frontend — Vercel

1. Vercel → Add New → Project → importa el mismo repo de GitHub.
2. **Root Directory**: déjalo en la raíz del repo (ahí vive el `package.json` del frontend). Vercel detecta Vite solo.
3. Variables de entorno (Project → Settings → Environment Variables):
   - `VITE_API_URL` = la URL pública del backend de DigitalOcean (paso 3), sin `/` final.
4. Deploy. Cuando tengas la URL final de Vercel, avísame para actualizar `FRONTEND_URL` en el backend (paso 3.4) y así el CORS y el Socket.io queden restringidos solo a tu dominio real.

## 5. Maestros (tiendas, productos, reglas de talla)

Los importadores (`backend/scripts/importar-tiendas.js`, `importar-productos.js`) leen de tu OneDrive y de la unidad `I:\` — esas rutas **solo existen en tu computador**, no en el servidor. Se siguen corriendo desde acá, apuntando a la base de datos de producción:

```bash
cd backend
DATABASE_URL="<connection string del paso 2>" npm run importar:tiendas
DATABASE_URL="<connection string del paso 2>" npm run importar:productos
```

## 6. Fotos de producto

No requieren configuración: se leen directo del repo público `github.com/beparra1-gif/buscador-precio` (ver `data/maestros/README.md`, punto 3). Si ese repo se llega a borrar o poner privado, las fotos dejan de cargar (el conteo de inventario no se ve afectado, solo la imagen).
