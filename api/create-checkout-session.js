/* Starts a real Stripe Checkout session for the Basic or Premium plan.
   The client (js/subscription.js) POSTs { plan, email, username }, gets
   back a Checkout URL, and redirects the browser there — card entry and
   the actual charge happen on Stripe's hosted page, never on our site.
   No database yet (see sql/schema.sql for the intended users/
   subscriptions tables), so email/username just prefill the Checkout form
   and ride along as metadata for now; once a backend is wired up, the
   success redirect + a webhook should create the real subscription row. */
"use strict";
const Stripe = require("stripe");

let stripe;

const PRICE_IDS = {
  basic: process.env.STRIPE_PRICE_BASIC,
  premium: process.env.STRIPE_PRICE_PREMIUM
};

async function readBody(req){
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){ res.status(405).json({ error: "POST only" }); return; }

  if(!process.env.STRIPE_SECRET_KEY){
    res.status(500).json({ error: "Missing STRIPE_SECRET_KEY" });
    return;
  }

  let body;
  try{ body = JSON.parse(await readBody(req)); }
  catch(e){ res.status(400).json({ error: "Invalid JSON body" }); return; }

  const priceId = PRICE_IDS[body.plan];
  if(!priceId){
    res.status(400).json({ error: "Unknown plan. Expected 'basic' or 'premium'." });
    return;
  }

  if(!stripe) stripe = new Stripe(process.env.STRIPE_SECRET_KEY);

  const origin = req.headers.origin || `https://${req.headers.host}`;

  try{
    const session = await stripe.checkout.sessions.create({
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${origin}/success.html?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription.html`,
      customer_email: body.email || undefined,
      metadata: { plan: body.plan, username: body.username || "" }
    });
    res.status(200).json({ url: session.url });
  } catch(e){
    res.status(500).json({ error: e.message || "Failed to start checkout" });
  }
};
