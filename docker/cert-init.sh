#!/bin/sh
set -eu

# Create local TLS material in a private Docker volume for the non-root API.
apk add --no-cache openssl >/dev/null

key=/certs/localhost-key.pem
cert=/certs/localhost-cert.pem

if [ ! -s "$key" ] || [ ! -s "$cert" ]; then
  openssl req -x509 -newkey rsa:2048 -nodes -sha256 -days 365 \
    -keyout "$key" \
    -out "$cert" \
    -subj "/CN=localhost" \
    -addext "subjectAltName=DNS:localhost,IP:127.0.0.1" >/dev/null 2>&1
fi

# The API runs as UID 1000 and requires read access to its private key.
chown 1000:1000 "$key" "$cert"
chmod 600 "$key"
chmod 644 "$cert"

echo "Local HTTPS certificate is available to the API."
