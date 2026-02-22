import express from "express";
import cron from "node-cron";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 4009;

// ✅ Put ALL Render endpoints here (hard-coded)
const PING_URLS = [
  // Ubuntu
  "https://ubuntureport.onrender.com",

  // AiCE
  "https://aicelearnbackend.aicecommunity.com/api/health/",
  "https://aicelearnrealtime.aicecommunity.com",
  "https://aicemail.onrender.com/api/health/",

  // SabiWay
  "https://backend.sabiway.com/api/health/",
  "https://realtime.sabiway.com",
  "https://waitlist.sabiway.com",
  

  // Ajobabalaje
  "https://ajobabalaje-server.onrender.com/api/health/"
];

// ✅ Health route for THIS keep-alive service
app.get("/health", (req, res) => {
  res.json({
    status: "alive",
    time: new Date().toISOString(),
  });
});

// ✅ Keep-alive cron job (every 10 minutes)
cron.schedule("*/10 * * * *", async () => {
  console.log("🔁 Running keep-alive pings:", new Date().toISOString());

  for (const url of PING_URLS) {
    try {
      const res = await axios.get(url, { timeout: 15000 });
      console.log(`✅ Pinged ${url} - Status: ${res.status}`);
    } catch (err) {
      console.error(`❌ Failed to ping ${url}`);
    }
  }
});

// ✅ Manual trigger (optional)
app.get("/ping-all", async (req, res) => {
  const results = [];

  for (const url of PING_URLS) {
    try {
      await axios.get(url);
      results.push({ url, status: "ok" });
    } catch {
      results.push({ url, status: "failed" });
    }
  }

  res.json(results);
});

// ✅ Start server
app.listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});
