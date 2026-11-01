#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="$ROOT/runtime"
SERVER="$RUNTIME/server"
DB_SQL="$RUNTIME/database.sql"
DB_DIR="/var/lib/mysql"
DB_USER="dborox"

mkdir -p /run/mysqld
chown -R mysql:mysql /run/mysqld "$DB_DIR"

if [ ! -d "$DB_DIR/mysql" ]; then
  echo "[db] initializing MariaDB"
  mariadb-install-db --user=mysql --datadir="$DB_DIR" >/dev/null
fi

# Extreme low-memory profile for the disposable development DB. The original
# 2000x2000 DBO Rox map needs nearly the entire 512 MB free instance by itself.
mysqld_safe \
  --datadir="$DB_DIR" \
  --bind-address=127.0.0.1 \
  --skip-networking=0 \
  --skip-name-resolve \
  --performance-schema=OFF \
  --innodb-buffer-pool-size=8M \
  --innodb-log-buffer-size=1M \
  --innodb-flush-method=O_DIRECT \
  --key-buffer-size=512K \
  --aria-pagecache-buffer-size=2M \
  --query-cache-size=0 \
  --table-open-cache=64 \
  --thread-cache-size=0 \
  --host-cache-size=0 \
  --tmp-table-size=1M \
  --max-heap-table-size=1M \
  --sort-buffer-size=256K \
  --read-buffer-size=128K \
  --read-rnd-buffer-size=256K \
  --join-buffer-size=128K \
  --max-connections=5 \
  >/tmp/mariadb.log 2>&1 &

for i in $(seq 1 60); do
  if mariadb-admin ping -uroot --silent >/dev/null 2>&1; then break; fi
  sleep 1
  if [ "$i" -eq 60 ]; then cat /tmp/mariadb.log; exit 1; fi
done

mariadb -uroot -e "CREATE DATABASE IF NOT EXISTS dborox CHARACTER SET latin1 COLLATE latin1_swedish_ci;"

if ! mariadb -uroot -Nse "SELECT 1 FROM dborox.accounts LIMIT 1" >/dev/null 2>&1; then
  echo "[db] importing original DBO Rox database"
  mariadb -uroot dborox < "$DB_SQL"
fi

mariadb -uroot <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON dborox.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON dborox.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

mariadb -uroot dborox <<'SQL'
UPDATE accounts
SET name='guest', password=SHA1('guest'), premdays=65535
WHERE id=1;
UPDATE players
SET name='Guest', account_id=1, online=0, lastlogin=0, posx=655, posy=399, posz=7, town_id=1
WHERE id=3;
SQL

echo "[db] Guest ready"

cat >> "$SERVER/config.lua" <<'LUA'

-- Render development database override (must stay last)
sqlType = "mysql"
sqlHost = "127.0.0.1"
sqlUser = "dborox"
sqlPass = ""
sqlDatabase = "dborox"
LUA

echo "[db] config path: $SERVER/config.lua"
echo "[db] final config override:"
tail -n 8 "$SERVER/config.lua"

# Open Render's public HTTP/WSS port immediately. Connections received before
# TFS finishes loading are rejected by the TCP side and the browser retries.
cd "$ROOT"
node bridge.mjs &
BRIDGE_PID=$!
echo "[bridge] bootstrap process started (pid $BRIDGE_PID)"

cd "$SERVER"
chmod +x ./theforgottenserver
chown -R otserver:otserver "$SERVER"
: > /tmp/tfs.log
runuser -u otserver -- stdbuf -oL -eL ./theforgottenserver > /tmp/tfs.log 2>&1 &
TFS_PID=$!

tail -n +1 -F /tmp/tfs.log &
TAIL_PID=$!

cleanup() {
  kill "$TAIL_PID" >/dev/null 2>&1 || true
  kill "$TFS_PID" >/dev/null 2>&1 || true
  kill "$BRIDGE_PID" >/dev/null 2>&1 || true
}
trap cleanup EXIT INT TERM

while true; do
  if ! kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
    echo "[bridge] public bridge exited unexpectedly"
    exit 1
  fi
  if ! kill -0 "$TFS_PID" >/dev/null 2>&1; then
    echo "[tfs] server exited during startup"
    exit 1
  fi
  if (echo >/dev/tcp/127.0.0.1/7172) >/dev/null 2>&1; then
    echo "[tfs] game port 7172 ready"
    kill "$TAIL_PID" >/dev/null 2>&1 || true
    TAIL_PID=0
    break
  fi
  sleep 1
done

while true; do
  if ! kill -0 "$TFS_PID" >/dev/null 2>&1; then
    echo "[tfs] game server stopped"
    exit 1
  fi
  if ! kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
    echo "[bridge] public bridge stopped"
    exit 1
  fi
  sleep 5
done
