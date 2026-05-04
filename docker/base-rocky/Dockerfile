FROM rockylinux:9

# Tell systemd it is running inside a container
ENV container=docker

# --allowerasing replaces curl-minimal (pre-installed in rockylinux:9 base) with full curl
RUN dnf install -y --allowerasing \
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
    bash-completion \
    # user and privilege management
    sudo \
    shadow-utils \
    polkit \
    # additional realistic tooling
    procps-ng \
    lsof \
    iputils \
    bind-utils \
    file \
    tree \
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

# Rocky uses the full path — /sbin/init is not guaranteed to be a symlink here
RUN useradd -m -s /bin/bash sr_sysadmin \
  && echo "sr_sysadmin:BashcampAdmin1!" | chpasswd \
  && usermod -aG wheel sr_sysadmin

ENTRYPOINT ["/usr/lib/systemd/systemd"]
