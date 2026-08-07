(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  function showError(msg){
    const el = document.getElementById("signupError");
    el.textContent = msg;
    el.hidden = false;
  }

  document.getElementById("signupForm").addEventListener("submit", async e => {
    e.preventDefault();
    const btn = document.getElementById("signupBtn");
    const username = document.getElementById("username").value.trim();
    const email = document.getElementById("email").value.trim().toLowerCase();
    const password = document.getElementById("password").value;
    const confirmPassword = document.getElementById("confirmPassword").value;

    document.getElementById("signupError").hidden = true;

    if(username.length < 3){ showError("Username must be at least 3 characters."); return; }
    if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)){ showError("Enter a valid email address."); return; }
    if(password.length < 8){ showError("Password must be at least 8 characters."); return; }
    if(password !== confirmPassword){ showError("Passwords don't match."); return; }

    const users = auth.getUsers();
    if(users.some(u => u.username.toLowerCase() === username.toLowerCase())){
      showError("That username is already taken."); return;
    }
    if(users.some(u => u.email === email)){
      showError("An account with that email already exists."); return;
    }

    btn.disabled = true;
    btn.textContent = "Creating account...";

    const passwordHash = await auth.sha256Hex(password);
    users.push({ username, email, passwordHash, createdAt: Date.now() });
    auth.saveUsers(users);
    auth.setCurrentUser({ username, email });

    window.location.href = "subscription.html";
  });
})();
