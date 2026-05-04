const express = require("express");
const cors = require("cors");
const app = express();

app.use(cors());
app.use(express.json());

// 🔑 API Key ของ Alpha Vantage ที่พี่หมีให้มาครับ
const AV_API_KEY = "W643XQNUX3FLFOA4"; 

app.get("/api/stocks", async (req, res) => {
    const symbols = req.query.symbols ? req.query.symbols.split(",") : ["AAPL"];
    const results = [];

    console.log(`📡 Alpha Vantage กำลังออกล่าหุ้นให้พี่หมี: ${symbols.join(", ")}`);

    for (const symbol of symbols) {
        const key = symbol.trim().toUpperCase();
        try {
            // 1. ดึงราคาปัจจุบัน (Global Quote)
            const quoteRes = await fetch(`https://www.alphavantage.co/query?function=GLOBAL_QUOTE&symbol=${key}&apikey=${AV_API_KEY}`);
            const quoteData = await quoteRes.json();
            const quote = quoteData["Global Quote"] || {};

            // 2. ดึงข้อมูลพื้นฐาน (Company Overview) - แหล่งข้อมูล PE และ EPS ฟรี
            const overviewRes = await fetch(`https://www.alphavantage.co/query?function=OVERVIEW&symbol=${key}&apikey=${AV_API_KEY}`);
            const overview = await overviewRes.json();

            // ตรวจสอบว่ามีข้อมูลส่งกลับมาหรือไม่
            if (!overview.Symbol && !quote["01. symbol"]) {
                console.warn(`⚠️ ไม่พบหุ้น ${key} หรือ API Limit เต็ม (ฟรี 25 ครั้ง/วัน)`);
                continue;
            }

            results.push({
                symbol: key,
                name: overview.Name || key,
                price: parseFloat(quote["05. price"]) || 0,
                changesPercentage: parseFloat(quote["10. change percent"]) || 0,
                pe: overview.PERatio !== "None" && overview.PERatio ? parseFloat(overview.PERatio).toFixed(2) : "N/A",
                eps: overview.EPS !== "None" && overview.EPS ? parseFloat(overview.EPS).toFixed(2) : "N/A",
                marketCap: parseInt(overview.MarketCapitalization) || 0,
                sentiment: "Neutral", 
                lynchStatus: (parseFloat(overview.PERatio) < 20) ? "⭐ Lynch Fit" : "Watchlist",
                timestamp: new Date().toLocaleTimeString()
            });

            console.log(`✅ ${key} ดึงข้อมูลงบการเงินสำเร็จ!`);

            // 💡 ทริค: Alpha Vantage ตัวฟรีจำกัด 5 ครั้งต่อนาที 
            // หากดึงหลายตัวพร้อมกัน อาจต้องรอสักครู่ครับ
            
        } catch (error) {
            console.error(`💥 พังที่หุ้น ${key}:`, error.message);
        }
    }

    res.json({
        success: true,
        stocks: results
    });
});

module.exports = app;
