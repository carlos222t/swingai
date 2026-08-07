(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  let pending = null; // { username, email, passwordHash, token }

  function showError(id, msg){
    const el = document.getElementById(id);
    el.textContent = msg;
    el.hidden = false;
  }

  async function requestCode(email){
    const res = await fetch("/api/send-verification-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email })
    });
    const data = await res.json();
    if(!res.ok) throw new Error(data.error || "Couldn't send the verification code.");
    return data.token;
  }

  document.getElementById("signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("signupBtn");
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    document.getElementById("signupError").hidden = true;

    if(username.length < 3){ showError("signupError", "Username must be at least 3 characters."); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showError("signupError", "Enter a valid email address."); return; }
    if(password.length < 8){ showError("signupError", "Password must be at least 8 characters."); return; }
    if(password !== confirmPassword){ showError("signupError", "Passwords don't match."); return; }

    const users = auth.getUsers();
    if(users.some(u => u.username.toLowerCase() === username.toLowerCase())){
      showError("signupError", "That username is already taken."); return;
    }
    if(users.some(u => u.email === email)){
      showError("signupError", "An account with that email already exists."); return;
    }

    btn.disabled = true;
    btn.textContent = "Sending code...";

    try{
      const passwordHash = await auth.sha256Hex(password);
      const token = await requestCode(email);
      pending = { username, email, passwordHash, token };

      document.getElementById("pageTitle").textContent = "Check your email";
      document.getElementById("pageSub").textContent = `We sent a 6-digit code to ${email}.`;
      document.getElementById("signupForm").hidden = true;
      document.getElementById("signinSwitch").hidden = true;
      document.getElementById("verifyForm").hidden = false;
      document.getElementById("code").focus();
    } catch(e){
      showError("signupError", e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Continue";
    }
  });

  document.getElementById("verifyForm").addEventListener("submit", async e => {
    e.preventDefault();
    if(!pending) return;
    const btn = document.getElementById("verifyBtn");
    const code = document.getElementById("code").value.trim();
    document.getElementById("verifyError").hidden = true;

    btn.disabled = true;
    btn.textContent = "Verifying...";

    try{
      const res = await fetch("/api/verify-code", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: pending.email, code, token: pending.token })
      });
      const data = await res.json();
      if(!res.ok) throw new Error(data.error || "Verification failed.");

      const users = auth.getUsers();
      users.push({ username: pending.username, email: pending.email, passwordHash: pending.passwordHash, plan: "free", createdAt: Date.now() });
      auth.saveUsers(users);
      auth.setCurrentUser({ username: pending.username, email: pending.email, plan: "free" });

      window.location.href = "subscription.html";
    } catch(e){
      showError("verifyError", e.message);
      btn.disabled = false;
      btn.textContent = "Verify & create account";
    }
  });

  document.getElementById("resendBtn").addEventListener("click", async () => {
    if(!pending) return;
    const btn = document.getElementById("resendBtn");
    btn.disabled = true;
    btn.textContent = "Resending...";
    try{
      pending.token = await requestCode(pending.email);
      document.getElementById("verifyError").hidden = true;
    } catch(e){
      showError("verifyError", e.message);
    } finally {
      btn.disabled = false;
      btn.textContent = "Resend code";
    }
  });
})();
