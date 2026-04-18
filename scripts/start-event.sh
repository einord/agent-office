#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
# Agent Office — Event launcher
#
# Starts everything needed on the presenter's laptop for a live event:
#   1. Pre-flight checks (pnpm, bun, Godot, config)
#   2. Builds backend + event binaries if missing
#   3. Starts the backend in EVENT_MODE
#   4. Opens the Godot client in fullscreen on the big screen
#   5. Prints the URL the audience should type in their browser
#   6. Shuts everything down cleanly on Ctrl+C
# ─────────────────────────────────────────────────────────────────────────────
set -u
set -o pipefail

# ── Paths ────────────────────────────────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
BACKEND_DIR="$ROOT_DIR/backend"
CLI_DIR="$ROOT_DIR/cli"
GODOT_PROJECT="$ROOT_DIR/gui/agent-office/project.godot"
DOWNLOADS_DIR="$BACKEND_DIR/downloads"
BACKEND_LOG="$ROOT_DIR/.event-backend.log"
GODOT_LOG="$ROOT_DIR/.event-godot.log"

# ── Config (override via env) ────────────────────────────────────────────────
EVENT_NAME="${EVENT_NAME:-Plik Event}"
HTTP_PORT="${HTTP_PORT:-3100}"
WS_PORT="${WS_PORT:-3101}"
DISCOVERY_PORT="${DISCOVERY_PORT:-3102}"
OPEN_GODOT="${OPEN_GODOT:-1}"          # set to 0 to skip Godot
BUILD_BINARIES="${BUILD_BINARIES:-auto}"  # auto | always | never

# ── Pretty printing ──────────────────────────────────────────────────────────
if [ -t 1 ]; then
  C_RESET=$'\033[0m'; C_BOLD=$'\033[1m'; C_DIM=$'\033[2m'
  C_GREEN=$'\033[32m'; C_YELLOW=$'\033[33m'; C_RED=$'\033[31m'; C_CYAN=$'\033[36m'
else
  C_RESET=""; C_BOLD=""; C_DIM=""; C_GREEN=""; C_YELLOW=""; C_RED=""; C_CYAN=""
fi

step()  { printf "${C_CYAN}▶${C_RESET}  %s\n" "$*"; }
ok()    { printf "${C_GREEN}✓${C_RESET}  %s\n" "$*"; }
warn()  { printf "${C_YELLOW}⚠${C_RESET}  %s\n" "$*"; }
fail()  { printf "${C_RED}✗${C_RESET}  %s\n" "$*" >&2; }
banner() {
  printf "\n${C_BOLD}${C_CYAN}"
  printf "  ╭──────────────────────────────────────────────╮\n"
  printf "  │  %-44s│\n" "$1"
  printf "  ╰──────────────────────────────────────────────╯\n"
  printf "${C_RESET}\n"
}

# ── LAN IP detection ─────────────────────────────────────────────────────────
detect_lan_ip() {
  local ip
  # Try `route` + `ifconfig` (macOS/BSD)
  local iface
  iface=$(route get default 2>/dev/null | awk '/interface: /{print $2; exit}')
  if [ -n "${iface:-}" ]; then
    ip=$(ifconfig "$iface" 2>/dev/null | awk '/inet /{print $2; exit}')
  fi
  # Fallback: any non-loopback IPv4
  if [ -z "${ip:-}" ]; then
    ip=$(ifconfig 2>/dev/null | awk '/inet /{if($2!="127.0.0.1"){print $2; exit}}')
  fi
  # Last resort: hostname -I (Linux)
  if [ -z "${ip:-}" ] && command -v hostname >/dev/null 2>&1; then
    ip=$(hostname -I 2>/dev/null | awk '{print $1}')
  fi
  echo "${ip:-localhost}"
}

