#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")" && pwd)"
RUNTIME="$ROOT/runtime"
SERVER="$RUNTIME/server"
DB_SQL="$RUNTIME/database.sql"
DB_DIR="/var/lib/mysql"
DB_USER="dborox"
MARIADB_SAFE_PID=""
BRIDGE_PID=""
BOOT_PID=""

mkdir -p /run/mysqld
chown -R mysql:mysql /run/mysqld "$DB_DIR"

if [ ! -d "$DB_DIR/mysql" ]; then
  echo "[db] initializing MariaDB"
  mariadb-install-db --user=mysql --datadir="$DB_DIR" >/dev/null
fi

start_mariadb() {
  : > /tmp/mariadb.log
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
  MARIADB_SAFE_PID=$!

  for i in $(seq 1 60); do
    if mariadb-admin ping -uroot --silent >/dev/null 2>&1; then
      echo "[db] MariaDB ready"
      return 0
    fi
    sleep 0.5
  done

  echo "[db] MariaDB failed to start"
  cat /tmp/mariadb.log
  return 1
}

stop_mariadb_for_map() {
  echo "[memory] pausing MariaDB while DBO Rox 2000x2000 map loads"
  mariadb-admin shutdown -uroot >/dev/null 2>&1 || true
  for i in $(seq 1 40); do
    if ! mariadb-admin ping -uroot --silent >/dev/null 2>&1; then
      echo "[memory] MariaDB stopped; RAM released to TFS map loader"
      return 0
    fi
    sleep 0.25
  done
  echo "[memory] warning: MariaDB did not fully stop before map load"
}

start_boot_listener() {
  /usr/local/bin/dbo-boot-listener &
  BOOT_PID=$!
  echo "[boot] lightweight startup listener pid $BOOT_PID"
}

stop_boot_listener() {
  if [ -n "${BOOT_PID:-}" ] && [ "$BOOT_PID" -gt 1 ] 2>/dev/null; then
    kill "$BOOT_PID" >/dev/null 2>&1 || true
    wait "$BOOT_PID" >/dev/null 2>&1 || true
    BOOT_PID=""
    sleep 0.2
  fi
}

start_bridge() {
  cd "$ROOT"
  node bridge.mjs &
  BRIDGE_PID=$!
  echo "[bridge] public websocket started after map load (pid $BRIDGE_PID)"
}

start_mariadb

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

# Keep Render healthy with a tiny native listener. Do not pay the Node runtime
# cost until TFS has fully loaded the legacy map.
start_boot_listener

cd "$SERVER"
chmod +x ./theforgottenserver
chown -R otserver:otserver "$SERVER"
: > /tmp/tfs.log

echo "[tfs] allocator: native OTServ pool (minimal boot profile)"
# No jemalloc preload, stdbuf, or tail process during the memory-critical map
# load. The native OTServ pools handle the millions of small map objects; logs
# remain in /tmp/tfs.log and are polled directly by this shell.
runuser -u otserver -- ./theforgottenserver > /tmp/tfs.log 2>&1 &
TFS_PID=$!
DB_PAUSED_FOR_MAP=0
MAP_LOGGED=0

cleanup() {
  if [ -n "${TFS_PID:-}" ] && [ "$TFS_PID" -gt 1 ] 2>/dev/null; then kill "$TFS_PID" >/dev/null 2>&1 || true; fi
  if [ -n "${BRIDGE_PID:-}" ] && [ "$BRIDGE_PID" -gt 1 ] 2>/dev/null; then kill "$BRIDGE_PID" >/dev/null 2>&1 || true; fi
  if [ -n "${BOOT_PID:-}" ] && [ "$BOOT_PID" -gt 1 ] 2>/dev/null; then kill "$BOOT_PID" >/dev/null 2>&1 || true; fi
}
trap cleanup EXIT INT TERM

while true; do
  if ! kill -0 "$TFS_PID" >/dev/null 2>&1; then
    echo "[tfs] server exited during startup"
    tail -n 60 /tmp/tfs.log || true
    exit 1
  fi
  if [ -z "$BOOT_PID" ] || ! kill -0 "$BOOT_PID" >/dev/null 2>&1; then
    echo "[boot] startup listener stopped unexpectedly"
    exit 1
  fi

  if [ "$DB_PAUSED_FOR_MAP" -eq 0 ] && grep -q 'Loading map and spawns' /tmp/tfs.log; then
    stop_mariadb_for_map
    DB_PAUSED_FOR_MAP=1
  fi

  if [ "$MAP_LOGGED" -eq 0 ] && grep -q 'Map size:' /tmp/tfs.log; then
    grep 'Map size:' /tmp/tfs.log | tail -n 1 || true
    echo "[memory] map parsing continues with DB and Node bridge offline"
    MAP_LOGGED=1
  fi

  if (echo >/dev/tcp/127.0.0.1/7172) >/dev/null 2>&1; then
    echo "[tfs] game port 7172 ready"
    tail -n 40 /tmp/tfs.log || true

    if [ "$DB_PAUSED_FOR_MAP" -eq 1 ]; then
      echo "[memory] map finished; restarting MariaDB before accepting Guest"
      start_mariadb
      DB_PAUSED_FOR_MAP=0
    fi

    stop_boot_listener
    start_bridge
    break
  fi
  sleep 0.5
done

while true; do
  if ! kill -0 "$TFS_PID" >/dev/null 2>&1; then
    echo "[tfs] game server stopped"
    tail -n 60 /tmp/tfs.log || true
    exit 1
  fi
  if [ -z "$BRIDGE_PID" ] || ! kill -0 "$BRIDGE_PID" >/dev/null 2>&1; then
    echo "[bridge] public bridge stopped"
    exit 1
  fi
  sleep 5
done
