FROM node:20-slim

# Install FFmpeg with libx264 + fonts for caption rendering
RUN apt-get update && \
    apt-get install -y --no-install-recommends ffmpeg fonts-dejavu-core && \
    rm -rf /var/lib/apt/lists/*

# Verify FFmpeg and libx264
RUN ffmpeg -version && ffmpeg -codecs 2>/dev/null | grep libx264

WORKDIR /app

# Install Node dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy app source
COPY . .

# Create required directories
RUN mkdir -p public/output tmp

EXPOSE 3000

CMD ["node", "server.js"]
