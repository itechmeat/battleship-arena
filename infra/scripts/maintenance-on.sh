#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
	echo "maintenance-on.sh must be run as root to manage /etc/battleship-arena/maintenance.on" >&2
	exit 1
fi

# Enable hard maintenance mode by creating the shared flag file consumed by Caddy.

install -d -m 0750 /etc/battleship-arena
touch /etc/battleship-arena/maintenance.on
