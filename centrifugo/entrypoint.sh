#!/bin/sh
set -e

# Read API key from file if CENTRIFUGO_API_KEY_FILE is set
if [ -n "$CENTRIFUGO_API_KEY_FILE" ] && [ -f "$CENTRIFUGO_API_KEY_FILE" ]; then
    export CENTRIFUGO_API_KEY=$(cat "$CENTRIFUGO_API_KEY_FILE")
fi

# Set default values for environment variables if not provided
export CENTRIFUGO_API_KEY="${CENTRIFUGO_API_KEY:-floww-api-key-dev}"
export CENTRIFUGO_ADMIN_ENABLED="${CENTRIFUGO_ADMIN_ENABLED:-true}"
export CENTRIFUGO_ADMIN_INSECURE="${CENTRIFUGO_ADMIN_INSECURE:-true}"
export CENTRIFUGO_CONNECT_PROXY_ENDPOINT="${CENTRIFUGO_CONNECT_PROXY_ENDPOINT:-http://app:3000/centrifugo/connect}"
export CENTRIFUGO_SUBSCRIBE_PROXY_ENDPOINT="${CENTRIFUGO_SUBSCRIBE_PROXY_ENDPOINT:-http://app:3000/centrifugo/subscribe}"
export CENTRIFUGO_ALLOWED_ORIGINS="${CENTRIFUGO_ALLOWED_ORIGINS:-[\"http://localhost:3000\", \"http://localhost:5173\"]}"
export CENTRIFUGO_ALLOW_ANONYMOUS="${CENTRIFUGO_ALLOW_ANONYMOUS:-true}"

# Process the config template with environment variables
envsubst < /centrifugo/config.template.json > /centrifugo/config.json

# Start Centrifugo with the processed config
exec centrifugo -c /centrifugo/config.json
