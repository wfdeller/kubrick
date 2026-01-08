# kubrick-web-service

Node.js backend API for the Kubrick video recording and streaming platform.

## Tech Stack

- **Node.js 20** with ES Modules
- **Express** for REST API
- **MongoDB** with Mongoose ODM
- **Redis** for distributed coordination
- **WebSocket** (ws) for real-time streaming
- **GCP Cloud Storage** for video storage

## Features

- REST API for recording CRUD operations
- Resumable/chunked video uploads
- WebSocket endpoint for live streaming
- Full-text search across recordings
- Distributed transcoding coordination via Redis

## Project Structure

```
src/
├── app.js                    # Express app entry point
├── models/
│   ├── Recording.js          # Recording schema with search indexes
│   └── User.js               # User schema (future auth)
├── routes/
│   ├── recordings.js         # /api/recordings CRUD
│   ├── upload.js             # /api/upload resumable uploads
│   ├── streams.js            # /api/streams status endpoints
│   ├── sessionInfo.js        # /api/session-info browser detection
│   └── health.js             # /health endpoint
├── services/
│   ├── redis/
│   │   ├── RedisClient.js    # Redis connection singleton
│   │   └── StreamCoordinator.js  # Chunk upload & event coordination
│   ├── storage/
│   │   ├── index.js          # Storage abstraction layer
│   │   └── gcp.js            # GCP Cloud Storage provider
│   └── streaming/
│       └── WebSocketServer.js    # WebSocket handler
├── middleware/
│   ├── errorHandler.js       # Global error handling
│   ├── requestLogger.js      # Request logging
│   ├── sessionInfo.js        # Session info extraction
│   └── auth.js               # Authentication (optional)
├── serializers/
│   └── recording.js          # JSON:API serialization
└── utils/
    ├── logger.js             # Winston logger
    └── validateEnvironment.js    # Startup validation
```

## API Endpoints

### Recordings
- `GET /api/recordings` - List recordings (supports `?filter[search]=` full-text)
- `GET /api/recordings/:id` - Get single recording
- `POST /api/recordings` - Create recording
- `PATCH /api/recordings/:id` - Update recording
- `DELETE /api/recordings/:id` - Delete recording

### Upload
- `POST /api/upload/presigned-url` - Get signed URL for direct upload
- `POST /api/upload/complete` - Mark upload complete
- `POST /api/upload/init-chunked` - Initialize chunked/resumable upload
- `POST /api/upload/chunk-url` - Get signed URL for chunk
- `POST /api/upload/complete-chunked` - Complete chunked upload
- `POST /api/upload/abort-chunked` - Abort chunked upload
- `POST /api/upload/thumbnail-url` - Get signed URL for thumbnail upload

### Streams (HLS Proxy)
- `GET /api/streams/:id/hls/manifest.m3u8` - HLS manifest
- `GET /api/streams/:id/hls/:segment` - HLS segment

### WebSocket
- `ws://host/ws/stream` - Live streaming endpoint

## Development

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your settings

# Start dev server with watch mode
npm run dev

# Start production server
npm start
```

## Environment Variables

```bash
# Required
NODE_ENV=development
PORT=3001
FRONTEND_URL=http://localhost:5173
MONGODB_URI=mongodb://localhost:27017/kubrick
REDIS_URL=redis://localhost:6379
GCP_PROJECT_ID=your-project
GCP_BUCKET_NAME=kubrick-videos

# Optional
LOG_LEVEL=info
OKTA_ENABLED=false
```

## WebSocket Protocol

Connect to `/ws/stream` and send JSON control messages:

```javascript
// Start streaming
{type: 'start', recordingId: 'abc123'}

// Send binary WebM chunks
ws.send(arrayBuffer)

// Stop streaming
{type: 'stop', duration: 120, pauseCount: 2, pauseDurationTotal: 15}

// Keep-alive
{type: 'ping'}
```

Server responds with:
```javascript
{type: 'started', recordingId: 'abc123', status: 'live'}
{type: 'segmentReady', recordingId: 'abc123', segment: 'segment_00001.ts'}
{type: 'manifestUpdated', recordingId: 'abc123'}
{type: 'streamComplete', recordingId: 'abc123', segmentCount: 30}
{type: 'pong', timestamp: 1234567890}
```

## Docker

```bash
# Build image
docker build -t kubrick-web-service .

# Run
docker run -p 3001:3001 \
  -e MONGODB_URI=mongodb://host:27017/kubrick \
  -e REDIS_URL=redis://host:6379 \
  -e GCP_PROJECT_ID=your-project \
  -e GCP_BUCKET_NAME=kubrick-videos \
  kubrick-web-service
```

## Health Check

```bash
curl http://localhost:3001/health
# {"status":"ok","timestamp":"..."}
```
