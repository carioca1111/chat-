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

WORKDIR /app
COPY dbo-rox-server/package.json ./package.json
RUN npm install --omit=dev

COPY dbo-rox-server/prepare-server.mjs ./prepare-server.mjs
RUN node prepare-server.mjs

# The original DBO Rox package ships the TFS 0.4 source. Build that source on
# Linux so the gameplay/data/scripts remain the original mod rather than a rewrite.
RUN cd /app/source && \
    chmod +x configure && \
    ./configure --enable-mysql && \
    make -j2 && \
    BIN="$(find . -maxdepth 2 -type f -executable \( -name 'theforgottenserver' -o -name 'TheForgottenServer' \) | head -n1)" && \
    test -n "$BIN" && \
    cp "$BIN" /app/runtime/server/theforgottenserver && \
    chmod +x /app/runtime/server/theforgottenserver

COPY dbo-rox-server/bridge.mjs ./bridge.mjs
COPY dbo-rox-server/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV GAME_HOST=127.0.0.1
ENV GAME_PORT=7172
EXPOSE 10000

CMD ["./start.sh"]
