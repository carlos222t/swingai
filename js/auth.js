/* Shared auth + plan-gating helpers. IMPORTANT: this is a client-only
   placeholder until a real backend is wired up (see sql/schema.sql for the
   intended users/subscriptions/upload_usage tables). Accounts, plans and
   upload counts here all live in this browser's localStorage only —
   nothing is sent to a server, nothing is shared across devices, and none
   of it is tamper-proof (anyone can edit their own localStorage to unlock
   Premium). It exists so the full sign-up -> choose-plan -> gated-feature
   flow can be built and tested end-to-end before a database and API are
   connected and these checks move server-side where they'd actually hold. */
(function(){
  "use strict";

  const USERS_KEY = "swingai_users_v1";
  const CURRENT_USER_KEY = "swingai_current_user_v1";
  const UPLOAD_USAGE_KEY = "swingai_upload_usage_v1";

  // Mirrors the plans table in sql/schema.sql.
  const PLAN_LIMITS = {
    free:    { monthlyUploads: 0,  premiumStocks: false },
    basic:   { monthlyUploads: 5,  premiumStocks: false },
    premium: { monthlyUploads: 15, premiumStocks: true }
  };

  async function sha256Hex(text){
    const buf = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
    return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, "0")).join("");
  }

  function getUsers(){
    try{ return JSON.parse(localStorage.getItem(USERS_KEY) || "[]"); }
    catch(e){ return []; }
  }
  function saveUsers(users){
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  function getCurrentUser(){
    try{ return JSON.parse(localStorage.getItem(CURRENT_USER_KEY) || "null"); }
    catch(e){ return null; }
  }
  function setCurrentUser(user){
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
  }
  function clearCurrentUser(){
    localStorage.removeItem(CURRENT_USER_KEY);
  }

  // ---------- Plan ----------
  // Signed-out visitors and signed-in users who've never subscribed are
  // both treated as "free" — matches the site's "Get in for free" link,
  // which doesn't require an account at all.
  function getPlan(){
    const user = getCurrentUser();
    return (user && user.plan) || "free";
  }

  function setPlan(plan){
    if(!PLAN_LIMITS[plan]) return;
    const user = getCurrentUser();
    if(!user) return;
    user.plan = plan;
    setCurrentUser(user);
    const users = getUsers();
    const idx = users.findIndex(u => u.email === user.email);
    if(idx !== -1){ users[idx].plan = plan; saveUsers(users); }
  }

  function planLimits(plan){
    return PLAN_LIMITS[plan] || PLAN_LIMITS.free;
  }
  function hasPremiumAccess(){
    return planLimits(getPlan()).premiumStocks;
  }

  // ---------- Upload usage (resets every calendar month) ----------
  function monthKey(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
  }
  function usageId(){
    const user = getCurrentUser();
    return user ? user.email : "anonymous";
  }
  function readUsage(){
    try{ return JSON.parse(localStorage.getItem(UPLOAD_USAGE_KEY) || "{}"); }
    catch(e){ return {}; }
  }
  function writeUsage(usage){
    localStorage.setItem(UPLOAD_USAGE_KEY, JSON.stringify(usage));
  }

  function getUploadsThisMonth(){
    const usage = readUsage();
    return (usage[usageId()] && usage[usageId()][monthKey()]) || 0;
  }
  function getUploadLimit(){
    return planLimits(getPlan()).monthlyUploads;
  }
  function canUpload(){
    return getUploadsThisMonth() < getUploadLimit();
  }
  function recordUpload(){
    const usage = readUsage();
    const id = usageId();
    usage[id] = usage[id] || {};
    usage[id][monthKey()] = (usage[id][monthKey()] || 0) + 1;
    writeUsage(usage);
  }

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.auth = {
    sha256Hex, getUsers, saveUsers, getCurrentUser, setCurrentUser, clearCurrentUser,
    getPlan, setPlan, hasPremiumAccess,
    getUploadsThisMonth, getUploadLimit, canUpload, recordUpload
  };
})();
