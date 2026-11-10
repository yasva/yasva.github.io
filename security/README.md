# secure-by-default: a reusable security pipeline

One GitHub Actions workflow that any repository can call to get four checks:

| Check | Tool | What it looks for | Blocks the merge when |
|-------|------|-------------------|-----------------------|
| Secrets | gitleaks | API keys, tokens, private keys in the code **and the whole git history** | any secret is found |
| SAST | Semgrep | insecure code patterns (XSS, injection, `eval`, weak crypto, ...) | a rule with severity `ERROR` matches |
| Dependencies and containers | Trivy | known CVEs in lockfiles and container images, insecure Dockerfiles / IaC | a HIGH or CRITICAL CVE **that has a fix** is found |
| SBOM | Syft | a list of every package (SPDX + CycloneDX), saved as a build artifact | never (inventory, not a gate) |

Everything that is found, blocking or not, goes to the repository's
**Security → Code scanning** tab and shows up as annotations on the pull request.

Files:

- [`.github/workflows/secure-by-default.yml`](../.github/workflows/secure-by-default.yml): the reusable workflow
- [`.github/workflows/security.yml`](../.github/workflows/security.yml): this repo calling it
- [`.github/workflows/security-selftest.yml`](../.github/workflows/security-selftest.yml): proves each scanner still detects planted problems
- [`TRADEOFFS.md`](TRADEOFFS.md): what I turned off, why, and how to stop developers from turning it all off
- [`THREAT-MODEL-MCP.md`](THREAT-MODEL-MCP.md): bonus, a short threat model for an AI agent with MCP tools

## How to use it from another repository

```yaml
# .github/workflows/security.yml in the calling repo
name: security
on:
  pull_request:
  push:
    branches: [main]
  schedule:
    - cron: "17 5 * * 1" # weekly: new CVEs appear without code changes
permissions: {}
jobs:
  security:
    uses: yasva/yasva.github.io/.github/workflows/secure-by-default.yml@<full-commit-sha>
    permissions:
      contents: read
      security-events: write
    with:
      exclude-paths: |
        test/fixtures
      image: ghcr.io/my-org/my-app@sha256:... # optional
```

Then make the check required: **Settings → Rules → Rulesets → Require status
checks**, and add the four `security / ...` checks. Without that, a red check
is only a suggestion.

### Inputs

| Input | Default | Meaning |
|-------|---------|---------|
| `exclude-paths` | empty | Newline-separated folders all four tools skip (fixtures, vendored code). |
| `semgrep-config` | `p/default` | Semgrep rulesets or local rule files, space-separated. |
| `image` | empty | A container image to scan with Trivy and Syft. Must be pullable by the runner. |
| `fail-on-findings` | `true` | Only the self-test sets this to `false`. |
| `upload-sarif` | `true` | Send results to code scanning. |

### Suppressing a finding (the only allowed ways)

All of these are files in the repo, so they go through a pull request,
show up in review, and are covered by `CODEOWNERS`:

- **gitleaks:** add the finding's fingerprint to `.gitleaksignore`, or an
  allowlist to `.gitleaks.toml` (it is picked up automatically). Only for a
  value that is provably not a secret. A real secret is rotated, not ignored.
- **Semgrep:** `// nosemgrep: <rule-id>` on the line, with a comment saying why.
- **Trivy:** a line in `.trivyignore` with an expiry date:
  `CVE-2024-12345 exp:2026-12-31`. The exception disappears on its own, so it
  gets looked at again.

## Decisions, and why

Each line is: what I did, why, and what it costs. These are the choices I
expect to be asked about.

**1. Where the workflow lives.** A reusable workflow should really live in
its own repository (e.g. `yasva/secure-by-default`) so other repos can pin
it and it has its own release history. I put it in the portfolio repo for
now so it runs on a real repo from day one. Moving it later is a copy plus
changing the `uses:` line.

**2. Actions pinned to a full commit SHA, not a tag.** A tag like `v4` can be
moved to different code by whoever controls the repo. In March 2026 that is
exactly what happened to `aquasecurity/trivy-action`: attackers force-pushed
76 of its 77 version tags to malicious code that stole CI secrets
([GHSA-69fq-xp46-6x23](https://github.com/aquasecurity/trivy/security/advisories/GHSA-69fq-xp46-6x23)).
A SHA cannot be moved. *Cost:* SHAs don't update themselves, so
`dependabot.yml` bumps them weekly.

**3. Scanners run as container images pinned by digest, not as third-party
actions.** The only actions I use are GitHub's own (`checkout`,
`upload-artifact`, `download-artifact`, `codeql-action/upload-sarif`). The
scanners run with `docker run image@sha256:...`. That lets me control
exactly what the scanner can touch: the code is mounted **read-only**, the
scanner never sees `GITHUB_TOKEN`, and gitleaks and Syft run with **no
network at all** (`--network none`), so even a compromised scanner image
can't send the code anywhere. *Cost:* Dependabot does not update digests
inside `run:` steps, so those are bumped by hand (or with Renovate).

**4. A one-week "cooldown" on new versions.** I pin versions released at
least a week ago. Most hijacked releases are found and pulled within days;
the malicious Trivy binary was live for about three hours. *Cost:* fixes in
the scanners themselves reach me a week later.

**5. Minimal `GITHUB_TOKEN` permissions.** The workflow starts with
`permissions: {}`. Every scanner job gets only `contents: read`. One separate
job, `report`, gets `security-events: write`, and it runs nothing but
GitHub's own upload action. So the job that runs third-party code never
holds a token that can write anything. `actions/checkout` also runs with
`persist-credentials: false` so the token isn't left in `.git/config` where a
scanner could read it.

**6. No inputs straight in shell scripts.** Inputs go through `env:` and are
used as `"$VAR"`, never as `${{ inputs.x }}` inside `run:`. Otherwise a
caller-controlled string could inject shell commands (GitHub's "script
injection" problem).

**7. Report wide, block narrow.** All findings from MEDIUM up go to the
Security tab, but only a small, actionable set fails the build (see the
table above). See `TRADEOFFS.md` for why.

**8. A self-test with planted problems.** A scanner that silently stops
working looks exactly like a clean repo: green. So `security-selftest.yml`
scans a folder of deliberately bad files (a fake API key, DOM XSS, an old
lodash, a root Dockerfile) plus an old Alpine image, and **fails if any
scanner finds nothing**. It runs when the pipeline changes and weekly.

**9. Weekly scheduled run.** New CVEs are published against code that hasn't
changed. Without a schedule, a quiet repo would never learn about them.

**10. Fork PRs don't upload to code scanning.** Their token can't write
security events, so the `report` job is skipped for them. The scans and
gates still run.

## Honest limits

- On this portfolio repo (static HTML/CSS/JS, no dependencies, no
  Dockerfile) Trivy and Syft have almost nothing to look at. The real proof
  that they work is the self-test run, not the main run.
- Semgrep's `p/default` rules are downloaded from semgrep.dev on every run.
  If that site is down, the scan fails (on purpose: a scan that silently
  skips rules is worse). Vendoring the rules into the repo would remove
  that dependency at the cost of updating them myself.
- The Trivy vulnerability database is downloaded on every run (~130 MB).
  Caching it would make runs faster; I haven't done that yet.
- Scanning a private container image needs registry credentials, which this
  workflow doesn't take yet.
