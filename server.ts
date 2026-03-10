import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const db = new Database("scans.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS scans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    detection_result TEXT NOT NULL,
    confidence_level INTEGER NOT NULL,
    reasons TEXT NOT NULL,
    red_flags TEXT NOT NULL,
    suggestions TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  )
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.post("/api/scans", (req, res) => {
    const { detectionResult, confidenceLevel, reasons, redFlags, suggestions } = req.body;
    
    try {
      const stmt = db.prepare(`
        INSERT INTO scans (detection_result, confidence_level, reasons, red_flags, suggestions)
        VALUES (?, ?, ?, ?, ?)
      `);
      
      const result = stmt.run(
        detectionResult,
        confidenceLevel,
        JSON.stringify(reasons),
        JSON.stringify(redFlags),
        JSON.stringify(suggestions)
      );
      
      res.json({ id: result.lastInsertRowid });
    } catch (error) {
      console.error("Error saving scan:", error);
      res.status(500).json({ error: "Failed to save scan" });
    }
  });

  app.get("/api/scans", (req, res) => {
    try {
      const scans = db.prepare("SELECT * FROM scans ORDER BY created_at DESC LIMIT 50").all();
      res.json(scans.map(scan => ({
        ...scan,
        reasons: JSON.parse(scan.reasons as string),
        red_flags: JSON.parse(scan.red_flags as string),
        suggestions: JSON.parse(scan.suggestions as string)
      })));
    } catch (error) {
      console.error("Error fetching scans:", error);
      res.status(500).json({ error: "Failed to fetch scans" });
    }
  });

  app.get("/api/stats", (req, res) => {
    try {
      const totalScans = db.prepare("SELECT COUNT(*) as count FROM scans").get() as { count: number };
      const fakeScans = db.prepare("SELECT COUNT(*) as count FROM scans WHERE detection_result = 'FAKE'").get() as { count: number };
      const realScans = db.prepare("SELECT COUNT(*) as count FROM scans WHERE detection_result = 'REAL'").get() as { count: number };
      
      const recentActivity = db.prepare("SELECT detection_result, COUNT(*) as count FROM scans GROUP BY detection_result").all();
      
      res.json({
        total: totalScans.count,
        fake: fakeScans.count,
        real: realScans.count,
        recentActivity
      });
    } catch (error) {
      console.error("Error fetching stats:", error);
      res.status(500).json({ error: "Failed to fetch stats" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(__dirname, "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(__dirname, "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
