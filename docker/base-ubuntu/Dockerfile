FROM ubuntu:22.04

# Tell systemd it is running inside a container (activates container mode,
# skips host-only initialization that cannot run in a namespaced environment)
ENV DEBIAN_FRONTEND=noninteractive
ENV container=docker

# Enable the universe repo (provides nmap, lsscsi, hwinfo, tshark, traceroute, etc.)
RUN echo "deb http://archive.ubuntu.com/ubuntu jammy universe" >> /etc/apt/sources.list \
  && echo "deb http://archive.ubuntu.com/ubuntu jammy-updates universe" >> /etc/apt/sources.list

# Remove the dpkg config that strips man pages from the ubuntu:22.04 base image,
# then reinstall pre-existing packages to restore their stripped pages before
# installing our own. Without this, man ls, man tar, etc. return "no entry".
# e2fsprogs is reinstalled here to restore chattr/lsattr man pages.
RUN rm -f /etc/dpkg/dpkg.cfg.d/excludes \
  && apt-get update \
  && apt-get install -y --reinstall coreutils tar gzip grep findutils util-linux e2fsprogs \
  && apt-get install -y --no-install-recommends \
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
    manpages \
    manpages-posix \
    bash-completion \
    # user and privilege management
    sudo \
    passwd \
    policykit-1 \
    # archiving and compression (Linux+ exam objectives)
    tar \
    cpio \
    gzip \
    bzip2 \
    xz-utils \
    zip \
    unzip \
    # access control and file management (Linux+ exam objectives)
    acl \
    at \
    diffutils \
    rsync \
    # additional realistic tooling
    procps \
    lsof \
    iputils-ping \
    dnsutils \
    file \
    tree \
    # hardware and storage inspection (Linux+ exam objectives)
    # lsattr/chattr already present via e2fsprogs (reinstalled above for man pages)
    lsscsi \
    hwinfo \
    # networking tools (Linux+ exam objectives; also required for networking scenarios)
    tcpdump \
    nmap \
    nftables \
    iptables \
    traceroute \
    mtr-tiny \
    ethtool \
    tshark \
  && if [ -x /usr/bin/man.REAL ]; then mv /usr/bin/man.REAL /usr/bin/man; fi \
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

# sr_sysadmin is the student-facing shell user for all lab sessions.
# Password is intentionally simple and documented in scenario READMEs — these
# containers are throwaway and only reachable through the authenticated ttyd path.
RUN useradd -m -s /bin/bash sr_sysadmin \
  && echo 'sr_sysadmin:BashcampAdmin1!' | chpasswd \
  && usermod -aG sudo sr_sysadmin \
  && echo "sr_sysadmin ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/sr_sysadmin \
  && chmod 440 /etc/sudoers.d/sr_sysadmin \
  && visudo -cf /etc/sudoers.d/sr_sysadmin

ENTRYPOINT ["/sbin/init"]
