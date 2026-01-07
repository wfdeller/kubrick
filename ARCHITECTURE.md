# Kubrick Architecture

This document provides comprehensive technical documentation of the Kubrick video recording and live streaming system.

## Table of Contents

1. [System Overview](#system-overview)
2. [Core Recording Flow](#core-recording-flow)
3. [Live Streaming Architecture](#live-streaming-architecture)
4. [Backend Services](#backend-services)
5. [Frontend Architecture](#frontend-architecture)
6. [Data Models](#data-models)
7. [Storage Architecture](#storage-architecture)
8. [WebSocket Protocol](#websocket-protocol)
9. [Security Considerations](#security-considerations)
10. [Performance Considerations](#performance-considerations)
11. [Deployment Considerations](#deployment-considerations)

---

## System Overview

Kubrick is a web-based video recording platform designed for interview capture scenarios. It consists of three main components:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KUBRICK SYSTEM                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────┐     ┌──────────────┐     ┌──────────────────────────────┐ │
│  │   Frontend   │     │   Backend    │     │      Cloud Storage           │ │
│  │   (React)    │────▶│  (Express)   │────▶│   (GCP/S3)                   │ │
│  │              │     │              │     │                              │ │
│  │ - Recording  │     │ - REST API   │     │ - Video files (.webm)       │ │
│  │ - Library    │     │ - WebSocket  │     │ - Thumbnails (.jpg)         │ │
│  │ - Streams    │     │ - FFmpeg     │     │ - HLS segments (.ts/.m3u8)  │ │
│  └──────────────┘     └──────────────┘     └──────────────────────────────┘ │
│         │                    │                                               │
│         │                    ▼                                               │
│         │             ┌──────────────┐                                       │
│         └────────────▶│   MongoDB    │                                       │
│                       │              │                                       │
│                       │ - Recordings │                                       │
│                       │ - Metadata   │                                       │
│                       └──────────────┘                                       │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Responsibilities

| Component | Technology | Responsibility |
|-----------|------------|----------------|
| Frontend | React 18, Vite | User interface, media capture, playback |
| Backend | Node.js, Express | API, WebSocket, FFmpeg orchestration |
| MongoDB | Mongoose ODM | Recording metadata persistence |
| Cloud Storage | GCP/S3 | Video file storage, HLS segment hosting |

---

## Core Recording Flow

The standard (non-live) recording flow captures video in the browser and uploads it after recording stops.

### Sequence Diagram

```
┌──────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  Browser │          │  Backend │          │  MongoDB │          │   GCS    │
└────┬─────┘          └────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │                     │
     │ getUserMedia()      │                     │                     │
     │◀────────────────────│                     │                     │
     │                     │                     │                     │
     │ MediaRecorder.start()                     │                     │
     │ (collect chunks every 1s)                 │                     │
     │                     │                     │                     │
     │ MediaRecorder.stop()│                     │                     │
     │ (combine chunks)    │                     │                     │
     │                     │                     │                     │
     │ POST /api/recordings│                     │                     │
     │────────────────────▶│ Create document     │                     │
     │                     │────────────────────▶│                     │
     │                     │◀────────────────────│                     │
     │◀────────────────────│ (recordingId)       │                     │
     │                     │                     │                     │
     │ POST /api/upload/init-chunked             │                     │
     │────────────────────▶│                     │ createResumableUpload()
     │                     │─────────────────────────────────────────▶│
     │                     │◀─────────────────────────────────────────│
     │◀────────────────────│ (uploadId, chunkSize)                    │
     │                     │                     │                     │
     │ [For each chunk]    │                     │                     │
     │ POST /api/upload/chunk-url                │                     │
     │────────────────────▶│                     │                     │
     │◀────────────────────│ (presigned URL)     │                     │
     │ PUT chunk ─────────────────────────────────────────────────────▶│
     │◀───────────────────────────────────────────────────────────────│
     │                     │                     │                     │
     │ POST /api/upload/complete-chunked         │                     │
     │────────────────────▶│ Update status='ready'                    │
     │                     │────────────────────▶│                     │
     │◀────────────────────│                     │                     │
     │                     │                     │                     │
```

### Key Components

#### useMediaRecorder Hook

**Location**: `frontend/src/hooks/useMediaRecorder.js`

Wraps the browser's MediaRecorder API with React state management.

```javascript
// Key configuration
const mediaRecorder = new MediaRecorder(mediaStream, {
    mimeType: 'video/webm;codecs=vp9',  // VP9 for quality, VP8 fallback
    videoBitsPerSecond: 2500000,         // Adjusts by quality setting
});

// Chunk collection (every 1 second)
mediaRecorder.start(1000);

// ondataavailable fires every 1s with a Blob chunk
mediaRecorder.ondataavailable = (event) => {
    chunks.push(event.data);
    // If live streaming, also send via WebSocket
    if (onChunkCallback) {
        onChunkCallback(event.data);
    }
};

// On stop, combine all chunks into final blob
mediaRecorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    setRecordedBlob(blob);
};
```

**Quality Presets**:
| Quality | Resolution | Bitrate |
|---------|------------|---------|
| 480p | 854x480 | 1 Mbps |
| 720p | 1280x720 | 2.5 Mbps |
| 1080p | 1920x1080 | 5 Mbps |

#### useChunkedUpload Hook

**Location**: `frontend/src/hooks/useChunkedUpload.js`

Handles resumable uploads with retry logic and progress tracking.

**Process**:
1. Initialize upload session (gets resumable URI from GCP or upload ID from S3)
2. Split blob into 10MB chunks
3. Upload each chunk sequentially (GCP) or in parallel (S3)
4. Track progress and handle retries (up to 3 per chunk)
5. Complete upload when all chunks succeed

**GCP Resumable Upload**:
- Uses `Content-Range` header: `bytes {start}-{end-1}/{total}`
- Expects 308 (Resume Incomplete) for intermediate chunks
- Expects 200 for final chunk

**S3 Multipart Upload**:
- Creates multipart upload, gets upload ID
- Each part gets its own presigned URL
- Collects ETags from each part response
- Completes with list of part numbers + ETags

---

## Live Streaming Architecture

Live streaming enables real-time viewing of recordings as they happen. It uses WebSocket for media transport and FFmpeg for HLS transcoding.

### High-Level Flow

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                         LIVE STREAMING FLOW                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  RECORDER                    SERVER                         VIEWERS          │
│  ────────                    ──────                         ───────          │
│                                                                              │
│  ┌──────────────┐     WebSocket      ┌──────────────┐                       │
│  │ MediaRecorder│─────(binary)──────▶│ WebSocket    │                       │
│  │ (1s chunks)  │                    │ Server       │                       │
│  └──────────────┘                    └──────┬───────┘                       │
│                                             │                                │
│                                             ▼                                │
│                                      ┌──────────────┐                       │
│                                      │ HLSTranscoder│                       │
│                                      │ (FFmpeg)     │                       │
│                                      └──────┬───────┘                       │
│                                             │                                │
│                                     ┌───────┴───────┐                       │
│                                     ▼               ▼                       │
│                              ┌──────────┐    ┌──────────┐                   │
│                              │ .ts      │    │ .m3u8    │                   │
│                              │ segments │    │ manifest │                   │
│                              └────┬─────┘    └────┬─────┘                   │
│                                   │               │                          │
│                                   ▼               ▼                          │
│                              ┌─────────────────────────┐                    │
│                              │     Cloud Storage       │                    │
│                              │     (GCS / S3)          │                    │
│                              └────────────┬────────────┘                    │
│                                           │                                  │
│                                           ▼                                  │
│                              ┌─────────────────────────┐    ┌────────────┐  │
│                              │     HLS.js Player       │◀───│  Viewer 1  │  │
│                              │     (Browser)           │    └────────────┘  │
│                              │                         │    ┌────────────┐  │
│                              │                         │◀───│  Viewer 2  │  │
│                              └─────────────────────────┘    └────────────┘  │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Component Deep Dive

#### WebSocketServer

**Location**: `backend/src/services/streaming/WebSocketServer.js`

Handles WebSocket connections for live streaming.

**Connection Lifecycle**:
```
1. Client connects to /ws/stream
2. Feature flag check (closes with 4403 if disabled)
3. Client sends JSON: { type: 'start', recordingId: '...' }
4. Server starts stream, responds: { type: 'started', ... }
5. Client sends binary chunks (raw WebM data)
6. Client sends JSON: { type: 'stop' } or disconnects
7. Server stops stream, cleans up
```

**Message Protocol**:

| Direction | Type | Format | Description |
|-----------|------|--------|-------------|
| C→S | start | JSON | Start stream for recordingId |
| C→S | stop | JSON | Stop active stream |
| C→S | ping | JSON | Keep-alive |
| C→S | (binary) | ArrayBuffer | Media chunk data |
| S→C | started | JSON | Stream started confirmation |
| S→C | stopped | JSON | Stream stopped with stats |
| S→C | pong | JSON | Ping response |
| S→C | error | JSON | Error message |
| S→C | streamStarted | JSON | Broadcast: new stream |
| S→C | streamEnded | JSON | Broadcast: stream ended |
| S→C | viewerJoined | JSON | Broadcast: viewer count change |
| S→C | viewerLeft | JSON | Broadcast: viewer count change |

#### HLSTranscoder

**Location**: `backend/src/services/streaming/HLSTranscoder.js`

Wraps FFmpeg as a child process to convert WebM input to HLS output.

**FFmpeg Pipeline**:
```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│ WebM Input  │────▶│   FFmpeg    │────▶│ HLS Output  │
│ (stdin)     │     │             │     │ (.ts/.m3u8) │
└─────────────┘     └─────────────┘     └─────────────┘
```

**FFmpeg Command**:
```bash
ffmpeg \
  -f webm -i pipe:0 \                    # Input from stdin
  -c:v libx264 \                         # H.264 video codec
  -preset veryfast \                     # Fast encoding
  -tune zerolatency \                    # Minimize latency
  -profile:v baseline -level 3.1 \       # Compatibility
  -b:v 2500k -maxrate 2500k \            # Bitrate control
  -bufsize 5000k \
  -c:a aac -b:a 128k -ar 44100 \         # Audio encoding
  -f hls \                               # HLS output format
  -hls_time 4 \                          # 4-second segments
  -hls_list_size 5 \                     # Keep 5 segments in playlist
  -hls_flags delete_segments+append_list+split_by_time \
  -hls_segment_type mpegts \
  -hls_segment_filename /tmp/kubrick-streams/{id}/segment_%05d.ts \
  /tmp/kubrick-streams/{id}/stream.m3u8
```

**Key Settings**:
| Setting | Value | Purpose |
|---------|-------|---------|
| `-preset veryfast` | Speed priority | Real-time encoding |
| `-tune zerolatency` | Low latency | Minimize encode delay |
| `-hls_time 4` | 4 seconds | Segment duration |
| `-hls_list_size 5` | 5 segments | Rolling playlist window |
| `-hls_flags delete_segments` | Auto-cleanup | Remove old segments |

**Events Emitted**:
- `segment`: New segment created
- `segmentReady`: Segment file available for upload
- `manifestUpdated`: Playlist file updated
- `close`: Process exited
- `error`: Fatal error occurred

#### StreamManager

**Location**: `backend/src/services/streaming/StreamManager.js`

Singleton that manages all active streams.

**Stream State**:
```javascript
{
    recordingId: String,        // MongoDB recording ID
    status: 'starting' | 'live' | 'stopping' | 'ended' | 'error',
    startTime: Number,          // Unix timestamp
    endTime: Number,            // Unix timestamp (when ended)
    viewerCount: Number,        // Current viewer count
    viewers: Set<String>,       // Viewer IDs
    segmentsUploaded: Number,   // Count of uploaded segments
    bytesUploaded: Number,      // Total bytes uploaded to storage
    lastActivity: Number,       // Last data received timestamp
    bucket: String,             // Storage bucket name
    streamPrefix: String,       // Storage path prefix
    manifestUrl: String,        // Signed URL for HLS playback
    error: String,              // Error message if failed
}
```

**Responsibilities**:
1. Create/destroy HLSTranscoder instances
2. Handle segment uploads to cloud storage
3. Update HLS manifest in storage
4. Track viewers per stream
5. Emit events for UI updates
6. Clean up resources on stream end

---

## Backend Services

### Storage Abstraction

**Location**: `backend/src/services/storage/`

Provider-agnostic interface for cloud storage operations.

```
┌─────────────────────────────────────────────────────────────────┐
│                    Storage Abstraction Layer                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  index.js (exports)                                              │
│  ├── getSignedUrl(bucket, key, operation, contentType)          │
│  ├── deleteFile(bucket, key)                                    │
│  ├── fileExists(bucket, key)                                    │
│  ├── initResumableUpload(bucket, key, contentType, size, origin)│
│  ├── getChunkUploadUrl(bucket, key, uploadId, partNumber, ...)  │
│  ├── completeResumableUpload(bucket, key, uploadId, parts)      │
│  ├── abortResumableUpload(bucket, key, uploadId)                │
│  ├── uploadStreamSegment(bucket, key, localPath)     [NEW]      │
│  ├── uploadStreamManifest(bucket, key, localPath)    [NEW]      │
│  └── getStreamPlaybackUrl(bucket, key)               [NEW]      │
│                                                                  │
│            ┌────────────┐              ┌────────────┐            │
│            │            │              │            │            │
│            │   gcp.js   │              │   s3.js    │            │
│            │            │              │            │            │
│            └────────────┘              └────────────┘            │
│                  │                           │                   │
│                  ▼                           ▼                   │
│         @google-cloud/storage        @aws-sdk/client-s3          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

**Provider Selection**:
```javascript
const provider = process.env.STORAGE_PROVIDER === 's3' ? s3 : gcp;
```

### Feature Flags

**Location**: `backend/src/utils/featureFlags.js`

Simple feature flag system using environment variables.

**Available Flags**:
| Flag | Environment Variable | Default |
|------|---------------------|---------|
| Live Streaming | `LIVE_STREAMING_ENABLED` | `false` |

**Usage**:
```javascript
// Check flag
if (isLiveStreamingEnabled()) {
    // Enable live streaming features
}

// Middleware (returns 404 if disabled)
router.use(requireLiveStreaming);

// Get all flags
const flags = getFeatureFlags();
// { liveStreaming: true/false }
```

### API Routes

#### recordings.js
- CRUD operations for recording metadata
- JSON:API formatted responses
- Pagination support

#### upload.js
- Presigned URL generation
- Chunked upload session management
- Thumbnail upload handling

#### streams.js
- Stream status queries
- Stream start/stop control
- Viewer registration
- Protected by `requireLiveStreaming` middleware

---

## Frontend Architecture

### Component Hierarchy

```
App
├── Header
├── Tabs
│   ├── RecordTab
│   │   ├── CameraPreview
│   │   └── MetadataCard
│   ├── LibraryTab
│   │   ├── VideoCard (list)
│   │   └── VideoPlayer (modal)
│   └── StreamsTab
│       └── StreamStatusTable
└── SessionInfoModal
```

### State Management

#### Zustand Stores

**preferencesStore**: Persisted to localStorage
- `defaultQuality`: Recording quality preference
- `recorderName`: User's name (persists across sessions)
- `metadata`: Key-value metadata fields

**recordingStore**: Transient recording state
- `status`: 'idle' | 'recording' | 'stopped' | 'uploading' | 'complete' | 'error'
- `duration`: Recording duration in seconds
- `error`: Error message if failed

#### TanStack Query

Used for server state:
- `['recordings']`: Recording list with pagination
- `['recordings', id]`: Single recording details
- `['features']`: Feature flags
- `['streams', 'status']`: Live stream status (polling)

### Custom Hooks

| Hook | Purpose |
|------|---------|
| `useMediaRecorder` | Browser media capture |
| `useChunkedUpload` | Resumable file uploads |
| `useLiveStream` | WebSocket streaming client |
| `useFeatureFlags` | Feature flag access |
| `useSessionInfo` | Browser/session metadata |

### HLS Playback

**Location**: `frontend/src/components/common/HLSPlayer.jsx`

Uses HLS.js for cross-browser HLS playback.

**Configuration**:
```javascript
const hls = new Hls({
    liveSyncDurationCount: 3,        // Stay 3 segments behind live
    liveMaxLatencyDurationCount: 10, // Max 10 segments behind
    liveDurationInfinity: isLive,    // Infinite duration for live
    lowLatencyMode: isLive,          // LL-HLS optimizations
    maxBufferLength: isLive ? 10 : 30,
    maxMaxBufferLength: isLive ? 30 : 600,
});
```

**Error Recovery**:
- Network errors: Retry with `hls.startLoad()`
- Media errors: Recover with `hls.recoverMediaError()`
- Fatal errors: Display error message

---

## Data Models

### Recording Schema

**Location**: `backend/src/models/Recording.js`

```javascript
{
    // Core identification
    title: { type: String, required: true, maxlength: 200 },
    description: { type: String, maxlength: 2000 },
    recorderName: { type: String, required: true, index: true },

    // Flexible metadata (varies per deployment)
    metadata: { type: Map, of: Schema.Types.Mixed },

    // Video properties
    quality: { type: String, enum: ['480p', '720p', '1080p'], default: '720p' },
    duration: { type: Number, default: 0 },           // seconds
    fileBytes: { type: Number, default: 0 },
    mimeType: { type: String, default: 'video/webm' },

    // Storage references
    storageProvider: { type: String, enum: ['gcp', 's3'], default: 'gcp' },
    storageBucket: String,
    storageKey: String,              // Path to video file
    thumbnailKey: String,            // Path to thumbnail
    uploadId: String,                // Resumable upload session ID

    // Live streaming (new)
    isLiveStreaming: { type: Boolean, default: false, index: true },
    streamStartedAt: Date,
    streamEndedAt: Date,
    hlsManifestKey: String,          // Path to HLS manifest

    // Session context
    sessionInfo: {
        ipAddress: String,
        timezone: String,
        timezoneOffset: Number,
        browserName: String,
        browserVersion: String,
        osName: String,
        osVersion: String,
        screenResolution: String,
        language: String,
        userAgent: String,
        deviceType: { type: String, enum: ['desktop', 'tablet', 'mobile', 'unknown'] },
    },

    // Lifecycle
    status: {
        type: String,
        enum: ['recording', 'uploading', 'processing', 'ready', 'error', 'archived'],
        default: 'recording',
        index: true,
    },
    recordedAt: { type: Date, default: Date.now },

    // Timestamps (auto-managed)
    createdAt: Date,
    updatedAt: Date,
}
```

**Indexes**:
- `{ recorderName: 1, createdAt: -1 }` - Filter by recorder
- `{ status: 1, createdAt: -1 }` - Filter by status
- `{ isLiveStreaming: 1 }` - Find live streams

**Virtual Fields**:
- `videoUrl`: Populated with signed URL for playback
- `thumbnailUrl`: Populated with signed URL for thumbnail
- `hlsUrl`: Populated with signed URL for HLS manifest

---

## Storage Architecture

### Storage Key Patterns

| Content Type | Pattern | Example |
|--------------|---------|---------|
| Video file | `recordings/{YYYY}/{MM}/{DD}/{recordingId}-{seq}.webm` | `recordings/2024/01/15/abc123-001.webm` |
| Thumbnail | `thumbnails/{recordingId}.jpg` | `thumbnails/abc123.jpg` |
| HLS Manifest | `streams/{recordingId}/stream.m3u8` | `streams/abc123/stream.m3u8` |
| HLS Segment | `streams/{recordingId}/segment_{n}.ts` | `streams/abc123/segment_00001.ts` |

### GCP Cloud Storage Setup

**Required Permissions**:
- `storage.objects.create`
- `storage.objects.delete`
- `storage.objects.get`
- `storage.objects.list`

**CORS Configuration** (`gcp-cors.json`):
```json
[
    {
        "origin": ["http://localhost:5173", "https://your-domain.com"],
        "method": ["GET", "PUT", "POST", "DELETE", "OPTIONS"],
        "responseHeader": ["Content-Type", "Content-Range", "Content-Length"],
        "maxAgeSeconds": 3600
    }
]
```

**Apply CORS**:
```bash
gsutil cors set gcp-cors.json gs://your-bucket-name
```

### S3 Setup

**Required Permissions**:
```json
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:DeleteObject",
                "s3:ListBucket",
                "s3:AbortMultipartUpload",
                "s3:ListMultipartUploadParts"
            ],
            "Resource": [
                "arn:aws:s3:::your-bucket-name",
                "arn:aws:s3:::your-bucket-name/*"
            ]
        }
    ]
}
```

**CORS Configuration**:
```json
{
    "CORSRules": [
        {
            "AllowedOrigins": ["http://localhost:5173", "https://your-domain.com"],
            "AllowedMethods": ["GET", "PUT", "POST", "DELETE"],
            "AllowedHeaders": ["*"],
            "MaxAgeSeconds": 3600
        }
    ]
}
```

---

## WebSocket Protocol

### Connection Flow

```
┌────────┐                                    ┌────────┐
│ Client │                                    │ Server │
└───┬────┘                                    └───┬────┘
    │                                             │
    │ ──── WebSocket Connect (ws://host/ws/stream) ────▶
    │                                             │
    │                   [Feature flag check]      │
    │                                             │
    │ ◀──────────────── Connection Open ─────────│
    │                                             │
    │ ──── { type: 'start', recordingId: '...' } ────▶
    │                                             │
    │               [Start HLSTranscoder]         │
    │                                             │
    │ ◀──── { type: 'started', status: 'live' } ──│
    │                                             │
    │ ──────────── Binary: WebM chunk ───────────▶
    │                [FFmpeg processing]          │
    │ ──────────── Binary: WebM chunk ───────────▶
    │                [Upload segment]             │
    │ ──────────── Binary: WebM chunk ───────────▶
    │                                             │
    │ ◀─── { type: 'viewerJoined', viewerCount: 1 } ─│
    │                                             │
    │ ──────────── { type: 'stop' } ─────────────▶
    │                                             │
    │               [Stop HLSTranscoder]          │
    │                                             │
    │ ◀──── { type: 'stopped', duration: 120 } ──│
    │                                             │
    │ ──────────── Connection Close ─────────────▶
    │                                             │
```

### Message Formats

**Start Stream**:
```json
{
    "type": "start",
    "recordingId": "64abc123def456..."
}
```

**Stream Started Response**:
```json
{
    "type": "started",
    "recordingId": "64abc123def456...",
    "status": "live",
    "streamPrefix": "streams/64abc123def456..."
}
```

**Stop Stream**:
```json
{
    "type": "stop"
}
```

**Stream Stopped Response**:
```json
{
    "type": "stopped",
    "recordingId": "64abc123def456...",
    "status": "ended",
    "duration": 120000,
    "segmentsUploaded": 30,
    "bytesUploaded": 45000000
}
```

**Viewer Events** (broadcast to all clients):
```json
{
    "type": "viewerJoined",
    "recordingId": "64abc123def456...",
    "viewerId": "viewer-uuid",
    "viewerCount": 5
}
```

---

## Security Considerations

### Current Implementation

| Area | Implementation |
|------|----------------|
| Storage Access | Presigned URLs with short expiry (1-2 hours) |
| CORS | Restricted to configured origins |
| API | No authentication (see future work) |
| WebSocket | No authentication (see future work) |

### Future: Authentication Integration

The codebase includes placeholders for Okta integration:

```javascript
// Environment variables (prepared but not active)
OKTA_ENABLED=false
OKTA_ISSUER=https://your-org.okta.com/oauth2/default
OKTA_CLIENT_ID=...
OKTA_AUDIENCE=api://default
```

### Recommendations for Production

1. **Enable HTTPS** for all traffic
2. **Implement authentication** before deployment
3. **Restrict CORS origins** to production domains
4. **Use private bucket** with signed URLs only
5. **Add rate limiting** to prevent abuse
6. **Validate file types** on upload
7. **Implement viewer authentication** for live streams

---

## Performance Considerations

### Recording Performance

| Factor | Consideration |
|--------|---------------|
| Chunk Size | 1-second chunks balance latency vs overhead |
| Video Bitrate | Higher quality = larger chunks = more processing |
| Browser | Chrome/Firefox have best MediaRecorder support |

### Upload Performance

| Factor | Configuration |
|--------|---------------|
| Chunk Size | 10MB balances memory vs request count |
| Parallelism | GCP: sequential; S3: up to 3 parallel |
| Retry | 3 attempts per chunk with exponential backoff |

### Live Streaming Performance

| Factor | Configuration |
|--------|---------------|
| HLS Segment Duration | 4 seconds (trade-off: latency vs buffering) |
| Playlist Size | 5 segments (20 seconds of buffer) |
| FFmpeg Preset | `veryfast` for real-time encoding |
| Expected Latency | 10-20 seconds end-to-end |

### FFmpeg Resource Usage

- **CPU**: ~50-100% of one core per stream (veryfast preset)
- **Memory**: ~100-200MB per FFmpeg process
- **Disk**: Temporary segments in `/tmp`, auto-cleaned

### Scaling Considerations

| Load Level | Recommendation |
|------------|----------------|
| 1-5 concurrent streams | Single server with FFmpeg inline |
| 5-20 concurrent streams | Dedicated worker processes |
| 20+ concurrent streams | Separate transcoding service/cluster |

---

## Deployment Considerations

### Environment Variables

**Required**:
```bash
NODE_ENV=production
PORT=3001
MONGODB_URI=mongodb://...
STORAGE_PROVIDER=gcp
GCP_PROJECT_ID=...
GCP_BUCKET_NAME=...
FRONTEND_URL=https://your-domain.com
```

**Optional**:
```bash
LOG_LEVEL=info                    # debug, http, info, warn, error
LIVE_STREAMING_ENABLED=true       # Enable live streaming
```

### System Requirements

**Minimum (no live streaming)**:
- Node.js 18+
- 1 CPU core
- 512MB RAM
- MongoDB connection

**Recommended (with live streaming)**:
- Node.js 18+
- 2+ CPU cores (FFmpeg is CPU-intensive)
- 2GB+ RAM
- FFmpeg installed
- MongoDB connection
- Fast network to cloud storage

### Docker Deployment

```dockerfile
FROM node:18-alpine

# Install FFmpeg for live streaming
RUN apk add --no-cache ffmpeg

WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .

EXPOSE 3001
CMD ["node", "src/app.js"]
```

### Health Monitoring

**Health Endpoint**: `GET /health`

Returns:
```json
{
    "status": "ok",
    "timestamp": "2024-01-15T12:00:00.000Z"
}
```

**Recommended Monitoring**:
- Health check endpoint polling
- MongoDB connection status
- WebSocket connection count
- FFmpeg process count and CPU usage
- Storage upload success rate
- Stream segment upload latency

---

## Appendix: File Reference

### Backend Files

| File | Purpose |
|------|---------|
| `src/app.js` | Express app setup, server initialization |
| `src/routes/recordings.js` | Recording CRUD API |
| `src/routes/upload.js` | Upload management API |
| `src/routes/streams.js` | Live streaming API |
| `src/routes/health.js` | Health check endpoint |
| `src/routes/sessionInfo.js` | Client session info endpoint |
| `src/models/Recording.js` | Mongoose schema |
| `src/services/storage/index.js` | Storage abstraction |
| `src/services/storage/gcp.js` | GCP implementation |
| `src/services/storage/s3.js` | S3 implementation |
| `src/services/streaming/HLSTranscoder.js` | FFmpeg wrapper |
| `src/services/streaming/StreamManager.js` | Stream lifecycle |
| `src/services/streaming/WebSocketServer.js` | WebSocket handler |
| `src/middleware/errorHandler.js` | Error handling |
| `src/middleware/requestLogger.js` | Request logging |
| `src/serializers/recordingSerializer.js` | JSON:API formatting |
| `src/utils/logger.js` | Winston logger |
| `src/utils/featureFlags.js` | Feature flags |

### Frontend Files

| File | Purpose |
|------|---------|
| `src/App.jsx` | Main app with tabs |
| `src/components/RecordTab/index.jsx` | Recording interface |
| `src/components/RecordTab/CameraPreview.jsx` | Video preview |
| `src/components/LibraryTab/index.jsx` | Recording library |
| `src/components/LibraryTab/VideoCard.jsx` | Recording card |
| `src/components/LibraryTab/VideoPlayer.jsx` | Playback modal |
| `src/components/StreamsTab/index.jsx` | Stream monitoring |
| `src/components/common/Header.jsx` | App header |
| `src/components/common/HLSPlayer.jsx` | HLS video player |
| `src/hooks/useMediaRecorder.js` | Recording hook |
| `src/hooks/useChunkedUpload.js` | Upload hook |
| `src/hooks/useLiveStream.js` | WebSocket hook |
| `src/hooks/useFeatureFlags.js` | Feature flags hook |
| `src/hooks/useSessionInfo.js` | Session info hook |
| `src/stores/recordingStore.js` | Recording state |
| `src/stores/preferencesStore.js` | User preferences |
| `src/api/recordings.js` | API client |
