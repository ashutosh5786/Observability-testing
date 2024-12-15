const express = require("express");
const client = require("prom-client");
const winston = require("winston");
const os = require("os");

const app = express();
const PORT = 3000;

// Initialize Prometheus metrics
const httpRequestDuration = new client.Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status_code"],
  buckets: [0.1, 0.5, 1, 2, 5], // Buckets for latency
});

const httpRequestCount = new client.Counter({
  name: "http_requests_total",
  help: "Total number of HTTP requests",
  labelNames: ["method", "route"],
});

const httpErrorCount = new client.Counter({
  name: "http_errors_total",
  help: "Total number of HTTP errors",
  labelNames: ["method", "status_code"],
});

const systemMetrics = new client.Gauge({
  name: "system_resource_usage",
  help: "System CPU and memory usage",
  labelNames: ["resource"],
});

// Logger setup
const logger = winston.createLogger({
  level: "info",
  format: winston.format.json(),
  transports: [
    new winston.transports.Console(),
    new winston.transports.File({ filename: "app.log" }),
  ],
});

// Middleware to track request duration and traffic
app.use((req, res, next) => {
  const start = Date.now();
  httpRequestCount.inc({ method: req.method, route: req.path });
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000; // Convert to seconds
    httpRequestDuration.observe(
      { method: req.method, route: req.path, status_code: res.statusCode },
      duration
    );

    if (res.statusCode >= 400) {
      httpErrorCount.inc({ method: req.method, status_code: res.statusCode });
    }
  });
  next();
});

// Simple endpoints
app.get("/", (req, res) => {
  res.send("Welcome to the Golden Signals App!");
});

app.get("/hello", (req, res) => {
  setTimeout(() => {
    res.send("Hello, World!");
  }, Math.random() * 1000); // Random delay to simulate latency
});

app.get("/error", (req, res) => {
  res.status(500).send("Simulated error!");
});

// Expose metrics at /metrics
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", client.register.contentType);
  res.end(await client.register.metrics());
});

// Monitor system resources every 5 seconds
setInterval(() => {
  const memoryUsage = process.memoryUsage().heapUsed / 1024 / 1024; // Convert to MB
  const cpuLoad = os.loadavg()[0]; // 1-minute average
  systemMetrics.set({ resource: "memory" }, memoryUsage);
  systemMetrics.set({ resource: "cpu" }, cpuLoad);

  logger.info({
    memoryUsage: `${memoryUsage.toFixed(2)} MB`,
    cpuLoad: cpuLoad.toFixed(2),
  });
}, 5000);

// Start server
app.listen(PORT, () => {
  console.log(`Server running on http://localhost:${PORT}`);
});
