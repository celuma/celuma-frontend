#!/usr/bin/env sh
set -eu

# Default BACKEND_URL if not provided
BACKEND_URL="${BACKEND_URL:-http://backend:8000}"

# Render nginx template with envsubst
export BACKEND_URL
envsubst '${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec "$@"


