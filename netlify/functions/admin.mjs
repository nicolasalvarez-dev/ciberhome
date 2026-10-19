// API del panel de administración: login con token firmado y lectura de datos (solo admin).
import { getStore } from "@netlify/blobs";
import { createHmac, timingSafeEqual } from "node:crypto";
const USER = process.env.ADMIN_USER || "admin";
const PASS = process.env.ADMIN_PASS || ""; // OBLIGATORIA: sin ADMIN_PASS el panel queda cerrado (Netlify → Environment variables)
// MODO DEMO (presentación al profesor): entra con usuario "admin" y contraseña "123" y ve todos los datos reales.
// Para DESACTIVARLO antes de abrir la tienda al público: en Netlify crea ADMIN_DEMO_OFF=1 y vuelve a desplegar.
const DEMO = process.env.ADMIN_DEMO_OFF !== "1";
const DEMO_PASS = "123";
const SECRET = process.env.ADMIN_SECRET || `cb|${USER}|${PASS}`; // mejor define ADMIN_SECRET (texto aleatorio largo)
const sign = (t) => createHmac("sha256", SECRET).update(String(t)).digest("hex");
const eq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && timingSafeEqual(x, y); };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const many = async (st, keys) => { const out = []; for (let i = 0; i < keys.length; i += 25) out.push(...(await Promise.all(keys.slice(i, i + 25).map((k) => st.get(k, { type: "json" }))))); return out.filter(Boolean); };
export default async (req, ctx) => {
  if (req.method !== "POST") return json({ error: "método" }, 405);
  let b; try { b = JSON.parse(await req.text()); } catch { return json({ error: "bad" }, 400); }
  const st = getStore({ name: "ciberhome", consistency: "strong" });
  if ((!PASS || PASS.length < 8) && !DEMO) return json({ error: "Panel desactivado: define ADMIN_PASS (mínimo 8 caracteres) en Netlify." }, 503);
  if (b.a === "login") {
    const lk = "lock/" + String((ctx && ctx.ip) || "x").replace(/[^\w.:]/g, "_"), l = (await st.get(lk, { type: "json" })) || { n: 0, t: 0 };
    const u = String(b.u || "").trim().toLowerCase(); // el usuario no distingue mayúsculas (Admin = admin)
    const realOk = PASS.length >= 8 && eq(u, USER.trim().toLowerCase()) && eq(b.p || "", PASS);
    const demoOk = DEMO && eq(u, "admin") && eq(b.p || "", DEMO_PASS);
    // En modo demo la clave es pública, así que el bloqueo por intentos no aplica a las credenciales demo correctas.
    if (!demoOk && l.n >= 5 && Date.now() - l.t < 15 * 60e3) return json({ error: "Demasiados intentos. Espera 15 minutos." }, 429);
    if (realOk || demoOk) {
      await st.delete(lk).catch(() => {});
      const exp = Date.now() + 8 * 3600e3; return json({ ok: true, tok: exp + "." + sign(exp), weak: !realOk });
    }
    await st.setJSON(lk, { n: Date.now() - l.t < 15 * 60e3 ? l.n + 1 : 1, t: Date.now() });
    return json({ error: "Usuario o contraseña incorrectos." }, 401);
  }
  const [exp, sig] = String(b.tok || "").split(".");
  if (!exp || !sig || +exp < Date.now() || !eq(sig, sign(exp))) return json({ error: "sesión" }, 401);
  if (b.a === "data") {
    const days = Math.min(90, Math.max(1, +b.days || 30)), pre = [];
    for (let i = 0; i < days; i++) pre.push(new Date(Date.now() - i * 864e5).toISOString().slice(0, 10));
    const lists = await Promise.all(pre.map((d) => st.list({ prefix: `s/${d}/` })));
    const sk = lists.flatMap((r) => r.blobs.map((x) => x.key)).slice(0, 4000);
    const [uk, ok] = await Promise.all([st.list({ prefix: "u/" }), st.list({ prefix: "o/" })]);
    const [sessions, users, orders] = await Promise.all([many(st, sk), many(st, uk.blobs.map((x) => x.key)), many(st, ok.blobs.map((x) => x.key))]);
    return json({ sessions, users, orders });
  }
  return json({ error: "acción" }, 400);
};
