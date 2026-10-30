#!/usr/bin/env bash
set -e
cd "$(dirname "$0")/.."

# GUI shells may inherit a different Node version and incompatible shell-manager
# state. Select the installed binary without sourcing interactive shell profiles.
node_executable=$(node scripts/select-node.mjs)
export PATH="$(dirname "$node_executable"):$PATH"
printf '[dev] Using Node %s (%s)\n' "$("$node_executable" --version)" "$node_executable"
exec "$node_executable" scripts/dev.mjs "$@"
