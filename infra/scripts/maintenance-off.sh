#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID:-$(id -u)}" -ne 0 ]]; then
	echo "maintenance-off.sh must be run as root to remove /etc/battleship-arena/maintenance.on" >&2
	exit 1
fi

# Disable hard maintenance mode by removing the shared Caddy flag file.

rm -f /etc/battleship-arena/maintenance.on
