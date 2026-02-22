import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("rpd.db");

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465, // Use SSL for port 465
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    // Do not fail on invalid certs (common for some SMTP relays)
    rejectUnauthorized: false
  }
});

async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_HOST) {
    console.log("SMTP not configured. Email would have been sent to:", to);
    console.log("Subject:", subject);
    console.log("Content:", text);
    return { success: false, error: "SMTP not configured" };
  }
  try {
    const info = await transporter.sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to,
      subject,
      text,
    });
    console.log("Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("Failed to send email:", error);
    return { success: false, error: error.message };
  }
}

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
    email TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (event_id) REFERENCES events(id)
  );
`);

// Migration: Add creator_email if it doesn't exist
try {
  db.prepare("SELECT creator_email FROM events LIMIT 1").get();
} catch (e) {
  console.log("Adding creator_email column to events table...");
  db.exec("ALTER TABLE events ADD COLUMN creator_email TEXT DEFAULT 'unknown@example.com'");
}

// Migration: Add email to rsvps if it doesn't exist
try {
  db.prepare("SELECT email FROM rsvps LIMIT 1").get();
} catch (e) {
  console.log("Adding email column to rsvps table...");
  db.exec("ALTER TABLE rsvps ADD COLUMN email TEXT DEFAULT 'unknown@example.com'");
}

async function startServer() {
  const app = express();
  const PORT = process.env.PORT || 3000;

  app.use(express.json());

  // Test Email Route
  app.post("/api/test-email", async (req, res) => {
    const { email } = req.body;
    if (!email) return res.status(400).json({ error: "Email required" });
    
    const result = await sendEmail(
      email, 
      "RPD Hub SMTP Test", 
      "If you are reading this, your SMTP settings are working correctly!"
    );
    
    if (result.success) {
      res.json({ message: "Test email sent successfully!" });
    } else {
      res.status(500).json({ error: result.error });
    }
  });

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

  app.post("/api/events", async (req, res) => {
    const { 
      title, description, playlist, format, 
      location, date, time, video_recorded, 
      proficiency, artist_type, creator_email
    } = req.body;

    if (!creator_email) {
      return res.status(400).json({ error: "Creator email is required" });
    }

    const stmt = db.prepare(`
      INSERT INTO events (
        title, description, playlist, format, 
        location, date, time, video_recorded, 
        proficiency, artist_type, creator_email
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    const result = stmt.run(
      title, description, playlist, format, 
      location, date, time, video_recorded ? 1 : 0, 
      proficiency, artist_type, creator_email
    );

    const eventId = result.lastInsertRowid;

    // Send confirmation email to creator
    const subject = `Event Created: ${title}`;
    const text = `Hi! Your RPD event "${title}" has been successfully posted on RPD Hub.
    
You will receive an email notification whenever someone RSVPs for your event.

Details:
Date: ${date}
Time: ${time}
Location: ${location}

Thank you for organizing!`;

    await sendEmail(creator_email, subject, text);

    res.json({ id: eventId });
  });

  app.post("/api/events/:id/rsvp", async (req, res) => {
    const eventId = req.params.id;
    const { email } = req.body;
    const userIdentifier = req.ip || "anonymous";

    if (!email) {
      return res.status(400).json({ error: "Email is required for RSVP" });
    }

    // Check if already RSVP'd with this email for this event
    const existing = db.prepare("SELECT id FROM rsvps WHERE event_id = ? AND email = ?").get(eventId, email);
    
    if (existing) {
      return res.status(400).json({ error: "This email has already RSVP'd for this event" });
    }

    db.prepare("INSERT INTO rsvps (event_id, user_identifier, email) VALUES (?, ?, ?)").run(eventId, userIdentifier, email);
    
    // Get event details for email
    const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as any;
    
    if (event) {
      // Send email to user
      const userSubject = `RSVP Confirmation: ${event.title}`;
      const userText = `Hi! You've successfully RSVP'd for ${event.title}.
      
Details:
Date: ${event.date}
Time: ${event.time}
Location: ${event.location}
Format: ${event.format === 'memory' ? 'Dancing from memory' : 'Video/Choreo provided'}
Video Policy: ${event.video_recorded ? 'Will be recorded & posted' : 'No public recording'}

Description:
${event.description}

Playlist:
${event.playlist}

See you there!`;
      
      await sendEmail(email, userSubject, userText);

      // Send email to creator
      const creatorSubject = `New RSVP for your event: ${event.title}`;
      const creatorText = `Hi! Someone just RSVP'd for your event "${event.title}".
      
Attendee Email: ${email}
Total RSVPs: ${db.prepare("SELECT COUNT(*) as count FROM rsvps WHERE event_id = ?").get(eventId).count}

Keep up the great work!`;

      await sendEmail(event.creator_email, creatorSubject, creatorText);
    }

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
