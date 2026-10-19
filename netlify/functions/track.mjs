// Recibe eventos anónimos de la web (sesiones, cuentas, pedidos) y los guarda en Netlify Blobs.
import { getStore } from "@netlify/blobs";
const s = (v, n = 120) => String(v == null ? "" : v).slice(0, n);
const n = (v) => (Number.isFinite(+v) ? +v : 0);
// Copia opcional de cuentas y pedidos en una hoja de Google Sheets (Apps Script). Variables en Netlify: SHEETS_URL y SHEETS_TOKEN.
const SHEETS_URL = process.env.SHEETS_URL || "", SHEETS_TOKEN = process.env.SHEETS_TOKEN || "";
const toSheets = async (payload) => {
  if (!SHEETS_URL) return;
  try { await fetch(SHEETS_URL, { method: "POST", headers: { "content-type": "text/plain;charset=utf-8" }, body: JSON.stringify({ token: SHEETS_TOKEN, ...payload }), redirect: "follow", signal: AbortSignal.timeout(8000) }); } catch {}
};
const key = (v) => s(v, 80).replace(/[^\w.@-]/g, "_");
export default async (req, ctx) => {
  if (req.method !== "POST") return new Response("", { status: 405 });
  let b;
  try { b = JSON.parse(await req.text()); } catch { return new Response("bad", { status: 400 }); }
  const st = getStore({ name: "ciberhome", consistency: "strong" });
  const geo = (ctx && ctx.geo) || {};
  const country = (geo.country && geo.country.code) || "", city = geo.city || "";
  try {
    if (b.t === "session" && b.s && b.s.sid) {
      const x = b.s, day = new Date(n(x.start) || Date.now()).toISOString().slice(0, 10);
      const prod = {};
      Object.entries(x.prod || {}).slice(0, 40).forEach(([k, v]) => (prod[key(k)] = { v: n(v && v.v), a: n(v && v.a) }));
      const ev = {};
      Object.entries(x.ev || {}).slice(0, 12).forEach(([k, v]) => (ev[key(k)] = n(v)));
      await st.setJSON(`s/${day}/${key(x.sid)}`, {
        sid: key(x.sid), vid: key(x.vid), start: n(x.start), last: n(x.last), pv: n(x.pv),
        pages: (x.pages || []).slice(0, 40).map((p) => [s(p[0], 80), n(p[1])]),
        dev: s(x.dev, 20), os: s(x.os, 20), br: s(x.br, 20), lang: s(x.lang, 10), scr: s(x.scr, 12),
        ref: s(x.ref, 80), src: s(x.src, 60), isNew: !!x.isNew, user: s(x.user, 40),
        ev, prod, q: (x.q || []).slice(0, 10).map((t) => s(t, 60)), country, city,
      });
    } else if (b.t === "user" && b.u && b.u.username) {
      const u = b.u, k = "u/" + key(u.username), old = (await st.get(k, { type: "json" })) || {};
      const rec = {
        username: s(u.username, 40), email: s(u.email, 100), name: s(u.name, 80),
        method: u.google ? "Google" : "Contraseña", createdAt: old.createdAt || n(u.createdAt) || Date.now(),
        lastLogin: n(u.lastLogin) || old.lastLogin || 0, logins: (old.logins || 0) + (b.login ? 1 : 0),
        country: country || old.country || "", city: city || old.city || "",
      };
      await st.setJSON(k, rec);
      await toSheets({ t: "user", u: rec });
    } else if (b.t === "order" && b.o && b.o.id) {
      const o = b.o;
      const rec = {
        id: s(o.id, 40), createdAt: n(o.createdAt), method: s(o.method, 20), pickup: !!o.pickup, install: !!o.install,
        store: o.store ? { name: s(o.store.name, 80) } : null,
        items: (o.items || []).slice(0, 50).map((i) => ({ id: s(i.id, 40), name: s(i.name, 100), qty: n(i.qty), total: n(i.total) })),
        subtotal: n(o.subtotal), installFee: n(o.installFee), total: n(o.total), discount: n(o.discount), promo: s(o.promo, 20),
        ship: Object.fromEntries(["nombre", "apellidos", "direccion", "cp", "ciudad", "telefono", "email"].map((f) => [f, s(o.ship && o.ship[f], 120)])),
        user: s(b.user || o.user, 40), country, city,
      };
      await st.setJSON("o/" + key(o.id), rec);
      await toSheets({ t: "order", o: rec });
    } else return new Response("ignored", { status: 400 });
  } catch (e) { return new Response("err", { status: 500 }); }
  return new Response("ok");
};
