# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY backend/package.json backend/tsconfig.json backend/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY backend/ backend/

# Build
RUN pnpm --filter agent-office-backend build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy built files and package.json
COPY --from=builder /app/backend/dist ./dist
COPY --from=builder /app/backend/package.json ./

# Install production dependencies only
RUN pnpm install --prod

# Expose ports
EXPOSE 3100 3101

# Run the server
CMD ["node", "dist/index.js"]
