# Inventario BTA — desplegado (2026-08-06)

| | URL |
|---|---|
| Frontend (Vercel) | https://inventario-bta-beparra1-gmailcoms-projects.vercel.app |
| Backend (DigitalOcean App Platform) | https://inventario-bta-backend-xddhd.ondigitalocean.app |
| Repo | https://github.com/beparra1-gif/Inventario-BTA |

## Cómo quedó armado

- **Backend**: app `inventario-bta-backend` en DigitalOcean App Platform (plan `basic-xxs`, ~US$5/mes), con una base de datos Postgres 15 embebida en la app (mismo patrón que `app-overlays-backend`). Sin Dockerfile — usa buildpack de Node (`npm install` + `node server.js`), con un job `PRE_DEPLOY` que corre `node migrate.js` antes de cada deploy (seguro, no reaplica lo que ya corrió). `deploy_on_push: true` en la rama `main` — cada push a GitHub redespliega solo.
- **Frontend**: proyecto `inventario-bta` en Vercel, framework Vite detectado automáticamente, variable `VITE_API_URL` apuntando al backend de arriba. **Importante**: se desactivó a mano la protección "Vercel Authentication" (`ssoProtection`) que Vercel activa por defecto en cuentas hobby — con ella prendida, nadie que no fuera miembro de tu cuenta de Vercel podía abrir la app (la hubiera bloqueado para el personal de tienda). Se desactivó solo para este proyecto, no afecta `app-overlays` ni los demás.
- **CORS/Socket.io**: `FRONTEND_URL` en el backend apunta a la URL de Vercel de arriba — verificado con curl que un origin distinto ya no recibe `Access-Control-Allow-Origin`.
- **`backend/Dockerfile`** queda en el repo como alternativa (por si en algún momento prefieren un Droplet en vez de App Platform), pero el deploy actual no lo usa.

## Lo que falta — pasos manuales, no los puedo hacer yo

1. **Crear tu cuenta de administrador** (elige tú el correo/clave):
   ```bash
   curl -X POST https://inventario-bta-backend-xddhd.ondigitalocean.app/api/auth/configuracion-inicial \
     -H "Content-Type: application/json" \
     -d '{"email":"tu-correo@ejemplo.com","password":"clave-de-al-menos-8-caracteres","nombre":"Tu Nombre"}'
   ```
   Se autodesactiva apenas exista un admin.

2. **Cargar los maestros** (tiendas, productos, reglas de talla) — se corren desde tu computador porque las fuentes son tu OneDrive y la unidad `I:\`, no existen en el servidor:
   ```bash
   cd backend
   DATABASE_URL="<connection string de la base de datos de inventario-bta-backend en DO>" npm run importar:tiendas
   DATABASE_URL="<mismo connection string>" npm run importar:productos
   ```
   El connection string está en DigitalOcean → App Platform → `inventario-bta-backend` → Components → `db` → Connection Details.

3. **Probar el flujo real** en el navegador (idealmente desde un celular, para el lector de código de barra) entrando a la URL del frontend de arriba.
