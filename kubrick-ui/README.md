# kubrick-ui

React frontend for the Kubrick video recording and streaming platform.

## Tech Stack

- **React 18** with Vite
- **Ant Design** UI components
- **Zustand** for state management
- **HLS.js** for video playback
- **CSS Variables** for theming

## Features

- **Record Tab**: Camera preview, recording controls, metadata entry, live streaming
- **Library Tab**: Browse recordings with full-text search, video playback

## Project Structure

```
src/
├── api/                  # API client functions
│   ├── recordings.js     # Recording CRUD operations
│   └── recordingService.js
├── components/
│   ├── RecordTab/        # Recording UI components
│   ├── LibraryTab/       # Library browser and player
│   └── common/           # Shared components (Header, HLSPlayer)
├── hooks/
│   ├── useMediaRecorder.js   # WebRTC media recording
│   ├── useLiveStream.js      # WebSocket streaming
│   ├── useChunkedUpload.js   # Resumable uploads
│   └── useSessionInfo.js     # Browser/device detection
├── stores/
│   ├── recordingStore.js     # Recording state
│   └── preferencesStore.js   # User preferences
└── utils/
    └── formatters.js         # Date/time formatting
```

## Development

```bash
# Install dependencies
npm install

# Start dev server (port 5173)
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview
```

## Environment Variables

Configure in `.env` or at build time:

```bash
VITE_API_URL=http://localhost:3001    # Backend API URL
VITE_OKTA_ENABLED=false               # Enable Okta auth (optional)
```

## WebSocket Streaming

The `useLiveStream` hook connects to `/ws/stream` for real-time video streaming:

1. Sends `{type: 'start', recordingId}` to begin
2. Streams binary WebM chunks from MediaRecorder
3. Sends `{type: 'stop', duration, pauseCount, ...}` to end
4. Receives transcoder events (segmentReady, manifestUpdated)

## Docker

```bash
# Build image
docker build -t kubrick-ui .

# Run (serves on port 8080)
docker run -p 8080:8080 kubrick-ui
```

The Dockerfile uses nginx to serve the built static files with proper routing for SPA.
