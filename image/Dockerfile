# Based on v86's tools/docker/alpine/Dockerfile at d96be77.
FROM docker.io/i386/alpine:3.21

ENV KERNEL=virt

RUN apk add --no-cache openrc alpine-base agetty alpine-conf linux-$KERNEL linux-firmware-none \
      nano vim python3 git mandoc man-pages tree htop

# Network Edition toolset (network spec section 3).
RUN apk add --no-cache \
      bash bash-completion coreutils util-linux findutils gawk less file which btop ncdu lsof strace tmux fastfetch sudo \
      zsh fish neovim micro mc \
      bat ripgrep fd fzf eza \
      curl wget openssh-client-default bind-tools iproute2 iputils traceroute nmap netcat-openbsd whois w3m \
      build-base nasm gdb valgrind cmake meson ninja-build \
      py3-pip nodejs npm lua5.4 sqlite jq postgresql17 \
      zip unzip xz \
      cmatrix sl figlet

RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab \
 && echo 'ttyS0::respawn:/sbin/agetty --autologin root -s ttyS0 115200 vt100' >> /etc/inittab \
 && echo "root:" | chpasswd \
 && sed -i 's#^root:x:0:0:root:/root:/bin/sh$#root:x:0:0:root:/root:/bin/bash#' /etc/passwd \
 && grep -q '^root:x:0:0:root:/root:/bin/bash$' /etc/passwd \
 && setup-hostname localhost

RUN for i in devfs dmesg mdev hwdrivers; do rc-update add $i sysinit; done \
 && for i in hwclock modules sysctl hostname syslog bootmisc; do rc-update add $i boot; done \
 && rc-update add killprocs shutdown

# The helper subtracts this list from /etc/apk/world to find packages a visitor added.
RUN mkdir -p /usr/local/share/linuxweb && sort -u /etc/apk/world > /usr/local/share/linuxweb/base-world

COPY rootfs/ /
RUN chmod +x /usr/local/bin/linuxweb-helper /usr/local/bin/linuxweb-help /etc/init.d/linuxweb-helper \
 && mkdir -p /.linuxweb \
 && rc-update add linuxweb-helper default

RUN mkinitfs -F "base virtio 9p" $(cat /usr/share/kernel/$KERNEL/kernel.release)
