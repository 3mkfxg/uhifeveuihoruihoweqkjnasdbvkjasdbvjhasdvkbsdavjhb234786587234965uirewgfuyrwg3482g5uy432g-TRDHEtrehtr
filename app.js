// App State
let username = localStorage.getItem('chat_username') || '';
let backendUrl = localStorage.getItem('chat_backend_url') || '';

// UI Elements
const loginOverlay = document.getElementById('login-overlay');
const loginForm = document.getElementById('login-form');
const usernameInput = document.getElementById('username-input');
const backendInput = document.getElementById('backend-input');
const chatWorkspace = document.getElementById('chat-workspace');
const messagesContainer = document.getElementById('messages-container');
const chatForm = document.getElementById('chat-form');
const messageInput = document.getElementById('message-input');
const fileInput = document.getElementById('file-input');
const displayUsername = document.getElementById('display-username');
const connectionStatus = document.getElementById('connection-status');
const statusIndicator = document.querySelector('.status-indicator');

// Upload UI Elements
const uploadProgressContainer = document.getElementById('upload-progress-bar-container');
const uploadFilename = document.getElementById('upload-filename');
const uploadPercentage = document.getElementById('upload-percentage');
const progressFill = document.getElementById('progress-fill');
const uploadBytes = document.getElementById('upload-bytes');

let socket = null;

// Function to initialize socket connection
function initSocket() {
  if (socket) {
    socket.disconnect();
  }

  // Connect to the configured backend URL with tunnel bypass headers
  socket = io(backendUrl, {
    extraHeaders: {
      "bypass-tunnel-reminder": "true"
    }
  });

  // Handle connection status
  socket.on('connect', () => {
    connectionStatus.textContent = 'Connected (SQLite Live)';
    statusIndicator.className = 'status-indicator online';
  });

  socket.on('disconnect', () => {
    connectionStatus.textContent = 'Disconnected. Retrying...';
    statusIndicator.className = 'status-indicator';
  });

  // Receive Message History
  socket.on('history', (history) => {
    messagesContainer.innerHTML = '';
    history.forEach(renderMessage);
  });

  // Receive New Live Messages
  socket.on('message', renderMessage);
}

// Auto login if credentials exist
if (username && backendUrl) {
  loginOverlay.classList.remove('active');
  displayUsername.textContent = username;
  initSocket();
} else {
  loginOverlay.classList.add('active');
  usernameInput.value = username;
  backendInput.value = backendUrl || 'http://localhost:3000';
}

// Handle Username & Backend URL Submission
loginForm.addEventListener('submit', (e) => {
  e.preventDefault();
  const userVal = usernameInput.value.trim();
  let backendVal = backendInput.value.trim();

  // Normalize Backend URL (remove trailing slash)
  if (backendVal.endsWith('/')) {
    backendVal = backendVal.slice(0, -1);
  }

  if (userVal && backendVal) {
    username = userVal;
    backendUrl = backendVal;
    localStorage.setItem('chat_username', username);
    localStorage.setItem('chat_backend_url', backendUrl);
    
    loginOverlay.classList.remove('active');
    displayUsername.textContent = username;
    initSocket();
  }
});

// Format file size helper
function formatBytes(bytes, decimals = 2) {
  if (bytes === 0) return '0 Bytes';
  const k = 1024;
  const dm = decimals < 0 ? 0 : decimals;
  const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
}

