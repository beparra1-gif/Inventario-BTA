# Inventario BTA

App de captura de inventario físico por tienda (EDP), con validación de artículos contra el maestro de productos, agrupación por código+talla, tax por usuario y exportación final en el formato legacy `INV_BTA_{numero}_{edp}.txt`.

## Stack
- Frontend: React 19 + Vite + PWA (offline-first), en la raíz del repo.
- Backend: Express + PostgreSQL + Socket.io, en `backend/`.
- Mismo patrón que `App-overlays` y `app-centro-de-cultura` (mismo dueño, mismo estilo de proyecto).

## Estado actual
- Esqueleto de frontend y backend listo para correr (`npm run dev` en cada carpeta).
- Modelo de datos inicial en `backend/migrations/001_init.sql` (tiendas, admins, productos_maestro, reglas_talla, inventarios, participantes, taxes, capturas).
- Parser EAN13 + agregación por código/talla + exportación .txt, validados con datos reales de tienda 230 (`backend/utils/ean13.js`, con tests en `ean13.test.js`).
- Importadores de maestro (`backend/scripts/importar-tiendas.js`, `backend/scripts/importar-productos.js`) leyendo directo de las fuentes reales del negocio, disponibles como script (`npm run importar:tiendas` / `npm run importar:productos`) y como endpoint (`POST /api/maestros/tiendas`, `POST /api/maestros/productos`) — ver `data/maestros/README.md` para rutas, llaves y decisiones confirmadas (incluye la regla de "talla única"). Solo se importa el maestro principal (`Maestro.csv`); `Maestro_Catecu.csv` queda fuera por instrucción del usuario.
- Fotos de producto resueltas en tiempo real desde la carpeta de `buscador-precio` (`backend/utils/fotos.js`, `GET /api/fotos/:codigo`), sin duplicar el repositorio de imágenes.
- API completa de captura: `auth` (login admin), `tiendas`, `inventarios` (crear/abrir/cerrar/resumen en vivo/exportar .txt), `participantes` (alias + rango de tax), `taxes` (abrir/cerrar), `capturas` (crear/editar/borrar/agrupado) y `articulos` (validar código+talla contra el maestro). Todas las rutas async están envueltas con `backend/utils/manejarAsync.js` y hay un middleware de errores en `server.js` — sin eso, un error de BD dejaría la request colgada (Express 4 no captura rechazos async solo).
- Frontend completo: pantallas de acceso (tienda+clave), participante/alias, selección de tax, captura (escaneo + manual, lista agrupada con foto y badges de reconocido/talla única) y panel admin (crear inventario, progreso en vivo por Socket.io, exportar). Diseño iOS (mismo lenguaje visual que `buscador-precio`: tarjetas, rojo Bata, tipografía del sistema) con soporte de tema oscuro y layouts responsivos para celular/tablet/PC (`src/estilos/app.css`).
- Reconocimiento de lectores de código de barra USB o Bluetooth vía `src/hooks/useEscanerCodigoBarras.js`: ambos se conectan como teclado HID, así que un solo listener de teclado (por tiempo entre teclas) los cubre a los dos sin WebUSB/WebHID (que no funcionan en Safari/iOS).
- Verificado (2026-08-06): `npm install` + `npm test` pasan completos en raíz y en `backend/` (13 + 4 tests), y `npm run build` del frontend compila limpio con el service worker de la PWA generado. El backend arranca y responde bien sin Postgres disponible (los endpoints que sí necesitan BD devuelven 500 controlado en vez de colgarse).
- Pendiente: auth de superadmin/admin todavía no protege los endpoints de maestros/fotos (no hay sesiones); probar el flujo real en un navegador con Postgres levantado y con un lector de código de barra físico (USB/Bluetooth) — eso no se pudo validar sin hardware.

## Desarrollo local
```bash
# backend
cd backend
cp .env.example .env   # completa DATABASE_URL
npm install
npm run migrate
npm run dev

# frontend (en otra terminal, desde la raíz)
cp .env.example .env
npm install
npm run dev
```
