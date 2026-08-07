/* Sends a 6-digit email verification code via Resend. No database, so the
   code isn't stored anywhere server-side — instead it's packed into a
   signed, expiring token (HMAC'd with VERIFICATION_SECRET) that's handed
   back to the client and round-tripped to /api/verify-code along with
   whatever the user typed in. Anyone tampering with the token invalidates
   the signature; anyone without the secret can't forge one. */
"use strict";
const crypto = require("crypto");

function sign(payload, secret){
  const b64 = Buffer.from(JSON.stringify(payload)).toString("base64url");
  const sig = crypto.createHmac("sha256", secret).update(b64).digest("base64url");
  return `${b64}.${sig}`;
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

  if(!process.env.VERIFICATION_SECRET || !process.env.RESEND_API_KEY){
    res.status(500).json({ error: "Email verification isn't configured yet." });
    return;
  }

  let body;
  try{ body = JSON.parse(await readBody(req)); }
  catch(e){ res.status(400).json({ error: "Invalid JSON body" }); return; }

  const email = (body.email || "").trim().toLowerCase();
  if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){
    res.status(400).json({ error: "Enter a valid email address." });
    return;
  }

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const exp = Date.now() + 10 * 60 * 1000; // 10 minutes
  const token = sign({ email, code, exp }, process.env.VERIFICATION_SECRET);

  try{
    const emailRes = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${process.env.RESEND_API_KEY}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: "SwingAI <verify@swingai.net>",
        to: [email],
        subject: "Your SwingAI verification code",
        html: `<p>Your verification code is <b style="font-size:20px;">${code}</b></p><p>It expires in 10 minutes. If you didn't request this, you can ignore it.</p>`
      })
    });
    if(!emailRes.ok){
      const errBody = await emailRes.text();
      throw new Error(`Resend error: ${errBody}`);
    }
  } catch(e){
    res.status(500).json({ error: e.message || "Couldn't send the verification email." });
    return;
  }

  res.status(200).json({ token });
};
