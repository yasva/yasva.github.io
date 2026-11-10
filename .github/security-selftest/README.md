# Self-test fixtures (deliberately insecure)

Everything in this folder is **intentionally wrong**. It exists so the
`selftest` job in `.github/workflows/security.yml` can prove that each
scanner still detects something. A security control you have never seen
fail is a control you have not tested.

- `fake-credentials.env`: a made-up, high-entropy API key (never valid anywhere).
- `insecure.js`: DOM XSS and `eval` on user input.
- `package.json` / `package-lock.json`: an old lodash with known HIGH CVEs.
- `Dockerfile`: `latest` tag, runs as root.

The normal scan excludes this folder through the `exclude-paths` input.
The folder lives under `.github/` so GitHub Pages never publishes it.
