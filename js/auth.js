/* Shared auth helpers. IMPORTANT: this is a client-only placeholder until a
   real backend is wired up (see sql/schema.sql for the intended users/
   subscriptions tables). Accounts here live in this browser's localStorage
   only — nothing is sent to a server, nothing is shared across devices, and
   this should not be treated as real authentication. It exists so the
   sign-up -> choose-plan -> app flow can be built and tested end-to-end
   before a database and API are connected. */
(function(){
  "use strict";

  const USERS_KEY = "swingai_users_v1";
  const CURRENT_USER_KEY = "swingai_current_user_v1";

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

  window.SwingAI = window.SwingAI || {};
  window.SwingAI.auth = { sha256Hex, getUsers, saveUsers, getCurrentUser, setCurrentUser, clearCurrentUser };
})();
