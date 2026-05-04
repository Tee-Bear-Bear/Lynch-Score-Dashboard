const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// 🔑 ใส่ API Key แท้ของคุณตรงนี้
const API_KEY = "SFtbTv6ztA9vxVnSxXvaHdMLLtCWhxxn5";

let alertedStocks = {};
setInterval(() => { alertedStocks = {}; }, 1000 * 60 * 60 * 24);

function analyzeNewsSentiment(news) {
  const pos = ["beat", "growth", "buyback", "positive", "dividend", "profit", "higher", "surge", "up"];
  const neg = ["miss", "decline", "debt", "lawsuit", "loss", "warning", "lower", "plunge", "drop", "down"];
  let score = 0;
  if (!news || !Array.isArray(news)) return 1; 

  news.forEach(n => {
    const t = (n.title || "").toLowerCase();
    pos.forEach(w => { if (t.includes(w)) score += 0.5; });
    neg.forEach(w => { if (t.includes(w)) score -= 0.5; });
  });
  return Math.max(0, Math.min(2, score + 1)); 
}

function getAnalysis(data, sector, news) {
  const pe = data.pe || 0;
  // FMP ส่งค่ามาเป็นจุดทศนิยม เราเลยต้องคูณ 100 ให้เป็นเปอร์เซ็นต์
  const growthPct = (data.epsGrowth || 0) * 100; 
  const margin = (data.profitMargin || 0) * 100;
  const debt = (data.debtToEquity || 0) * 100; 
  
  let peg = pe > 0 && growthPct > 0 ? pe / growthPct : 0;
  const isNA = (val) => val === 0 || val === null || val === undefined || isNaN(val);
  
  let isValueTrap = false;
  let trapReason = "";
  if (pe > 0 && pe < 7 && growthPct < 0) { isValueTrap = true; trapReason = "P/E ต่ำแต่กำไรถดถอย"; }
  else if (debt > 250) { isValueTrap = true; trapReason = "หนี้สูงเกินเกณฑ์ปกติ"; }
  
  let lynchScore = 0;
  if (growthPct > 15) lynchScore += 1.5;
  if (peg > 0 && peg < 1.1) lynchScore += 1.5;
  if (margin > 15) lynchScore += 1.0;
  
  const isFinance = ["Financial Services", "Real Estate", "Financials"].includes(sector);
  if ((isFinance && debt < 300) || (!isFinance && debt < 60)) lynchScore += 1.0;
  
  const sentiment = analyzeNewsSentiment(news);
  const storyScore = Math.min(5, (margin > 20 ? 1.5 : 0) + (debt < 30 ? 1.5 : 0) + sentiment);
  
  return { 
    type: growthPct > 20 ? "Fast Grower" : (growthPct > 10 ? "Stalwart" : "Cyclical"), 
    lynchScore, storyScore, totalScore: lynchScore + storyScore, isValueTrap, trapReason,
    growth: { val: isNA(growthPct) ? "N/A" : growthPct.toFixed(0) + "%", color: isNA(growthPct) ? "#94a3b8" : (growthPct > 15 ? "#4ade80" : "#fbbf24"), status: isNA(growthPct) ? "ไม่พบข้อมูล" : (growthPct > 25 ? "สูงมาก" : (growthPct > 15 ? "สูง" : "ปกติ")), raw: growthPct },
    pegData: { val: isNA(peg) ? "N/A" : peg.toFixed(2), color: isNA(peg) ? "#94a3b8" : (peg < 1 ? "#4ade80" : (peg < 1.5 ? "#fbbf24" : "#f87171")), status: isNA(peg) ? "ไม่พบข้อมูล" : (peg < 1 ? "ดีมาก" : (peg < 1.5 ? "ตึงตัว" : "แพง")), raw: peg },
    debtData: { val: isNA(debt) ? "N/A" : debt.toFixed(0) + "%", color: isNA(debt) ? "#94a3b8" : (lynchScore >= 4 ? "#4ade80" : "#ef4444"), status: isNA(debt) ? "ไม่พบข้อมูล" : (lynchScore >= 4 ? "ดีมาก" : "สูง"), raw: debt },
    profit: { val: isNA(margin) ? "N/A" : margin.toFixed(1) + "%", color: isNA(margin) ? "#94a3b8" : (margin > 15 ? "#4ade80" : "#fbbf24"), status: isNA(margin) ? "ไม่พบข้อมูล" : (margin > 15 ? "สูง" : "กลาง"), raw: margin }
  };
}

app.get("/api/stocks", async (req, res) => {
  try {
    if (!req.query.symbols) return res.json([]);
    const symbols = req.query.symbols.split(",");
    let results = [];
    
    for (const s of symbols) {
      const key = s.toUpperCase().trim();
      try {
        // 🚀 ยิง API แท้ไปที่ FMP (ดึงข้อมูลทีละส่วน)
        const [quoteRes, profileRes, metricsRes, growthRes, newsRes] = await Promise.all([
          fetch(`https://financialmodelingprep.com/api/v3/quote/${key}?apikey=${API_KEY}`),
          fetch(`https://financialmodelingprep.com/api/v3/profile/${key}?apikey=${API_KEY}`),
          fetch(`https://financialmodelingprep.com/api/v3/key-metrics-ttm/${key}?apikey=${API_KEY}`),
          fetch(`https://financialmodelingprep.com/api/v3/financial-growth/${key}?limit=1&apikey=${API_KEY}`),
          fetch(`https://financialmodelingprep.com/api/v3/stock_news?tickers=${key}&limit=5&apikey=${API_KEY}`)
        ]);

        const quote = await quoteRes.json();
        const profile = await profileRes.json();
        const metrics = await metricsRes.json();
        const growth = await growthRes.json();
        const news = await newsRes.json();

        // ตรวจสอบว่ามีข้อมูลหุ้นนี้จริงๆ หรือไม่
        if (!quote || quote.length === 0) {
            results.push({ symbol: key, error: true });
            continue;
        }

        // จับคู่ข้อมูลใหม่ให้เข้ากับระบบ Lynch Score ของเรา
        const stockData = {
            pe: quote[0]?.pe || metrics[0]?.peRatioTTM,
            epsGrowth: growth[0]?.epsgrowth || 0,
            profitMargin: metrics[0]?.netProfitMarginTTM || 0,
            debtToEquity: metrics[0]?.debtToEquityTTM || 0
        };

        const sector = profile[0]?.sector || "Unknown";
        const analysis = getAnalysis(stockData, sector, news);
        const is10x = analysis.totalScore >= 9;
        
        let alert = false;
        if (is10x && !alertedStocks[key]) { alert = true; alertedStocks[key] = true; }
        
        results.push({ 
            symbol: key, 
            name: quote[0]?.name || "-", 
            price: quote[0]?.price || 0, 
            ...analysis, 
            is10x, 
            alert 
        });
        
      } catch (err) { 
        console.error(`❌ Error fetching ${key} from FMP:`, err.message); 
        results.push({ symbol: key, error: true }); 
      }
    }
    res.json(results);
  } catch (err) { res.json([]); }
});

module.exports = app;
