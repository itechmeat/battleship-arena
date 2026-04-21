# S1b Host Bootstrap Runbook

This runbook is the S1b handover contract. S1a is complete without a live host. S1b only resolves the named placeholders `EMAIL_PLACEHOLDER`, `<staging-domain>`, and `OFFHOST_PLACEHOLDER` and records the choices below.

## Irreversible decisions

| Decision                    | Value to record in S1b |
| --------------------------- | ---------------------- |
| Cloud provider              | `[fill in during S1b]` |
| Region                      | `[fill in during S1b]` |
| VPS size                    | `[fill in during S1b]` |
| Staging domain              | `[fill in during S1b]` |
| Staging public URL          | `[fill in during S1b]` |
| ACME email                  | `[fill in during S1b]` |
| DNS provider                | `[fill in during S1b]` |
| Off-host backup target host | `[fill in during S1b]` |
| Off-host backup target path | `[fill in during S1b]` |
| Deploy user name on host    | `battleship-deploy`    |

## Path model

- `/opt/battleship-arena/` is the checked-out repository root and the future production deploy root.
- `/opt/battleship-arena/backend/dist/` is the production backend dist target.
- `/opt/battleship-arena-staging/backend/dist/` is the staging backend dist target.
- `/var/www/battleship-arena/web/` is the production web root.
- `/var/www/battleship-arena-staging/web/` is the staging web root.
- `/var/www/battleship-arena/maintenance.html` is the shared hard-maintenance page.
- `/var/lib/battleship-arena/project.db` is the production SQLite file.
- `/var/lib/battleship-arena-staging/project-staging.db` is the staging SQLite file.
- `/var/backups/battleship-arena/` is the shared local snapshot directory.
- `/etc/battleship-arena/maintenance.on` is the hard-maintenance flag file.

## User and ownership model

- `battleship` is the runtime identity for backend and backup units.
- `battleship-deploy` owns the rsync targets and is the SSH identity used by GitHub Actions.
- `www-data` is the Caddy runtime group for web and maintenance assets.

Narrow sudoers contract for `battleship-deploy`:

```text
battleship-deploy ALL=(root) NOPASSWD: /usr/bin/systemctl restart battleship-arena-staging.service, /usr/bin/touch /etc/battleship-arena/maintenance.on, /usr/bin/rm -f /etc/battleship-arena/maintenance.on
```

## GitHub secrets and variables

| Setting                        | Purpose                                                              |
| ------------------------------ | -------------------------------------------------------------------- |
| `secrets.STAGING_SSH_KEY`      | Private key used by the deploy workflow for rsync and SSH            |
| `vars.STAGING_SSH_HOST`        | SSH and rsync target host; may be an IP address                      |
| `vars.STAGING_SSH_KNOWN_HOSTS` | Known-hosts entry written into `~/.ssh/known_hosts`                  |
| `vars.STAGING_PUBLIC_URL`      | Full HTTPS URL used for the post-deploy health poll                  |
| `vars.STAGING_DEPLOY_ENABLED`  | The only gate switch; deploy is enabled only when this equals `true` |

## Ordered S1b steps

1. Provision the VPS, record the cloud provider, region, and VPS size in the table above.
2. Decide the staging hostname, DNS provider, ACME email, and off-host backup destination, then record them in the same table.
3. Replace `EMAIL_PLACEHOLDER` in [infra/Caddyfile](../../infra/Caddyfile) and replace `<staging-domain>` in [infra/Caddyfile](../../infra/Caddyfile) with the chosen hostname.
4. Replace `OFFHOST_PLACEHOLDER` in [infra/scripts/offhost-rsync.sh](../../infra/scripts/offhost-rsync.sh) with the final off-host rsync target.
5. Run [infra/scripts/host-bootstrap.sh](../../infra/scripts/host-bootstrap.sh) on the host from the checked-out repository root.
6. Install the narrow sudoers entry for `battleship-deploy` exactly as written above.
7. Generate the SSH keypair for `battleship-deploy`, register the public key on the host, and populate `secrets.STAGING_SSH_KEY` and `vars.STAGING_SSH_KNOWN_HOSTS`.
8. Populate `vars.STAGING_SSH_HOST` and `vars.STAGING_PUBLIC_URL` with the recorded values.
9. Flip `vars.STAGING_DEPLOY_ENABLED` to `true`, then trigger or wait for the next `deploy-staging.yml` run.
10. Confirm one successful off-host rsync run and record the resolved target host and path in this document.
11. Reboot the host, verify the staging service and both timers come back active, and record the result in `docs/ops/reboot-drill-<date>.md`.

S1b is done only when every step above has a recorded outcome and the reboot drill artifact exists.
