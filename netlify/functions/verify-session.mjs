// Comprueba en Stripe que una sesión de pago está realmente pagada (evita fingir un pedido visitando /?pago=exito).
import Stripe from "stripe";
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
export default async (req) => {
  if (req.method !== "POST") return json({ error: "Método no permitido." }, 405);
  if (!process.env.STRIPE_SECRET_KEY) return json({ paid: false, error: "Stripe no configurado." }, 500);
  try {
    const { sid } = JSON.parse((await req.text()) || "{}");
    if (!/^cs_(test|live)_[A-Za-z0-9]+$/.test(String(sid || ""))) return json({ paid: false }, 400);
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
    const s = await stripe.checkout.sessions.retrieve(sid);
    return json({ paid: s.payment_status === "paid", amount: (s.amount_total || 0) / 100 });
  } catch (e) {
    return json({ paid: false, error: "No se pudo comprobar el pago." }, 500);
  }
};
