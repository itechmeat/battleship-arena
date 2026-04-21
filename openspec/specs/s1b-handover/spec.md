# s1b-handover Specification

## Purpose

TBD - created by archiving change s1a-bootstrap. Update Purpose after archive.

## Requirements

### Requirement: Host bootstrap runbook enumerates irreversible operator decisions

`docs/ops/host-bootstrap.md` SHALL exist under version control at the end of S1a and MUST enumerate every irreversible operator decision that S1b is required to record before any live infrastructure is created. The decision list MUST include: cloud provider and region, VPS size, staging domain, staging public URL, ACME email for Let's Encrypt, DNS provider, off-host backup target host, off-host backup target path, and deploy user name on the host. Each decision MUST appear as a fillable slot in the document so that S1b fills values into the runbook itself and the completed runbook becomes the audit record of what was chosen.

#### Scenario: An operator reads the runbook before provisioning a VPS

- WHEN an operator opens `docs/ops/host-bootstrap.md` prior to executing S1b
- THEN every irreversible decision listed above is present as a fillable slot with no value assumed by S1a
- AND no decision is committed to a silent default that would be hard to reverse after provisioning

#### Scenario: S1b completes the runbook with recorded choices

- WHEN S1b finishes provisioning and edits `docs/ops/host-bootstrap.md` to record the chosen values
- THEN the completed document contains one resolved value for every decision slot
- AND the document itself is the single source of truth for what was chosen

### Requirement: Host bootstrap runbook documents the on-host path model

The runbook MUST document the complete on-host filesystem layout that the committed infra artifacts assume. The documented path model MUST include `/opt/battleship-arena/` as the checked-out repository root and the S4 prod backend dist target, `/opt/battleship-arena-staging/backend/dist/` as the staging backend rsync target, `/var/www/battleship-arena-staging/web/` as the staging web root, `/var/www/battleship-arena/maintenance.html` as the hard-maintenance page location, `/var/lib/battleship-arena-staging/project-staging.db` as the staging SQLite file, `/var/backups/battleship-arena/` as the local snapshot directory shared between prod and staging, and `/etc/battleship-arena/maintenance.on` as the hard-maintenance flag file.

#### Scenario: An operator verifies a host layout against the runbook

- WHEN an operator reads the path model section of `docs/ops/host-bootstrap.md`
- THEN every path that any committed systemd unit, Caddy vhost, or ops script references on the host appears in the documented list
- AND the documented location matches what the matching infra artifact assumes at runtime

### Requirement: Host bootstrap runbook documents the user and ownership model

The runbook MUST document the three host identities the committed infra assumes: `battleship` as the runtime user for the backend systemd units, `battleship-deploy` as the CI deploy identity that owns the rsync targets, and `www-data` as the Caddy runtime user. For `battleship-deploy` the runbook MUST record the exact narrow sudoers contract that the deploy workflow relies on: permission to run `systemctl restart battleship-arena-staging.service`, `touch /etc/battleship-arena/maintenance.on`, and `rm -f /etc/battleship-arena/maintenance.on`, with no broader privilege grant.

#### Scenario: Operator reviews the sudoers entry before installing it

- WHEN the operator reaches the sudoers step in the runbook
- THEN the exact command list that `battleship-deploy` may run as root is written verbatim in the runbook
- AND no command outside that list is authorized for the deploy identity

#### Scenario: CI deploy identity performs an rsync

- WHEN the `deploy-staging.yml` workflow rsyncs a build artifact as `battleship-deploy`
- THEN no sudo is required for the rsync itself because the deploy identity owns the rsync target directories per the documented ownership model

### Requirement: Host bootstrap runbook lists the GitHub secrets and variables inventory

The runbook MUST list every GitHub Actions secret and repository variable that S1b is required to populate before the staging deploy can run. The inventory MUST include `secrets.STAGING_SSH_KEY`, `vars.STAGING_SSH_HOST`, `vars.STAGING_SSH_KNOWN_HOSTS`, `vars.STAGING_PUBLIC_URL`, and `vars.STAGING_DEPLOY_ENABLED`. The runbook MUST identify `vars.STAGING_DEPLOY_ENABLED` as the single repository-variable switch that promotes the workflow from gate-disabled to gate-enabled; no other setting is permitted to change the deploy gate state.

#### Scenario: S1b populates the secrets and variables

- WHEN an operator executes the S1b steps in the runbook
- THEN the runbook gives an explicit checklist of the five GitHub settings to populate
- AND the operator does not need to hunt through workflow files to discover which names are load-bearing

#### Scenario: Operator flips the deploy gate

