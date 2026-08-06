import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { useToast } from '../contexto/ToastContext.jsx';

export function AdminLogin({ onLogin, onVolver }) {
  const mostrarToast = useToast();
  const [necesitaConfiguracion, setNecesitaConfiguracion] = useState(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nombre, setNombre] = useState('');
  const [cargando, setCargando] = useState(false);

  useEffect(() => {
    api.necesitaConfiguracion()
      .then((r) => setNecesitaConfiguracion(r.necesitaConfiguracion))
      .catch(() => setNecesitaConfiguracion(false));
  }, []);

  async function entrar() {
    if (!email || !password) return;
    setCargando(true);
    try {
      onLogin(await api.login(email, password));
    } catch {
      mostrarToast('Credenciales inválidas', 'error');
    } finally {
      setCargando(false);
    }
  }

  async function configurar() {
    if (!email || password.length < 8) return;
    setCargando(true);
    try {
      onLogin(await api.configuracionInicial(email, password, nombre));
      mostrarToast('Cuenta de administrador creada', 'ok');
    } catch {
      mostrarToast('No se pudo crear la cuenta, intenta de nuevo', 'error');
    } finally {
      setCargando(false);
    }
  }

  if (necesitaConfiguracion === null) {
    return <div className="pantalla" />;
  }

  return (
    <div className="pantalla">
      <div className="contenedor">
        <div className="tarjeta">
          {necesitaConfiguracion ? (
            <>
              <h1 className="titulo-pantalla">Configuración inicial</h1>
              <p className="subtitulo">Todavía no existe ningún administrador — crea la primera cuenta (queda como superadmin).</p>

              <label className="etiqueta">Nombre</label>
              <input className="campo" value={nombre} onChange={(e) => setNombre(e.target.value)} />
              <label className="etiqueta">Correo</label>
              <input className="campo" type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
              <label className="etiqueta">Contraseña (mínimo 8 caracteres)</label>
              <input className="campo" type="password" value={password} onChange={(e) => setPassword(e.target.value)} />

              <button className="btn btn-primario" disabled={!email || password.length < 8 || cargando} onClick={configurar}>
                {cargando ? 'Creando...' : 'Crear cuenta de administrador'}
              </button>
            </>
          ) : (
            <>
              <h1 className="titulo-pantalla">Administración</h1>

              <input className="campo" type="email" placeholder="Correo" value={email} onChange={(e) => setEmail(e.target.value)} autoFocus />
              <input
                className="campo"
                type="password"
                placeholder="Contraseña"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && entrar()}
              />

              <button className="btn btn-primario" disabled={!email || !password || cargando} onClick={entrar}>
                {cargando ? 'Ingresando...' : 'Ingresar'}
              </button>
            </>
          )}

          <button className="btn-texto" style={{ display: 'block', margin: '16px auto 0' }} onClick={onVolver}>
            Volver a captura
          </button>
        </div>
      </div>
    </div>
  );
}
