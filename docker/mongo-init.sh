#!/bin/bash
set -euo pipefail

uri='mongodb://mongo:27017/admin?directConnection=true'

# Initialise a single-node replica set so booking transactions are supported.
mongosh --quiet "$uri" --eval '
try {
  const status = rs.status();
  if (status.set !== "rs0") throw new Error("Unexpected replica set name");
} catch (error) {
  if (error.code !== 94) throw error;
  rs.initiate({ _id: "rs0", members: [{ _id: 0, host: "mongo:27017" }] });
}'

# The API must not connect until the replica set has a writable primary.
for attempt in $(seq 1 60); do
  if mongosh --quiet "$uri" --eval \
    'if (!db.hello().isWritablePrimary) quit(1)' >/dev/null 2>&1; then
    echo 'Disposable MongoDB replica set is ready.'
    exit 0
  fi
  sleep 2
done

echo 'MongoDB replica set did not become writable.' >&2
exit 1
