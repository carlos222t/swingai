(function(){
  "use strict";
  const auth = window.SwingAI.auth;
  const PENDING_KEY = "swingai_pending_signup";
  const TOKEN_KEY = "swingai_pending_token";

  const pendingRaw = sessionStorage.getItem(PENDING_KEY);
  if(!pendingRaw){
    window.location.href = "signup";
    return;
  }
  const pending = JSON.parse(pendingRaw);
  document.getElementById("emailDisplay").textContent = pending.email;

  function showError(id, msg){
    const el = document.getElementById(id);
    el.textContent = msg;
    el.hidden = false;
  }

  async function requestCode(){
    const res = await fetch("/api/send-verification-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email: pending.email })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Couldn't send the verification code.");
    sessionStorage.setItem(TOKEN_KEY, data.token);
  }

  document.getElementById("sendForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("sendBtn");
    document.getElementById("sendError").hidden = true;
    btn.disabled = true;
    btn.textContent = "Sending...";

    try{
      await requestCode();
      document.getElementById("pageSub").textContent = `Code sent to ${pending.email}. Enter it below.`;
      document.getElementById("sendForm").hidden = true;
      document.getElementById("verifyForm").hidden = false;
      document.getElementById("code").focus();
    } catch(e){
      showError("sendError", e.message);
      btn.disabled = false;
      btn.textContent = "Send code";
    }
  });

  document.getElementById("verifyForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("verifyBtn");
    const code = document.getElementById("code").value.trim();
    const token = sessionStorage.getItem(TOKEN_KEY);
    document.getElementById("verifyError").hidden = true;

    if(!token){
      showError("verifyError", "That code expired or wasn't sent from this page. Hit resend.");
      return;
    }

    btn.disabled = true;
    btn.textContent = "Verifying...";

    try{
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pending.email, code, token })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Verification failed.");

      const users = auth.getUsers();
      users.push({ username: pending.username, email: pending.email, passwordHash: pending.passwordHash, plan: "free", createdAt: Date.now() });
      auth.saveUsers(users);
      auth.setCurrentUser({ username: pending.username, email: pending.email, plan: "free" });

      sessionStorage.removeItem(PENDING_KEY);
      sessionStorage.removeItem(TOKEN_KEY);

      document.getElementById("verifyForm").hidden = true;
      document.getElementById("signinSwitch").hidden = true;
      document.getElementById("successStage").hidden = false;
    } catch(e){
      showError("verifyError", e.message);
      btn.disabled = false;
      btn.textContent = "Verify & create account";
    }
  });

  document.getElementById("resendBtn").addEventListener("click", async () => {
    const btn = document.getElementById("resendBtn");
    btn.disabled = true;
    btn.textContent = "Resending...";
    try{
      await requestCode();
      document.getElementById("verifyError").hidden = true;
    } catch(e){
      showError("verifyError", e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Resend code";
    }
  });
})();
