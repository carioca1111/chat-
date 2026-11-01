FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential autoconf automake libtool pkg-config ca-certificates git \
    libboost-all-dev libgmp-dev zlib1g-dev libxml2-dev liblua5.1-0-dev \
    libssl-dev default-libmysqlclient-dev mariadb-server mariadb-client \
    libsqlite3-dev && \
    rm -rf /var/lib/apt/lists/*

# Keep the browser/runtime stack amd64, but add i386 development/runtime libs
# solely for TFS. This 2010-era server is extremely pointer-heavy; a 32-bit
# address model substantially reduces the resident size of the 2000x2000 map.
RUN dpkg --add-architecture i386 && \
    apt-get update && apt-get install -y --no-install-recommends \
    g++-multilib libc6:i386 libc6-dev:i386 \
    libboost-thread1.74-dev:i386 libboost-regex1.74-dev:i386 \
    libboost-system1.74-dev:i386 libboost-date-time1.74-dev:i386 \
    libboost-filesystem1.74-dev:i386 \
    libgmp-dev:i386 zlib1g-dev:i386 libxml2-dev:i386 \
    liblua5.1-0-dev:i386 libssl-dev:i386 libmariadb-dev:i386 \
    libsqlite3-dev:i386 && \
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

# Compile only the TFS executable as i386. The rest of the image (Node,
# MariaDB and the native supervisor) stays amd64. The OTServ object allocator
# remains enabled on top of the smaller 32-bit pointer layout.
RUN cd /app/source && \
    autoreconf -fiv && \
    chmod +x configure && \
    PKG_CONFIG_LIBDIR=/usr/lib/i386-linux-gnu/pkgconfig:/usr/share/pkgconfig \
    CXX="g++ -m32" LDFLAGS="-m32" \
    ./configure --enable-mysql --enable-otserv-allocator && \
    make -j2 CXXFLAGS="-pipe -m32" LDFLAGS="-m32" && \
    BIN="$(find . -maxdepth 2 -type f -executable \( -name 'theforgottenserver' -o -name 'TheForgottenServer' \) | head -n1)" && \
    test -n "$BIN" && \
    file "$BIN" && \
    cp "$BIN" /app/runtime/server/theforgottenserver && \
    chmod +x /app/runtime/server/theforgottenserver && \
    chown -R otserver:otserver /app/runtime/server

RUN apt-get update && apt-get install -y --no-install-recommends libjemalloc2 && \
    rm -rf /var/lib/apt/lists/*

# During the map peak, one tiny static process replaces both Bash and the old
# separate health listener. It owns Render's HTTP port, starts TFS, pauses DB,
# detects port 7172, restores DB, then hands the public port to Node/WSS.
COPY dbo-rox-server/boot-supervisor.c ./boot-supervisor.c
RUN gcc -Os -static -s ./boot-supervisor.c -o /usr/local/bin/dbo-boot-supervisor

COPY dbo-rox-server/bridge.mjs ./bridge.mjs
COPY dbo-rox-server/start.sh ./start.sh
RUN chmod +x ./start.sh

ENV GAME_HOST=127.0.0.1
ENV GAME_PORT=7172
EXPOSE 10000

CMD ["./start.sh"]
