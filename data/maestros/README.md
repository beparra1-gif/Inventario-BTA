# Fuentes de los maestros

Rutas reales confirmadas (2026-08-06). Importadores implementados: `backend/scripts/importar-tiendas.js` y `backend/scripts/importar-productos.js`, disponibles como script (`npm run importar:tiendas` / `npm run importar:productos` desde `backend/`) y como endpoint (`POST /api/maestros/tiendas`, `POST /api/maestros/productos`, `backend/routes/maestros.js`). No son archivos que vivan en este repo, son rutas OneDrive/red del equipo — los scripts las leen directo (rutas configurables por env var, ver `.env.example`).

## 1. Maestro de tiendas
**Ruta:** `...Operaciones Chile - Documentos\base\BASE.xlsx`, hoja **`DM+BASE DATOS TIENDA`**.
(Ojo: la carpeta se llama `base`, minúscula — no confundir con `BASE DE DATOS B.P`, que es otra carpeta distinta al mismo nivel. También existe una copia en `BASE.23.PRUEBAS.xlsx` con la misma hoja — no usar, es de pruebas.)

- **Llave:** `EDP` + `GLOSA TIENDA` (coincide con `tiendas.edp` / `tiendas.glosa` en el schema). El importador upsertea por `edp` y registra una advertencia si la `glosa` de la fuente difiere de la que ya había en BD para ese EDP (posible error de datos), sin bloquear la importación.
- La hoja trae 66 columnas (DISTRITO, JEFE ZONAL, ZONA, CIUDAD, REGION, UBICACIÓN, ADMINISTRACION, RETAIL CONCEPT, fechas de apertura/remodelación, m², renta, comisión, CADENA ORIGINAL, etc.) — muchas más que las 10 que hoy tiene la tabla `tiendas`. Por instrucción del usuario: se importa solo contra las columnas que ya existen en el schema, pero se deja registro de las demás acá para no tener que releer el Excel cuando se necesiten más adelante.

## 2. Maestro de productos + reglas de talla
**Ruta:** `I:\Ti\Auditoria\MaestroTiendas\Maestro.csv` (593.515 filas, `;` como separador, columnas `PRD_CODIGO; PRD_DESCRPOS; PRD_TALLA`). Existe también `Maestro_Catecu.csv` en la misma carpeta con el mismo formato (catálogo Catecu, cadena aparte) — **confirmado por el usuario: no se importa**, el importador solo trabaja con `Maestro.csv`.

Verificado con los 593.515 registros: **`PRD_CODIGO` (9 dígitos) = `codigo` (7 díg.) + `talla_cruda` (2 díg.)**, y ese `talla_cruda` es exactamente el mismo dígito 11-12 que extrae `parseEAN13` (`backend/utils/ean13.js`). O sea este único CSV alimenta dos tablas, en el mismo recorrido (`backend/scripts/importar-productos.js`):

- **`productos_maestro`**: `codigo = PRD_CODIGO[0:7]`, `talla = PRD_CODIGO[7:9]` (talla cruda, no la real), `descripcion = PRD_DESCRPOS`. Sigue sin `foto_url` en el modelo — las fotos se resuelven armando la URL en el momento (ver punto 3), no se guardan en la tabla.
- **`reglas_talla`**: `prefijo = codigo` (los 7 dígitos completos), `talla_cruda = PRD_CODIGO[7:9]`, `talla_real = PRD_TALLA`. **Confirmado por el usuario**: el `prefijo` es el código completo, no una familia corta — se probó agrupar por prefijos de 2 a 7 dígitos y el mapeo `talla_cruda → talla_real` solo es 100% consistente usando el código completo (con prefijos más cortos hay miles de choques porque la escala real depende del artículo exacto, no de una familia amplia de códigos).
- **Regla de talla única**: confirmado por el usuario — cuando `talla_cruda === '01'`, en captura manual se muestra como "talla única" en vez de la talla real que traduciría `reglas_talla` (varios artículos no tienen una talla real en ese punto). Implementado en `parseArticuloManual` (`backend/utils/ean13.js`), campo `tallaUnica`.

## 3. Fotos de producto
**Decisión final (2026-08-06, revisada tras el primer intento):** la primera versión leía la carpeta de fotos de `buscador-precio` directo del filesystem local (`Documents/GitHub/buscador-precio/fotos/`) — funcionaba en desarrollo pero **se rompía en cualquier servidor real** (Droplet, App Platform), porque esa carpeta solo existe en este computador. Al revisar cómo lo resuelve `buscador-precio` (las 40.025 fotos están commiteadas directo en su propio repo público `github.com/beparra1-gif/buscador-precio`), se cambió a apuntar al `raw.githubusercontent.com` de ese mismo repo en vez de duplicar ~400MB de imágenes acá o armar un bucket nuevo.

Mismo nombre de archivo y misma lógica de fallback que esa app: intenta `{codigo}.jpg` (minúscula) y si falla (`onError`) cae a `{codigo}.JPG` (mayúscula) — pero ahora resuelto **en el cliente** (`src/pantallas/PantallaCaptura.jsx`), no en el backend, porque ya no hay filesystem que consultar: `backend/utils/fotos.js` solo arma las dos URLs posibles (`urlFotoMinuscula`/`urlFotoMayuscula`), sin verificar cuál existe — el navegador lo resuelve con el mismo patrón `<img onError>` que ya usaba `buscador-precio`. No necesita configuración ni variable de entorno.

**Trade-off asumido:** las fotos de Inventario-BTA dependen de que siga existiendo/público `github.com/beparra1-gif/buscador-precio`. Si ese repo se borra o se pone privado, las fotos dejan de cargar acá también (no rompe el conteo de inventario, solo la imagen).

---

Pendiente real: proteger `POST /api/maestros/*` con auth de admin (ya existe login/bootstrap en `routes/auth.js`, falta conectar un middleware de sesión a estas rutas).
