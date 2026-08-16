import { useState } from 'react';

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
      items: [{ label: 'Validar tax cerrados', vista: 'auditoria' }],
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

export function HeaderAdmin({ admin, vista, onNavegar, onSalir }) {
  const [menuAbierto, setMenuAbierto] = useState(null); // id de menú desktop abierto
  const [usuarioAbierto, setUsuarioAbierto] = useState(false);
  const [movilAbierto, setMovilAbierto] = useState(false);

  const menus = armarMenus(admin);

  function ir(vistaDestino) {
    onNavegar(vistaDestino);
    setMenuAbierto(null);
    setUsuarioAbierto(false);
    setMovilAbierto(false);
  }

  function menuActivo(menu) {
    return menu.items.some((i) => i.vista === vista);
  }

  return (
    <div className="encabezado-admin">
      <div className="encabezado-admin-fila">
        <button className="encabezado-admin-marca" onClick={() => ir('menu')}>
          Inventario <span>BTA</span>
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
