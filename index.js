import express from "express";
import cron from "node-cron";
import axios from "axios";

const app = express();
const PORT = process.env.PORT || 4009;

// ────────────────────────────────────────────────
// ✅ Group your endpoints by how often they need pinging
// ────────────────────────────────────────────────

// Every 5 minutes
const PING_URLS_5MIN = [
  { url: "https://adekunle-news-automation-backend.onrender.com/api/news/post_all/", method: "post" },
];

// Every 10 minutes
const PING_URLS_10MIN = [
  // Ubuntu
  "https://ubuntureport.onrender.com",

  // AiCE
  "https://backend.aicecommunity.com/api/health/",
  "https://realtime.aicecommunity.com",
  "https://aicemail.onrender.com/api/health/",

  // SabiWay
  "https://backend.sabiway.com/api/health/",
  "https://backend.sabiway.com/api/posts/",
  "https://realtime.sabiway.com",
  "https://waitlist.sabiway.com",

  // Ajobabalaje
  "https://ajobabalaje.onrender.com/api/health/",
];

// Every 70 minutes
const PING_URLS_70MIN = [
  { url: "https://adekunle-news-automation-backend.onrender.com/api/news/fetch_recent/", method: "post" },
];

// ────────────────────────────────────────────────
// ✅ Shared helpers
// ────────────────────────────────────────────────

// Normalize an entry (string or { url, method }) down to just its URL,
// used for building clean JSON responses on the manual trigger routes.
function toUrl(entry) {
  return typeof entry === "string" ? entry : entry.url;
}

async function pingUrls(entries, label) {
  console.log(`🔁 [${label}] Running keep-alive pings:`, new Date().toISOString());

  for (const entry of entries) {
    const url = toUrl(entry);
    const method = typeof entry === "string" ? "get" : (entry.method || "get");

    try {
      const res = method === "post"
        ? await axios.post(url, {}, { timeout: 15000 })
        : await axios.get(url, { timeout: 15000 });

      console.log(`✅ [${label}] Pinged ${url} (${method.toUpperCase()}) - Status: ${res.status}`);
    } catch (err) {
      console.error(`❌ [${label}] Failed to ping ${url} (${method.toUpperCase()}) - ${err.message}`);
    }
  }
}

// ────────────────────────────────────────────────
// ✅ Health route for THIS keep-alive service
// ────────────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({
    status: "alive",
    time: new Date().toISOString(),
  });
});

// ────────────────────────────────────────────────
// ✅ Schedules
// ────────────────────────────────────────────────

// Cron handles 5 and 10 min fine since they divide evenly into 60
cron.schedule("*/5 * * * *", () => pingUrls(PING_URLS_5MIN, "5min"));
cron.schedule("*/10 * * * *", () => pingUrls(PING_URLS_10MIN, "10min"));

// 70 minutes doesn't divide evenly into a clock hour, so cron syntax
// can't express it directly. Plain setInterval handles it cleanly instead.
const SEVENTY_MIN_MS = 70 * 60 * 1000;
setInterval(() => pingUrls(PING_URLS_70MIN, "70min"), SEVENTY_MIN_MS);

// Optional: run the 70-min group once shortly after boot so you're not
// waiting a full 70 minutes for the first ping after a deploy.
setTimeout(() => pingUrls(PING_URLS_70MIN, "70min-initial"), 30 * 1000);

// ────────────────────────────────────────────────
// ✅ Manual trigger routes (optional, handy for debugging)
// ────────────────────────────────────────────────
app.get("/ping-all", async (req, res) => {
  const all = [
    ...PING_URLS_5MIN,
    ...PING_URLS_10MIN,
    ...PING_URLS_70MIN,
  ];

  await pingUrls(all, "all-manual");

  res.json({ triggered: all.map(toUrl) });
});

app.get("/ping-5min", async (req, res) => {
  await pingUrls(PING_URLS_5MIN, "5min-manual");
  res.json({ triggered: PING_URLS_5MIN.map(toUrl) });
});

app.get("/ping-10min", async (req, res) => {
  await pingUrls(PING_URLS_10MIN, "10min-manual");
  res.json({ triggered: PING_URLS_10MIN.map(toUrl) });
});

app.get("/ping-70min", async (req, res) => {
  await pingUrls(PING_URLS_70MIN, "70min-manual");
  res.json({ triggered: PING_URLS_70MIN.map(toUrl) });
});

// ────────────────────────────────────────────────
// ✅ Start server
// ────────────────────────────────────────────────
app.listen(PORT, () => {
  console.log(`✅ Keep-alive server running on port ${PORT}`);
});