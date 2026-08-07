/* Plan selection. "Get in for free" (plain link in subscription.html) just
   goes straight into the app. The paid buttons POST to
   /api/create-checkout-session (real Stripe Checkout, test mode) and
   redirect to the URL it returns. */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  document.querySelectorAll(".plan-choose-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const plan = btn.dataset.plan;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Starting checkout...";
      const user = auth.getCurrentUser();
      try{
        const res = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, email: user && user.email, username: user && user.username })
        });
        const data = await res.json();
        if(!res.ok) throw new Error(data.error || "Checkout failed to start.");
        window.location.href = data.url;
      } catch(e){
        btn.disabled = false;
        btn.textContent = original;
        alert("Couldn't start checkout: " + e.message);
      }
    });
  });
})();
