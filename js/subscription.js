/* Plan selection. "Get in for free" (plain link in subscription.html) just
   goes straight into the app. The paid buttons POST to
   /api/create-checkout-session (real Stripe Checkout) and redirect to the
   URL it returns. A billing-term toggle swaps between monthly pricing and
   a discounted 6-month term, each with its own Stripe price. */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  const PRICING = {
    basic: {
      monthly: { html: "$19.99<span>/mo</span>", savings: null },
      "6month": { html: "$89.99<span>/6mo</span>", savings: "That's $15.00/mo. Save $29.95 vs paying monthly." }
    },
    premium: {
      monthly: { html: '<span class="plan-price-was">$55.00</span>$39.99<span>/mo</span>', savings: null },
      "6month": { html: "$179.99<span>/6mo</span>", savings: "That's $30.00/mo. Save $59.95 vs paying monthly." }
    }
  };

  let term = "monthly";

  function render(){
    ["basic", "premium"].forEach(plan => {
      const cfg = PRICING[plan][term];
      document.getElementById(plan + "Price").innerHTML = cfg.html;
      const savingsEl = document.getElementById(plan + "Savings");
      if(cfg.savings){
        savingsEl.textContent = cfg.savings;
        savingsEl.hidden = false;
      } else {
        savingsEl.hidden = true;
      }
    });
  }

  document.querySelectorAll(".billing-toggle-btn").forEach(btn => {
    btn.addEventListener("click", () => {
      term = btn.dataset.term;
      document.querySelectorAll(".billing-toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
      render();
    });
  });

  document.querySelectorAll(".plan-choose-btn").forEach(btn => {
    btn.addEventListener("click", async () => {
      const plan = btn.dataset.plan;
      const user = auth.getCurrentUser();
      if(!user){
        window.location.href = "signup.html";
        return;
      }
      const original = btn.textContent;
      btn.disabled = true;
      btn.textContent = "Starting checkout...";
      try{
        const res = await fetch("/api/create-checkout-session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ plan, term, email: user && user.email, username: user && user.username })
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

  render();
})();