// Render message helper
function renderMessage(msg) {
  const isSelf = msg.username === username;
  const row = document.createElement('div');
  row.className = `message-row ${isSelf ? 'outgoing' : 'incoming'}`;

  const bubble = document.createElement('div');
  bubble.className = 'message-bubble';

  const meta = document.createElement('div');
  meta.className = 'msg-meta';

  const author = document.createElement('span');
  author.className = 'msg-author';
  author.textContent = msg.username;

  const time = document.createElement('span');
  time.className = 'msg-time';
  const d = new Date(msg.timestamp);
  time.textContent = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

  meta.appendChild(author);
  meta.appendChild(time);
  bubble.appendChild(meta);

  const text = document.createElement('div');
  text.className = 'msg-text';
  
  if (msg.fileUrl) {
    text.textContent = msg.text || `Shared a file`;
    bubble.appendChild(text);

    // Resolve URL absolute path to backend server
    const absoluteFileUrl = `${backendUrl}${msg.fileUrl}`;

    // Render attachment based on file type
    const mime = msg.fileType || '';
    if (mime.startsWith('image/')) {
      const img = document.createElement('img');
      img.src = absoluteFileUrl;
      img.alt = msg.fileName;
      
      const attachment = document.createElement('div');
      attachment.className = 'media-attachment';
      attachment.appendChild(img);
      bubble.appendChild(attachment);
    } else if (mime.startsWith('video/')) {
      const video = document.createElement('video');
      video.src = absoluteFileUrl;
      video.controls = true;
      video.preload = 'metadata';

      const attachment = document.createElement('div');
      attachment.className = 'media-attachment';
      attachment.appendChild(video);
      bubble.appendChild(attachment);
    } else {
      // General file download card
      const fileCard = document.createElement('a');
      fileCard.href = absoluteFileUrl;
      fileCard.className = 'file-link-card';
      fileCard.target = '_blank';
      fileCard.download = msg.fileName;

      const fileIcon = document.createElement('span');
      fileIcon.className = 'file-icon';
      fileIcon.textContent = '📄';

      const fileDetails = document.createElement('div');
      fileDetails.className = 'file-details';

      const fileName = document.createElement('span');
      fileName.className = 'file-name';
      fileName.textContent = msg.fileName;

      const fileSize = document.createElement('span');
      fileSize.className = 'file-size';
      fileSize.textContent = formatBytes(msg.fileSize || 0);

      fileDetails.appendChild(fileName);
      fileDetails.appendChild(fileSize);
      fileCard.appendChild(fileIcon);
      fileCard.appendChild(fileDetails);
      bubble.appendChild(fileCard);
    }
  } else {
    text.textContent = msg.text;
    bubble.appendChild(text);
  }

  row.appendChild(bubble);
  messagesContainer.appendChild(row);
  messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

// Handle Chat Submission
chatForm.addEventListener('submit', (e) => {
  e.preventDefault();
  if (!socket) return;
  const text = messageInput.value.trim();
  if (text) {
    socket.emit('message', { username, text });
    messageInput.value = '';
    messageInput.focus();
  }
});

// File Upload Handler (Chunked Uploading for files >1GB)
fileInput.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const fileId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  const CHUNK_SIZE = 1024 * 1024 * 5; // 5MB Chunk Size
  const totalChunks = Math.ceil(file.size / CHUNK_SIZE);
  
  // Show progress bar container
  uploadProgressContainer.classList.remove('hidden');
  uploadFilename.textContent = file.name;
  
  try {
    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex++) {
      const start = chunkIndex * CHUNK_SIZE;
      const end = Math.min(start + CHUNK_SIZE, file.size);
      const chunk = file.slice(start, end);

      const formData = new FormData();
      formData.append('chunk', chunk, `${file.name}.part_${chunkIndex}`);
      formData.append('fileId', fileId);
      formData.append('chunkIndex', chunkIndex);
      formData.append('totalChunks', totalChunks);

      // Upload Chunk to backend URL with bypass header
      await fetch(`${backendUrl}/upload-chunk`, {
        method: 'POST',
        headers: {
          'bypass-tunnel-reminder': 'true'
        },
        body: formData
      });

      // Update progress details
      const bytesUploaded = Math.min((chunkIndex + 1) * CHUNK_SIZE, file.size);
      const percent = Math.round((bytesUploaded / file.size) * 100);
      progressFill.style.width = `${percent}%`;
      uploadPercentage.textContent = `${percent}%`;
      uploadBytes.textContent = `${formatBytes(bytesUploaded)} / ${formatBytes(file.size)}`;
    }

    // Call Merge endpoint at backend URL when all chunks are sent
    const mergeRes = await fetch(`${backendUrl}/merge-chunks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'bypass-tunnel-reminder': 'true'
      },
      body: JSON.stringify({
        fileId,
        fileName: file.name,
        totalChunks,
        fileType: file.type,
        fileSize: file.size,
        username
      })
    });

    const mergeResult = await mergeRes.json();
    if (!mergeResult.success) {
      alert('Upload failed during server file merging.');
    }
  } catch (err) {
    console.error('Upload Error:', err);
    alert('An error occurred during file upload.');
  } finally {
    // Hide progress bar container and reset inputs
    uploadProgressContainer.classList.add('hidden');
    progressFill.style.width = '0%';
    uploadPercentage.textContent = '0%';
    fileInput.value = '';
  }
});
