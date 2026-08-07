/* Swaps the topbar's "Sign in" link for the signed-in username + a sign-out
   control, based on the client-only auth stub in js/auth.js. */
(function(){
  "use strict";
  const link = document.getElementById("topbarAuthLink");
  if(!link) return;
  const user = window.SwingAI.auth.getCurrentUser();
  if(!user) return;

  const plan = window.SwingAI.auth.getPlan();
  const planLabel = plan.charAt(0).toUpperCase() + plan.slice(1);
  link.textContent = `${user.username} (${planLabel})`;
  link.removeAttribute("href");
  link.style.cursor = "pointer";
  link.title = "Click to sign out";
  link.addEventListener("click", () => {
    window.SwingAI.auth.clearCurrentUser();
    window.location.reload();
  });
})();
