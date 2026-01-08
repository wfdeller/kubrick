# kubrick-transcoder

Distributed FFmpeg transcoding worker for the Kubrick video platform.

## Overview

This service consumes video chunks from GCP Cloud Storage, transcodes them to HLS format using FFmpeg, and uploads the resulting segments back to storage. It coordinates with other services via Redis.

## Tech Stack

- **Node.js 20** with ES Modules
- **FFmpeg** for video transcoding
- **Redis** for job coordination and pub/sub
- **GCP Cloud Storage** for video storage

## How It Works

1. **Listen** for `stream_start` events on Redis `stream:control`
2. **Claim** the stream by setting ownership in Redis
3. **Consume** chunk notifications from `stream:chunks:{recordingId}`
4. **Download** WebM chunks from GCP Cloud Storage
5. **Transcode** by piping chunks to FFmpeg stdin
6. **Upload** HLS segments (.ts) and manifest (.m3u8) to storage
7. **Publish** events (`segmentReady`, `manifestUpdated`, `streamComplete`) via Redis pub/sub
8. **Finalize** when `stream_stop` is received

## Project Structure

```
src/
├── index.js                      # Entry point, worker lifecycle
├── utils/
│   └── logger.js                 # Winston logger
└── services/
    ├── redis/
    │   └── RedisClient.js        # Redis connection
    ├── storage/
    │   ├── index.js              # Storage abstraction
    │   └── gcp.js                # GCP provider
    └── transcoder/
        └── TranscodeWorker.js    # Main worker logic
```

## FFmpeg Configuration

Transcoding parameters optimized for live streaming:

- **Input**: WebM (VP8/VP9 + Opus) via stdin
- **Video**: H.264 baseline, 2500kbps, veryfast preset, zerolatency tune
- **Audio**: AAC 128kbps, 44.1kHz
- **Output**: HLS with 4-second segments, MPEG-TS format

## Development

```bash
# Install dependencies
npm install

# Copy environment config
cp .env.example .env
# Edit .env with your settings

# Run worker
npm start
```

## Environment Variables

```bash
# Redis (required)
REDIS_URL=redis://localhost:6379

# GCP Cloud Storage (required)
GCP_PROJECT_ID=your-project
GCP_BUCKET_NAME=kubrick-videos

# Worker settings
WORKER_ID=                    # Auto-generated UUID if not set
HEARTBEAT_INTERVAL_MS=5000    # Heartbeat frequency
HEARTBEAT_TTL_MS=10000        # Heartbeat expiry (detect dead workers)

# Logging
LOG_LEVEL=info
NODE_ENV=production
```

## Redis Data Structures

### Streams
- `stream:control` - Control events (stream_start, stream_stop)
- `stream:chunks:{recordingId}` - Chunk arrival notifications

### Keys
- `stream:{recordingId}:state` - Hash with stream status, chunk count
- `stream:{recordingId}:owner` - Worker ID that owns the stream
- `worker:{workerId}:heartbeat` - Worker liveness (TTL-based)

### Pub/Sub
- `transcoder:events:{recordingId}` - Events published by transcoder

## Scaling

Run multiple transcoder workers for horizontal scaling:

```yaml
# docker-compose.yml
transcoder:
  build: ./kubrick-transcoder
  deploy:
    replicas: 3
```

Workers automatically claim streams using Redis atomic operations. If a worker dies, its heartbeat expires and another worker can take over.

## Docker

```bash
# Build image (includes FFmpeg)
docker build -t kubrick-transcoder .

# Run
docker run \
  -e REDIS_URL=redis://host:6379 \
  -e GCP_PROJECT_ID=your-project \
  -e GCP_BUCKET_NAME=kubrick-videos \
  kubrick-transcoder
```

## Failure Handling

| Scenario | Recovery |
|----------|----------|
| Worker crash | Heartbeat expires, another worker claims stream |
| FFmpeg crash | Stream marked as error, client notified |
| Redis unavailable | Worker retries with backoff |
| Storage unavailable | Chunk processing retried |

## Output Structure

```
{bucket}/
└── recordings/
    └── 2026/01/08/
        └── {recordingId}/
            ├── chunks/
            │   ├── chunk_00000000.webm
            │   └── chunk_00000001.webm
            └── hls/
                ├── stream.m3u8
                ├── segment_00000.ts
                └── segment_00001.ts
```
