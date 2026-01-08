# Transcoder Dockerfile
# Using Alpine for reliable ffmpeg availability on ARM64 and x86_64
FROM node:20-alpine

# Install ffmpeg
RUN apk add --no-cache ffmpeg

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY src ./src

# Run as non-root user
USER node

CMD ["node", "src/index.js"]
