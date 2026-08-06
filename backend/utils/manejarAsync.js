// Express 4 no captura rechazos de promesas en handlers async: sin este
// wrapper, un error de BD dentro de un `await pool.query(...)` deja la
// request colgada en vez de responder 500. Envuelve cada handler async y
// pasa cualquier error a `next()` para que lo tome el middleware de errores.
export function manejarAsync(fn) {
  return (req, res, next) => fn(req, res, next).catch(next);
}
