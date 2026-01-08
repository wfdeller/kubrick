# Kubrick Platform Architecture

This document describes the overall architecture of the Kubrick video recording and streaming platform.

## System Overview

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              KUBRICK PLATFORM                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                             │
│   ┌─────────────┐         ┌─────────────────────┐        ┌──────────────┐  │
│   │  kubrick-ui │────────▶│ kubrick-web-service │◀──────▶│    MongoDB   │  │
│   │   (React)   │  HTTP   │     (Node.js)       │        │              │  │
│   └──────┬──────┘         └──────────┬──────────┘        └──────────────┘  │
│          │                           │                                      │
│          │ WebSocket                 │                                      │
│          │ /ws/stream                │                   ┌──────────────┐  │
│          │                           ├──────────────────▶│    Redis     │  │
│          └───────────────────────────┤                   │              │  │
│                                      │                   └───────┬──────┘  │
│                                      │                           │         │
│                                      │ chunks    ┌───────────────┘         │
│                                      ▼           │  pub/sub                │
│                              ┌───────────────┐   │                         │
│                              │  GCP Cloud    │   │   ┌──────────────────┐  │
│                              │   Storage     │◀──┼──▶│kubrick-transcoder│  │
│                              │               │   │   │    (FFmpeg)      │  │
│                              └───────────────┘   │   │    Worker 1      │  │
│                                      ▲           │   └──────────────────┘  │
│                                      │           │   ┌──────────────────┐  │
│                                      │           └──▶│kubrick-transcoder│  │
│                                      │               │    Worker 2      │  │
│                                      └───────────────┴──────────────────┘  │
│                                        HLS segments                        │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### kubrick-ui (Frontend)

**Purpose**: Browser-based UI for recording and viewing videos.

**Technology**: React 18, Vite, Zustand, Tailwind CSS

**Key Responsibilities**:
- Camera access via WebRTC MediaRecorder API
- Real-time video preview
- WebSocket connection for live streaming
- Chunked video upload for non-live recordings
- Library browsing with search
- HLS video playback

### kubrick-web-service (Backend API)

**Purpose**: REST API and WebSocket server for the platform.

**Technology**: Node.js 20, Express, Mongoose, ioredis, ws

**Key Responsibilities**:
- Recording CRUD operations (MongoDB)
- Resumable upload coordination (signed URLs)
- WebSocket endpoint for live streaming
- Chunk upload to GCP Cloud Storage
- Stream coordination via Redis
- Event relay from transcoders to clients

### kubrick-transcoder (Worker)

**Purpose**: Distributed video transcoding workers.

**Technology**: Node.js 20, FFmpeg, ioredis

**Key Responsibilities**:
- Claim streams from Redis queue
- Download chunks from GCP Cloud Storage
- Transcode WebM to HLS (FFmpeg)
- Upload HLS segments to storage
- Publish progress events via Redis pub/sub
- Heartbeat for failure detection

### Redis

**Purpose**: Distributed coordination and messaging.

**Usage**:
- **Streams**: Job queue for chunk notifications
- **Hashes**: Stream state and metadata
- **Pub/Sub**: Real-time event broadcast
- **Keys with TTL**: Worker heartbeats

### MongoDB

**Purpose**: Persistent data storage.

**Collections**:
- `recordings`: Video metadata, search indexes, storage references

### GCP Cloud Storage

**Purpose**: Video file storage.

**Structure**:
```
{bucket}/
└── recordings/
    └── {year}/{month}/{day}/
        └── {recordingId}/
            ├── chunks/           # Raw WebM chunks (live streams)
            │   └── chunk_*.webm
            ├── hls/              # Transcoded HLS output
            │   ├── stream.m3u8
            │   └── segment_*.ts
            └── {recordingId}.webm   # Direct uploads (non-live)
```

## Data Flows

### Flow 1: Live Stream Recording

```
┌────────┐    ┌─────────┐    ┌─────────┐    ┌───────┐    ┌────────────┐
│Browser │───▶│WebSocket│───▶│ Storage │    │ Redis │───▶│ Transcoder │
│        │    │ Server  │    │ (chunks)│    │       │    │            │
└────────┘    └────┬────┘    └────┬────┘    └───┬───┘    └─────┬──────┘
     │             │              │             │               │
     │ 1. start    │              │             │               │
     │────────────▶│              │             │               │
     │             │ 2. upload    │             │               │
     │ 3. chunk    │    chunk     │             │               │
     │────────────▶│─────────────▶│             │               │
     │             │              │             │               │
     │             │ 4. publish   │             │               │
     │             │    to stream │             │               │
     │             │─────────────────────────▶│               │
     │             │              │             │ 5. consume    │
     │             │              │             │───────────────▶│
     │             │              │             │               │
     │             │              │◀────────────────────────────│
     │             │              │  6. download chunk          │
     │             │              │                             │
     │             │              │  7. FFmpeg transcode        │
     │             │              │                             │
     │             │              │◀────────────────────────────│
     │             │              │  8. upload HLS segment      │
     │             │              │                             │
     │             │◀─────────────────────────│◀───────────────│
     │             │  9. pub/sub event        │ 10. publish    │
     │◀────────────│                          │                │
     │ 11. segment │                          │                │
     │     ready   │                          │                │
```

