/**
 * STATLAB — utilidades de DOM
 * ---------------------------------------------------------------------------
 * Se construye la interfaz creando nodos, nunca inyectando HTML procedente de
 * datos. `el()` acepta hijos como cadenas (que se insertan siempre como
 * texto → protección XSS por construcción) o como nodos.
 *
 * Sólo `html()` permite marcado, y está reservada a plantillas literales
 * escritas por nosotros (nunca con datos de usuario interpolados).
 */

/** Crea un elemento. `attrs` admite: class, id, text, html, aria-*, data-*,
 *  on<Evento> (función), y cualquier atributo estándar. */
export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'class') node.className = v;
    else if (k === 'text') node.textContent = String(v);
    else if (k === 'html') node.innerHTML = v;           // solo plantillas propias
    else if (k === 'dataset') Object.assign(node.dataset, v);
    else if (k === 'style' && typeof v === 'object') Object.assign(node.style, v);
    else if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v);
    } else if (v === true) node.setAttribute(k, '');
    else node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

export function append(parent, children) {
  const list = Array.isArray(children) ? children : [children];
  for (const c of list.flat(4)) {
    if (c === null || c === undefined || c === false || c === '') continue;
    parent.appendChild(typeof c === 'object' && c.nodeType ? c : document.createTextNode(String(c)));
  }
  return parent;
}

/** Vacía un nodo. */
export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

/** Sustituye el contenido de un nodo. */
export function replace(node, children) {
  clear(node);
  return append(node, children);
}

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/** Fragmento a partir de una plantilla literal propia (sin datos de usuario). */
export function html(strings, ...values) {
  const tpl = document.createElement('template');
  tpl.innerHTML = String.raw({ raw: strings }, ...values);
  return tpl.content;
}

/** Etiqueta <svg> y descendientes necesitan namespace propio. */
export function svgEl(tag, attrs = {}, children = []) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v === null || v === undefined || v === false) continue;
    if (k === 'text') { node.textContent = String(v); continue; }
    if (k.startsWith('on') && typeof v === 'function') {
      node.addEventListener(k.slice(2).toLowerCase(), v); continue;
    }
    node.setAttribute(k, String(v));
  }
  append(node, children);
  return node;
}

/* ---------------------------------------------------------------- toasts -- */

let toastSeq = 0;
export function toast(message, kind = '', ms = 3800) {
  const root = document.getElementById('toaster');
  if (!root) return;
  const id = ++toastSeq;
  const node = el('div', { class: `toast ${kind ? 'toast--' + kind : ''}`, 'data-toast': id, text: message });
  root.appendChild(node);
  setTimeout(() => { node.style.opacity = '0'; setTimeout(() => node.remove(), 250); }, ms);
}

/* ---------------------------------------------------------------- modal --- */

let lastFocused = null;

/** Abre un modal accesible. `body` y `footer` son nodos. Devuelve cerrar(). */
export function modal({ title, body, footer, onClose, labelledBy = 'modalTitle' }) {
  const root = document.getElementById('modalRoot');
  lastFocused = document.activeElement;

  const close = () => {
    document.removeEventListener('keydown', onKey);
    clear(root);
    if (lastFocused && lastFocused.focus) lastFocused.focus();
    if (onClose) onClose();
  };

  const onKey = (e) => {
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'Tab') trapFocus(e, box);
  };

  const closeBtn = el('button', {
    class: 'btn btn--icon btn--ghost', type: 'button',
    'aria-label': 'Cerrar', onClick: close, html: '<span aria-hidden="true">✕</span>',
  });

  const box = el('div', { class: 'modal', role: 'dialog', 'aria-modal': 'true', 'aria-labelledby': labelledBy }, [
    el('div', { class: 'modal__head' }, [
      el('h2', { id: labelledBy, text: title, style: { margin: '0' } }),
      closeBtn,
    ]),
    body,
    footer ? el('div', { class: 'modal__foot' }, footer) : null,
  ]);

  const backdrop = el('div', {
    class: 'modal-backdrop',
    onClick: (e) => { if (e.target === backdrop) close(); },
  }, [box]);

  replace(root, backdrop);
  document.addEventListener('keydown', onKey);
  const first = box.querySelector('input,select,textarea,button:not([aria-label="Cerrar"]),a[href]') || closeBtn;
  first.focus();
  return close;
}

const FOCUSABLE = 'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

function trapFocus(e, container) {
  const items = Array.from(container.querySelectorAll(FOCUSABLE)).filter((n) => n.offsetParent !== null);
  if (!items.length) return;
  const first = items[0], last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
  else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
}

/** Confirmación accesible basada en promesa (evita window.confirm, que bloquea). */
export function confirmDialog({ title, message, confirmText = 'Confirmar', cancelText = 'Cancelar', danger = false }) {
  return new Promise((resolve) => {
    let settled = false;
    const done = (v) => { if (!settled) { settled = true; resolve(v); } };
    const close = modal({
      title,
      body: el('p', { text: message }),
      footer: [
        el('button', { class: 'btn', type: 'button', text: cancelText, onClick: () => { done(false); close(); } }),
        el('button', {
          class: `btn ${danger ? 'btn--danger' : 'btn--primary'}`, type: 'button', text: confirmText,
          onClick: () => { done(true); close(); },
        }),
      ],
      onClose: () => done(false),
    });
  });
}

/** Anuncia un mensaje a lectores de pantalla sin mover el foco. */
export function announce(message) {
  let live = document.getElementById('srLive');
  if (!live) {
    live = el('div', { id: 'srLive', class: 'sr-only', role: 'status', 'aria-live': 'polite' });
    document.body.appendChild(live);
  }
  live.textContent = '';
  setTimeout(() => { live.textContent = message; }, 30);
}

/** Mueve el foco al contenedor principal tras un cambio de ruta. */
export function focusMain() {
  const main = document.getElementById('main');
  if (main) { main.focus({ preventScroll: true }); window.scrollTo({ top: 0, behavior: 'auto' }); }
}
