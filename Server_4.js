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

    console.log(`🚀 พี่หมีครับ! เริ่มดึงข้อมูลระบบ Stable สำหรับ: ${symbols.join(", ")}`);

    for (const symbol of symbols) {
        const key = symbol.trim().toUpperCase();
        try {
            // 🌐 ใช้ Stable Profile (ดึงชื่อ, ราคา, การเปลี่ยนแปลง)
            const pRes = await fetch(`https://financialmodelingprep.com/stable/profile?symbol=${key}&apikey=${API_KEY}`);
            const pData = await pRes.json();

            // 🌐 ใช้ Stable Key Metrics (ดึง PE, EPS)
            const mRes = await fetch(`https://financialmodelingprep.com/stable/key-metrics-ttm?symbol=${key}&apikey=${API_KEY}`);
            const mData = await mRes.json();

            const p = Array.isArray(pData) ? pData[0] : pData;
            const m = Array.isArray(mData) ? mData[0] : mData;

            if (!p || !p.symbol) {
                console.warn(`⚠️ ไม่พบหุ้น: ${key}`);
                continue;
            }

            // ดึงข่าวสั้นๆ (ถ้าพังให้ข้ามไป ไม่ให้กระทบตัวเลขหลัก)
            let sentiment = "Neutral";
            try {
                const nRes = await fetch(`https://financialmodelingprep.com/stable/stock_news?tickers=${key}&limit=3&apikey=${API_KEY}`);
                const nData = await nRes.json();
                sentiment = await analyzeNewsSentiment(nData);
            } catch (e) { console.error("News Error:", e.message); }

            // 📊 ส่งตัวเลขกลับไปเป็น Number เพื่อให้หน้าเว็บไม่งง
            results.push({
                symbol: key,
                name: p.name || p.companyName || key,
                price: Number(p.price) || 0,
                changesPercentage: Number(p.changesPercentage || p.changes) || 0,
                pe: Number(m.peRatioTTM) || 0,
                eps: Number(m.netIncomePerShareTTM) || 0,
                marketCap: Number(p.mktCap || p.marketCap) || 0,
                sentiment: sentiment,
                lynchStatus: (m.peRatioTTM && m.peRatioTTM < 20) ? "⭐ Lynch Fit" : "Watchlist",
                timestamp: new Date().toLocaleTimeString()
            });

            console.log(`✅ ${key} ข้อมูลมาครบแล้วครับพี่หมี!`);

        } catch (error) {
            console.error(`💥 หุ้น ${key} มีปัญหา:`, error.message);
        }
    }

    // 🎁 ห่อข้อมูลเป็น Object (แก้ไขจุดที่ไม่สอดคล้องกัน)
    res.json({
        success: true,
        stocks: results
    });
});

module.exports = app;
