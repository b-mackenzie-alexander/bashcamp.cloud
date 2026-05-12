FROM rockylinux:9

# Tell systemd it is running inside a container
ENV container=docker

# Remove the dnf "nodocs" flag from the rockylinux:9 base image, then reinstall
# pre-existing packages to restore their stripped man pages. Without this,
# man ls, man tar, etc. return "no entry".
# --allowerasing replaces curl-minimal (pre-installed in rockylinux:9 base) with full curl
# EPEL is enabled first to provide hwinfo, lsscsi, wireshark-cli, and mtr.
# e2fsprogs is reinstalled to restore chattr/lsattr man pages.
RUN sed -i '/^tsflags/d' /etc/dnf/dnf.conf \
  && dnf install -y epel-release \
  && dnf reinstall -y coreutils tar gzip grep findutils util-linux e2fsprogs \
  && dnf install -y --allowerasing \
    # systemd and service infrastructure
    systemd \
    dbus \
    cronie \
    rsyslog \
    # sysadmin tools
    vim \
    nano \
    less \
    curl \
    wget \
    net-tools \
    iproute \
    man-db \
    man-pages \
    coreutils-common \
    bash-completion \
    # user and privilege management
    sudo \
    shadow-utils \
    polkit \
    # archiving and compression (Linux+ exam objectives)
    tar \
    cpio \
    gzip \
    bzip2 \
    xz \
    zip \
    unzip \
    # access control and file management (Linux+ exam objectives)
    acl \
    at \
    diffutils \
    rsync \
    # additional realistic tooling
    procps-ng \
    lsof \
    iputils \
    bind-utils \
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
    mtr \
    ethtool \
    wireshark-cli \
  && dnf clean all

# Mask units that cannot function in a container.
# systemd-logind is intentionally NOT masked — required for su, sudo, and polkit.
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
    sys-kernel-config.mount

# sr_sysadmin is the student-facing shell user for all lab sessions.
# Password is intentionally simple and documented in scenario READMEs — these
# containers are throwaway and only reachable through the authenticated ttyd path.
# Rocky uses the full path — /sbin/init is not guaranteed to be a symlink here
RUN useradd -m -s /bin/bash sr_sysadmin \
  && echo 'sr_sysadmin:BashcampAdmin1!' | chpasswd \
  && usermod -aG wheel sr_sysadmin \
  && echo "sr_sysadmin ALL=(ALL) NOPASSWD: ALL" > /etc/sudoers.d/sr_sysadmin \
  && chmod 440 /etc/sudoers.d/sr_sysadmin \
  && visudo -cf /etc/sudoers.d/sr_sysadmin

ENTRYPOINT ["/usr/lib/systemd/systemd"]
