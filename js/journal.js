/* Trading Journal: a personal calendar of daily wins/losses, kept in
   localStorage per-user (same client-only pattern as js/auth.js — nothing
   is synced to a server or across devices yet; sql/schema.sql would need a
   `journal_entries` table to move this server-side). */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  const ENTRIES_KEY = "swingai_journal_entries_v1";
  const SETTINGS_KEY = "swingai_journal_settings_v1";
  const SYMBOLS_KEY = "swingai_journal_symbols_v1";
  const DEFAULT_SETTINGS = { startingBalance: 10000, profitSplit: 100 };

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
  function getEntries(){
    const all = readAllEntries();
    return all[userId()] || [];
  }
  function setEntries(list){
    const all = readAllEntries();
    all[userId()] = list;
    localStorage.setItem(ENTRIES_KEY, JSON.stringify(all));
  }

  function readAllSettings(){
    try{ return JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch(e){ return {}; }
  }
  function getSettings(){
    const all = readAllSettings();
    return Object.assign({}, DEFAULT_SETTINGS, all[userId()] || {});
  }
  function setSettings(settings){
    const all = readAllSettings();
    all[userId()] = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
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
  function dmy(dateStr){
    const [y,m,d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
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

  let currentYear = new Date().getFullYear();

  // ---------- Calendar ----------
  function renderCalendar(){
    document.getElementById("journalYear").textContent = String(currentYear);
    const entries = getEntries();
    const byDate = {};
    entries.forEach(e => {
      (byDate[e.date] = byDate[e.date] || []).push(e);
    });

    const today = todayStr();
    const wrap = document.getElementById("journalCalendar");
    wrap.innerHTML = "";

    for(let m = 0; m < 12; m++){
      const card = document.createElement("div");
      card.className = "month-card";

      const title = document.createElement("div");
      title.className = "month-title";
      title.textContent = MONTHS[m];
      card.appendChild(title);

      const grid = document.createElement("div");
      grid.className = "month-grid";
      WEEKDAYS.forEach(w => {
        const wd = document.createElement("div");
        wd.className = "month-weekday";
        wd.textContent = w;
        grid.appendChild(wd);
      });

      const firstDow = new Date(currentYear, m, 1).getDay();
      const daysInMonth = new Date(currentYear, m + 1, 0).getDate();

      for(let i = 0; i < firstDow; i++){
        const blank = document.createElement("div");
        blank.className = "day-cell day-blank";
        grid.appendChild(blank);
      }

      for(let d = 1; d <= daysInMonth; d++){
        const key = dateKey(currentYear, m, d);
        const dayEntries = byDate[key] || [];
        const cell = document.createElement("div");
        cell.className = "day-cell";
        if(key === today) cell.classList.add("today");

        if(dayEntries.length){
          const net = dayEntries.reduce((s,e) => s + e.amount, 0);
          cell.classList.add("has-entries", net >= 0 ? "win" : "loss");
          cell.innerHTML = `<span class="day-num">${d}</span><span class="day-amt">${compactAmt(net)}</span>`;
        } else {
          cell.innerHTML = `<span class="day-num">${d}</span>`;
        }
        cell.addEventListener("click", () => openEntryModal(key));
        grid.appendChild(cell);
      }

      card.appendChild(grid);
      wrap.appendChild(card);
    }
  }

  document.getElementById("prevYearBtn").addEventListener("click", () => { currentYear--; renderCalendar(); });
  document.getElementById("nextYearBtn").addEventListener("click", () => { currentYear++; renderCalendar(); });

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
    setEntries(getEntries().filter(e => e.id !== id));
    renderDayEntries(entryDate.value);
    renderCalendar();
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

    const entries = getEntries();
    entries.push({
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 8),
      date,
      symbol,
      amount: entryResult === "win" ? amount : -amount
    });
    setEntries(entries);
    saveSymbol(symbol);

    currentYear = parseInt(date.slice(0,4), 10);
    renderCalendar();

    // Stay open on the same date so several trades can be logged back to back.
    resetEntryForm();
    renderDayEntries(date);
    entrySymbol.focus();
  });

  // ---------- Settings modal ----------
  const settingsModal = document.getElementById("settingsModalOverlay");
  const settingsBalance = document.getElementById("settingsBalance");
  const settingsSplit = document.getElementById("settingsSplit");

  document.getElementById("settingsBtn").addEventListener("click", () => {
    const s = getSettings();
    settingsBalance.value = s.startingBalance;
    settingsSplit.value = s.profitSplit;
    settingsModal.hidden = false;
  });
  document.getElementById("settingsModalClose").addEventListener("click", () => settingsModal.hidden = true);
  settingsModal.addEventListener("click", e => { if(e.target === settingsModal) settingsModal.hidden = true; });

  document.getElementById("settingsSaveBtn").addEventListener("click", () => {
    const balance = parseFloat(settingsBalance.value);
    const split = parseFloat(settingsSplit.value);
    setSettings({
      startingBalance: isFinite(balance) && balance >= 0 ? balance : DEFAULT_SETTINGS.startingBalance,
      profitSplit: isFinite(split) && split >= 0 && split <= 100 ? split : DEFAULT_SETTINGS.profitSplit
    });
    settingsModal.hidden = true;
  });

  // ---------- Statistics modal ----------
  const statsModal = document.getElementById("statsModalOverlay");
  const statsGrid = document.getElementById("statsGrid");
  const statsPeriodToggle = document.getElementById("statsPeriodToggle");
  let statsPeriod = "all";

  function startOfWeek(d){
    const day = d.getDay(); // 0 = Sunday
    const diff = (day === 0 ? -6 : 1) - day; // shift to Monday
    const monday = new Date(d);
    monday.setDate(d.getDate() + diff);
    monday.setHours(0,0,0,0);
    return monday;
  }

  function filterByPeriod(entries, period){
    if(period === "all") return entries;
    const now = new Date();
    if(period === "month"){
      return entries.filter(e => {
        const d = new Date(e.date + "T00:00:00");
        return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
      });
    }
    // week
    const monday = startOfWeek(now);
    const sunday = new Date(monday);
    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(23,59,59,999);
    return entries.filter(e => {
      const d = new Date(e.date + "T00:00:00");
      return d >= monday && d <= sunday;
    });
  }

  function computeStats(period){
    const all = getEntries();
    const entries = filterByPeriod(all, period);
    const settings = getSettings();

    const wins = entries.filter(e => e.amount > 0);
    const losses = entries.filter(e => e.amount < 0);
    const totalWins = wins.reduce((s,e) => s + e.amount, 0);
    const totalLosses = losses.reduce((s,e) => s + Math.abs(e.amount), 0);
    const net = totalWins - totalLosses;
    const balance = settings.startingBalance;
    const pctOfBalance = balance > 0 ? (net / balance) * 100 : 0;
    const totalOrders = totalWins + totalLosses;
    const winRate = totalOrders > 0 ? (totalWins / totalOrders) * 100 : 0;
    const netEarning = net * (settings.profitSplit / 100);

    let periodStart = "—", periodEnd = "—", weeks = 0;
    if(entries.length){
      const dates = entries.map(e => e.date).sort();
      periodStart = dates[0];
      periodEnd = dates[dates.length - 1];
      const days = (new Date(periodEnd + "T00:00:00") - new Date(periodStart + "T00:00:00")) / 86400000;
      weeks = days / 7;
    }

    return {
      totalWins, totalLosses, net, balance, pctOfBalance, totalOrders, winRate,
      winEntries: wins.length, lossEntries: losses.length, totalEntries: entries.length,
      netEarning, periodStart, periodEnd, weeks
    };
  }

  function renderStats(){
    const s = computeStats(statsPeriod);
    const line = (label, value, cls) => `<div class="stat-line"><span>${label}</span><b${cls ? ` class="${cls}"` : ""}>${value}</b></div>`;
    const netCls = s.net >= 0 ? "pos" : "neg";
    const netEarnCls = s.netEarning >= 0 ? "pos" : "neg";

    statsGrid.innerHTML = [
      line("Total Wins", money(s.totalWins), "pos"),
      line("Total Losses", money(s.totalLosses), s.totalLosses > 0 ? "neg" : ""),
      line("Net (Wins - Losses)", money(s.net), netCls),
      line("Balance", money(s.balance)),
      line("% of Balance", s.pctOfBalance.toFixed(2) + "%", netCls),
      line("Total Orders", money(s.totalOrders)),
      line("Win Rate", s.winRate.toFixed(2) + "%"),
      line("Win Entries", s.winEntries, "pos"),
      line("Loss Entries", s.lossEntries, s.lossEntries > 0 ? "neg" : ""),
      line("Total Entries", s.totalEntries),
      line("Net Earning", money(s.netEarning), netEarnCls),
      line("Period of Time", s.periodStart === "—" ? "—" : `${dmy(s.periodStart)} - ${dmy(s.periodEnd)}`),
      line("Start Date", s.periodStart === "—" ? "—" : dmy(s.periodStart)),
      line("End Date", s.periodEnd === "—" ? "—" : dmy(s.periodEnd)),
      line("Time (Weeks)", s.weeks.toFixed(2))
    ].join("");
  }

  document.getElementById("statsBtn").addEventListener("click", () => {
    statsPeriod = "all";
    statsPeriodToggle.querySelectorAll(".billing-toggle-btn").forEach(b => b.classList.toggle("active", b.dataset.period === "all"));
    renderStats();
    statsModal.hidden = false;
  });
  document.getElementById("statsModalClose").addEventListener("click", () => statsModal.hidden = true);
  statsModal.addEventListener("click", e => { if(e.target === statsModal) statsModal.hidden = true; });

  statsPeriodToggle.addEventListener("click", e => {
    const btn = e.target.closest(".billing-toggle-btn");
    if(!btn) return;
    statsPeriod = btn.dataset.period;
    statsPeriodToggle.querySelectorAll(".billing-toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
    renderStats();
  });

  renderCalendar();
})();
