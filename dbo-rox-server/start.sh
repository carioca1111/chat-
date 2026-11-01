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

mysqld_safe --datadir="$DB_DIR" --bind-address=127.0.0.1 --skip-networking=0 >/tmp/mariadb.log 2>&1 &

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

# Local-only database user. MariaDB is bound to loopback and is not exposed by Render.
mariadb -uroot <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON dborox.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON dborox.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# Disposable development Guest. Reuse the original sample rows so all custom
# DBO Rox vocation/outfit columns remain intact.
mariadb -uroot dborox <<'SQL'
UPDATE accounts
SET name='guest', password=SHA1('guest'), premdays=65535
WHERE id=1;
UPDATE players
SET name='Guest', account_id=1, online=0, lastlogin=0, posx=655, posy=399, posz=7, town_id=1
WHERE id=3;
SQL

echo "[db] Guest ready"

# TFS 0.4 loads config.lua from its working directory. Append explicit values
# so these final Lua assignments override any legacy SQL settings earlier in the file.
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

cd "$SERVER"
chmod +x ./theforgottenserver
chown -R otserver:otserver "$SERVER"
runuser -u otserver -- stdbuf -oL -eL ./theforgottenserver > /tmp/tfs.log 2>&1 &
TFS_PID=$!

for i in $(seq 1 90); do
  if ! kill -0 "$TFS_PID" >/dev/null 2>&1; then
    echo "[tfs] server exited during startup"
    cat /tmp/tfs.log
    exit 1
  fi
  if (echo >/dev/tcp/127.0.0.1/7172) >/dev/null 2>&1; then
    echo "[tfs] game port 7172 ready"
    break
  fi
  sleep 1
  if [ "$i" -eq 90 ]; then
    echo "[tfs] timeout waiting for port 7172"
    cat /tmp/tfs.log
    exit 1
  fi
done

cd "$ROOT"
exec node bridge.mjs
