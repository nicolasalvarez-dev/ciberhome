/**
 * CiberHome · Base de datos en Google Sheets (Apps Script)
 * Recibe cuentas y pedidos desde la web (a través de Netlify) y los guarda en 3 hojas:
 *   Pedidos  → un pedido por fila
 *   Lineas   → un producto por fila (para filtrar por producto)
 *   Cuentas  → un usuario por fila
 * No se guardan contraseñas ni datos de pago.
 */

// 1) Pon aquí una clave larga inventada por ti. Debe ser IGUAL que la variable SHEETS_TOKEN de Netlify.
const TOKEN = 'PON-AQUI-UNA-CLAVE-LARGA';
const TZ = 'Europe/Madrid';

const COLS = {
  Pedidos: ['Fecha', 'Nº pedido', 'Usuario', 'Email', 'Nombre', 'Apellidos', 'Teléfono', 'Dirección', 'CP', 'Ciudad',
            'Método de pago', 'Entrega', 'Tienda de recogida', 'Instalación', 'Subtotal (€)', 'Instalación (€)',
            'Descuento (€)', 'Código promo', 'Total (€)', 'Nº productos', 'Productos'],
  Lineas:  ['Fecha', 'Nº pedido', 'ID producto', 'Producto', 'Cantidad', 'Total línea (€)'],
  Cuentas: ['Usuario', 'Email', 'Nombre', 'Método de acceso', 'Fecha de alta', 'Último acceso', 'Nº accesos', 'País', 'Ciudad']
};
const D = 'dd/mm/yyyy hh:mm', T = '@', M = '#,##0.00', N = '0';
const FMT = {
  Pedidos: [D, T, T, T, T, T, T, T, T, T, T, T, T, T, M, M, M, T, M, N, T],
  Lineas:  [D, T, T, T, N, M],
  Cuentas: [T, T, T, T, D, D, N, T, T]
};

/** Ejecuta esta función UNA vez (menú Ejecutar → setup) para crear las hojas con sus filtros. */
function setup() {
  Object.keys(COLS).forEach(function (n) { ensureFilter_(sh_(n)); });
}

function doGet() { return out_({ ok: true, servicio: 'CiberHome Sheets' }); }

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const b = JSON.parse(e.postData.contents);
    if (b.token !== TOKEN) return out_({ ok: false, error: 'token' });
    if (b.t === 'order' && b.o && b.o.id) saveOrder_(b.o);
    else if (b.t === 'user' && b.u && b.u.username) saveUser_(b.u);
    else return out_({ ok: false, error: 'evento' });
    return out_({ ok: true });
  } catch (err) {
    return out_({ ok: false, error: String(err) });
  } finally {
    lock.releaseLock();
  }
}

function saveOrder_(o) {
  const ship = o.ship || {}, items = o.items || [], when = new Date(o.createdAt || Date.now());
  const row = [
    when, o.id, o.user || '', ship.email || '', ship.nombre || '', ship.apellidos || '', ship.telefono || '',
    ship.direccion || '', ship.cp || '', ship.ciudad || '', o.method || '',
    o.pickup ? 'Recogida en tienda' : 'Envío a domicilio', (o.store && o.store.name) || '', o.install ? 'Sí' : 'No',
    num_(o.subtotal), num_(o.installFee), num_(o.discount), o.promo || '', num_(o.total),
    items.reduce(function (a, i) { return a + num_(i.qty); }, 0),
    items.map(function (i) { return i.qty + ' × ' + i.name; }).join('; ')
  ];
  upsert_(sh_('Pedidos'), 'Pedidos', 2, o.id, row);

  // Líneas: se borran las del pedido (por si llega repetido) y se vuelven a escribir
  const L = sh_('Lineas');
  const ids = L.getLastRow() > 1 ? L.getRange(2, 2, L.getLastRow() - 1, 1).getValues() : [];
  for (let i = ids.length - 1; i >= 0; i--) if (String(ids[i][0]) === String(o.id)) L.deleteRow(i + 2);
  if (items.length) {
    const rows = items.map(function (i) { return [when, o.id, i.id || '', i.name || '', num_(i.qty), num_(i.total)]; });
    const r = L.getRange(L.getLastRow() + 1, 1, rows.length, COLS.Lineas.length);
    r.setNumberFormats(rows.map(function () { return FMT.Lineas; }));
    r.setValues(rows);
  }
}

function saveUser_(u) {
  const row = [
    u.username, u.email || '', u.name || '', u.method || 'Contraseña',
    u.createdAt ? new Date(u.createdAt) : '', u.lastLogin ? new Date(u.lastLogin) : '',
    num_(u.logins), u.country || '', u.city || ''
  ];
  upsert_(sh_('Cuentas'), 'Cuentas', 1, u.username, row);
}

/** Si ya existe una fila con ese identificador la actualiza; si no, la añade al final. */
function upsert_(sheet, name, keyCol, id, row) {
  const last = sheet.getLastRow();
  let target = 0;
  if (last > 1) {
    const vals = sheet.getRange(2, keyCol, last - 1, 1).getValues();
    for (let i = 0; i < vals.length; i++) if (String(vals[i][0]) === String(id)) { target = i + 2; break; }
  }
  if (!target) target = Math.max(last, 1) + 1;
  const r = sheet.getRange(target, 1, 1, row.length);
  r.setNumberFormats([FMT[name]]);   // primero el formato (texto, fecha, euros) y después los valores
  r.setValues([row]);
}

function sh_(name) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let s = ss.getSheetByName(name);
  if (!s) {
    s = ss.insertSheet(name);
    const h = COLS[name];
    s.getRange(1, 1, 1, h.length).setValues([h]).setFontWeight('bold').setBackground('#5B5FEF').setFontColor('#FFFFFF');
    s.setFrozenRows(1);
  }
  return s;
}

function ensureFilter_(s) {
  if (!s.getFilter()) s.getRange(1, 1, s.getMaxRows(), COLS[s.getName()].length).createFilter();
}

function num_(v) { const n = Number(v); return isFinite(n) ? n : 0; }
function out_(o) { return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON); }
