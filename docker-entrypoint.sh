#!/bin/sh
set -e

# A mounted disk can arrive owned by root, which would make the unprivileged app user unable
# to create the SQLite files. Fix ownership first, then drop privileges.
data_dir="$(dirname "${DATABASE_PATH:-/app/data/devscope.db}")"
mkdir -p "$data_dir"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node "$data_dir"
  exec gosu node "$@"
fi

exec "$@"
