/* Trading Journal: a personal calendar of daily wins/losses, kept in
   localStorage per-user (same client-only pattern as js/auth.js — nothing
   is synced to a server or across devices yet; sql/schema.sql would need a
   `journal_entries` table to move this server-side). */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;
  const accountsApi = window.SwingAI.journalAccounts;

  const ENTRIES_KEY = "swingai_journal_entries_v1";
  const SYMBOLS_KEY = "swingai_journal_symbols_v1";

  const WEEKDAYS = ["Su","Mo","Tu","We","Th","Fr","Sa"];
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function userId(){
    const user = auth.getCurrentUser();
    return user ? user.email : "anonymous";
  }

  function readAllEntries(){
    try{ return JSON.parse(localStorage.getItem(ENTRIES_KEY) || "{}"); }
    catch(e){ return {}; }
  }
  // Every entry for this user, across all of their accounts.
  function getAllEntries(){
    const all = readAllEntries();
    return all[userId()] || [];
  }
  function setAllEntries(list){
    const all = readAllEntries();
    all[userId()] = list;
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
  }
  // Entries for the currently active account only — what the calendar and
  // P/L math should actually see. Entries saved before multi-account
  // support existed have no accountId, so they fall back to the default
  // account rather than disappearing.
  function getEntries(){
    const accountId = accountsApi.getActiveAccountId();
    return getAllEntries().filter(e => (e.accountId || accountsApi.DEFAULT_ACCOUNT_ID) === accountId);
  }
  function addEntry(entry){
    entry.accountId = accountsApi.getActiveAccountId();
    const list = getAllEntries();
    list.push(entry);
    setAllEntries(list);
  }
  function removeEntry(id){
    setAllEntries(getAllEntries().filter(e => e.id !== id));
  }

  // ---------- Saved symbols (quick-pick chips) ----------
  function readAllSymbols(){
    try{ return JSON.parse(localStorage.getItem(SYMBOLS_KEY) || "{}"); }
    catch(e){ return {}; }
  }
  function getSavedSymbols(){
    const all = readAllSymbols();
    return all[userId()] || [];
  }
  function saveSymbol(symbol){
    symbol = symbol.trim().toUpperCase();
    if(!symbol) return;
    const list = getSavedSymbols();
    if(list.includes(symbol)) return;
    list.push(symbol);
    const all = readAllSymbols();
    all[userId()] = list;
    localStorage.setItem(SYMBOLS_KEY, JSON.stringify(all));
  }
  function removeSavedSymbol(symbol){
    const all = readAllSymbols();
    all[userId()] = getSavedSymbols().filter(s => s !== symbol);
    localStorage.setItem(SYMBOLS_KEY, JSON.stringify(all));
  }

  function todayStr(){
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function dateKey(y,m,d){
    return `${y}-${String(m+1).padStart(2,"0")}-${String(d).padStart(2,"0")}`;
  }
  function money(n){
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function compactAmt(n){
    const sign = n < 0 ? "-" : "+";
    const abs = Math.abs(n);
    if(abs >= 1000) return sign + (abs/1000).toFixed(abs >= 10000 ? 0 : 1) + "k";
    return sign + Math.round(abs);
  }
  function startOfWeek(d){
    const day = d.getDay(); // 0 = Sunday
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0,0,0,0);
    return monday;
  }

  let viewMode = "year"; // "year" | "month" | "week"
  let currentYear = new Date().getFullYear();
  let currentMonth = new Date().getMonth();
  let currentWeekStart = startOfWeek(new Date());

  // ---------- Calendar ----------
  function periodLabel(){
    if(viewMode === "year") return String(currentYear);
    if(viewMode === "month") return `${MONTHS[currentMonth]} ${currentYear}`;
    const start = currentWeekStart;
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    const startLabel = `${MONTHS[start.getMonth()].slice(0,3)} ${start.getDate()}`;
    const endLabel = start.getMonth() === end.getMonth() ? `${end.getDate()}` : `${MONTHS[end.getMonth()].slice(0,3)} ${end.getDate()}`;
    return `${startLabel}–${endLabel}, ${end.getFullYear()}`;
  }

  function buildDayCell(key, labelHtml, extraClass){
    const dayEntries = getEntries().filter(e => e.date === key);
    const cell = document.createElement("div");
    cell.className = "day-cell" + (extraClass ? " " + extraClass : "");
    if(key === todayStr()) cell.classList.add("today");
    let html = labelHtml;
    if(dayEntries.length){
      const net = dayEntries.reduce((s,e) => s + e.amount, 0);
      cell.classList.add("has-entries", net >= 0 ? "win" : "loss");
      html += `<span class="day-amt">${compactAmt(net)}</span>`;
    }
    cell.innerHTML = html;
    cell.addEventListener("click", () => openEntryModal(key));
    return cell;
  }

  function buildMonthCard(y, m, clickableTitle){
    const card = document.createElement("div");
    card.className = "month-card";

    const title = document.createElement("div");
    title.className = "month-title" + (clickableTitle ? " month-title-clickable" : "");
    title.textContent = MONTHS[m];
    if(clickableTitle){
      title.title = `View ${MONTHS[m]}`;
      title.addEventListener("click", () => switchView("month", { year: y, month: m }));
    }
    card.appendChild(title);

    const grid = document.createElement("div");
    grid.className = "month-grid";
    WEEKDAYS.forEach(w => {
      const wd = document.createElement("div");
      wd.className = "month-weekday";
      wd.textContent = w;
      grid.appendChild(wd);
    });

    const firstDow = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();

    for(let i = 0; i < firstDow; i++){
      const blank = document.createElement("div");
      blank.className = "day-cell day-blank";
      grid.appendChild(blank);
    }
    for(let d = 1; d <= daysInMonth; d++){
      const key = dateKey(y, m, d);
      grid.appendChild(buildDayCell(key, `<span class="day-num">${d}</span>`));
    }

    card.appendChild(grid);
    return card;
  }

  function renderYearView(wrap){
    for(let m = 0; m < 12; m++){
      wrap.appendChild(buildMonthCard(currentYear, m, true));
    }
  }
  function renderMonthView(wrap){
    wrap.appendChild(buildMonthCard(currentYear, currentMonth, false));
  }
  function renderWeekView(wrap){
    const strip = document.createElement("div");
    strip.className = "week-strip";
    for(let i = 0; i < 7; i++){
      const d = new Date(currentWeekStart);
      d.setDate(currentWeekStart.getDate() + i);
      const key = dateKey(d.getFullYear(), d.getMonth(), d.getDate());
      const labelHtml = `<span class="week-day-name">${WEEKDAYS[d.getDay()]} ${MONTHS[d.getMonth()].slice(0,3)}</span><span class="day-num">${d.getDate()}</span>`;
      strip.appendChild(buildDayCell(key, labelHtml, "day-cell-week"));
    }
    wrap.appendChild(strip);
  }

  function computePL(){
    const entries = getEntries();
    let filtered;
    if(viewMode === "year"){
      filtered = entries.filter(e => e.date.slice(0,4) === String(currentYear));
    } else if(viewMode === "month"){
      const ym = `${currentYear}-${String(currentMonth+1).padStart(2,"0")}`;
      filtered = entries.filter(e => e.date.slice(0,7) === ym);
    } else {
      const start = currentWeekStart;
      const end = new Date(start);
      end.setDate(start.getDate() + 6);
      end.setHours(23,59,59,999);
      filtered = entries.filter(e => {
        const d = new Date(e.date + "T00:00:00");
        return d >= start && d <= end;
      });
    }
    return filtered.reduce((s,e) => s + e.amount, 0);
  }
  function signedMoney(n){
    return (n < 0 ? "-" : "+") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function renderPL(){
    const net = computePL();
    const badge = document.getElementById("plBadge");
    badge.textContent = signedMoney(net);
    badge.classList.toggle("pos", net >= 0);
    badge.classList.toggle("neg", net < 0);
  }

  function render(){
    document.getElementById("journalPeriodLabel").textContent = periodLabel();
    const wrap = document.getElementById("journalCalendar");
    wrap.className = "journal-calendar view-" + viewMode;
    wrap.innerHTML = "";
    if(viewMode === "year") renderYearView(wrap);
    else if(viewMode === "month") renderMonthView(wrap);
    else renderWeekView(wrap);
    renderPL();
    const label = document.getElementById("accountSwitcherLabel");
    if(label){
      const active = accountsApi.getActiveAccount();
      label.textContent = active ? active.name : "Account";
    }
  }

  function switchView(mode, opts){
    viewMode = mode;
    if(opts){
      if(opts.year != null) currentYear = opts.year;
      if(opts.month != null) currentMonth = opts.month;
    }
    document.querySelectorAll("#viewToggle .billing-toggle-btn").forEach(b => b.classList.toggle("active", b.dataset.view === mode));
    render();
  }

  document.getElementById("viewToggle").addEventListener("click", e => {
    const btn = e.target.closest("[data-view]");
    if(!btn) return;
    switchView(btn.dataset.view);
  });

  document.getElementById("prevBtn").addEventListener("click", () => {
    if(viewMode === "year") currentYear--;
    else if(viewMode === "month"){
      currentMonth--;
      if(currentMonth < 0){ currentMonth = 11; currentYear--; }
    } else {
      currentWeekStart.setDate(currentWeekStart.getDate() - 7);
    }
    render();
  });
  document.getElementById("nextBtn").addEventListener("click", () => {
    if(viewMode === "year") currentYear++;
    else if(viewMode === "month"){
      currentMonth++;
      if(currentMonth > 11){ currentMonth = 0; currentYear++; }
    } else {
      currentWeekStart.setDate(currentWeekStart.getDate() + 7);
    }
    render();
  });

  // ---------- Add Entry modal (opens straight from a click on any date) ----------
  const entryModal = document.getElementById("entryModalOverlay");
  const entryModalTitle = document.getElementById("entryModalTitle");
  const entryDate = document.getElementById("entryDate");
  const entrySymbol = document.getElementById("entrySymbol");
  const entryAmount = document.getElementById("entryAmount");
  const entryError = document.getElementById("entryError");
  const resultToggle = document.getElementById("resultToggle");
  const symbolChips = document.getElementById("symbolChips");
  const symbolSaveBtn = document.getElementById("symbolSaveBtn");
  const dayEntriesWrap = document.getElementById("dayEntriesWrap");
  const dayEntriesList = document.getElementById("dayEntriesList");
  let entryResult = "win";

  function renderSymbolChips(){
    const current = entrySymbol.value.trim().toUpperCase();
    const saved = getSavedSymbols();
    symbolChips.innerHTML = saved.map(sym => `
      <span class="symbol-chip${sym === current ? " active" : ""}" data-symbol="${sym}">
        <span class="symbol-chip-label">${sym}</span>
        <button type="button" class="symbol-chip-remove" data-symbol="${sym}" title="Remove ${sym}" aria-label="Remove ${sym}">&times;</button>
      </span>`).join("");
  }

  function dateTitle(dateStr){
    const [y,m,d] = dateStr.split("-").map(Number);
    return `${MONTHS[m-1]} ${d}, ${y}`;
  }

  function renderDayEntries(dateStr){
    const entries = getEntries().filter(e => e.date === dateStr);
    entryModalTitle.textContent = entries.length ? `Add Entry — ${dateTitle(dateStr)}` : "Add Entry";
    if(!entries.length){
      dayEntriesWrap.hidden = true;
      dayEntriesList.innerHTML = "";
      return;
    }
    dayEntriesWrap.hidden = false;
    dayEntriesList.innerHTML = entries.map(e => {
      const cls = e.amount >= 0 ? "win" : "loss";
      return `<div class="day-entry-row" data-id="${e.id}">
        <div class="day-entry-info">
          <span class="day-entry-sym">${e.symbol}</span>
          <span class="day-entry-tag">${e.amount >= 0 ? "Win" : "Loss"}</span>
        </div>
        <div class="day-entry-right">
          <span class="day-entry-amt ${cls}">${money(e.amount)}</span>
          <button type="button" class="day-entry-remove" title="Delete entry" aria-label="Delete entry">&times;</button>
        </div>
      </div>`;
    }).join("");
  }

  function resetEntryForm(){
    entrySymbol.value = "";
    entryAmount.value = "";
    entryError.hidden = true;
    entryResult = "win";
    resultToggle.querySelectorAll(".dir-btn").forEach(b => b.classList.toggle("active", b.dataset.result === "win"));
    renderSymbolChips();
  }

  function openEntryModal(prefillDate){
    const date = prefillDate || todayStr();
    entryDate.value = date;
    resetEntryForm();
    renderDayEntries(date);
    entryModal.hidden = false;
    entrySymbol.focus();
  }
  function closeEntryModal(){ entryModal.hidden = true; }

  document.getElementById("addEntryBtn").addEventListener("click", () => openEntryModal());
  document.getElementById("entryModalClose").addEventListener("click", closeEntryModal);
  entryModal.addEventListener("click", e => { if(e.target === entryModal) closeEntryModal(); });

  entryDate.addEventListener("change", () => renderDayEntries(entryDate.value));

  resultToggle.addEventListener("click", e => {
    const btn = e.target.closest(".dir-btn");
    if(!btn) return;
    entryResult = btn.dataset.result;
    resultToggle.querySelectorAll(".dir-btn").forEach(b => b.classList.toggle("active", b === btn));
  });

  symbolSaveBtn.addEventListener("click", () => {
    saveSymbol(entrySymbol.value);
    renderSymbolChips();
  });
  entrySymbol.addEventListener("input", renderSymbolChips);

  symbolChips.addEventListener("click", e => {
    const removeBtn = e.target.closest(".symbol-chip-remove");
    if(removeBtn){
      removeSavedSymbol(removeBtn.dataset.symbol);
      renderSymbolChips();
      return;
    }
    const chip = e.target.closest(".symbol-chip");
    if(!chip) return;
    entrySymbol.value = chip.dataset.symbol;
    renderSymbolChips();
    entryAmount.focus();
  });

  dayEntriesList.addEventListener("click", e => {
    const btn = e.target.closest(".day-entry-remove");
    if(!btn) return;
    const id = btn.closest(".day-entry-row").dataset.id;
    removeEntry(id);
    renderDayEntries(entryDate.value);
    render();
  });

  document.getElementById("entrySaveBtn").addEventListener("click", () => {
    const date = entryDate.value;
    const symbol = entrySymbol.value.trim().toUpperCase();
    const amount = parseFloat(entryAmount.value);

    if(!date || !symbol || !isFinite(amount) || amount <= 0){
      entryError.textContent = "Enter a date, symbol, and an amount greater than 0.";
      entryError.hidden = false;
      return;
    }

    addEntry({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      date,
      symbol,
      amount: entryResult === "win" ? amount : -amount
    });
    saveSymbol(symbol);

    render();

    // Stay open on the same date so several trades can be logged back to back.
    resetEntryForm();
    renderDayEntries(date);
    entrySymbol.focus();
  });

  // ---------- Account switcher (switch / add / rename / delete accounts) ----------
  const accountSwitcher = document.getElementById("accountSwitcher");
  const accountSwitcherBtn = document.getElementById("accountSwitcherBtn");
  const accountSwitcherLabel = document.getElementById("accountSwitcherLabel");
  const accountDropdown = document.getElementById("accountDropdown");
  const accountDropdownList = document.getElementById("accountDropdownList");
  const newAccountName = document.getElementById("newAccountName");
  const addAccountBtn = document.getElementById("addAccountBtn");
  let renamingAccountId = null;

  function renderAccountSwitcher(){
    const accounts = accountsApi.getAccounts();
    const activeId = accountsApi.getActiveAccountId();
    const active = accounts.find(a => a.id === activeId) || accounts[0];
    accountSwitcherLabel.textContent = active ? active.name : "Account";

    accountDropdownList.innerHTML = accounts.map(a => {
      if(a.id === renamingAccountId){
        return `<div class="account-row account-row-editing" data-id="${a.id}">
          <input type="text" class="account-rename-input" id="accountRenameInput" value="${a.name.replace(/"/g,"&quot;")}" maxlength="40">
        </div>`;
      }
      return `<div class="account-row${a.id === activeId ? " active" : ""}" data-id="${a.id}">
        <button type="button" class="account-row-name" data-id="${a.id}">${a.name}</button>
        <span class="account-row-actions">
          <button type="button" class="account-row-btn account-row-rename" data-id="${a.id}" title="Rename" aria-label="Rename ${a.name}">&#9998;</button>
          ${accounts.length > 1 ? `<button type="button" class="account-row-btn account-row-delete" data-id="${a.id}" title="Delete" aria-label="Delete ${a.name}">&times;</button>` : ""}
        </span>
      </div>`;
    }).join("");

    const input = document.getElementById("accountRenameInput");
    if(input){
      input.focus();
      input.select();
    }
  }

  function openAccountDropdown(){
    renderAccountSwitcher();
    accountDropdown.hidden = false;
  }
  function closeAccountDropdown(){
    accountDropdown.hidden = true;
    renamingAccountId = null;
    newAccountName.value = "";
  }

  accountSwitcherBtn.addEventListener("click", () => {
    if(accountDropdown.hidden) openAccountDropdown();
    else closeAccountDropdown();
  });

  document.addEventListener("click", e => {
    // Use composedPath (captured at dispatch time) rather than
    // accountSwitcher.contains(e.target): row clicks re-render
    // accountDropdownList's innerHTML synchronously, which detaches the
    // original target before this bubbles up here, making .contains()
    // wrongly report "outside" and close the dropdown mid-action.
    if(!e.composedPath().includes(accountSwitcher)) closeAccountDropdown();
  });

  function commitRename(id, value){
    if(value && value.trim()) accountsApi.renameAccount(id, value);
    renamingAccountId = null;
    renderAccountSwitcher();
  }

  accountDropdownList.addEventListener("click", e => {
    const renameBtn = e.target.closest(".account-row-rename");
    if(renameBtn){
      renamingAccountId = renameBtn.dataset.id;
      renderAccountSwitcher();
      return;
    }
    const deleteBtn = e.target.closest(".account-row-delete");
    if(deleteBtn){
      const acc = accountsApi.getAccounts().find(a => a.id === deleteBtn.dataset.id);
      if(acc && confirm(`Delete "${acc.name}"? Its logged entries will no longer be shown.`)){
        accountsApi.deleteAccount(deleteBtn.dataset.id);
        renderAccountSwitcher();
        render();
      }
      return;
    }
    const nameBtn = e.target.closest(".account-row-name");
    if(nameBtn){
      accountsApi.setActiveAccountId(nameBtn.dataset.id);
      closeAccountDropdown();
      render();
    }
  });

  accountDropdownList.addEventListener("keydown", e => {
    if(e.target.id !== "accountRenameInput") return;
    if(e.key === "Enter") commitRename(renamingAccountId, e.target.value);
    else if(e.key === "Escape"){ renamingAccountId = null; renderAccountSwitcher(); }
  });
  accountDropdownList.addEventListener("focusout", e => {
    if(e.target.id === "accountRenameInput" && renamingAccountId) commitRename(renamingAccountId, e.target.value);
  });

  function submitNewAccount(){
    const name = newAccountName.value;
    if(!name || !name.trim()) return;
    accountsApi.addAccount(name);
    closeAccountDropdown();
    render();
  }
  addAccountBtn.addEventListener("click", submitNewAccount);
  newAccountName.addEventListener("keydown", e => { if(e.key === "Enter") submitNewAccount(); });

  render();
})();