# ── Pre-flight ───────────────────────────────────────────────────────────────
preflight() {
  step "Kontrollerar beroenden…"

  command -v pnpm >/dev/null 2>&1 || { fail "pnpm saknas. Installera: brew install pnpm"; exit 1; }
  ok "pnpm: $(pnpm --version)"

  command -v node >/dev/null 2>&1 || { fail "node saknas. Installera: brew install node"; exit 1; }
  ok "node: $(node --version)"

  if [ "$BUILD_BINARIES" != "never" ]; then
    command -v bun >/dev/null 2>&1 || { fail "bun saknas. Installera: brew install oven-sh/bun/bun"; exit 1; }
    ok "bun:  $(bun --version)"
  fi

  if [ "$OPEN_GODOT" = "1" ]; then
    if ! find_godot >/dev/null; then
      warn "Godot hittades inte — hoppar över GUI. Sätt GODOT=/sökväg/till/godot eller OPEN_GODOT=0."
      OPEN_GODOT=0
    else
      ok "godot: $(find_godot)"
    fi
  fi

  if [ ! -f "$BACKEND_DIR/config.json" ]; then
    warn "backend/config.json saknas — kopierar från config.event.example.json"
    cp "$BACKEND_DIR/config.event.example.json" "$BACKEND_DIR/config.json"
  fi
}

find_godot() {
  if [ -n "${GODOT:-}" ] && command -v "$GODOT" >/dev/null 2>&1; then
    echo "$GODOT"; return 0
  fi
  if command -v godot >/dev/null 2>&1; then
    command -v godot; return 0
  fi
  if [ -x "/Applications/Godot.app/Contents/MacOS/Godot" ]; then
    echo "/Applications/Godot.app/Contents/MacOS/Godot"; return 0
  fi
  if [ -x "/Applications/Godot_mono.app/Contents/MacOS/Godot" ]; then
    echo "/Applications/Godot_mono.app/Contents/MacOS/Godot"; return 0
  fi
  return 1
}

# ── Build steps ──────────────────────────────────────────────────────────────
ensure_backend_built() {
  if [ ! -f "$BACKEND_DIR/dist/index.js" ]; then
    step "Backend inte byggt — kör pnpm install + build…"
    (cd "$ROOT_DIR" && pnpm install --silent) || { fail "pnpm install misslyckades"; exit 1; }
    (cd "$BACKEND_DIR" && npm run build) || { fail "backend build misslyckades"; exit 1; }
    ok "Backend byggd"
  fi
}

ensure_cli_built() {
  if [ ! -f "$CLI_DIR/dist/event-main.js" ]; then
    step "CLI inte byggt — kör npm run build…"
    (cd "$CLI_DIR" && npm run build) || { fail "cli build misslyckades"; exit 1; }
    ok "CLI byggd"
  fi
}

ensure_binaries_built() {
  case "$BUILD_BINARIES" in
    never) return 0 ;;
    always) ;;
    auto)
      # If any binary exists, skip — rebuild with BUILD_BINARIES=always
      if ls "$DOWNLOADS_DIR"/agent-office-event* >/dev/null 2>&1; then
        ok "Klient-binärer finns redan i backend/downloads/"
        return 0
      fi
      ;;
  esac

  step "Bygger standalone klient-binärer (det här tar en stund)…"
  (cd "$CLI_DIR" && node scripts/build-event-binaries.mjs) \
    || { fail "Kunde inte bygga binärer"; exit 1; }
  ok "Klient-binärer klara"
}

# ── Port hygiene ─────────────────────────────────────────────────────────────
free_port() {
  local port="$1"
  local pids
  pids=$(lsof -ti ":$port" 2>/dev/null || true)
  if [ -n "$pids" ]; then
    warn "Port $port är upptagen (pid $pids) — dödar"
    echo "$pids" | xargs kill -9 2>/dev/null || true
    sleep 0.3
  fi
}

# ── Backend lifecycle ────────────────────────────────────────────────────────
BACKEND_PID=""
GODOT_PID=""

