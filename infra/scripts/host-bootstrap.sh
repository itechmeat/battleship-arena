#!/usr/bin/env bash
set -euo pipefail

# Provision host users, directories, maintenance page, and unit files for the S1b host bootstrap.

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"

ensure_group() {
  local group_name="$1"
  if ! getent group "$group_name" >/dev/null; then
    groupadd --system "$group_name"
  fi
}

ensure_user() {
  local user_name="$1"
  shift
  if ! id -u "$user_name" >/dev/null 2>&1; then
    useradd "$@" "$user_name"
  fi
}

ensure_group battleship
ensure_user battleship --system --gid battleship --home-dir /nonexistent --shell /usr/sbin/nologin
ensure_user battleship-deploy --system --create-home --home-dir /home/battleship-deploy --shell /bin/bash

usermod -a -G battleship,www-data battleship-deploy

install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena/backend/dist
install -d -o battleship-deploy -g battleship -m 2750 /opt/battleship-arena-staging/backend/dist

install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena/web
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena-staging
install -d -o battleship-deploy -g www-data -m 2755 /var/www/battleship-arena-staging/web

install -d -o battleship -g battleship -m 0750 /var/lib/battleship-arena
install -d -o battleship -g battleship -m 0750 /var/lib/battleship-arena-staging
install -d -o battleship -g battleship -m 0750 /var/backups/battleship-arena
install -d -o battleship -g battleship -m 0750 /etc/battleship-arena

install -o battleship-deploy -g www-data -m 0644 "$REPO_ROOT/infra/maintenance.html" /var/www/battleship-arena/maintenance.html

install -o root -g root -m 0644 "$REPO_ROOT/infra/systemd/battleship-arena.service" /etc/systemd/system/battleship-arena.service
install -o root -g root -m 0644 "$REPO_ROOT/infra/systemd/battleship-arena-staging.service" /etc/systemd/system/battleship-arena-staging.service
install -o root -g root -m 0644 "$REPO_ROOT/infra/systemd/battleship-backup.service" /etc/systemd/system/battleship-backup.service
install -o root -g root -m 0644 "$REPO_ROOT/infra/systemd/battleship-backup.timer" /etc/systemd/system/battleship-backup.timer
install -o root -g root -m 0644 "$REPO_ROOT/infra/systemd/battleship-offhost-rsync.service" /etc/systemd/system/battleship-offhost-rsync.service
install -o root -g root -m 0644 "$REPO_ROOT/infra/systemd/battleship-offhost-rsync.timer" /etc/systemd/system/battleship-offhost-rsync.timer

systemctl daemon-reload
systemctl enable battleship-arena.service
systemctl enable battleship-arena-staging.service
systemctl enable battleship-backup.timer
systemctl enable battleship-offhost-rsync.timer
