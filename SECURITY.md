# Security Policy

## Supported versions

Only the latest published version of `morphicons` receives security fixes.

## Reporting a vulnerability

Please **do not open a public issue** for security problems. Instead, use
GitHub's private vulnerability reporting:

1. Go to the [Security tab](https://github.com/guillermolg00/morphicons/security)
2. Click **Report a vulnerability**

You will get an initial response within 72 hours. Once a fix is available it
ships as a patch release through the automated publish pipeline (npm packages
are published with provenance, so you can verify exactly which commit and
workflow produced each release).

## Scope notes

morphicons is a pure animation library: zero runtime dependencies, no network
access, no `eval`, no DOM APIs beyond `setAttribute` on the element you hand
it. Reports about the website (morphicons.com) are also welcome through the
same channel.
