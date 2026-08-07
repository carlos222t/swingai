/* Applies the plan the customer just paid for. Stripe redirects here after
   a real checkout completes; we read the plan back off our own success_url
   query param (set in api/create-checkout-session.js) rather than trusting
   anything from Stripe directly, since there's no webhook/backend yet to
   verify session status server-side. */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;
  const params = new URLSearchParams(window.location.search);
  const plan = params.get("plan");

  if(plan === "basic" || plan === "premium"){
    if(auth.getCurrentUser()){
      auth.setPlan(plan);
    } else {
      document.querySelector(".page-sub").textContent =
        "Payment went through, but you weren't signed in to attach it to an account. Sign in, then contact support to activate your plan.";
    }
  }
})();
