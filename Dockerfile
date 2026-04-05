# Stage 1: Build frontend
FROM node:20-alpine AS frontend-build
WORKDIR /app/frontend
COPY frontend/package.json frontend/package-lock.json* ./
RUN npm ci --production=false
COPY frontend/ ./
RUN npm run build

# Stage 2: Build kitchen display
FROM node:20-alpine AS kitchen-build
WORKDIR /app/kitchen
COPY kitchen/package.json kitchen/package-lock.json* ./
RUN npm ci --production=false
COPY kitchen/ ./
RUN npm run build

# Stage 3: Build SuperAdmin Dashboard
FROM node:20-alpine AS superadmin-build
WORKDIR /app/superadmin
COPY superadmin-frontend/package.json superadmin-frontend/package-lock.json* ./
RUN npm ci --production=false
COPY superadmin-frontend/ ./
RUN npm run build

# Stage 4: Backend production
FROM node:20-alpine AS production
WORKDIR /app

# Security: run as non-root user
RUN addgroup -g 1001 -S petpooja && adduser -S petpooja -u 1001

# Install OpenSSL for Prisma compatibility
RUN apk add --no-cache openssl

# Install production dependencies
COPY backend/package.json backend/package-lock.json* ./
RUN npm ci --production && npm cache clean --force

# Copy backend source
COPY backend/src/ ./src/
COPY backend/prisma/ ./prisma/
COPY backend/.env.example ./.env.example

RUN npx prisma generate

# Copy built frontends
COPY --from=frontend-build /app/frontend/dist ./public/dashboard
COPY --from=kitchen-build /app/kitchen/dist ./public/kitchen
COPY --from=superadmin-build /app/superadmin/dist ./public/admin

# Create required directories
RUN mkdir -p uploads logs && chown -R petpooja:petpooja /app

USER petpooja

EXPOSE 5001

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:5001/health || exit 1

CMD ["node", "src/app.js"]
