/* Plan selection. "Get in for free" (plain link in subscription.html) just
   goes straight into the app. The paid buttons are wired up to POST to
   /api/create-checkout-session, which doesn't exist yet — real charging
   needs Stripe keys and a backend to record the resulting subscription
   (see sql/schema.sql). Until then this shows an honest "not connected
   yet" message instead of pretending a purchase went through. */
(function(){
  "use strict";

  document.querySelectorAll(".plan-choose-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const plan = btn.dataset.plan;
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Starting checkout...";
      try{
        const res = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan })
        });
        if(!res.ok) throw new Error();
        const { url } = await res.json();
        window.location.href = url;
      } catch(e){
        btn.disabled = false;
        btn.textContent = original;
        alert("Payments aren't connected yet. Once Stripe is wired up, this button will take you to checkout for the " + plan + " plan.");
      }
    });
  });
})();
