const base = {
  xmlns: 'http://www.w3.org/2000/svg',
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const IconoTienda = (props) => (
  <svg {...base} width={props.tamano ?? 20} height={props.tamano ?? 20} {...props}>
    <path d="M3 21h18" /><path d="M5 21V7l8-4v18" /><path d="M19 21V11l-6-4" />
  </svg>
);

export const IconoCandado = (props) => (
  <svg {...base} width={props.tamano ?? 20} height={props.tamano ?? 20} {...props}>
    <rect x="3" y="11" width="18" height="11" rx="2" /><path d="M7 11V7a5 5 0 0 1 10 0v4" />
  </svg>
);

export const IconoUsuario = (props) => (
  <svg {...base} width={props.tamano ?? 20} height={props.tamano ?? 20} {...props}>
    <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" /><circle cx="12" cy="7" r="4" />
  </svg>
);

export const IconoEscanear = (props) => (
  <svg {...base} width={props.tamano ?? 22} height={props.tamano ?? 22} {...props}>
    <path d="M3 7V5a2 2 0 0 1 2-2h2" /><path d="M17 3h2a2 2 0 0 1 2 2v2" />
    <path d="M21 17v2a2 2 0 0 1-2 2h-2" /><path d="M7 21H5a2 2 0 0 1-2-2v-2" />
    <rect x="7" y="7" width="2" height="10" /><rect x="11" y="7" width="2" height="10" /><rect x="15" y="7" width="2" height="10" />
  </svg>
);

export const IconoCamara = (props) => (
  <svg {...base} width={props.tamano ?? 24} height={props.tamano ?? 24} {...props}>
    <path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z" />
    <circle cx="12" cy="13" r="3" />
  </svg>
);

export const IconoCerrar = (props) => (
  <svg {...base} width={props.tamano ?? 22} height={props.tamano ?? 22} {...props}>
    <line x1="18" y1="6" x2="6" y2="18" /><line x1="6" y1="6" x2="18" y2="18" />
  </svg>
);

export const IconoDescargar = (props) => (
  <svg {...base} width={props.tamano ?? 20} height={props.tamano ?? 20} {...props}>
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" />
  </svg>
);

export const IconoChevron = (props) => (
  <svg {...base} width={props.tamano ?? 14} height={props.tamano ?? 14} {...props}>
    <polyline points="9 18 15 12 9 6" />
  </svg>
);

export const IconoCheck = (props) => (
  <svg {...base} width={props.tamano ?? 14} height={props.tamano ?? 14} {...props}>
    <polyline points="20 6 9 17 4 12" />
  </svg>
);

export const IconoAlerta = (props) => (
  <svg {...base} width={props.tamano ?? 14} height={props.tamano ?? 14} {...props}>
    <path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
    <line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" />
  </svg>
);

export const IconoEliminar = (props) => (
  <svg {...base} width={props.tamano ?? 18} height={props.tamano ?? 18} {...props}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
  </svg>
);
