#define _GNU_SOURCE
#include <arpa/inet.h>
#include <errno.h>
#include <fcntl.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/select.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <time.h>
#include <unistd.h>

static volatile sig_atomic_t running = 1;
static pid_t tfs_pid = -1;
static pid_t bridge_pid = -1;
static pid_t db_safe_pid = -1;
static int listen_fd = -1;

static void on_signal(int sig) {
    (void)sig;
    running = 0;
}

static long long now_ms(void) {
    struct timespec ts;
    clock_gettime(CLOCK_MONOTONIC, &ts);
    return (long long)ts.tv_sec * 1000LL + ts.tv_nsec / 1000000LL;
}

static int tcp_ready(int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return 0;
    struct timeval tv = {0, 100000};
    setsockopt(fd, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));
    setsockopt(fd, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_LOOPBACK);
    addr.sin_port = htons((unsigned short)port);
    int ok = connect(fd, (struct sockaddr *)&addr, sizeof(addr)) == 0;
    close(fd);
    return ok;
}

static int open_listener(int port) {
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return -1;
    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));
    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons((unsigned short)port);
    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0 || listen(fd, 16) < 0) {
        close(fd);
        return -1;
    }
    return fd;
}

static void serve_boot_once(int timeout_ms) {
    if (listen_fd < 0) {
        usleep((useconds_t)timeout_ms * 1000U);
        return;
    }
    fd_set set;
    FD_ZERO(&set);
    FD_SET(listen_fd, &set);
    struct timeval tv;
    tv.tv_sec = timeout_ms / 1000;
    tv.tv_usec = (timeout_ms % 1000) * 1000;
    int r = select(listen_fd + 1, &set, NULL, NULL, &tv);
    if (r <= 0 || !FD_ISSET(listen_fd, &set)) return;
    int client = accept(listen_fd, NULL, NULL);
    if (client < 0) return;
    const char response[] =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Length: 18\r\n"
        "Connection: close\r\n\r\n"
        "DBO Rox booting...\n";
    (void)write(client, response, sizeof(response) - 1);
    close(client);
}

static int child_alive(pid_t pid) {
    if (pid <= 0) return 0;
    int status = 0;
    pid_t r = waitpid(pid, &status, WNOHANG);
    if (r == 0) return 1;
    return 0;
}

static pid_t start_tfs(const char *server_dir) {
    pid_t pid = fork();
    if (pid != 0) return pid;

    struct stat st;
    if (stat("/home/otserver", &st) != 0) _exit(111);
    if (chdir(server_dir) != 0) _exit(112);

    int logfd = open("/tmp/tfs.log", O_CREAT | O_WRONLY | O_TRUNC, 0644);
    if (logfd < 0) _exit(113);
    dup2(logfd, STDOUT_FILENO);
    dup2(logfd, STDERR_FILENO);
    if (logfd > STDERR_FILENO) close(logfd);

    if (setgid(st.st_gid) != 0) _exit(114);
    if (setuid(st.st_uid) != 0) _exit(115);
    execl("./theforgottenserver", "./theforgottenserver", (char *)NULL);
    _exit(116);
}

static int stop_db(void) {
    fprintf(stdout, "[memory] native supervisor pausing MariaDB before map peak\n");
    fflush(stdout);
    int rc = system("mariadb-admin shutdown -uroot >/dev/null 2>&1");
    (void)rc;
    for (int i = 0; i < 80; ++i) {
        if (!tcp_ready(3306)) {
            fprintf(stdout, "[memory] MariaDB stopped; native supervisor owns the peak\n");
            fflush(stdout);
            return 1;
        }
        usleep(100000);
    }
    fprintf(stdout, "[memory] warning: MariaDB still appears reachable\n");
    fflush(stdout);
    return 0;
}

