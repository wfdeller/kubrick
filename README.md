# Kubrick

A web application for recording interview videos, storing them in cloud storage (GCP Cloud Storage or AWS S3), and persisting metadata to MongoDB.

## Features

-   **Video Recording**: Browser-based video recording using MediaRecorder API
-   **Chunked Uploads**: Resumable uploads for large video files (hour+ recordings)
-   **Cloud Storage**: Support for GCP Cloud Storage (primary) and AWS S3
-   **Session Metadata**: Automatic capture of browser, OS, timezone, IP address, and device info
-   **Recording Library**: Browse, search, and playback recorded videos
-   **Responsive Design**: Works on desktop and tablet devices
-   **URL Pre-population**: Pre-fill recording metadata via URL parameters

## Tech Stack

### Frontend

-   React 18 with Vite
-   Ant Design UI components
-   Zustand for state management (with localStorage persistence)
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

Pre-populate recording metadata via URL parameters:

| Field         | Parameters               |
| ------------- | ------------------------ |
| Recorder Name | `recorderName` or `name` |
| Event ID      | `eventId` or `event`     |
| CivID         | `civId` or `civ`         |
| A#            | `aNumber` or `a`         |

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

| Method | Endpoint                       | Description                 |
| ------ | ------------------------------ | --------------------------- |
| POST   | `/api/upload/init-chunked`     | Initialize chunked upload   |
| POST   | `/api/upload/chunk-url`        | Get presigned URL for chunk |
| POST   | `/api/upload/complete-chunked` | Complete chunked upload     |
| POST   | `/api/upload/abort-chunked`    | Abort chunked upload        |

### Session

| Method | Endpoint            | Description           |
| ------ | ------------------- | --------------------- |
| GET    | `/api/session-info` | Get client IP address |

## Project Structure

```
kubrick/
├── frontend/
│   ├── src/
│   │   ├── components/
│   │   │   ├── RecordTab/        # Recording interface
│   │   │   ├── LibraryTab/       # Video library
│   │   │   └── common/           # Shared components
│   │   ├── hooks/                # Custom React hooks
│   │   ├── stores/               # Zustand stores
│   │   ├── styles/               # CSS files
│   │   └── App.jsx
│   └── package.json
│
├── backend/
│   ├── src/
│   │   ├── models/               # Mongoose models
│   │   ├── routes/               # Express routes
│   │   ├── services/             # Business logic
│   │   │   └── storage/          # Cloud storage abstraction
│   │   ├── serializers/          # JSON:API serializers
│   │   └── app.js
│   ├── gcp-cors.json             # GCP bucket CORS config
│   └── package.json
│
└── README.md
```

## Recording Data Model

```javascript
{
  title: String,
  recorderName: String,       // Required
  eventId: String,            // Optional
  civId: Number,              // Optional
  aNumber: Number,            // Optional
  quality: '480p' | '720p' | '1080p',
  duration: Number,           // Seconds
  fileBytes: Number,
  status: 'recording' | 'uploading' | 'processing' | 'ready' | 'error',
  sessionInfo: {
    ipAddress: String,
    timezone: String,
    browserName: String,
    browserVersion: String,
    osName: String,
    osVersion: String,
    screenResolution: String,
    language: String,
    deviceType: String
  },
  storageProvider: 'gcp' | 's3',
  storageBucket: String,
  storageKey: String,
  createdAt: Date,
  updatedAt: Date
}
```

## License

Proprietary - All rights reserved