### Flow 2: Direct Upload (Non-Live)

```
┌────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│Browser │───▶│   API   │───▶│ Storage │    │ MongoDB │
│        │    │ Server  │    │         │    │         │
└────────┘    └────┬────┘    └────┬────┘    └────┬────┘
     │             │              │              │
     │ 1. init     │              │              │
     │    upload   │              │              │
     │────────────▶│              │              │
     │             │ 2. create    │              │
     │             │    resumable │              │
     │             │─────────────▶│              │
     │◀────────────│              │              │
     │ 3. signed   │              │              │
     │    URLs     │              │              │
     │             │              │              │
     │ 4. upload   │              │              │
     │    chunks   │              │              │
     │────────────────────────────▶│              │
     │             │              │              │
     │ 5. complete │              │              │
     │────────────▶│              │              │
     │             │ 6. complete  │              │
     │             │    upload    │              │
     │             │─────────────▶│              │
     │             │              │              │
     │             │ 7. save      │              │
     │             │    recording │              │
     │             │─────────────────────────────▶│
```

### Flow 3: Video Playback

```
┌────────┐    ┌─────────┐    ┌─────────┐    ┌─────────┐
│Browser │───▶│   API   │───▶│ MongoDB │    │ Storage │
│        │    │ Server  │    │         │    │  (CDN)  │
└────────┘    └────┬────┘    └────┬────┘    └────┬────┘
     │             │              │              │
     │ 1. GET      │              │              │
     │  recording  │              │              │
     │────────────▶│              │              │
     │             │ 2. fetch     │              │
     │             │    metadata  │              │
     │             │─────────────▶│              │
     │◀────────────│              │              │
     │ 3. metadata │              │              │
     │  + storage  │              │              │
     │    key      │              │              │
     │             │              │              │
     │ 4. GET      │              │              │
     │  playback   │              │              │
     │────────────▶│              │              │
     │             │ 5. generate  │              │
     │             │  signed URL  │              │
     │             │─────────────────────────────▶│
     │◀────────────│              │              │
     │ 6. HLS URL  │              │              │
     │             │              │              │
     │ 7. fetch    │              │              │
     │    HLS      │              │              │
     │────────────────────────────────────────────▶│
     │◀───────────────────────────────────────────│
     │ 8. m3u8 +   │              │              │
     │    segments │              │              │
```

## Redis Data Model

### Control Stream
```
stream:control
├── {id}: type=stream_start, recordingId=abc123, bucket=..., prefix=...
└── {id}: type=stream_stop, recordingId=abc123, duration=120
```

### Chunk Stream (per recording)
```
stream:chunks:{recordingId}
├── {id}: seq=0, key=recordings/.../chunk_00000000.webm, size=312456
├── {id}: seq=1, key=recordings/.../chunk_00000001.webm, size=298765
└── ...
```

### Stream State (Hash)
```
stream:{recordingId}:state
├── status: live | ending | complete | error
├── bucket: kubrick-videos
├── prefix: recordings/2026/01/08
├── startTime: 1704672000000
└── chunkCount: 45
```

### Worker Ownership
```
stream:{recordingId}:owner = worker-uuid-123
worker:{workerId}:heartbeat = 1704672300000 (TTL: 10s)
```

### Pub/Sub Channels
```
transcoder:events:{recordingId}
├── {type: segmentReady, segment: segment_00001.ts}
├── {type: manifestUpdated, key: .../stream.m3u8}
└── {type: streamComplete, segmentCount: 30}
```

## Scaling Considerations

### Horizontal Scaling

| Component | Scaling Strategy |
|-----------|------------------|
| kubrick-ui | CDN + multiple nginx instances |
| kubrick-web-service | Multiple pods (stateless after Redis) |
| kubrick-transcoder | Multiple workers (auto-claim via Redis) |
| Redis | Redis Cluster or managed service |
| MongoDB | Replica set or managed service |
| GCP Storage | Managed cloud storage (inherently scalable) |

### No Sticky Sessions Required

The distributed architecture eliminates sticky session requirements:

1. **Web service pods** are stateless - all state in Redis/MongoDB
2. **Any web pod** can handle any WebSocket connection
3. **Transcoder workers** auto-claim streams atomically via Redis
4. **Failover** is automatic - dead worker's streams are reclaimed

### Bottlenecks & Mitigations

| Bottleneck | Mitigation |
|------------|------------|
| Redis throughput | Redis Cluster, connection pooling |
| Storage upload latency | Parallel chunk uploads, CDN |
| FFmpeg CPU | Dedicated transcoder instances, auto-scaling |
| MongoDB queries | Indexes, read replicas, caching |

## Security

### Current Implementation
- CORS configured for frontend origin
- Signed URLs for storage access (time-limited)
- Session info extraction (IP, user-agent)

### Future Considerations
- Okta/OAuth2 authentication (prepared, not enabled)
- Recording ownership/permissions
- Rate limiting
- Input validation

## Deployment

### Docker Compose (Development)
```bash
docker-compose up
```

### Kubernetes (Production)
- Deploy each service as a Deployment
- Use ConfigMaps/Secrets for configuration
- Use managed Redis (Memorystore) and MongoDB (Atlas)
- Use Ingress with WebSocket support
- Auto-scale transcoder workers based on queue depth
