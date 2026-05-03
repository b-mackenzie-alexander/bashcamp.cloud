FROM ubuntu:22.04

# Tell systemd it is running inside a container (activates container mode,
# skips host-only initialization that cannot run in a namespaced environment)
ENV DEBIAN_FRONTEND=noninteractive
ENV container=docker

RUN apt-get update && apt-get install -y --no-install-recommends \
    # systemd and service infrastructure
    systemd \
    systemd-sysv \
    dbus \
    cron \
    rsyslog \
    # sysadmin tools
    vim \
    nano \
    less \
    curl \
    wget \
    net-tools \
    iproute2 \
    man-db \
    bash-completion \
    # user and privilege management
    sudo \
    passwd \
    policykit-1 \
    # additional realistic tooling
    procps \
    lsof \
    iputils-ping \
    dnsutils \
    file \
    tree \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Mask units that cannot function in a container.
# systemd-logind is intentionally NOT masked — it is required for su, sudo, and polkit.
RUN systemctl mask \
    getty@tty1.service \
    getty@tty2.service \
    getty@tty3.service \
    getty@tty4.service \
    getty@tty5.service \
    getty@tty6.service \
    serial-getty@.service \
    systemd-remount-fs.service \
    dev-hugepages.mount \
    sys-fs-fuse-connections.mount \
    sys-kernel-config.mount \
    systemd-update-utmp.service \
    systemd-update-utmp-runlevel.service

ENTRYPOINT ["/sbin/init"]
