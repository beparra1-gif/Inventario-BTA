import { io } from 'socket.io-client';
import { api } from './api.js';

// Conexión única y perezosa: se abre recién cuando alguna pantalla la usa
// (dashboard admin, captura viendo otros taxes en vivo), no en el arranque.
let socket = null;

export function obtenerSocket() {
  if (!socket) socket = io(api.urlBase, { autoConnect: true });
  return socket;
}

export function unirseAInventario(inventarioId) {
  obtenerSocket().emit('unirse-inventario', inventarioId);
}

export function unirseAdmin() {
  obtenerSocket().emit('unirse-admin');
}
