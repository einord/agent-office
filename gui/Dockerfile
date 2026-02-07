# Godot Web Export Dockerfile
# Multi-stage build: Export Godot project to Web, then serve via nginx
#
# Build args:
#   GODOT_VERSION - Godot version to use (default: 4.3)
#   BUILD_TIMESTAMP - Build timestamp for version.txt (auto-generated if not set)
#
# Usage:
#   docker build -t agent-office-web ./gui
#   docker build --build-arg GODOT_VERSION=4.4 -t agent-office-web ./gui
#   docker build --build-arg BUILD_TIMESTAMP=$(date +%s) -t agent-office-web ./gui

# =============================================================================
# Stage 1: Export Godot project to Web
# =============================================================================
ARG GODOT_VERSION=4.6
FROM barichello/godot-ci:${GODOT_VERSION} AS godot-export

ARG GODOT_VERSION=4.6
ARG BUILD_TIMESTAMP

# Create directories
RUN mkdir -p /project /build/web

# Copy Godot project
COPY agent-office/ /project/

# Export to Web
# Note: --headless is required for CI/CD environments
# The export templates are included in barichello/godot-ci
WORKDIR /project
RUN godot --headless --verbose --export-release "Web" /build/web/index.html || \
    (echo "Export failed. Listing project files:" && ls -la /project && exit 1)

# Verify export succeeded
RUN test -f /build/web/index.html || (echo "Export did not produce index.html" && exit 1)

# Generate build version stamp for auto-reload detection
# Use BUILD_TIMESTAMP if provided, otherwise generate current timestamp
# The ARG ensures this layer is not cached when BUILD_TIMESTAMP changes
RUN echo "${BUILD_TIMESTAMP:-$(date +%s)}" > /build/web/version.txt

# =============================================================================
# Stage 2: Serve with nginx
# =============================================================================
FROM nginx:alpine

# Copy exported web files
COPY --from=godot-export /build/web /usr/share/nginx/html

# Copy nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Add healthcheck
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
    CMD wget --no-verbose --tries=1 --spider http://localhost/health || exit 1

# Expose port
EXPOSE 80

# nginx runs as default CMD
