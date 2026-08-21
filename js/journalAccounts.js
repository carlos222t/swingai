/* Journal Accounts: lets a user keep several named trading accounts (e.g.
   "Personal", "Prop Firm A", "Roth IRA") and switch between them. Entries
   and per-account settings are tagged with an accountId and filtered by
   whichever account is currently active. Same client-only localStorage
   pattern as js/auth.js — nothing is synced to a server. Must load after
   js/auth.js and before js/journal.js, js/journalSettings.js and
   js/statisticsPage.js. */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  const ACCOUNTS_KEY = "swingai_journal_accounts_v1";
  const ACTIVE_KEY = "swingai_journal_active_account_v1";
  const DEFAULT_ACCOUNT_ID = "default";
  const DEFAULT_ACCOUNT_NAME = "Main Account";

  function userId(){
    const user = auth.getCurrentUser();
    return user ? user.email : "anonymous";
  }

  function readAllAccounts(){
    try{ return JSON.parse(localStorage.getItem(ACCOUNTS_KEY) || "{}"); }
    catch(e){ return {}; }
  }
  function writeAllAccounts(all){
    localStorage.setItem(ACCOUNTS_KEY, JSON.stringify(all));
  }
  function readAllActive(){
    try{ return JSON.parse(localStorage.getItem(ACTIVE_KEY) || "{}"); }
    catch(e){ return {}; }
  }
  function writeAllActive(all){
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(all));
  }

  function newAccountId(){
    return Date.now().toString(36) + "-" + Math.random().toString(36).slice(2, 8);
  }

  // Makes sure the current user has at least one account, creating the
  // default one on first use so existing (pre-multi-account) entries and
  // settings — which have no accountId — keep resolving against it.
  function ensureAccounts(){
    const all = readAllAccounts();
    const uid = userId();
    if(!all[uid] || !all[uid].length){
      all[uid] = [{ id: DEFAULT_ACCOUNT_ID, name: DEFAULT_ACCOUNT_NAME }];
      writeAllAccounts(all);
    }
    return all[uid];
  }

  function getAccounts(){
    return ensureAccounts();
  }

  function getActiveAccountId(){
    const accounts = getAccounts();
    const allActive = readAllActive();
    const uid = userId();
    let id = allActive[uid];
    if(!id || !accounts.some(a => a.id === id)){
      id = accounts[0].id;
      allActive[uid] = id;
      writeAllActive(allActive);
    }
    return id;
  }

  function setActiveAccountId(id){
    const accounts = getAccounts();
    if(!accounts.some(a => a.id === id)) return;
    const allActive = readAllActive();
    allActive[userId()] = id;
    writeAllActive(allActive);
  }

  function getActiveAccount(){
    const id = getActiveAccountId();
    return getAccounts().find(a => a.id === id);
  }

  function addAccount(name){
    name = (name || "").trim();
    if(!name) return null;
    const all = readAllAccounts();
    const uid = userId();
    const accounts = all[uid] || ensureAccounts();
    const account = { id: newAccountId(), name };
    accounts.push(account);
    all[uid] = accounts;
    writeAllAccounts(all);
    setActiveAccountId(account.id);
    return account;
  }

  function renameAccount(id, name){
    name = (name || "").trim();
    if(!name) return false;
    const all = readAllAccounts();
    const uid = userId();
    const accounts = all[uid] || [];
    const account = accounts.find(a => a.id === id);
    if(!account) return false;
    account.name = name;
    all[uid] = accounts;
    writeAllAccounts(all);
    return true;
  }

  // Refuses to delete the last remaining account — there must always be
  // somewhere for entries to live. Returns false when that's the case.
  function deleteAccount(id){
    const all = readAllAccounts();
    const uid = userId();
    let accounts = all[uid] || [];
    if(accounts.length <= 1) return false;
    accounts = accounts.filter(a => a.id !== id);
    all[uid] = accounts;
    writeAllAccounts(all);

    const allActive = readAllActive();
    if(allActive[uid] === id){
      allActive[uid] = accounts[0].id;
      writeAllActive(allActive);
    }
    return true;
  }

  window.SwingAI.journalAccounts = {
    DEFAULT_ACCOUNT_ID,
    getAccounts,
    getActiveAccountId,
    setActiveAccountId,
    getActiveAccount,
    addAccount,
    renameAccount,
    deleteAccount
  };
})();
