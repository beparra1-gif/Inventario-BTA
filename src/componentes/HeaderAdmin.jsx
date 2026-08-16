import { useEffect, useState } from 'react';
import { api } from '../api.js';
import { formatearFecha } from '../utilidades/fecha.js';

// Nav superior del panel admin: menús principales con sus apartados. Se
// arma como datos (no como JSX repetido) para que el mismo contenido sirva
// tanto para el desplegable de escritorio como para la hoja de menú en
// celular, sin duplicar la lista en dos lugares.
function armarMenus(admin) {
  const menus = [
    {
      id: 'inventarios',
      label: 'Inventarios',
      items: [
        { label: 'Crear inventario', vista: 'crear' },
        { label: 'Revisar inventarios realizados', vista: 'revisar' },
      ],
    },
    {
      id: 'auditoria',
      label: 'Auditoría',
      items: [
        { label: 'Validar tax cerrados', vista: 'auditoria' },
        { label: 'Histórico de diferencias por tienda', vista: 'historico' },
      ],
    },
  ];
  if (admin.rol === 'superadmin') {
    menus.push({
      id: 'administracion',
      label: 'Administración',
      items: [
        { label: 'Administradores', vista: 'admins' },
        { label: 'Maestros (tiendas y productos)', vista: 'maestros' },
      ],
    });
  }
  return menus;
}

function inicial(admin) {
  const fuente = admin.nombre || admin.email || '?';
  return fuente.trim().charAt(0).toUpperCase();
}

// Notificaciones persistentes (inconsistencias de auditoría, solicitudes de
// modificación, capturadores con muchos errores) — antes solo viajaban por
// Socket.io en vivo; si nadie tenía el panel abierto en ese momento se
// perdían. Se consultan acá con un poll simple (no dependen de estar
// dentro de la room de un inventario puntual).
function useNotificaciones(adminId) {
  const [notificaciones, setNotificaciones] = useState([]);

  async function cargar() {
    try {
      setNotificaciones(await api.listarNotificaciones(adminId));
    } catch {
      /* se reintenta en el próximo poll */
    }
  }

  useEffect(() => {
    cargar();
    const intervalo = setInterval(cargar, 30000);
    return () => clearInterval(intervalo);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminId]);

  async function marcarLeidas() {
    try {
      await api.marcarNotificacionesLeidas(adminId);
      cargar();
    } catch {
      /* no es crítico, se reintenta solo */
    }
  }

  return { notificaciones, marcarLeidas };
}

