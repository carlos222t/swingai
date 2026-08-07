/* Upload Trade page: take a screenshot, preview it, then send it to
   /api/analyze-trade (Claude, vision) and render the real bull/bear
   breakdown it reads off the actual chart. */
(function(){
  "use strict";

  const ANALYZE_URL = "/api/analyze-trade";
  const MAX_DIMENSION = 1400;
  const JPEG_QUALITY = 0.85;

  let currentFile = null;

  function fileToCompressedBase64(file){
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, MAX_DIMENSION / Math.max(img.width, img.height));
        const w = Math.round(img.width * scale), h = Math.round(img.height * scale);
        const canvas = document.createElement("canvas");
        canvas.width = w; canvas.height = h;
        canvas.getContext("2d").drawImage(img, 0, 0, w, h);
        const dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        resolve({ base64: dataUrl.split(",")[1], mediaType: "image/jpeg" });
      };
      img.onerror = reject;
      img.src = URL.createObjectURL(file);
    });
  }

  function showStage(stage){
    document.getElementById("uploadStage").hidden = stage !== "upload";
    document.getElementById("previewStage").hidden = stage !== "preview";
    document.getElementById("reportStage").hidden = stage !== "report";
  }

  function onFileChosen(file){
    if(!file || !file.type.startsWith("image/")) return;
    currentFile = file;
    const url = URL.createObjectURL(file);
    const img = document.getElementById("previewImage");
    img.src = url;
    showStage("preview");
  }

  function fmtPct(n){ const s = n > 0 ? "+" : ""; return `${s}${n.toFixed(1)}%`; }

  function renderReport(result){
    const { stock, bull, bear, news, score, verdict } = result;

    document.getElementById("reportSymbol").textContent = stock.symbol;
    document.getElementById("reportName").textContent = stock.name;
    document.getElementById("reportPrice").textContent = "$" + stock.price.toFixed(2);

    const scoreEl = document.getElementById("reportScore");
    scoreEl.textContent = score + "%";
    scoreEl.className = "report-score " + verdict.cls;
    document.getElementById("reportVerdict").textContent = verdict.label;
    document.getElementById("reportVerdict").className = "report-verdict " + verdict.cls;
    document.getElementById("reportBar").style.width = score + "%";
    document.getElementById("reportBar").className = "report-bar-fill " + verdict.cls;

    document.getElementById("bullList").innerHTML = bull.length
      ? bull.map(t => `<li>${t}</li>`).join("")
      : `<li class="sign-empty">Nothing clearly bullish showed up in this read.</li>`;
    document.getElementById("bearList").innerHTML = bear.length
      ? bear.map(t => `<li>${t}</li>`).join("")
      : `<li class="sign-empty">No red flags showed up in this read.</li>`;

    document.getElementById("newsList").innerHTML = news.length
      ? news.map(n => `
        <div class="news-row">
          <span class="news-tag ${n.tag.toLowerCase()}">${n.tag}</span>
          <span class="news-text">${n.text}</span>
        </div>`).join("")
      : `<div class="news-row"><span class="news-text">No relevant recent news found for this one.</span></div>`;

    document.getElementById("reportStats").innerHTML = `
      <div class="stat-row"><span>Week</span><b class="${stock.weeklyChangePct > 0 ? "up" : stock.weeklyChangePct < 0 ? "down" : ""}">${fmtPct(stock.weeklyChangePct)}</b></div>
      <div class="stat-row"><span>Month</span><b class="${stock.monthlyChangePct > 0 ? "up" : stock.monthlyChangePct < 0 ? "down" : ""}">${fmtPct(stock.monthlyChangePct)}</b></div>
      <div class="stat-row"><span>Rel. volume</span><b>${stock.relVol.toFixed(2)}&times;</b></div>
      <div class="stat-row"><span>Dist. from 21 EMA</span><b class="${stock.dist20 > 0 ? "up" : "down"}">${fmtPct(stock.dist20)}</b></div>
    `;

    showStage("report");
  }

  function showPaywall(title, sub, showCta){
    document.getElementById("uploadPaywallTitle").textContent = title;
    document.getElementById("uploadPaywallSub").textContent = sub;
    document.getElementById("uploadPaywallCta").hidden = !showCta;
    document.getElementById("uploadPaywall").hidden = false;
    document.getElementById("pageSub").hidden = true;
    document.getElementById("uploadStage").hidden = true;
  }

  function initUploadPage(){
    const fileInput = document.getElementById("fileInput");
    const dropzone = document.getElementById("dropzone");
    if(!fileInput) return;

    const auth = window.SwingAI.auth;
    const plan = auth.getPlan();
    const limit = auth.getUploadLimit();
    const used = auth.getUploadsThisMonth();

    if(limit === 0){
      showPaywall(
        "Chart uploads are a Basic or Premium feature",
        "Upgrade to get a real AI read on your trade screenshots against the pullback checklist.",
        true
      );
      return;
    }
    if(used >= limit){
      showPaywall(
        `You've used all ${limit} uploads this month`,
        plan === "basic"
          ? "Resets at the start of next month, or upgrade to Premium for 15 a month."
          : "Resets at the start of next month.",
        plan === "basic"
      );
      return;
    }

    document.getElementById("pageSub").textContent =
      `Drop in a chart screenshot and we'll read it against the 21/50 EMA pullback checklist. ${limit - used} of ${limit} uploads left this month.`;

    fileInput.addEventListener("change", () => onFileChosen(fileInput.files[0]));

    ["dragover", "dragenter"].forEach(evt => {
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.add("drag"); });
    });
    ["dragleave", "drop"].forEach(evt => {
      dropzone.addEventListener(evt, e => { e.preventDefault(); dropzone.classList.remove("drag"); });
    });
    dropzone.addEventListener("drop", e => {
      const file = e.dataTransfer.files && e.dataTransfer.files[0];
      if(file) onFileChosen(file);
    });

    document.getElementById("resetBtn").addEventListener("click", () => {
      currentFile = null;
      fileInput.value = "";
      showStage("upload");
    });

    document.getElementById("analyzeBtn").addEventListener("click", async () => {
      if(!currentFile) return;
      const btn = document.getElementById("analyzeBtn");
      const errEl = document.getElementById("uploadError");
      btn.disabled = true;
      btn.textContent = "Reading the chart...";
      errEl.hidden = true;

      try{
        const { base64, mediaType } = await fileToCompressedBase64(currentFile);
        const res = await fetch(ANALYZE_URL, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ image: base64, mediaType })
        });
        const result = await res.json();
        if(!res.ok) throw new Error(result.error || "Analysis failed.");
        auth.recordUpload();
        renderReport(result);
      } catch(e){
        errEl.hidden = false;
        errEl.textContent = "Couldn't analyze this chart: " + (e.message || "unknown error");
      } finally {
        btn.disabled = false;
        btn.textContent = "Analyze this trade";
      }
    });

    document.getElementById("newTradeBtn").addEventListener("click", () => {
      currentFile = null;
      fileInput.value = "";
      showStage("upload");
    });
  }

  document.addEventListener("DOMContentLoaded", initUploadPage);
})();
