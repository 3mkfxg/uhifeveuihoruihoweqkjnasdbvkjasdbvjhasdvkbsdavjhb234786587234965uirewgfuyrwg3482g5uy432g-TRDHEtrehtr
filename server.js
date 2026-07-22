const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');
const fs = require('fs');
const cors = require('cors');
const multer = require('multer');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  maxHttpBufferSize: 1e8, // 100MB
  cors: {
    origin: '*',
  }
});

// Configure middleware
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname)));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));

// Ensure directories exist
const UPLOADS_DIR = path.join(__dirname, 'uploads');
const TEMP_DIR = path.join(UPLOADS_DIR, 'temp');
if (!fs.existsSync(UPLOADS_DIR)) fs.mkdirSync(UPLOADS_DIR, { recursive: true });
if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });

// Setup multer for memory storage of chunks
const storage = multer.memoryStorage();
const upload = multer({ storage });

let db;
async function initDb() {
  db = await open({
    filename: path.join(__dirname, 'chat.db'),
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT,
      text TEXT,
      fileName TEXT,
      fileUrl TEXT,
      fileSize INTEGER,
      fileType TEXT,
      timestamp DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// REST Endpoint for Chunked Uploads
app.post('/upload-chunk', upload.single('chunk'), async (req, res) => {
  try {
    const { fileId, chunkIndex, totalChunks } = req.body;
    if (!fileId || chunkIndex === undefined || !req.file) {
      return res.status(400).json({ error: 'Missing parameters or file chunk' });
    }

    const chunkDir = path.join(TEMP_DIR, fileId);
    if (!fs.existsSync(chunkDir)) {
      fs.mkdirSync(chunkDir, { recursive: true });
    }

    const chunkPath = path.join(chunkDir, `${chunkIndex}.tmp`);
    fs.writeFileSync(chunkPath, req.file.buffer);

    res.json({ success: true, message: `Chunk ${chunkIndex} uploaded successfully` });
  } catch (error) {
    console.error('Error uploading chunk:', error);
    res.status(500).json({ error: 'Failed to upload chunk' });
  }
});

// REST Endpoint to Merge Uploaded Chunks
app.post('/merge-chunks', async (req, res) => {
  try {
    const { fileId, fileName, totalChunks, fileType, fileSize, username } = req.body;
    if (!fileId || !fileName || !totalChunks) {
      return res.status(400).json({ error: 'Missing parameters' });
    }

    const chunkDir = path.join(TEMP_DIR, fileId);
    const finalFilePath = path.join(UPLOADS_DIR, fileName);

    // Merge chunks
    const writeStream = fs.createWriteStream(finalFilePath);

    for (let i = 0; i < totalChunks; i++) {
      const chunkPath = path.join(chunkDir, `${i}.tmp`);
      if (!fs.existsSync(chunkPath)) {
        writeStream.end();
        return res.status(400).json({ error: `Missing chunk index ${i}` });
      }

      const chunkBuffer = fs.readFileSync(chunkPath);
      writeStream.write(chunkBuffer);
      
      // Delete temporary chunk file after writing
      fs.unlinkSync(chunkPath);
    }

    writeStream.end();

    // Clean up temporary directory
    fs.rmdirSync(chunkDir);

    const fileUrl = `/uploads/${encodeURIComponent(fileName)}`;

    // Insert file reference into database
    const message = {
      username: username || 'Anonymous',
      text: `Sent a file: ${fileName}`,
      fileName,
      fileUrl,
      fileSize,
      fileType
    };

    const result = await db.run(
      `INSERT INTO messages (username, text, fileName, fileUrl, fileSize, fileType) VALUES (?, ?, ?, ?, ?, ?)`,
      [message.username, message.text, message.fileName, message.fileUrl, message.fileSize, message.fileType]
    );

    message.id = result.lastID;
    message.timestamp = new Date().toISOString();

    // Broadcast file message
    io.emit('message', message);

    res.json({ success: true, fileUrl });
  } catch (error) {
    console.error('Error merging chunks:', error);
    res.status(500).json({ error: 'Failed to merge chunks' });
  }
});

// Socket.io connection logic
io.on('connection', async (socket) => {
  console.log('User connected:', socket.id);

  // Send history to newly connected user
  try {
    const history = await db.all('SELECT * FROM messages ORDER BY timestamp ASC LIMIT 100');
    socket.emit('history', history);
  } catch (err) {
    console.error('Error reading chat history:', err);
  }

  // Handle new incoming text messages
  socket.on('message', async (data) => {
    const { username, text } = data;
    if (!username || !text) return;

    try {
      const result = await db.run(
        `INSERT INTO messages (username, text) VALUES (?, ?)`,
        [username, text]
      );
      
      const newMessage = {
        id: result.lastID,
        username,
        text,
        timestamp: new Date().toISOString()
      };

      io.emit('message', newMessage);
    } catch (err) {
      console.error('Error saving message:', err);
    }
  });

  socket.on('disconnect', () => {
    console.log('User disconnected:', socket.id);
  });
});

// Start the server
const PORT = process.env.PORT || 3000;
initDb().then(() => {
  server.listen(PORT, () => {
    console.log(`Server listening on http://localhost:${PORT}`);
  });
}).catch(err => {
  console.error('Failed to initialize database:', err);
});