export function HeaderAdmin({ admin, vista, onNavegar, onSalir }) {
  const [menuAbierto, setMenuAbierto] = useState(null); // id de menú desktop abierto
  const [usuarioAbierto, setUsuarioAbierto] = useState(false);
  const [movilAbierto, setMovilAbierto] = useState(false);
  const [notifAbierto, setNotifAbierto] = useState(false);
  const { notificaciones, marcarLeidas } = useNotificaciones(admin.id);
  const noLeidas = notificaciones.filter((n) => !n.leido_en).length;

  const menus = armarMenus(admin);

  function ir(vistaDestino) {
    onNavegar(vistaDestino);
    setMenuAbierto(null);
    setUsuarioAbierto(false);
    setMovilAbierto(false);
    setNotifAbierto(false);
  }

  function menuActivo(menu) {
    return menu.items.some((i) => i.vista === vista);
  }

  return (
    <div className="encabezado-admin">
      <div className="encabezado-admin-fila">
        <button className="encabezado-admin-marca" onClick={() => ir('menu')} title="MODULO CAPTURA DE INVENTARIO">
          MODULO <span>CAPTURA</span> DE INVENTARIO
        </button>

        <nav className="nav-admin-desktop">
          {menus.map((menu) => (
            <div className="nav-admin-item" key={menu.id}>
              <button
                className={`nav-admin-boton${menuActivo(menu) ? ' activo' : ''}`}
                onClick={() => setMenuAbierto((actual) => (actual === menu.id ? null : menu.id))}
              >
                {menu.label} ▾
              </button>
              {menuAbierto === menu.id && (
                <>
                  <button className="nav-admin-fondo" onClick={() => setMenuAbierto(null)} aria-label="Cerrar menú" />
                  <div className="nav-admin-desplegable">
                    {menu.items.map((item) => (
                      <button
                        key={item.vista}
                        className={item.vista === vista ? 'activo' : ''}
                        onClick={() => ir(item.vista)}
                      >
                        {item.label}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          ))}
        </nav>

        <div className="nav-admin-espaciador" />

        <div className="nav-admin-item">
          <button className="nav-admin-campana" onClick={() => setNotifAbierto((v) => !v)} aria-label="Notificaciones">
            🔔
            {noLeidas > 0 && <span className="nav-admin-badge">{noLeidas > 9 ? '9+' : noLeidas}</span>}
          </button>
          {notifAbierto && (
            <>
              <button className="nav-admin-fondo" onClick={() => setNotifAbierto(false)} aria-label="Cerrar notificaciones" />
              <div className="nav-admin-desplegable nav-admin-desplegable-derecha nav-admin-notificaciones">
                <div className="nav-admin-notificaciones-header">
                  <strong>Notificaciones</strong>
                  {noLeidas > 0 && (
                    <button className="btn-texto" style={{ padding: 0, fontSize: 12 }} onClick={marcarLeidas}>
                      Marcar todas leídas
                    </button>
                  )}
                </div>
                {notificaciones.length === 0 ? (
                  <p style={{ fontSize: 13, color: 'var(--texto-tenue)', padding: '10px 12px', margin: 0 }}>Sin notificaciones.</p>
                ) : (
                  notificaciones.slice(0, 20).map((n) => (
                    <div key={n.id} className={`nav-admin-notificacion${!n.leido_en ? ' no-leida' : ''}`}>
                      <div style={{ fontSize: 13 }}>{n.mensaje}</div>
                      <div style={{ fontSize: 11, color: 'var(--texto-tenue)' }}>
                        {n.numero_inventario ? `${n.numero_inventario} · ` : ''}{formatearFecha(n.creado_en)}
                      </div>
                    </div>
                  ))
                )}
              </div>
            </>
          )}
        </div>

        <div className="nav-admin-usuario nav-admin-desktop">
          <button className="nav-admin-usuario-boton" onClick={() => setUsuarioAbierto((v) => !v)}>
            <span className="nav-admin-avatar">{inicial(admin)}</span>
            <span className="nav-admin-usuario-nombre">{admin.nombre || admin.email}</span>
          </button>
          {usuarioAbierto && (
            <>
              <button className="nav-admin-fondo" onClick={() => setUsuarioAbierto(false)} aria-label="Cerrar menú" />
              <div className="nav-admin-desplegable nav-admin-desplegable-derecha">
                <button className={vista === 'perfil' ? 'activo' : ''} onClick={() => ir('perfil')}>
                  Mi perfil
                </button>
                <button onClick={onSalir}>Salir</button>
              </div>
            </>
          )}
        </div>

        <button className="nav-admin-movil-boton nav-admin-movil" onClick={() => setMovilAbierto((v) => !v)} aria-label="Menú">
          {movilAbierto ? '✕' : '☰'}
        </button>
      </div>

      {movilAbierto && (
        <div className="nav-admin-movil-panel nav-admin-movil">
          {menus.map((menu) => (
            <div key={menu.id}>
              <div className="nav-admin-movil-seccion">{menu.label}</div>
              {menu.items.map((item) => (
                <button key={item.vista} className={item.vista === vista ? 'activo' : ''} onClick={() => ir(item.vista)}>
                  {item.label}
                </button>
              ))}
            </div>
          ))}
          <div className="nav-admin-movil-seccion">{admin.nombre || admin.email}</div>
          <button className={vista === 'perfil' ? 'activo' : ''} onClick={() => ir('perfil')}>Mi perfil</button>
          <button onClick={onSalir}>Salir</button>
        </div>
      )}
    </div>
  );
}
