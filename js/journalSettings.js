/* Journal Settings page: account settings + hand-rolled SVG charts reading
   the same localStorage data as js/journal.js (swingai_journal_entries_v1 /
   swingai_journal_settings_v1, keyed per-user like js/auth.js). */
(function(){
  "use strict";
  const auth = window.SwingAI.auth;

  const ENTRIES_KEY = "swingai_journal_entries_v1";
  const SETTINGS_KEY = "swingai_journal_settings_v1";
  const DEFAULT_SETTINGS = { startingBalance: 10000, profitSplit: 100 };
  const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

  function userId(){
    const user = auth.getCurrentUser();
    return user ? user.email : "anonymous";
  }
  function getEntries(){
    try{
      const all = JSON.parse(localStorage.getItem(ENTRIES_KEY) || "{}");
      return all[userId()] || [];
    } catch(e){ return []; }
  }
  function getSettings(){
    try{
      const all = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}");
      return Object.assign({}, DEFAULT_SETTINGS, all[userId()] || {});
    } catch(e){ return Object.assign({}, DEFAULT_SETTINGS); }
  }
  function setSettings(settings){
    let all;
    try{ all = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "{}"); }
    catch(e){ all = {}; }
    all[userId()] = settings;
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(all));
  }

  function money(n){
    const sign = n < 0 ? "-" : "";
    return sign + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }
  function signedMoney(n){
    return (n < 0 ? "-" : "+") + "$" + Math.abs(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
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
  const COLOR_TEXT_FAINT = cssVar("--text-faint") || "#7c7b76";
  const COLOR_BORDER = "rgba(255,255,255,.14)";

  // ---------- Settings form ----------
  function loadSettingsForm(){
    const s = getSettings();
    document.getElementById("settingsBalance").value = s.startingBalance;
    document.getElementById("settingsSplit").value = s.profitSplit;
  }

  document.getElementById("settingsSaveBtn").addEventListener("click", () => {
    const balance = parseFloat(document.getElementById("settingsBalance").value);
    const split = parseFloat(document.getElementById("settingsSplit").value);
    setSettings({
      startingBalance: isFinite(balance) && balance >= 0 ? balance : DEFAULT_SETTINGS.startingBalance,
      profitSplit: isFinite(split) && split >= 0 && split <= 100 ? split : DEFAULT_SETTINGS.profitSplit
    });
    loadSettingsForm();
    buildWinRate();

    const confirm = document.getElementById("saveConfirm");
    confirm.hidden = false;
    clearTimeout(window.__journalSettingsConfirmTimer);
    window.__journalSettingsConfirmTimer = setTimeout(() => { confirm.hidden = true; }, 2000);
  });

  // ---------- Win Rate stat block ----------
  function buildWinRate(){
    const entries = getEntries();
    const wins = entries.filter(e => e.amount > 0);
    const losses = entries.filter(e => e.amount < 0);
    const totalWins = wins.reduce((s,e) => s + e.amount, 0);
    const totalLosses = losses.reduce((s,e) => s + Math.abs(e.amount), 0);
    const totalOrders = totalWins + totalLosses;
    const winRate = totalOrders > 0 ? (totalWins / totalOrders) * 100 : 0;

    document.getElementById("winRateScore").textContent = winRate.toFixed(1) + "%";
    const bar = document.getElementById("winRateBar");
    bar.style.width = Math.min(100, winRate) + "%";
    bar.className = "report-bar-fill " + (winRate >= 60 ? "safe" : winRate >= 40 ? "mixed" : "risky");

    const winStat = document.getElementById("winDollarStat");
    winStat.textContent = money(totalWins);
    winStat.className = totalWins > 0 ? "pos" : "";

    const lossStat = document.getElementById("lossDollarStat");
    lossStat.textContent = money(-totalLosses);
    lossStat.className = totalLosses > 0 ? "neg" : "";
  }

  // ---------- Equity curve ----------
  function getDailyCumulative(){
    const byDate = {};
    getEntries().forEach(e => { byDate[e.date] = (byDate[e.date] || 0) + e.amount; });
    const dates = Object.keys(byDate).sort();
    let running = 0;
    return dates.map(d => { running += byDate[d]; return { date: d, value: running }; });
  }

  function buildEquityChart(){
    const wrap = document.getElementById("equityChartWrap");
    const daily = getDailyCumulative();
    if(daily.length < 2){
      wrap.innerHTML = '<div class="empty-state">Log trades on at least two different days to see your equity curve.</div>';
      return;
    }

    const W = 700, H = 260, padL = 54, padR = 16, padT = 18, padB = 30;
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
      <svg viewBox="0 0 ${W} ${H}" id="equitySvg">
        <line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="${COLOR_BORDER}" stroke-width="1" stroke-dasharray="4 4"/>
        <polyline points="${linePoints}" fill="none" stroke="${COLOR_BRAND2}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>
        <circle cx="${xAt(daily.length-1)}" cy="${yAt(current)}" r="3.5" fill="${currentColor}"/>
        <text x="${xAt(daily.length-1)}" y="${yAt(current) - 10}" text-anchor="end" font-size="11" font-weight="700" fill="${currentColor}" font-family="'IBM Plex Mono',monospace">${signedMoney(current)}</text>
        <text x="${padL}" y="${H-8}" font-size="10" fill="${COLOR_TEXT_FAINT}">${dmyShort(daily[0].date)}</text>
        <text x="${W-padR}" y="${H-8}" text-anchor="end" font-size="10" fill="${COLOR_TEXT_FAINT}">${dmyShort(daily[daily.length-1].date)}</text>
        <line id="eqCrosshair" x1="0" y1="${padT}" x2="0" y2="${H-padB}" stroke="${COLOR_TEXT_FAINT}" stroke-width="1" opacity="0"/>
        <circle id="eqHoverDot" r="4" opacity="0"/>
        <rect id="eqOverlay" x="${padL}" y="${padT}" width="${plotW}" height="${plotH}" fill="transparent" style="cursor:crosshair;"/>
      </svg>
      <div class="chart-tooltip" id="eqTooltip"></div>
    `;

    const svg = document.getElementById("equitySvg");
    const overlay = document.getElementById("eqOverlay");
    const crosshair = document.getElementById("eqCrosshair");
    const hoverDot = document.getElementById("eqHoverDot");
    const tooltip = document.getElementById("eqTooltip");

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

  // ---------- Monthly P/L bar chart ----------
  let chartYear = new Date().getFullYear();

  function buildMonthlyChart(){
    document.getElementById("chartYearLabel").textContent = String(chartYear);
    const wrap = document.getElementById("monthlyChartWrap");
    const monthly = new Array(12).fill(0);
    getEntries().forEach(e => {
      if(e.date.slice(0,4) === String(chartYear)){
        monthly[parseInt(e.date.slice(5,7),10) - 1] += e.amount;
      }
    });

    if(!monthly.some(v => v !== 0)){
      wrap.innerHTML = `<div class="empty-state">No trades logged in ${chartYear} yet.</div>`;
      return;
    }

    const W = 700, H = 240, padL = 20, padR = 20, padT = 16, padB = 30;
    const plotW = W - padL - padR, plotH = H - padT - padB;
    const zeroY = padT + plotH / 2;
    const maxAbs = Math.max(...monthly.map(v => Math.abs(v)), 1);
    const scale = (plotH / 2 * 0.88) / maxAbs;
    const colW = plotW / 12;
    const barW = colW * 0.56;
    const MONTHS_SHORT = MONTHS.map(m => m.slice(0,3));

    let bars = "", labels = "";
    for(let i = 0; i < 12; i++){
      const v = monthly[i];
      const cx = padL + i * colW + colW / 2;
      const x = cx - barW / 2;
      const h = Math.max(Math.abs(v) * scale, v !== 0 ? 1 : 0);
      const y = v >= 0 ? zeroY - h : zeroY;
      bars += `<rect class="pl-bar" data-i="${i}" data-v="${v}" x="${x}" y="${y}" width="${barW}" height="${h}" rx="3" fill="${v >= 0 ? COLOR_GOOD : COLOR_CRITICAL}" style="cursor:pointer;"/>`;
      labels += `<text x="${cx}" y="${H-8}" text-anchor="middle" font-size="10" fill="${COLOR_TEXT_FAINT}">${MONTHS_SHORT[i]}</text>`;
    }

    wrap.innerHTML = `
      <svg viewBox="0 0 ${W} ${H}" id="monthlySvg">
        <line x1="${padL}" y1="${zeroY}" x2="${W-padR}" y2="${zeroY}" stroke="${COLOR_BORDER}" stroke-width="1"/>
        ${bars}
        ${labels}
      </svg>
      <div class="chart-tooltip" id="monthlyTooltip"></div>
    `;

    const svg = document.getElementById("monthlySvg");
    const tooltip = document.getElementById("monthlyTooltip");
    wrap.querySelectorAll(".pl-bar").forEach(bar => {
      bar.addEventListener("mousemove", () => {
        const i = parseInt(bar.dataset.i, 10);
        const v = parseFloat(bar.dataset.v);
        const bx = parseFloat(bar.getAttribute("x")) + parseFloat(bar.getAttribute("width")) / 2;
        const by = parseFloat(bar.getAttribute("y"));
        tooltip.innerHTML = `<span class="tt-date">${MONTHS[i]} ${chartYear}</span><br><b class="${v >= 0 ? "tt-pos" : "tt-neg"}">${signedMoney(v)}</b>`;
        tooltip.style.left = (bx / W * 100) + "%";
        tooltip.style.top = (by / H * 100) + "%";
        tooltip.classList.add("show");
      });
      bar.addEventListener("mouseleave", () => tooltip.classList.remove("show"));
    });
  }

  document.getElementById("chartPrevYear").addEventListener("click", () => { chartYear--; buildMonthlyChart(); });
  document.getElementById("chartNextYear").addEventListener("click", () => { chartYear++; buildMonthlyChart(); });

  loadSettingsForm();
  buildWinRate();
  buildEquityChart();
  buildMonthlyChart();
})();
