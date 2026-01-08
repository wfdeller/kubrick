# Build stage
FROM registry.access.redhat.com/ubi9/nodejs-20:latest AS build

WORKDIR /opt/app-root/src

# Copy package files and install dependencies
COPY package*.json ./
RUN npm ci

# Copy source code
COPY . .

# Build with production API URL
ARG VITE_API_URL
ENV VITE_API_URL=${VITE_API_URL}
ARG VITE_OKTA_ENABLED=false
ENV VITE_OKTA_ENABLED=${VITE_OKTA_ENABLED}

RUN npm run build

# Production stage
FROM registry.access.redhat.com/ubi9/nginx-122:latest

# Copy built files
COPY --from=build /opt/app-root/src/dist /opt/app-root/src

# Copy nginx configuration
COPY nginx.conf /etc/nginx/nginx.conf

EXPOSE 8080

CMD ["nginx", "-g", "daemon off;"]
