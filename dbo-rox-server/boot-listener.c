#include <arpa/inet.h>
#include <errno.h>
#include <signal.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/socket.h>
#include <unistd.h>

static volatile sig_atomic_t running = 1;

static void stop_handler(int sig) {
    (void)sig;
    running = 0;
}

int main(void) {
    const char *port_env = getenv("PORT");
    int port = port_env ? atoi(port_env) : 10000;
    int fd = socket(AF_INET, SOCK_STREAM, 0);
    if (fd < 0) return 1;

    int yes = 1;
    setsockopt(fd, SOL_SOCKET, SO_REUSEADDR, &yes, sizeof(yes));

    struct sockaddr_in addr;
    memset(&addr, 0, sizeof(addr));
    addr.sin_family = AF_INET;
    addr.sin_addr.s_addr = htonl(INADDR_ANY);
    addr.sin_port = htons((unsigned short)port);

    if (bind(fd, (struct sockaddr *)&addr, sizeof(addr)) < 0) {
        perror("boot-listener bind");
        close(fd);
        return 2;
    }
    if (listen(fd, 16) < 0) {
        perror("boot-listener listen");
        close(fd);
        return 3;
    }

    signal(SIGTERM, stop_handler);
    signal(SIGINT, stop_handler);
    fprintf(stdout, "[boot] tiny HTTP listener on :%d while TFS loads\n", port);
    fflush(stdout);

    const char response[] =
        "HTTP/1.1 200 OK\r\n"
        "Content-Type: text/plain\r\n"
        "Content-Length: 18\r\n"
        "Connection: close\r\n"
        "\r\n"
        "DBO Rox booting...\n";

    while (running) {
        int client = accept(fd, NULL, NULL);
        if (client < 0) {
            if (errno == EINTR) continue;
            break;
        }
        (void)write(client, response, sizeof(response) - 1);
        close(client);
    }

    close(fd);
    return 0;
}
