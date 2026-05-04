const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// 🔑 API Key ของพี่หมี
const API_KEY = "SFtbTv6ztA9vxVnSxXvaHdMLDCWhxxn5";

async function analyzeNewsSentiment(news) {
    if (!news || !Array.isArray(news) || news.length === 0) return "Neutral";
    const text = news.map(n => n.title).join(" ");
    const positiveWords = ["upgrade", "buy", "growth", "positive", "bullish", "strong", "beat", "surge"];
    const negativeWords = ["downgrade", "sell", "decline", "negative", "bearish", "weak", "miss", "drop"];
    let score = 0;
    positiveWords.forEach(word => { if (text.toLowerCase().includes(word)) score++; });
    negativeWords.forEach(word => { if (text.toLowerCase().includes(word)) score--; });
    return score > 0 ? "Positive" : score < 0 ? "Negative" : "Neutral";
}

app.get("/api/stocks", async (req, res) => {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["AAP", "LRCX", "CROX"];
    const results = [];

    for (const symbol of symbols) {
        const key = symbol.trim().toUpperCase();
        try {
            console.log(`📡 กำลังดึงข้อมูล ${key} ผ่านท่อ Stable...`);
            
            // 🚀 ใช้ท่อ Stable Profile (เพื่อชื่อและราคา)
            const profileUrl = `https://financialmodelingprep.com/stable/profile?symbol=${key}&apikey=${API_KEY}`;
            const profileRes = await fetch(profileUrl);
            const profileData = await profileRes.json();

            // 🚀 ใช้ท่อ Stable Metrics (เพื่อ PE และ EPS)
            const metricsUrl = `https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${key}&apikey=${API_KEY}`;
            const metricsRes = await fetch(metricsUrl);
            const metricsData = await metricsRes.json();

            const p = Array.isArray(profileData) ? profileData[0] : profileData;
            const m = Array.isArray(metricsData) ? metricsData[0] : metricsData;

            // ถ้าไม่มีข้อมูลพื้นฐาน ให้ข้ามไป
            if (!p || !p.symbol) {
                console.warn(`⚠️ ไม่พบข้อมูลหุ้น: ${key}`);
                results.push({ symbol: key, error: true });
                continue;
            }

            // ดึงข่าวผ่านท่อ Stable
            const newsUrl = `https://financialmodelingprep.com/stable/stock_news?tickers=${key}&limit=3&apikey=${API_KEY}`;
            const newsRes = await fetch(newsUrl);
            const newsData = await newsRes.json();
            const sentiment = await analyzeNewsSentiment(newsData);

            results.push({
                symbol: key,
                name: p.name || p.companyName || key,
                price: p.price,
                changesPercentage: p.changesPercentage || p.changes,
                pe: m.peRatioTTM ? Number(m.peRatioTTM).toFixed(2) : "N/A",
                eps: m.netIncomePerShareTTM ? Number(m.netIncomePerShareTTM).toFixed(2) : "N/A",
                marketCap: p.mktCap || p.marketCap,
                sentiment: sentiment,
                lynchStatus: (m.peRatioTTM && m.peRatioTTM < 20) ? "⭐ Lynch Fit" : "Watchlist",
                timestamp: new Date().toLocaleTimeString()
            });

            console.log(`✅ ${key} เรียบร้อย!`);

        } catch (error) {
            console.error(`💥 พังที่หุ้น ${key}:`, error.message);
            results.push({ symbol: key, error: true });
        }
    }
    res.json(results);
});

module.exports = app;
