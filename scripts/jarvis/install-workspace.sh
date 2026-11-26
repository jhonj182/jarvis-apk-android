#!/usr/bin/env bash
# Installs the Jarvis persona on this desktop: creates the agent workspace,
# copies the instructions into it and registers the folder with Orca Lab so the
# phone can pick it as "the place Jarvis speaks from". Idempotent.
#
# Usage: scripts/jarvis/install-workspace.sh [target-directory]
# Default target: $HOME/orca/projects/jarvis-mobile-brain
#
# Why a workspace and not the APK: the repository is public (ADR-007), and the
# persona must change without a 30-minute build (ADR-006).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
SOURCE_DIR="$REPO_ROOT/personaje/jarvis-mobile"
TARGET="${1:-$HOME/orca/projects/jarvis-mobile-brain}"
ORCA_BIN="${ORCA_CLI_COMMAND:-}"

log() {
  printf '%s\n' "$*"
}

if [ ! -f "$SOURCE_DIR/AGENTS.md" ]; then
  log "ERROR: no existe $SOURCE_DIR/AGENTS.md. Ejecuta el script desde el repositorio jarvis-apk-android." >&2
  exit 1
fi

if [ -z "$ORCA_BIN" ]; then
  if [ -x "$HOME/.local/bin/orca" ] && "$HOME/.local/bin/orca" status >/dev/null 2>&1; then
    ORCA_BIN="$HOME/.local/bin/orca"
  elif command -v orca-ide >/dev/null 2>&1; then
    ORCA_BIN="orca-ide"
  elif command -v orca >/dev/null 2>&1 && orca --version >/dev/null 2>&1; then
    ORCA_BIN="orca"
  fi
fi

mkdir -p "$TARGET"
cp "$SOURCE_DIR/AGENTS.md" "$TARGET/AGENTS.md"
cp "$SOURCE_DIR/CLAUDE.md" "$TARGET/CLAUDE.md"

GIT_AUTHOR_ARGS=(-c "user.name=${GIT_AUTHOR_NAME:-jarvis-mobile}" -c "user.email=${GIT_AUTHOR_EMAIL:-jarvis-mobile@localhost}")
if [ ! -d "$TARGET/.git" ]; then
  git -C "$TARGET" init -q
  git -C "$TARGET" add AGENTS.md CLAUDE.md
  git -C "$TARGET" "${GIT_AUTHOR_ARGS[@]}" commit -q -m "chore: espacio de trabajo de jarvis movil"
elif [ -n "$(git -C "$TARGET" status --porcelain -- AGENTS.md CLAUDE.md)" ]; then
  git -C "$TARGET" add AGENTS.md CLAUDE.md
  git -C "$TARGET" "${GIT_AUTHOR_ARGS[@]}" commit -q -m "chore: actualiza el personaje de jarvis movil"
fi

ABS_TARGET="$(cd "$TARGET" && pwd)"
if [ -n "$ORCA_BIN" ] && "$ORCA_BIN" repo list --json > /dev/null 2>&1; then
  # `repo add` on an already registered path is a no-op or a duplicate error; either way the
  # workspace is reachable from the phone, so the output is shown but never fails the install.
  "$ORCA_BIN" repo add --path "$ABS_TARGET" --json > /dev/null 2>&1 \
    && log "Espacio de trabajo registrado en Orca Lab: $ABS_TARGET" \
    || log "Orca Lab ya conocía el espacio de trabajo, o no pudo registrarlo: $ABS_TARGET"
else
  log "Orca Lab no está disponible desde aquí. Registra la carpeta a mano: orca repo add --path \"$ABS_TARGET\""
fi

log "Listo. En la app: Ajustes de Jarvis > Elegir espacio de trabajo > $ABS_TARGET"
