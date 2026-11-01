FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake libtool pkg-config ca-certificates git \
    libboost-all-dev libgmp-dev zlib1g-dev libxml2-dev liblua5.1-0-dev \
    libssl-dev default-libmysqlclient-dev mariadb-server mariadb-client \
    libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

# TFS 0.4 predates modern Boost releases and checks for the old Boost TR1
# wrapper headers. Debian 12 still ships the GCC TR1 headers, so expose small
# compatibility wrappers instead of modifying the DBO Rox gameplay source.
RUN mkdir -p /usr/include/boost/tr1 && \
    printf '#pragma once\n#include <tr1/unordered_set>\n' > /usr/include/boost/tr1/unordered_set.hpp && \
    printf '#pragma once\n#include <tr1/unordered_map>\n' > /usr/include/boost/tr1/unordered_map.hpp

RUN useradd --system --create-home --shell /bin/bash otserver

WORKDIR /app
COPY dbo-rox-server/package.json ./package.json
RUN npm install --omit=dev

COPY dbo-rox-server/prepare-server.mjs ./prepare-server.mjs
RUN node prepare-server.mjs

# Regenerate the 2010-era autotools helper files with the toolchain available
# on Debian 12. The native OTServ pool allocator is enabled because this old
# server creates millions of small map/tile/item objects and the 512 MiB free
# Render instance otherwise exhausts memory while loading the 2000x2000 map.
RUN cd /app/source && \
    autoreconf -fiv && \
    chmod +x configure && \
    ./configure --enable-mysql --enable-otserv-allocator && \
    make -j2 && \
    BIN="$(find . -maxdepth 2 -type f -executable \( -name 'theforgottenserver' -o -name 'TheForgottenServer' \) | head -n1)" && \
    test -n "$BIN" && \
    cp "$BIN" /app/runtime/server/theforgottenserver && \
    chmod +x /app/runtime/server/theforgottenserver && \
    chown -R otserver:otserver /app/runtime/server

# Keep jemalloc available for diagnostics/future use, though the current
# memory-critical boot path relies on the native OTServ allocator only.
RUN apt-get update && apt-get install -y --no-install-recommends libjemalloc2 && \
    rm -rf /var/lib/apt/lists/*

# Render requires a public port during startup. Build the listener statically
# so it does not map glibc shared libraries while the 2000x2000 map is at peak RAM.
COPY dbo-rox-server/boot-listener.c ./boot-listener.c
RUN gcc -Os -static -s ./boot-listener.c -o /usr/local/bin/dbo-boot-listener

COPY dbo-rox-server/bridge.mjs ./bridge.mjs
COPY dbo-rox-server/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV GAME_HOST=127.0.0.1
ENV GAME_PORT=7172
EXPOSE 10000

CMD ["./start.sh"]
