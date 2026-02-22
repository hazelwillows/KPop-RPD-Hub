import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

const db = new Database("rpd.db");

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    title TEXT NOT NULL,
    description TEXT,
    playlist TEXT,
    format TEXT, -- 'memory' or 'video'
    location TEXT NOT NULL,
    date TEXT NOT NULL,
    time TEXT NOT NULL,
    video_recorded BOOLEAN DEFAULT 0,
    proficiency TEXT, -- 'beginner', 'mid', 'pro'
    artist_type TEXT, -- 'girl_group', 'boy_group', 'mixed'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS rsvps (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    event_id INTEGER NOT NULL,
    user_identifier TEXT NOT NULL, -- Simple session/ip based for demo
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );
`);

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes
  app.get("/api/events", (req, res) => {
    const { q, location, proficiency, artist_type } = req.query;
    let query = `
      SELECT e.*, (SELECT COUNT(*) FROM rsvps r WHERE r.event_id = e.id) as rsvp_count 
      FROM events e 
      WHERE 1=1
    `;
    const params: any[] = [];

    if (q) {
      query += ` AND (title LIKE ? OR description LIKE ? OR playlist LIKE ?)`;
      params.push(`%${q}%`, `%${q}%`, `%${q}%`);
    }
    if (location) {
      query += ` AND location LIKE ?`;
      params.push(`%${location}%`);
    }
    if (proficiency) {
      query += ` AND proficiency = ?`;
      params.push(proficiency);
    }
    if (artist_type) {
      query += ` AND artist_type = ?`;
      params.push(artist_type);
    }

    query += ` ORDER BY date ASC, time ASC`;

    const events = db.prepare(query).all(...params);
    res.json(events);
  });

  app.post("/api/events", (req, res) => {
    const { 
      title, description, playlist, format, 
      location, date, time, video_recorded, 
      proficiency, artist_type 
    } = req.body;

    const stmt = db.prepare(`
      INSERT INTO events (
        title, description, playlist, format, 
        location, date, time, video_recorded, 
        proficiency, artist_type
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title, description, playlist, format, 
      location, date, time, video_recorded ? 1 : 0, 
      proficiency, artist_type
    );

    res.json({ id: result.lastInsertRowid });
  });

  app.post("/api/events/:id/rsvp", (req, res) => {
    const eventId = req.params.id;
    const userIdentifier = req.ip || "anonymous"; // Simple identifier

    // Check if already RSVP'd
    const existing = db.prepare("SELECT id FROM rsvps WHERE event_id = ? AND user_identifier = ?").get(eventId, userIdentifier);
    
    if (existing) {
      return res.status(400).json({ error: "Already RSVP'd" });
    }

    db.prepare("INSERT INTO rsvps (event_id, user_identifier) VALUES (?, ?)").run(eventId, userIdentifier);
    
    const count = db.prepare("SELECT COUNT(*) as count FROM rsvps WHERE event_id = ?").get(eventId) as { count: number };
    res.json({ rsvp_count: count.count });
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
