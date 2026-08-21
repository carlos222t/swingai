/* Statistics page: every number from the Journal, each in its own
   category card with a chart. Reads the same localStorage data as
   js/journal.js and js/journalSettings.js (swingai_journal_entries_v1 /
   swingai_journal_settings_v1, keyed per-user like js/auth.js). */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;
  const accountsApi = window.SwingAI.journalAccounts;

  const ENTRIES_KEY = "swingai_journal_entries_v1";
  const SETTINGS_KEY = "swingai_journal_settings_v1";
  const DEFAULT_SETTINGS = { startingBalance: 10000, profitSplit: 100 };
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function userId(){
    const user = auth.getCurrentUser();
    return user ? user.email : "anonymous";
  }
  // Same per-account scoping (with legacy default-account fallback) as
  // js/journalSettings.js — keep both in sync if this logic changes.
  function getEntries(){
    try{
      const all = JSON.parse(localStorage.getItem(ENTRIES_KEY) || "{}");
      const list = all[userId()] || [];
      const accountId = accountsApi.getActiveAccountId();
      return list.filter(e => (e.accountId || accountsApi.DEFAULT_ACCOUNT_ID) === accountId);
    } catch(e){ return []; }
  }
  function getSettings(){
    try{
      const all = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      const accountId = accountsApi.getActiveAccountId();
      const legacy = accountId === accountsApi.DEFAULT_ACCOUNT_ID ? all[userId()] : undefined;
      return Object.assign({}, DEFAULT_SETTINGS, all[userId() + "::" + accountId] || legacy || {});
    } catch(e){ return Object.assign({}, DEFAULT_SETTINGS); }
  }

  function money(n){
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signedMoney(n){
    return (n < 0 ? "-" : "+") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function dmy(dateStr){
    const [y,m,d] = dateStr.split("-");
    return `${d}/${m}/${y}`;
  }
  function dmyShort(dateStr){
    const [y,m,d] = dateStr.split("-").map(Number);
    return `${MONTHS[m-1].slice(0,3)} ${d}`;
  }

  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const COLOR_GOOD = cssVar("--good") || "#0ca30c";
  const COLOR_GOOD_TEXT = cssVar("--good-text") || "#3ddc3d";
  const COLOR_CRITICAL = cssVar("--critical") || "#d03b3b";
  const COLOR_CRITICAL_TEXT = cssVar("--critical-text") || "#ff6b6b";
  const COLOR_BRAND2 = cssVar("--brand-2") || "#3987e5";
  const COLOR_TEXT = cssVar("--text") || "#ffffff";
  const COLOR_TEXT_FAINT = cssVar("--text-faint") || "#7c7b76";
  const COLOR_BORDER = "rgba(255,255,255,.14)";
  const COLOR_TRACK = "rgba(255,255,255,.09)";

  // ---------- Period filter (mirrors js/journal.js's stats math) ----------
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
    const entries = filterByPeriod(getEntries(), period);
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
      entries, settings,
      totalWins, totalLosses, net, balance, pctOfBalance, totalOrders, winRate,
      winEntries: wins.length, lossEntries: losses.length, totalEntries: entries.length,
      netEarning, periodStart, periodEnd, weeks
    };
  }

  // ---------- Shared chart builders ----------
  function ringGauge(ringPct, color, valueText, subText){
    const size = 140, r = 54, cx = 70, cy = 70, sw = 12;
    const circumference = 2 * Math.PI * r;
    const clamped = Math.max(0, Math.min(100, ringPct));
    const offset = circumference * (1 - clamped / 100);
    return `<svg viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${COLOR_TRACK}" stroke-width="${sw}"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="${color}" stroke-width="${sw}" stroke-linecap="round" stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" transform="rotate(-90 ${cx} ${cy})"/>
      <text x="${cx}" y="${cy-2}" text-anchor="middle" font-size="21" font-weight="800" fill="${COLOR_TEXT}" font-family="'IBM Plex Mono',monospace">${valueText}</text>
      <text x="${cx}" y="${cy+18}" text-anchor="middle" font-size="9.5" fill="${COLOR_TEXT_FAINT}">${subText}</text>
    </svg>`;
  }

  function compareBars(rows){
    const max = Math.max(...rows.map(r => Math.abs(r.raw)), 1);
    return rows.map(r => `
      <div class="compare-bar-row">
        <span class="compare-bar-label">${r.label}</span>
        <span class="compare-bar-track"><span class="compare-bar-fill" style="width:${(Math.abs(r.raw) / max * 100)}%;background:${r.color};"></span></span>
        <span class="compare-bar-value" style="color:${r.color};">${r.value}</span>
      </div>`).join("");
  }

  const statRow = (label, value, cls) => `<div class="stat-row"><span>${label}</span><b${cls ? ` class="${cls}"` : ""}>${value}</b></div>`;

  // ---------- Category renderers ----------
  function renderNetPL(s){
    const headline = document.getElementById("netHeadline");
    headline.textContent = signedMoney(s.net);
    headline.className = "cat-headline " + (s.net >= 0 ? "pos" : "neg");

    document.getElementById("winLossBars").innerHTML = compareBars([
      { label: "Wins", raw: s.totalWins, value: money(s.totalWins), color: COLOR_GOOD_TEXT },
      { label: "Losses", raw: s.totalLosses, value: money(-s.totalLosses), color: COLOR_CRITICAL_TEXT }
    ]);
  }

  function renderWinRate(s){
    document.getElementById("winRateGauge").innerHTML = ringGauge(
      s.winRate, s.winRate >= 50 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT,
      s.winRate.toFixed(1) + "%", "$ WIN RATE"
    );
    document.getElementById("winRateSideStats").innerHTML =
      statRow("Win $", money(s.totalWins), "pos") +
      statRow("Loss $", money(-s.totalLosses), s.totalLosses > 0 ? "neg" : "") +
      statRow("Total Orders", money(s.totalOrders));
  }

  function renderAccountPerformance(s){
    const ringPct = s.balance > 0 ? Math.max(0, s.pctOfBalance) : 0;
    document.getElementById("balanceGauge").innerHTML = ringGauge(
      ringPct, s.pctOfBalance >= 0 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT,
      s.pctOfBalance.toFixed(1) + "%", "OF BALANCE"
    );
    document.getElementById("balanceSideStats").innerHTML =
      statRow("Balance", money(s.balance)) +
      statRow("Net", signedMoney(s.net), s.net >= 0 ? "pos" : "neg") +
      statRow("Profit Split", s.settings.profitSplit + "%");
  }

  function renderVolume(s){
    document.getElementById("volumeHeadline").textContent = money(s.totalOrders);
    const winPct = s.totalOrders > 0 ? (s.totalWins / s.totalOrders * 100) : 0;
    const lossPct = s.totalOrders > 0 ? (s.totalLosses / s.totalOrders * 100) : 0;

    const bar = document.getElementById("volumeStackedBar");
    bar.innerHTML = s.totalOrders > 0
      ? `<span class="stacked-bar-seg" style="width:${winPct}%;background:${COLOR_GOOD};"></span><span class="stacked-bar-seg" style="width:${lossPct}%;background:${COLOR_CRITICAL};"></span>`
      : "";

    document.getElementById("volumeLegend").innerHTML = `
      <span class="legend-item"><i class="legend-dot win"></i>Win $<b>${winPct.toFixed(1)}%</b></span>
      <span class="legend-item"><i class="legend-dot loss"></i>Loss $<b>${lossPct.toFixed(1)}%</b></span>
    `;
  }

  function renderNetEarning(s){
    const headline = document.getElementById("netEarningHeadline");
    headline.textContent = signedMoney(s.netEarning);
    headline.className = "cat-headline " + (s.netEarning >= 0 ? "pos" : "neg");
    document.getElementById("netEarningSub").textContent = `Keeping ${s.settings.profitSplit}% of net per your Settings`;

    document.getElementById("netEarningBars").innerHTML = compareBars([
      { label: "Net", raw: s.net, value: signedMoney(s.net), color: s.net >= 0 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT },
      { label: "Your Cut", raw: s.netEarning, value: signedMoney(s.netEarning), color: s.netEarning >= 0 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT }
    ]);
  }

  function renderEntries(s){
    const entryWinPct = s.totalEntries > 0 ? (s.winEntries / s.totalEntries * 100) : 0;
    document.getElementById("entriesGauge").innerHTML = ringGauge(
      entryWinPct, entryWinPct >= 50 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT,
      Math.round(entryWinPct) + "%", "ENTRIES WIN %"
    );
    document.getElementById("entriesSideStats").innerHTML =
      statRow("Win Entries", s.winEntries, "pos") +
      statRow("Loss Entries", s.lossEntries, s.lossEntries > 0 ? "neg" : "") +
      statRow("Total Entries", s.totalEntries);
  }

  function renderTimeline(s){
    document.getElementById("timelineStats").innerHTML =
      statRow("Period of Time", s.periodStart === "—" ? "—" : `${dmy(s.periodStart)} - ${dmy(s.periodEnd)}`) +
      statRow("Start Date", s.periodStart === "—" ? "—" : dmy(s.periodStart)) +
      statRow("End Date", s.periodEnd === "—" ? "—" : dmy(s.periodEnd)) +
      statRow("Time (Weeks)", s.weeks.toFixed(2));

    const wrap = document.getElementById("timelineChartWrap");
    const byDate = {};
    s.entries.forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + e.amount; });
    const dates = Object.keys(byDate).sort();
    let running = 0;
    const daily = dates.map(d => { running += byDate[d]; return { date: d, value: running }; });

    if(daily.length < 2){
      wrap.innerHTML = '<div class="empty-state">Log trades on at least two different days in this period to see a curve.</div>';
      return;
    }

    const W = 700, H = 240, padL = 54, padR = 16, padT = 18, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const values = daily.map(p => p.value);
    let yMin = Math.min(0, ...values), yMax = Math.max(0, ...values);
    if(yMin === yMax){ yMin -= 1; yMax += 1; }
    const yPad = (yMax - yMin) * 0.12;
    yMin -= yPad; yMax += yPad;

    const xAt = i => padL + (i / (daily.length - 1)) * plotW;
    const yAt = v => padT + (1 - (v - yMin) / (yMax - yMin)) * plotH;
    const zeroY = yAt(0);

    const linePoints = daily.map((p,i) => `${xAt(i)},${yAt(p.value)}`).join(" ");
    const current = daily[daily.length - 1].value;
    const currentColor = current >= 0 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT;

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" id="timelineSvg">
        <line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="${COLOR_BORDER}" stroke-width="1" stroke-dasharray="4 4"/>
        <polyline points="${linePoints}" fill="none" stroke="${COLOR_BRAND2}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${xAt(daily.length-1)}" cy="${yAt(current)}" r="3.5" fill="${currentColor}"/>
        <text x="${xAt(daily.length-1)}" y="${yAt(current) - 10}" text-anchor="end" font-size="11" font-weight="700" fill="${currentColor}" font-family="'IBM Plex Mono',monospace">${signedMoney(current)}</text>
        <text x="${padL}" y="${H-8}" font-size="10" fill="${COLOR_TEXT_FAINT}">${dmyShort(daily[0].date)}</text>
        <text x="${W-padR}" y="${H-8}" text-anchor="end" font-size="10" fill="${COLOR_TEXT_FAINT}">${dmyShort(daily[daily.length-1].date)}</text>
        <line id="tlCrosshair" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="${COLOR_TEXT_FAINT}" stroke-width="1" opacity="0"/>
        <circle id="tlHoverDot" r="4" opacity="0"/>
        <rect id="tlOverlay" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair;"/>
      </svg>
      <div class="chart-tooltip" id="tlTooltip"></div>
    `;

    const svg = document.getElementById("timelineSvg");
    const overlay = document.getElementById("tlOverlay");
    const crosshair = document.getElementById("tlCrosshair");
    const hoverDot = document.getElementById("tlHoverDot");
    const tooltip = document.getElementById("tlTooltip");

    overlay.addEventListener("mousemove", e => {
      const rect = svg.getBoundingClientRect();
      const svgX = (e.clientX - rect.left) / rect.width * W;
      let idx = Math.round(((svgX - padL) / plotW) * (daily.length - 1));
      idx = Math.max(0, Math.min(daily.length - 1, idx));
      const point = daily[idx];
      const px = xAt(idx), py = yAt(point.value);

      crosshair.setAttribute("x1", px);
      crosshair.setAttribute("x2", px);
      crosshair.setAttribute("opacity", 1);
      hoverDot.setAttribute("cx", px);
      hoverDot.setAttribute("cy", py);
      hoverDot.setAttribute("fill", point.value >= 0 ? COLOR_GOOD_TEXT : COLOR_CRITICAL_TEXT);
      hoverDot.setAttribute("opacity", 1);

      tooltip.innerHTML = `<span class="tt-date">${dmyShort(point.date)}</span><br><b class="${point.value >= 0 ? "tt-pos" : "tt-neg"}">${signedMoney(point.value)}</b>`;
      tooltip.style.left = (px / W * 100) + "%";
      tooltip.style.top = (py / H * 100) + "%";
      tooltip.classList.add("show");
    });
    overlay.addEventListener("mouseleave", () => {
      crosshair.setAttribute("opacity", 0);
      hoverDot.setAttribute("opacity", 0);
      tooltip.classList.remove("show");
    });
  }

  function renderAll(){
    const period = document.querySelector("#statsPeriodToggle .billing-toggle-btn.active").dataset.period;
    const s = computeStats(period);
    renderNetPL(s);
    renderWinRate(s);
    renderAccountPerformance(s);
    renderVolume(s);
    renderNetEarning(s);
    renderEntries(s);
    renderTimeline(s);
  }

  document.getElementById("statsPeriodToggle").addEventListener("click", e => {
    const btn = e.target.closest(".billing-toggle-btn");
    if(!btn) return;
    document.querySelectorAll("#statsPeriodToggle .billing-toggle-btn").forEach(b => b.classList.toggle("active", b === btn));
    renderAll();
  });

  // ---------- Active-account label (editing accounts happens on the Journal page) ----------
  function renderAccountLabel(){
    const label = document.getElementById("statsAccountLabel");
    if(!label) return;
    const account = accountsApi.getActiveAccount();
    label.textContent = account ? account.name : "";
  }

  renderAccountLabel();
  renderAll();
})();
