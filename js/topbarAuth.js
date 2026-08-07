/* Swaps the topbar's "Sign in" link for a username + tier badge that opens
   a small dropdown (Upgrade plan / Log out), based on the client-only auth
   stub in js/auth.js. */
(function(){
  "use strict";
  const link = document.getElementById("topbarAuthLink");
  const dropdown = document.getElementById("profileDropdown");
  if(!link) return;
  const user = window.SwingAI.auth.getCurrentUser();
  if(!user) return;

  const plan = window.SwingAI.auth.getPlan();
  const badge = plan === "premium" ? ' <span class="tier-badge" title="Premium">\u{1F451}</span>'
    : plan === "basic" ? ' <span class="tier-badge" title="Basic">\u{1F48E}</span>'
    : "";
  link.innerHTML = user.username + badge;
  link.removeAttribute("href");
  link.style.cursor = "pointer";

  link.addEventListener("click", e => {
    e.preventDefault();
    dropdown.hidden = !dropdown.hidden;
  });
  document.addEventListener("click", e => {
    if(!dropdown.hidden && !e.target.closest("#profileMenu")){
      dropdown.hidden = true;
    }
  });

  const logoutBtn = document.getElementById("logoutBtn");
  if(logoutBtn){
    logoutBtn.addEventListener("click", () => {
      window.SwingAI.auth.clearCurrentUser();
      window.location.reload();
    });
  }
})();
