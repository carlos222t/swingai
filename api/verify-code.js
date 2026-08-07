/* Verifies the code the user typed against the signed token from
   /api/send-verification-code. Stateless — the token itself carries the
   email, code and expiry, so there's nothing to look up server-side. */
"use strict";
const crypto = require("crypto");

function verify(token, secret){
  const [b64, sig] = (token || "").split(".");
  if(!b64 || !sig) return null;
  const expected = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  if(sig !== expected) return null;
  try{ return JSON.parse(Buffer.from(b64, "base64url").toString()); }
  catch(e){ return null; }
}

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

  if(!process.env.VERIFICATION_SECRET){
    res.status(500).json({ error: "Email verification isn't configured yet." });
    return;
  }

  let body;
  try{ body = JSON.parse(await readBody(req)); }
  catch(e){ res.status(400).json({ error: "Invalid JSON body" }); return; }

  const { email, code, token } = body;
  const payload = verify(token, process.env.VERIFICATION_SECRET);

  if(!payload){ res.status(400).json({ error: "Invalid or tampered verification token." }); return; }
  if(payload.email !== (email || "").trim().toLowerCase()){ res.status(400).json({ error: "Email doesn't match this code." }); return; }
  if(Date.now() > payload.exp){ res.status(400).json({ error: "This code has expired. Request a new one." }); return; }
  if(payload.code !== code){ res.status(400).json({ error: "Incorrect code." }); return; }

  res.status(200).json({ ok: true });
};