start_backend() {
  step "Startar backend i EVENT_MODE…"

  # Generate a disposable admin token if user hasn't set one
  if [ -z "${EVENT_ADMIN_TOKEN:-}" ]; then
    EVENT_ADMIN_TOKEN="$(openssl rand -hex 8 2>/dev/null || echo "admin-$$-$RANDOM")"
    export EVENT_ADMIN_TOKEN
  fi

  : > "$BACKEND_LOG"
  # `exec` replaces the subshell with node, so $! is the node PID directly —
  # otherwise cleanup would only kill the subshell and leave backend orphaned.
  (
    cd "$BACKEND_DIR" && \
    exec env \
      EVENT_MODE=true \
      EVENT_NAME="$EVENT_NAME" \
      EVENT_ADMIN_TOKEN="$EVENT_ADMIN_TOKEN" \
      node dist/index.js >>"$BACKEND_LOG" 2>&1
  ) &
  BACKEND_PID=$!

  # Wait until /health responds (max 15s)
  local attempts=0
  until curl -fsS "http://localhost:$HTTP_PORT/health" >/dev/null 2>&1; do
    attempts=$((attempts + 1))
    if [ "$attempts" -ge 60 ]; then
      fail "Backend svarade inte inom 15 sekunder. Logg:"
      tail -20 "$BACKEND_LOG" >&2
      cleanup
      exit 1
    fi
    sleep 0.25
  done
  ok "Backend igång (pid $BACKEND_PID, logg: $BACKEND_LOG)"
}

start_godot() {
  [ "$OPEN_GODOT" = "1" ] || return 0
  step "Startar Godot-klienten…"

  local godot_bin
  godot_bin=$(find_godot)

  : > "$GODOT_LOG"
  ( exec "$godot_bin" --path "$(dirname "$GODOT_PROJECT")" >>"$GODOT_LOG" 2>&1 ) &
  GODOT_PID=$!
  ok "Godot igång (pid $GODOT_PID, logg: $GODOT_LOG)"
}

CLEANED_UP=0
cleanup() {
  [ "$CLEANED_UP" = "1" ] && return 0
  CLEANED_UP=1
  echo ""
  step "Avslutar…"
  if [ -n "$GODOT_PID" ] && kill -0 "$GODOT_PID" 2>/dev/null; then
    kill "$GODOT_PID" 2>/dev/null || true
  fi
  if [ -n "$BACKEND_PID" ] && kill -0 "$BACKEND_PID" 2>/dev/null; then
    kill "$BACKEND_PID" 2>/dev/null || true
    # Give the HTTP server a moment to close
    sleep 0.5
  fi
  ok "Klart"
}

trap cleanup EXIT INT TERM

# ── Go! ──────────────────────────────────────────────────────────────────────
banner "Agent Office — Event Launcher"

preflight
free_port "$HTTP_PORT"
free_port "$WS_PORT"
free_port "$DISCOVERY_PORT"

ensure_backend_built
ensure_cli_built
ensure_binaries_built

start_backend
start_godot

LAN_IP=$(detect_lan_ip)

printf "\n${C_BOLD}${C_GREEN}"
printf "  ╭──────────────────────────────────────────────────────╮\n"
printf "  │                                                      │\n"
printf "  │  🎉  %-50s│\n" "$EVENT_NAME är igång!"
printf "  │                                                      │\n"
printf "  │  Säg till publiken:                                  │\n"
printf "  │                                                      │\n"
printf "  │  ${C_RESET}${C_BOLD}%-52s${C_GREEN}│\n" "    http://${LAN_IP}:${HTTP_PORT}/download"
printf "  │                                                      │\n"
printf "  ╰──────────────────────────────────────────────────────╯\n"
printf "${C_RESET}\n"

printf "  ${C_DIM}Admin-token (för /event/flush): ${EVENT_ADMIN_TOKEN}${C_RESET}\n"
printf "  ${C_DIM}Backend-logg:  ${BACKEND_LOG}${C_RESET}\n"
printf "  ${C_DIM}Godot-logg:    ${GODOT_LOG}${C_RESET}\n\n"
printf "  Tryck ${C_BOLD}Ctrl+C${C_RESET} för att stänga allt.\n\n"

# Block on backend only — Godot may fork+detach on macOS and exit almost
# immediately even when the window stays open, so we can't rely on its PID.
# If Godot dies, the window simply closes; backend keeps serving downloads.
while kill -0 "$BACKEND_PID" 2>/dev/null; do
  sleep 1
done

# Backend died (or user hit Ctrl+C, which triggers trap before we get here)
cleanup
