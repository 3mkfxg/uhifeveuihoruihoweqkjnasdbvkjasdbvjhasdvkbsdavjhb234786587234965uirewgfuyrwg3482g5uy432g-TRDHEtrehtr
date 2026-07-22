# LiveStream Chat Room (Unlimited Large File Sharing)

A real-time chatting application with persistent chat history in a local SQLite database and a custom chunked file uploader capable of sending and streaming video files of any size (even >1GB) completely for free.

## Tech Stack
- **Frontend**: Glassmorphism CSS layout, Socket.io client, Native JavaScript chunked slicer.
- **Backend**: Node.js, Express, Socket.io, Multer, SQLite.

## Quick Start

### 1. Install Dependencies
Make sure you have [Node.js](https://nodejs.org/) installed, then run:
```bash
npm install
```

### 2. Start the Server
Start the server locally:
```bash
npm start
```
The server will now be running on **http://localhost:3000**. Open this in one or more browser tabs to test live chatting.

---

## Exposing the Application to the Internet (Free Hosting & Storage)

To share the application with your friends online so they can join and upload files directly to your machine:

### Option A: Using LocalTunnel (Quickest, Zero Setup)
While the local server is running on port 3000, open a new command prompt and run:
```bash
npx localtunnel --port 3000
```
This will instantly generate a public URL (e.g., `https://xyz.loca.lt`) that you can send to anyone. When they visit this URL, they will connect directly to your local backend and SQLite database.

### Option B: Using Cloudflare Tunnels (More Permanent/Stable)
1. Download and install `cloudflared`.
2. Run the tunnel command:
```bash
cloudflared tunnel --url http://localhost:3000
```
This yields a high-performance public link backed by Cloudflare's network.

---

## How Chunked Uploading Works
To bypass normal cloud server memory limits and upload files >1GB:
1. The client breaks down your selected file into **5MB binary pieces (chunks)**.
2. The chunks are uploaded one by one to the server using standard HTTP requests (avoiding massive single payloads).
3. Once all chunks are safely on disk, the backend merges the chunks back into the original file format under the `uploads/` folder and broadcasts the new media card to the Socket.io room.
