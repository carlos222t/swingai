(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  function showError(msg){
    const el = document.getElementById("signinError");
    el.textContent = msg;
    el.hidden = false;
  }

  document.getElementById("signinForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("signinBtn");
    const identifier = document.getElementById("identifier").value.trim().toLowerCase();
    const password = document.getElementById("password").value;

    document.getElementById("signinError").hidden = true;
    btn.disabled = true;
    btn.textContent = "Signing in...";

    const passwordHash = await auth.sha256Hex(password);
    const users = auth.getUsers();
    const user = users.find(u =>
      (u.username.toLowerCase() === identifier || u.email === identifier) &&
      u.passwordHash === passwordHash
    );

    if(!user){
      showError("Incorrect email/username or password.");
      btn.disabled = false;
      btn.textContent = "Sign in";
      return;
    }

    auth.setCurrentUser({ username: user.username, email: user.email, plan: user.plan || "free" });
    window.location.href = "trending.html";
  });
})();
