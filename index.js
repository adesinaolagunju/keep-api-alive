import express from "express";
import axios from "axios";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const app = express();
const PORT = process.env.PORT || 4009;

// ────────────────────────────────────────────────
// Active ping timers: Map<endpointId, NodeJS.Timeout>
// ────────────────────────────────────────────────
const activeTimers = new Map();

// ────────────────────────────────────────────────
// Ping a single endpoint and log result
// ────────────────────────────────────────────────
async function pingEndpoint(endpoint) {
  const { id, label, url, method } = endpoint;
  const startTime = Date.now();
  let statusCode = null;
  let success = false;
  let error = null;

  try {
    const res = method === "POST"
      ? await axios.post(url, {}, { timeout: 120000 })
      : await axios.get(url, { timeout: 120000 });

    statusCode = res.status;
    success = true;   // axios only resolves on 2xx, so reaching here means success
    console.log(`✅ [${label}] Pinged ${url} (${method}) - Status: ${statusCode}`);
  } catch (err) {
    // if axios got a response but it was non-2xx, err.response exists
    statusCode = err.response?.status ?? null;
    error = err.message;
    console.error(`❌ [${label}] Failed to ping ${url} (${method}) - ${error}`);
  }

  const responseTimeMs = Date.now() - startTime;

  try {
    await prisma.pingLog.create({
      data: {
        endpointId: id,
        statusCode,
        success,
        responseTimeMs,
        error,
      },
    });
  } catch (dbErr) {
    console.error(`❌ [${label}] Failed to write log: ${dbErr.message}`);
  }
}

// ────────────────────────────────────────────────
// Schedule a single endpoint
// ────────────────────────────────────────────────
function scheduleEndpoint(endpoint) {
  const { id, label, intervalMinutes } = endpoint;
  const intervalMs = intervalMinutes * 60 * 1000;

  // Clear existing timer if any
  if (activeTimers.has(id)) {
    clearInterval(activeTimers.get(id));
  }

  const timer = setInterval(() => pingEndpoint(endpoint), intervalMs);
  activeTimers.set(id, timer);

  console.log(`📅 Scheduled "${label}" every ${intervalMinutes}min`);
}

// ────────────────────────────────────────────────
// Unschedule an endpoint
// ────────────────────────────────────────────────
function unscheduleEndpoint(endpointId) {
  if (activeTimers.has(endpointId)) {
    clearInterval(activeTimers.get(endpointId));
    activeTimers.delete(endpointId);
    console.log(`🗑️ Unscheduled endpoint: ${endpointId}`);
  }
}

// ────────────────────────────────────────────────
// Load all active endpoints from DB and schedule
// FIX: no longer wipes and recreates every timer on
// every reload cycle. It only unschedules endpoints
// that are no longer active, and only schedules
// endpoints that don't already have a running timer.
// This lets existing timers count down uninterrupted.
// ────────────────────────────────────────────────
async function loadEndpoints() {
  console.log("🔄 Loading endpoints from database...");

  try {
    const endpoints = await prisma.endpoint.findMany({
      where: { isActive: true },
    });

    console.log(`📡 Found ${endpoints.length} active endpoints`);

    const currentIds = new Set(endpoints.map(ep => ep.id));

    // Unschedule endpoints that are no longer active/present in DB
    for (const id of activeTimers.keys()) {
      if (!currentIds.has(id)) {
        unscheduleEndpoint(id);
      }
    }

    // Only schedule endpoints that don't already have a timer running
    for (const ep of endpoints) {
      if (!activeTimers.has(ep.id)) {
        try {
          scheduleEndpoint(ep);
        } catch (err) {
          console.error(`❌ Failed to schedule "${ep.label}": ${err.message}`);
        }
      }
    }

    return endpoints;
  } catch (err) {
    console.error(`❌ Failed to load endpoints: ${err.message}`);
    return [];
  }
}

// ────────────────────────────────────────────────
// Health route
// ────────────────────────────────────────────────
app.get("/health", async (req, res) => {
  const endpointCount = await prisma.endpoint.count({ where: { isActive: true } });
  res.json({
    status: "alive",
    time: new Date().toISOString(),
    activeEndpoints: endpointCount,
    scheduledTimers: activeTimers.size,
  });
});

// ────────────────────────────────────────────────
// Manual trigger: ping all active endpoints now
// ────────────────────────────────────────────────
app.get("/ping-all", async (req, res) => {
  const endpoints = await prisma.endpoint.findMany({ where: { isActive: true } });

  const results = await Promise.allSettled(endpoints.map(ep => pingEndpoint(ep)));

  res.json({
    triggered: endpoints.length,
    results: results.map((r, i) => ({
      url: endpoints[i].url,
      status: r.status,
    })),
  });
});

// ────────────────────────────────────────────────
// Manual trigger: ping a single endpoint by ID
// ────────────────────────────────────────────────
app.get("/ping/:id", async (req, res) => {
  const endpoint = await prisma.endpoint.findUnique({ where: { id: req.params.id } });
  if (!endpoint) {
    return res.status(404).json({ error: "Endpoint not found" });
  }

  await pingEndpoint(endpoint);
  res.json({ pinged: endpoint.url });
});

// ────────────────────────────────────────────────
// Reload endpoints from database (picks up changes)
// ────────────────────────────────────────────────
app.post("/reload", async (req, res) => {
  const endpoints = await loadEndpoints();
  res.json({ reloaded: endpoints.length });
});

// ────────────────────────────────────────────────
// List currently scheduled endpoints
// ────────────────────────────────────────────────
app.get("/endpoints", async (req, res) => {
  const endpoints = await prisma.endpoint.findMany({
    orderBy: { createdAt: "asc" },
  });
  res.json(endpoints);
});

// ────────────────────────────────────────────────
// Start server
// ────────────────────────────────────────────────
async function start() {
  try {
    await prisma.$connect();
    console.log("✅ Connected to database");
  } catch (err) {
    console.error(`❌ Database connection failed: ${err.message}`);
    process.exit(1);
  }

  await loadEndpoints();

  // Refresh endpoint list every 5 minutes (picks up DB changes without restart)
  setInterval(loadEndpoints, 5 * 60 * 1000);

  app.listen(PORT, () => {
    console.log(`✅ Keep-alive server running on port ${PORT}`);
  });
}

start();