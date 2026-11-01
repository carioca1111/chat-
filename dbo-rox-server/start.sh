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

# Local-only game DB account. MariaDB itself is bound to 127.0.0.1 inside this
# container and is not exposed publicly by Render.
mariadb -uroot <<SQL
CREATE USER IF NOT EXISTS '${DB_USER}'@'127.0.0.1';
CREATE USER IF NOT EXISTS '${DB_USER}'@'localhost';
GRANT ALL PRIVILEGES ON dborox.* TO '${DB_USER}'@'127.0.0.1';
GRANT ALL PRIVILEGES ON dborox.* TO '${DB_USER}'@'localhost';
FLUSH PRIVILEGES;
SQL

# Disposable development Guest. Reuses the original sample account/character so
# all vocation/outfit/server-specific columns remain compatible with the mod.
mariadb -uroot dborox <<'SQL'
UPDATE accounts
SET name='guest', password=SHA1('guest'), premdays=65535
WHERE id=1;
UPDATE players
SET name='Guest', account_id=1, online=0, lastlogin=0, posx=655, posy=399, posz=7, town_id=1
WHERE id=3;
SQL

echo "[db] Guest ready"

# Modern MariaDB authenticates local root over a Unix socket. TFS connects over
# TCP, so point the legacy config at the dedicated local game account.
sed -i -E "s|^[[:space:]]*sqlUser[[:space:]]*=.*$|sqlUser = \"${DB_USER}\"|" "$SERVER/config.lua"
sed -i -E 's|^[[:space:]]*sqlPass[[:space:]]*=.*$|sqlPass = ""|' "$SERVER/config.lua"
echo "[db] effective TFS DB settings:"
grep -E '^[[:space:]]*(sqlHost|sqlUser|sqlDatabase)[[:space:]]*=' "$SERVER/config.lua" || true

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
