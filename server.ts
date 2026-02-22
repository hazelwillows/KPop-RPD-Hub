import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";
import nodemailer from "nodemailer";
import { fileURLToPath } from 'url';
import dns from 'node:dns';
import net from 'node:net';

// Force IPv4 globally
if (dns.setDefaultResultOrder) {
  dns.setDefaultResultOrder('ipv4first');
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const db = new Database("rpd.db");

// Email transporter setup
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT) || 587,
  secure: Number(process.env.SMTP_PORT) === 465,
  pool: true, // Use pooling for multiple emails
  maxConnections: 3,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  tls: {
    rejectUnauthorized: false
  },
  // Force IPv4 to prevent ENETUNREACH on cloud providers
  lookup: (hostname, options, callback) => {
    dns.lookup(hostname, { family: 4 }, (err, address, family) => {
      callback(err, address, family);
    });
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
  logger: true,
  debug: true
});

async function sendEmail(to: string, subject: string, text: string) {
  if (!process.env.SMTP_USER || !process.env.SMTP_HOST) {
    console.log("⚠️ SMTP not configured. Email skipped for:", to);
    return { success: false, error: "SMTP not configured" };
  }
  
  try {
    const fromName = "RPD Hub";
    // IMPORTANT: For MailSlurp/Brevo/SendGrid, the 'from' address MUST be a verified email.
    // If SMTP_USER is an API key, SMTP_FROM must be set to a valid email address.
    const fromEmail = process.env.SMTP_FROM || (process.env.SMTP_USER.includes('@') ? process.env.SMTP_USER : 'noreply@rpdhub.com');
    
    if (!fromEmail.includes('@')) {
      console.warn("⚠️ WARNING: The 'From' email address does not look like a valid email. This will likely cause delivery failure.");
    }
    
    console.log(`📧 Attempting to send email:
      To: ${to}
      From: "${fromName}" <${fromEmail}>
      Subject: ${subject}
    `);

    const info = await transporter.sendMail({
      from: `"${fromName}" <${fromEmail}>`,
      to,
      subject,
      text,
    });
    
    console.log("✅ Email sent successfully:", info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error: any) {
    console.error("❌ SMTP Error details:", {
      message: error.message,
      code: error.code,
      command: error.command,
      response: error.response
    });
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

  // Debug Endpoint (Highest Priority)
  app.get("/api/debug", async (req, res) => {
    const host = process.env.SMTP_HOST || 'smtp.gmail.com';
    const port = Number(process.env.SMTP_PORT) || 587;
    
    const checkPort = () => new Promise((resolve) => {
      const socket = new net.Socket();
      socket.setTimeout(10000); // 10s for the test
      socket.on('connect', () => { socket.destroy(); resolve('Connected (Port is Open)'); });
      socket.on('timeout', () => { socket.destroy(); resolve('Timeout (Render is likely blocking this port)'); });
      socket.on('error', (e: any) => { socket.destroy(); resolve(`Error: ${e.code} - ${e.message}`); });
      socket.connect(port, host);
    });

    const portStatus = await checkPort();

    res.json({
      env: process.env.NODE_ENV,
      port: PORT,
      smtp_host: host,
      smtp_port: port,
      smtp_port_status: portStatus,
      smtp_configured: !!process.env.SMTP_USER,
      smtp_from: process.env.SMTP_FROM || (process.env.SMTP_USER?.includes('@') ? process.env.SMTP_USER : 'Not Set (Using Fallback)'),
      db_path: path.join(__dirname, "rpd.db"),
      timestamp: new Date().toISOString()
    });
  });

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
    console.log("📥 Received request to create event:", req.body.title);
    const { 
      title, description, playlist, format, 
      location, date, time, video_recorded, 
      proficiency, artist_type, creator_email
    } = req.body;

    if (!creator_email) {
      return res.status(400).json({ error: "Creator email is required" });
    }

    try {
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
      console.log("💾 Event saved to DB with ID:", eventId);

      // Send confirmation email
      await sendEmail(creator_email, `Event Created: ${title}`, `Hi! Your RPD event "${title}" has been successfully posted.`);

      res.json({ id: eventId });
    } catch (err: any) {
      console.error("❌ DB Error creating event:", err.message);
      res.status(500).json({ error: "Database error" });
    }
  });

  app.post("/api/events/:id/rsvp", async (req, res) => {
    const eventId = req.params.id;
    const { email } = req.body;
    console.log(`📥 Received RSVP for event ${eventId} from ${email}`);

    if (!email) {
      return res.status(400).json({ error: "Email is required for RSVP" });
    }

    try {
      const existing = db.prepare("SELECT id FROM rsvps WHERE event_id = ? AND email = ?").get(eventId, email);
      if (existing) {
        return res.status(400).json({ error: "This email has already RSVP'd" });
      }

      db.prepare("INSERT INTO rsvps (event_id, user_identifier, email) VALUES (?, ?, ?)").run(eventId, req.ip || "anon", email);
      console.log("💾 RSVP saved to DB");

      const event = db.prepare("SELECT * FROM events WHERE id = ?").get(eventId) as any;
      if (event) {
        console.log(`📧 Sending RSVP emails for event: ${event.title}`);
        
        // Send confirmation to the person who RSVP'd
        const userRes = await sendEmail(email, `RSVP Confirmation: ${event.title}`, `You've successfully RSVP'd for ${event.title}.`);
        if (!userRes.success) {
          console.error(`❌ Failed to send confirmation to user ${email}:`, userRes.error);
        }

        // Send notification to the event creator
        const creatorRes = await sendEmail(event.creator_email, `New RSVP: ${event.title}`, `Someone just RSVP'd: ${email}`);
        if (!creatorRes.success) {
          console.error(`❌ Failed to send notification to creator ${event.creator_email}:`, creatorRes.error);
        }
      }

      const count = db.prepare("SELECT COUNT(*) as count FROM rsvps WHERE event_id = ?").get(eventId) as { count: number };
      res.json({ rsvp_count: count.count });
    } catch (err: any) {
      console.error("❌ DB Error in RSVP:", err.message);
      res.status(500).json({ error: "Database error" });
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

  app.listen(Number(PORT), "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
