/* Upload Trade's real analysis engine. Takes the uploaded chart screenshot
   (base64, sent from js/upload.js) and asks Claude to actually read it
   against the 21/50 EMA pullback/momentum checklist, grounded in whatever
   price, EMA lines, candles and volume are visible in the image — no more
   picking a canned stock and faking the read. Runs as a Vercel serverless
   function since Anthropic's API rejects direct browser calls. */
"use strict";
const Anthropic = require("@anthropic-ai/sdk");

let anthropic;

const SYSTEM_PROMPT = `You are a swing-trading chart reader for an app called SwingAI. You're shown a screenshot of a stock chart (usually from TradingView or a broker app) and must read it against this strategy:

A 21/50 EMA pullback setup buys a temporary dip inside an uptrend. Price should sit above both the 21 and 50 EMA with the 21 EMA on top, then pull back to one of those lines before bouncing on rising volume. Classify the setup as "Momentum" if price hasn't yet reclaimed the 21 EMA (still approaching it from below, uptrend still developing), "Pullback" if price has reclaimed the 21 EMA and is resting on it as support, or "Neither" if the chart doesn't show a clean uptrend structure at all.

Read whatever is actually visible in the image: ticker/symbol, company name if shown, current price, any visible EMA/moving-average lines and their approximate values, candlestick shape and recent trend, and volume bars. If EMA lines aren't explicitly labeled, estimate their approximate position from the visible trend line/moving-average overlay if one is drawn, or make a reasoned qualitative call from candlestick structure alone. If the ticker symbol isn't legible or identifiable, use "UNKNOWN" for symbol and a generic descriptive name.

Produce specific, grounded bull and bear observations (2-5 each) that reference what you actually see in the chart, in the same beginner-friendly voice as: "Price is only 1.2% above the 21 EMA, right in the zone traders watch for a bounce." Don't fabricate precise numbers you can't see — round/approximate is fine, but say "roughly" or "looks like" where you're estimating rather than reading an exact label.

If web search turns up genuinely recent news for the identified ticker, include up to 2 real headlines tagged Bullish/Bearish/Neutral. If the symbol is unidentifiable or you find nothing relevant, return an empty news array rather than inventing headlines.

Score the setup 0-100 on how safe/clean it looks per the checklist above (a textbook pullback with volume confirmation scores high; a broken trend or unclear structure scores low).`;

const SCHEMA = {
  type: "object",
  properties: {
    symbol: { type: "string" },
    name: { type: "string" },
    price: { type: "number" },
    setup: { type: "string", enum: ["Momentum", "Pullback", "Neither"] },
    dist21EmaPct: { type: "number", description: "estimated % distance of price from the 21 EMA, positive if price is above it" },
    weeklyChangePct: { type: "number" },
    monthlyChangePct: { type: "number" },
    relVol: { type: "number", description: "estimated volume relative to average, 1.0 = average" },
    score: { type: "integer" },
    bull: { type: "array", items: { type: "string" } },
    bear: { type: "array", items: { type: "string" } },
    news: {
      type: "array",
      items: {
        type: "object",
        properties: {
          tag: { type: "string", enum: ["Bullish", "Bearish", "Neutral"] },
          text: { type: "string" }
        },
        required: ["tag", "text"],
        additionalProperties: false
      }
    }
  },
  required: ["symbol", "name", "price", "setup", "dist21EmaPct", "weeklyChangePct", "monthlyChangePct", "relVol", "score", "bull", "bear", "news"],
  additionalProperties: false
};

function verdictFor(score){
  if(score >= 70) return { label: "Safer setup", cls: "safe" };
  if(score >= 45) return { label: "Mixed signals, wait for confirmation", cls: "mixed" };
  return { label: "Risky setup", cls: "risky" };
}

async function readBody(req){
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", chunk => { data += chunk; });
    req.on("end", () => resolve(data));
    req.on("error", reject);
  });
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  if(req.method === "OPTIONS"){ res.status(204).end(); return; }
  if(req.method !== "POST"){ res.status(405).json({ error: "POST only" }); return; }

  if(!process.env.ANTHROPIC_API_KEY){
    res.status(500).json({ error: "Missing ANTHROPIC_API_KEY" });
    return;
  }

  let body;
  try{
    body = JSON.parse(await readBody(req));
  } catch(e){
    res.status(400).json({ error: "Invalid JSON body" });
    return;
  }
  const { image, mediaType } = body;
  if(!image || !mediaType){
    res.status(400).json({ error: "Missing image or mediaType" });
    return;
  }

  if(!anthropic) anthropic = new Anthropic();

  try{
    const response = await anthropic.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      system: SYSTEM_PROMPT,
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: SCHEMA }
      },
      tools: [{ type: "web_search_20260209", name: "web_search", max_uses: 2 }],
      messages: [{
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: mediaType, data: image } },
          { type: "text", text: "Read this chart against the 21/50 EMA pullback/momentum checklist and return the analysis." }
        ]
      }]
    });

    if(response.stop_reason === "refusal"){
      res.status(422).json({ error: "Request was declined by Anthropic's safety classifiers." });
      return;
    }
    const textBlock = response.content.find(b => b.type === "text");
    if(!textBlock){
      res.status(502).json({ error: "No analysis returned." });
      return;
    }
    const parsed = JSON.parse(textBlock.text);

    const result = {
      stock: {
        symbol: parsed.symbol, name: parsed.name, price: parsed.price,
        weeklyChangePct: parsed.weeklyChangePct, monthlyChangePct: parsed.monthlyChangePct,
        relVol: parsed.relVol, dist20: parsed.dist21EmaPct, setup: parsed.setup
      },
      bull: parsed.bull, bear: parsed.bear, news: parsed.news,
      score: parsed.score, verdict: verdictFor(parsed.score)
    };
    res.status(200).json(result);
  } catch(e){
    res.status(500).json({ error: e.message || "Analysis failed" });
  }
};
