# Kubrick

A web application for recording interview videos, storing them in cloud storage (GCP Cloud Storage or AWS S3), and persisting metadata to MongoDB.

## Features

-   **Video Recording**: Browser-based video recording using MediaRecorder API
-   **Chunked Uploads**: Resumable uploads for large video files (hour+ recordings)
-   **Cloud Storage**: Support for GCP Cloud Storage (primary) and AWS S3
-   **Thumbnail Generation**: Automatic capture of video thumbnails
-   **Session Metadata**: Automatic capture of browser, OS, timezone, IP address, and device info
-   **Recording Library**: Browse, search, and playback recorded videos
-   **Flexible Metadata**: Store arbitrary key-value metadata with recordings
-   **Responsive Design**: Works on desktop and tablet devices
-   **URL Pre-population**: Pre-fill recording metadata via URL parameters

## Tech Stack

### Frontend

-   React 18 with Vite
-   React Router for navigation
-   Ant Design UI components
-   Zustand for state management (preferences persisted to localStorage)
-   TanStack Query for server state
-   MediaRecorder API for video capture

### Backend

-   Node.js + Express
-   MongoDB with Mongoose ODM
-   GCP Cloud Storage / AWS S3
-   JSON:API specification for REST endpoints

## Quick Start

### Prerequisites

-   Node.js 18+
-   MongoDB (local or Atlas)
-   GCP Cloud Storage bucket (or AWS S3)

### Installation

```bash
# Clone the repository
git clone <repository-url>
cd kubrick

# Install backend dependencies
cd backend
npm install

# Install frontend dependencies
cd ../frontend
npm install
```

### Configuration

Create `backend/.env`:

```bash
# Server
PORT=3001
NODE_ENV=development

# MongoDB
MONGODB_URI=mongodb://localhost:27017/kubrick

# Storage Provider ('gcp' or 's3')
STORAGE_PROVIDER=gcp

# GCP Cloud Storage
GCP_PROJECT_ID=your-project-id
GCP_BUCKET_NAME=your-bucket-name
GOOGLE_APPLICATION_CREDENTIALS=./path-to-service-account-key.json

# AWS S3 (alternative)
# AWS_REGION=us-east-1
# AWS_BUCKET_NAME=your-bucket-name
# AWS_ACCESS_KEY_ID=xxx
# AWS_SECRET_ACCESS_KEY=xxx
```

### GCP Bucket CORS Configuration

Apply CORS settings for browser uploads:

```bash
cd backend
gsutil cors set gcp-cors.json gs://your-bucket-name
```

### Running the Application

```bash
# Terminal 1: Start backend
cd backend
npm run dev

# Terminal 2: Start frontend
cd frontend
npm run dev
```

Access the application at `http://localhost:5173`

## URL Parameters

Pre-populate recording metadata via URL parameters. The recorder name is stored persistently; all other parameters are stored as flexible metadata.

| Parameter               | Description                            |
| ----------------------- | -------------------------------------- |
| `recorderName` / `name` | Recorder's name (persisted in storage) |
| Any other parameter     | Stored in flexible metadata map        |

Common metadata fields (not enforced, just conventions):

-   `eventId` - Event identifier
-   `civId` - CivID number
-   `aNumber` - A# reference

Example:

```
http://localhost:5173/?name=John%20Doe&eventId=EVT-123&civId=456&aNumber=789
```

## API Endpoints

All endpoints follow the JSON:API v1.1 specification.

### Recordings

| Method | Endpoint              | Description                       |
| ------ | --------------------- | --------------------------------- |
| GET    | `/api/recordings`     | List recordings (with pagination) |
| GET    | `/api/recordings/:id` | Get single recording              |
| POST   | `/api/recordings`     | Create recording metadata         |
| PATCH  | `/api/recordings/:id` | Update recording                  |
| DELETE | `/api/recordings/:id` | Delete recording                  |

### Upload

| Method | Endpoint                       | Description                     |
| ------ | ------------------------------ | ------------------------------- |
| POST   | `/api/upload/presigned-url`    | Get presigned URL for upload    |
| POST   | `/api/upload/complete`         | Mark simple upload complete     |
| POST   | `/api/upload/init-chunked`     | Initialize chunked upload       |
| POST   | `/api/upload/chunk-url`        | Get presigned URL for chunk     |
| POST   | `/api/upload/complete-chunked` | Complete chunked upload         |
| POST   | `/api/upload/abort-chunked`    | Abort chunked upload            |
| POST   | `/api/upload/thumbnail-url`    | Get presigned URL for thumbnail |

### Session & Health

| Method | Endpoint            | Description           |
| ------ | ------------------- | --------------------- |
| GET    | `/api/session-info` | Get client IP address |
| GET    | `/api/health`       | Health check endpoint |

## Project Structure

```
kubrick/
├── frontend/
│   ├── src/
│   │   ├── api/                  # API client functions
│   │   ├── components/
│   │   │   ├── RecordTab/        # Recording interface
│   │   │   ├── LibraryTab/       # Video library
│   │   │   └── common/           # Shared components
│   │   ├── hooks/                # Custom React hooks
│   │   ├── stores/               # Zustand stores
│   │   ├── styles/
│   │   │   └── components/       # Component-specific CSS
│   │   └── App.jsx
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── middleware/           # Express middleware
│   │   ├── models/               # Mongoose models
│   │   ├── routes/               # Express routes
│   │   ├── serializers/          # JSON:API serializers
│   │   ├── services/
│   │   │   └── storage/          # Cloud storage abstraction
│   │   ├── utils/                # Utilities (logger, etc.)
│   │   └── app.js
│   ├── gcp-cors.json             # GCP bucket CORS config
│   └── package.json
│
└── README.md
```

## Recording Data Model

```javascript
{
  title: String,              // Required, max 200 chars
  description: String,        // Optional, max 2000 chars
  recorderName: String,       // Required
  metadata: Map,              // Flexible key-value pairs (eventId, civId, etc.)
  quality: '480p' | '720p' | '1080p',
  duration: Number,           // Seconds
  fileBytes: Number,
  mimeType: String,           // Default: 'video/webm'
  status: 'recording' | 'uploading' | 'processing' | 'ready' | 'error' | 'archived',
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
    deviceType: 'desktop' | 'tablet' | 'mobile' | 'unknown'
  },
  storageProvider: 'gcp' | 's3',
  storageBucket: String,
  storageKey: String,
  thumbnailKey: String,       // Storage key for thumbnail image
  uploadId: String,           // For resumable upload sessions
  recordedAt: Date,
  createdAt: Date,
  updatedAt: Date
}
```

## License

Proprietary - All rights reserved
