# Based on v86's tools/docker/alpine/Dockerfile at d96be77.
FROM docker.io/i386/alpine:3.21

ENV KERNEL=virt

RUN apk add --no-cache openrc alpine-base agetty alpine-conf linux-$KERNEL linux-firmware-none \
      nano vim python3 git mandoc man-pages tree htop

RUN sed -i 's/getty 38400 tty1/agetty --autologin root tty1 linux/' /etc/inittab \
 && echo 'ttyS0::respawn:/sbin/agetty --autologin root -s ttyS0 115200 vt100' >> /etc/inittab \
 && echo "root:" | chpasswd \
 && setup-hostname localhost

RUN for i in devfs dmesg mdev hwdrivers; do rc-update add $i sysinit; done \
 && for i in hwclock modules sysctl hostname syslog bootmisc; do rc-update add $i boot; done \
 && rc-update add killprocs shutdown

COPY rootfs/ /
RUN chmod +x /usr/local/bin/linuxweb-helper /usr/local/bin/linuxweb-help /etc/init.d/linuxweb-helper \
 && mkdir -p /.linuxweb \
 && rc-update add linuxweb-helper default

RUN mkinitfs -F "base virtio 9p" $(cat /usr/share/kernel/$KERNEL/kernel.release)
