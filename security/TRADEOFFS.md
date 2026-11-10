# Trade-offs: noise, false alarms, and keeping the pipeline switched on

A security pipeline fails in two ways. It can miss things (false negatives),
or it can cry wolf so often that people stop reading it, mark everything as
"won't fix", or delete the workflow (false positives). The second one kills
more pipelines than the first. Everything below is about the balance between
the two.

All numbers here come from real runs of this pipeline on this repo, in
[pull request #10](https://github.com/yasva/yasva.github.io/pull/10).

## 1. What the runs actually found

**Main scan of the portfolio site** (static HTML/CSS/JS):

| Tool | Findings | True problems |
|------|----------|---------------|
| gitleaks (full history, 15+ commits) | 0 | 0 |
| Semgrep `p/default` | 4 | 0 (see 2a) |
| Trivy | 0 (no lockfiles, no Dockerfile) | 0 |
| Syft | 0 packages | n/a |

**Self-test on planted problems** (`.github/security-selftest/` + Alpine 3.10.0):

| Tool | Planted | Found | Missed |
|------|---------|-------|--------|
| gitleaks | 1 fake API key | 1 | 0 |
| Semgrep | `eval`, DOM XSS via `innerHTML`, fake key, root Dockerfile | 3 of 4 (fake key and root Dockerfile at `ERROR`, `eval` at `WARNING`) | **the `innerHTML` XSS** (see 2c) |
| Trivy | old lodash, root/`latest` Dockerfile, old Alpine | 34 findings, 16 fixable HIGH/CRITICAL | 0 |
| Syft | lodash + Alpine packages | 12 packages | 0 |

## 2. False alarms (and misses) I dealt with, and why

### 2a. Semgrep `html.security.audit.missing-integrity`: turned off for this repo

It fired 4 times, on `index.html` and `cv.html`. All 4 were wrong:

- 2 were on `<link rel="canonical" href="https://yasva.github.io/...">`. A
  canonical link is a hint to search engines; the browser never loads it,
  so there is nothing for Subresource Integrity (SRI) to protect.
- 2 were on `<link rel="icon" href="data:image/svg+xml,...">`. A `data:` URI
  is inline, so again nothing is downloaded from anyone.

And the one third-party resource the site *does* load, the Google Fonts
stylesheet, was **not** flagged. (SRI wouldn't work there anyway: Google
serves different CSS to different browsers, so there is no single hash.)

So on this repo the rule had 4 false positives, 0 true positives and 1 miss.
It is a `WARNING` rule, so it never blocked a merge, but it still put 4
alerts in the Security tab and on every PR touching those files. Alerts
that are always wrong teach people to scroll past alerts. I turned it off
through the `semgrep-exclude-rules` input in `security.yml`, with a comment
pointing here.

*What I gave up:* if I later add a `<script src="https://cdn...">`, this
rule might have caught the missing `integrity` attribute. The better control
for that risk is a Content-Security-Policy that only allows scripts from my
own origin, which doesn't depend on a pattern matcher noticing.

*Why turn it off for the repo and not suppress each line?* Four
`nosemgrep` comments in HTML would be noise in the code for a rule that
was wrong every time. If it had been right sometimes, per-line suppression
would have been the better choice.

### 2b. Semgrep only blocks on `ERROR`; `WARNING` and `INFO` are reported, not blocking

Semgrep severities mean roughly: `ERROR` = likely a real vulnerability,
`WARNING` = worth a look, `INFO` = style or hardening hint. Rules marked
"audit" are written to catch *everything that might* be a problem; they
are high-recall on purpose. Blocking merges on them is how a team learns to
hate the scanner. They still go to the Security tab and show up on the PR,
so nothing is hidden; they just don't stop the merge.

### 2c. A miss: Semgrep didn't catch the `innerHTML` XSS

The fixture puts a URL parameter straight into `innerHTML`, a textbook DOM
XSS. `p/default` flagged the `eval` in the same file but not this. That
is a reminder of what SAST is: pattern matching. A green Semgrep run means
"none of these 1,000 patterns matched", not "this code is safe". I kept the
fixture in the self-test anyway, so if a future ruleset starts catching it,
the count goes up and I'll see it.

### 2d. Trivy only blocks on HIGH/CRITICAL **with a fix available**

On the old Alpine image Trivy reported 34 findings; 16 were HIGH/CRITICAL
with a fixed version. If the build fails on a CVE that has no fix yet, the
developer can do nothing except ignore it, and once ignoring red checks is
normal, real failures get ignored too. So:

- **Report:** everything MEDIUM and up, fixed or not.
- **Block:** HIGH/CRITICAL where an upgrade exists (`--ignore-unfixed`).

*What I gave up:* a critical CVE with no fix doesn't block. That's a
risk-acceptance decision, and it should be visible: it sits in the Security
tab, and the weekly scheduled run will start blocking as soon as a fix ships.

### 2e. Trivy's secret scanner is off (and an inconsistency I left in)

gitleaks owns secrets. With both on, every leaked key shows up twice in two
formats, and people have to triage the same thing twice. One tool, one
finding.

But the self-test showed that Semgrep's `p/default` *also* has a secrets
rule (`detected-generic-api-key`), and it flagged the same fake key as
gitleaks. By my own argument I should turn that off too. I left it on for
now because it is one rule rather than a whole second engine, and a second
pattern set for secrets is cheap insurance. That's a judgment call, not a
principle, and I'd accept either answer from a team.

### 2f. gitleaks blocks on everything, and scans the whole history

There's no "low severity" leaked key. And a key deleted in a later commit is
still in the git history, still readable by anyone who clones the repo. So:
full history (`fetch-depth: 0`), any finding fails. The answer to a real
finding is **rotate the key first**, then clean up. Rewriting history alone
doesn't help once it has been pushed.

### 2g. Test fixtures are excluded from the main scan

The self-test folder is full of planted problems, so the main scan skips it
via `exclude-paths`. This is the most dangerous kind of exception (a whole
folder), so it is: one folder, in `.github/` (not served by GitHub Pages),
owned in `CODEOWNERS`, and scanned on its own by the self-test.

## 3. How to stop developers from just switching it off

The honest version: you can't make bypassing *impossible* for someone with
admin rights. What you can do is make the pipeline cheap to live with, make
switching it off visible, and make the right path easier than the bypass.

**Make it worth keeping (reduce the reasons to bypass):**

1. **Block narrow, report wide** (section 2). Every red build must be
   something the developer can fix today.
2. **Say how to fix it in the failure.** The gate prints the fixed version,
   the file and the line in the job summary, not just "failed".
3. **Fast.** The four scans run in parallel, in about a minute here. A slow
   gate gets skipped.
4. **Annotations on the PR**, not a report nobody opens. Results go to code
   scanning, which puts them on the changed lines.

**Make the bypass visible (and the legitimate exception easy):**

5. **Exceptions live in the repo, as files** (`.gitleaksignore`,
   `.trivyignore`, `nosemgrep`, `semgrep-exclude-rules`). Adding one is a
   diff that someone reviews, with a reason, and it shows in `git blame`.
6. **Exceptions expire.** `.trivyignore` entries carry `exp:YYYY-MM-DD`.
   An accepted risk comes back for review on its own.
7. **`CODEOWNERS` on the workflow and the ignore files**, plus "require
   review from code owners". The person who wants the exception can't
   approve their own exception.
8. **Dismissals in the Security tab need a reason** ("false positive",
   "used in tests", "won't fix") and are logged with the user's name.

**Make it hard to remove:**

9. **Required status checks** via a branch ruleset. A PR can't merge while
   the security checks are red or missing.
10. **Org-level rulesets / required workflows.** In an organization the
    security team can require this workflow on every repo from the org
    settings, so deleting `security.yml` from one repo does nothing.
11. **Central, pinned, reusable workflow.** Teams call it by SHA; the
    security team updates the rules in one place. Teams don't own the
    scanner config, so there's less to fiddle with.
12. **The self-test.** Someone could "fix" a red build by breaking the
    scanner (a too-wide exclude, a ruleset that loads nothing). The self-test
    catches that: it fails when a scanner stops finding planted problems.
    It already caught one real bug: an early version read Semgrep's severity
    from the wrong field in the report, so the Semgrep gate could never
    fail. The scan was green and *looked* fine.

**The human part:**

13. **Measure the false-positive rate** (dismissed as false positive ÷ all
    findings) per rule, and turn off rules that are mostly wrong, like 2a.
    If the security team never removes noisy rules, developers will remove
    the whole pipeline.
14. **Break-glass, written down.** For a real emergency, an admin can
    bypass the ruleset. GitHub logs every bypass. Agree in advance that each
    one gets a follow-up issue. A documented escape hatch gets used
    honestly; a missing one gets replaced by deleting the workflow.

## 4. What I'd change for a real team

- Gate only on **new** findings in a PR (diff-aware), so an old codebase can
  adopt this without fixing 300 findings on day one. Code scanning already
  shows "new in this PR"; the gate here doesn't use it yet.
- Cache the Trivy database, vendor the Semgrep rules, and add a private
  registry login for image scanning.
- Move the reusable workflow to its own repo with tagged releases.