- WHEN the operator sets `vars.STAGING_DEPLOY_ENABLED` to `"true"`
- THEN the next `deploy-staging.yml` run writes `### Deploy gate: ENABLED` to its step summary and runs the gated steps
- AND no other variable or secret is consulted to decide whether the gate is open

### Requirement: Host bootstrap runbook specifies the ordered S1b steps and the reboot drill

The runbook MUST present the S1b bootstrap procedure as an ordered sequence of steps, starting at VPS provisioning and ending at a recorded reboot drill. The ordered sequence MUST include placeholder replacement in `Caddyfile`, execution of `infra/scripts/host-bootstrap.sh`, installation of the narrow sudoers file, SSH deploy-key generation and registration, population of the `STAGING_SSH_HOST`, `STAGING_SSH_KNOWN_HOSTS`, and `STAGING_PUBLIC_URL` variables, flipping `vars.STAGING_DEPLOY_ENABLED` to `"true"`, a first off-host rsync run, and a reboot drill whose outcome is recorded at `docs/ops/reboot-drill-<date>.md`. The runbook MUST declare that S1b is done only when every step has a recorded outcome.

#### Scenario: A fresh operator runs S1b end-to-end

- WHEN a fresh operator follows `docs/ops/host-bootstrap.md` top to bottom
- THEN the steps are executable in the order written without requiring an out-of-band decision
- AND the final state is a reachable staging URL with an enabled deploy gate

#### Scenario: Reboot drill is recorded

- WHEN S1b completes the reboot drill
- THEN a `docs/ops/reboot-drill-<date>.md` file is created with a short log of which services came back active
- AND the runbook references that file as the artifact proving the reboot drill passed

### Requirement: Version log exists from the start of S1a and records resolved pinned versions

`docs/ops/version-log-2026-04-20.md` MUST exist before any dependency is installed in S1a (created during Pre-task 0) and MUST record, for every dependency pinned by `docs/spec.md` section 2, the floor version from the spec, the resolved exact version selected at S1a implementation time, and the source-of-truth URL consulted to select it. Every resolved value MUST be greater than or equal to the corresponding floor. The log MUST be committed alongside the first repo-chrome commit so the audit record lands with the code that consumed it.

#### Scenario: A reviewer audits a pinned dependency

- WHEN a reviewer inspects `docs/ops/version-log-2026-04-20.md`
- THEN every pinned dependency in `docs/spec.md` section 2 has a row with floor, resolved version, and source-of-truth URL
- AND every resolved value satisfies `resolved >= floor`

#### Scenario: A lookup returns a value below the floor

- WHEN the version log would record a resolved value that is below the spec floor
- THEN the log is not committed in that state and the discrepancy is raised before S1a proceeds
- AND no install is executed against the violating version

### Requirement: Version log is append-only history

The version log MUST be treated as a living audit record. Later S1a dependency bumps and S1b provisioning decisions MUST NOT rewrite the historical rows of `docs/ops/version-log-2026-04-20.md`; they MUST either extend the existing log with new rows or land a new dated log file alongside it. The handover contract forbids back-editing previously recorded versions so that any future reviewer can reconstruct what was pinned on each dated slice.

#### Scenario: A later bump changes a pinned version

- WHEN a dependency is bumped after the initial S1a commit
- THEN the change extends the existing version log or creates a new dated log file
- AND no previously recorded row is silently overwritten

#### Scenario: S1b provisioning records host-side versions

- WHEN S1b pins host-side tooling such as Caddy or Bun on the VPS
- THEN the decision is appended to the version log trail rather than replacing the S1a entry

### Requirement: Handover contract makes S1a idempotent with respect to S1b

The handover contract between S1a and S1b MUST guarantee that S1a is complete without any live host, and that S1b only needs to act on named placeholders. No S1a step MAY assume a host exists, and no S1b step MAY require editing S1a code outside the placeholders explicitly enumerated in the runbook: `EMAIL_PLACEHOLDER` in `Caddyfile`, `<staging-domain>` in `Caddyfile` and workflows, and `OFFHOST_PLACEHOLDER` in `offhost-rsync.sh`. The runbook MUST make this contract explicit so S1b never rewrites unrelated S1a artifacts.

#### Scenario: S1a merges before any VPS is provisioned

- WHEN S1a is merged to `main`
- THEN every S1a artifact is valid and verifiable locally and in CI without a live host
- AND the `deploy` job in `deploy-staging.yml` runs but writes `### Deploy gate: DISABLED` and skips the actual deploy steps

#### Scenario: S1b resolves only named placeholders

- WHEN S1b edits committed files to bring the deploy path online
- THEN the only edits required are replacements of `EMAIL_PLACEHOLDER`, `<staging-domain>`, and `OFFHOST_PLACEHOLDER`
- AND no other S1a code is rewritten to satisfy S1b's requirements
