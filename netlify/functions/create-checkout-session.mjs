// Crea una sesión de Stripe Checkout (se ejecuta en el servidor: aquí sí se usa la clave SECRETA).
// Incluye el código de primera compra BIENVENIDO10 (-10 % en productos), validado en el servidor.
import Stripe from "stripe";
import { getStore } from "@netlify/blobs";

const PROMO = { code: "BIENVENIDO10", pct: 10 };
// Catálogo oficial: los precios se calculan AQUÍ, nunca se fían del navegador. Mantenlo igual que PRODUCTS en public/index.html.
const CATALOG = {
  cam1: { name: "Cámara exterior HD", price: 79 }, cerr1: { name: "Cerradura inteligente", price: 129 },
  rob1: { name: "Robot aspirador", price: 249 }, asis1: { name: "Altavoz asistente inteligente", price: 59 },
  bomb1: { name: "Bombillas inteligentes (pack 3)", price: 39 }, term1: { name: "Termostato inteligente", price: 119 },
  "acc-panel-cam1": { name: "Panel solar para cámara", price: 19 }, "acc-soporte-cam1": { name: "Soporte de pared orientable", price: 9 },
  "acc-filtro-rob1": { name: "Filtro HEPA de repuesto", price: 15 }, "acc-base-rob1": { name: "Base de carga y vaciado automático", price: 89 },
};
const INSTALL_FEE = 29, STEP = 0.07; // +7 % por cada unidad extra del mismo producto
const totalCents = (base, qty) => { let t = 0; for (let i = 0; i < qty; i++) t += base * (1 + STEP * i); return Math.round(Math.round(t * 100)); };
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });
const promoErr = (m) => json({ error: m, promoError: true }, 400);

// ¿Ya compró antes este correo/usuario? Se mira en Stripe (pagos hechos) y en los pedidos guardados.
async function yaCompro(stripe, email, user) {
  let ok = 0, found = false;
  if (/^[^\s'"\\]+@[^\s'"\\]+$/.test(email)) {
    try {
      const r = await stripe.paymentIntents.search({ query: `status:'succeeded' AND metadata['email']:'${email}'`, limit: 1 });
      ok++; if (r.data.length) found = true;
    } catch (e) { /* la búsqueda puede no estar disponible en tu cuenta */ }
  }
  try {
    const st = getStore({ name: "ciberhome", consistency: "strong" });
    const keys = (await st.list({ prefix: "o/" })).blobs.map((b) => b.key).slice(0, 1000);
    for (let i = 0; i < keys.length && !found; i += 25) {
      const rows = await Promise.all(keys.slice(i, i + 25).map((k) => st.get(k, { type: "json" })));
      found = rows.some((o) => o && ((o.ship && String(o.ship.email || "").toLowerCase() === email) || (user && o.user === user)));
    }
    ok++;
  } catch (e) { /* Blobs no disponible en local */ }
  return ok ? found : null; // null = no se pudo comprobar
}

export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!process.env.STRIPE_SECRET_KEY) return json({ error: "Falta configurar STRIPE_SECRET_KEY en las variables de entorno de Netlify." }, 500);
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
  try {
    const body = JSON.parse((await req.text()) || "{}");
    const items = Array.isArray(body.items) ? body.items : [];
    const customer = body.customer || {};
    if (!items.length) return json({ error: "El carrito está vacío." }, 400);
    if (items.length > 50) return json({ error: "Carrito no válido." }, 400);
    const line_items = [];
    for (const it of items) {
      const p = CATALOG[String(it.id)], qty = parseInt(it.qty, 10);
      if (!p || !(qty >= 1 && qty <= 99)) return json({ error: "Carrito no válido." }, 400);
      line_items.push({
        price_data: { currency: "eur", product_data: { name: (qty > 1 ? `${p.name} (x${qty})` : p.name).slice(0, 120) }, unit_amount: totalCents(p.price, qty) },
        quantity: 1,
      });
    }
    const subCents = line_items.reduce((s, l) => s + l.price_data.unit_amount, 0);
    // La instalación solo existe con envío a domicilio (no con recogida en tienda)
    const installFee = body.install && !body.pickup ? INSTALL_FEE : 0;
    if (installFee > 0) line_items.push({ price_data: { currency: "eur", product_data: { name: "Instalación a domicilio" }, unit_amount: installFee * 100 }, quantity: 1 });

    const email = String(customer.email || "").trim().toLowerCase();
    const user = String(customer.user || "").slice(0, 40);
    let discounts;
    if (body.promo) {
      if (String(body.promo).trim().toUpperCase() !== PROMO.code) return promoErr("Ese código de descuento no es válido.");
      const prev = await yaCompro(stripe, email, user);
      if (prev === true) return promoErr("El código BIENVENIDO10 es solo para tu primera compra.");
      if (prev === null) return promoErr("No se pudo comprobar el código ahora mismo. Inténtalo de nuevo o continúa sin código.");
      const coupon = await stripe.coupons.create({ amount_off: Math.round(subCents / 10), currency: "eur", duration: "once", max_redemptions: 1, name: "Primera compra −10 %" });
      discounts = [{ coupon: coupon.id }];
    }

    const siteUrl = process.env.URL || new URL(req.url).origin;
    const meta = { email: email.slice(0, 100), user, promo: discounts ? PROMO.code : "" };
    const session = await stripe.checkout.sessions.create({
      mode: "payment", payment_method_types: ["card"], locale: "es", line_items, discounts,
      customer_email: email || undefined, metadata: meta, payment_intent_data: { metadata: meta },
      success_url: `${siteUrl}/?pago=exito&sid={CHECKOUT_SESSION_ID}`, cancel_url: `${siteUrl}/?pago=cancelado`,
    });
    return json({ url: session.url });
  } catch (err) {
    return json({ error: err.message || "Error creando la sesión de pago." }, 500);
  }
};