static pid_t start_db(void) {
    pid_t pid = fork();
    if (pid != 0) return pid;
    int logfd = open("/tmp/mariadb.log", O_CREAT | O_WRONLY | O_TRUNC, 0644);
    if (logfd >= 0) {
        dup2(logfd, STDOUT_FILENO);
        dup2(logfd, STDERR_FILENO);
        if (logfd > STDERR_FILENO) close(logfd);
    }
    execlp("mysqld_safe", "mysqld_safe",
        "--datadir=/var/lib/mysql",
        "--bind-address=127.0.0.1",
        "--skip-networking=0",
        "--skip-name-resolve",
        "--performance-schema=OFF",
        "--innodb-buffer-pool-size=8M",
        "--innodb-log-buffer-size=1M",
        "--innodb-flush-method=O_DIRECT",
        "--key-buffer-size=512K",
        "--aria-pagecache-buffer-size=2M",
        "--query-cache-size=0",
        "--table-open-cache=64",
        "--thread-cache-size=0",
        "--host-cache-size=0",
        "--tmp-table-size=1M",
        "--max-heap-table-size=1M",
        "--sort-buffer-size=256K",
        "--read-buffer-size=128K",
        "--read-rnd-buffer-size=256K",
        "--join-buffer-size=128K",
        "--max-connections=5",
        (char *)NULL);
    _exit(121);
}

static pid_t start_bridge(const char *root_dir) {
    pid_t pid = fork();
    if (pid != 0) return pid;
    if (chdir(root_dir) != 0) _exit(131);
    execlp("node", "node", "bridge.mjs", (char *)NULL);
    _exit(132);
}

static void dump_tfs_tail(void) {
    (void)system("tail -n 80 /tmp/tfs.log 2>/dev/null || true");
}

int main(int argc, char **argv) {
    const char *root_dir = argc > 1 ? argv[1] : "/app";
    const char *server_dir = argc > 2 ? argv[2] : "/app/runtime/server";
    const char *port_env = getenv("PORT");
    int public_port = port_env ? atoi(port_env) : 10000;

    signal(SIGTERM, on_signal);
    signal(SIGINT, on_signal);
    signal(SIGPIPE, SIG_IGN);

    listen_fd = open_listener(public_port);
    if (listen_fd < 0) {
        perror("[supervisor] bind public port");
        return 2;
    }
    fprintf(stdout, "[supervisor] static native boot supervisor on :%d\n", public_port);
    fflush(stdout);

    tfs_pid = start_tfs(server_dir);
    if (tfs_pid <= 0) return 3;
    fprintf(stdout, "[supervisor] TFS pid %d; native OTServ allocator active\n", (int)tfs_pid);
    fflush(stdout);

    long long start = now_ms();
    int db_paused = 0;
    int game_ready = 0;

    while (running && !game_ready) {
        if (!child_alive(tfs_pid)) {
            fprintf(stdout, "[supervisor] TFS exited during boot\n");
            dump_tfs_tail();
            return 4;
        }

        long long elapsed = now_ms() - start;
        if (!db_paused && elapsed >= 4000) {
            db_paused = stop_db();
        }

        if (tcp_ready(7172)) {
            game_ready = 1;
            break;
        }
        serve_boot_once(100);
    }

    if (!running) goto shutdown;

    fprintf(stdout, "[tfs] game port 7172 ready\n");
    dump_tfs_tail();

    if (db_paused) {
        fprintf(stdout, "[memory] map finished; restarting MariaDB\n");
        fflush(stdout);
        db_safe_pid = start_db();
        int ready = 0;
        for (int i = 0; i < 120 && running; ++i) {
            if (tcp_ready(3306)) { ready = 1; break; }
            serve_boot_once(100);
        }
        if (!ready) {
            fprintf(stdout, "[db] MariaDB failed to return after map load\n");
            goto shutdown;
        }
        fprintf(stdout, "[db] MariaDB reachable again\n");
        fflush(stdout);
    }

    close(listen_fd);
    listen_fd = -1;
    usleep(250000);

    bridge_pid = start_bridge(root_dir);
    if (bridge_pid <= 0) goto shutdown;
    fprintf(stdout, "[bridge] Node websocket bridge pid %d started after map load\n", (int)bridge_pid);
    fflush(stdout);

    while (running) {
        if (!child_alive(tfs_pid)) {
            fprintf(stdout, "[supervisor] TFS stopped\n");
            dump_tfs_tail();
            break;
        }
        if (!child_alive(bridge_pid)) {
            fprintf(stdout, "[supervisor] websocket bridge stopped\n");
            break;
        }
        sleep(1);
    }

shutdown:
    if (listen_fd >= 0) close(listen_fd);
    if (bridge_pid > 0) kill(bridge_pid, SIGTERM);
    if (tfs_pid > 0) kill(tfs_pid, SIGTERM);
    if (db_safe_pid > 0) kill(db_safe_pid, SIGTERM);
    return 0;
}
