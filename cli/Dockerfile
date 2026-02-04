# Build stage
FROM node:22-alpine AS builder

# Install pnpm
RUN corepack enable && corepack prepare pnpm@9 --activate

WORKDIR /app

# Copy workspace files
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json tsconfig.base.json ./
COPY cli/package.json cli/tsconfig.json cli/

# Install dependencies
RUN pnpm install --frozen-lockfile

# Copy source
COPY cli/ cli/

# Build
RUN pnpm --filter agent-office build

# Production stage
FROM node:22-alpine

WORKDIR /app

# Install pnpm for production install
RUN corepack enable && corepack prepare pnpm@9 --activate

# Copy built files and package.json
COPY --from=builder /app/cli/dist ./dist
COPY --from=builder /app/cli/package.json ./

# Install production dependencies only
RUN pnpm install --prod

# Mount point for Claude sessions
VOLUME ["/root/.claude"]

# Run the monitor
CMD ["node", "dist/index.js"]
