# Security policy

## Supported version

Security fixes are applied to the latest version on the `main` branch.

## Local-server boundary

No Slop is designed as a local development tool. The Vite server binds to
`127.0.0.1`, and browser requests with a non-localhost `Origin` are rejected.
This matters because some application routes can:

- invoke a locally installed Claude or Codex CLI;
- append or remove learned writing examples; and
- update the local rules, voice, and API documentation files.

Do not expose port 4242 through a public interface, tunnel, reverse proxy, or
LAN binding without adding authentication, authorization, request limits, and
appropriate sandboxing.

The MCP server communicates over stdio and launches no network listener.

## Sensitive local data

Personal learned voice examples are stored in `style/examples.jsonl`, which is
gitignored. Local imported drafts and dismissal state are also excluded. Review
all example content before committing it.

## Reporting a vulnerability

Please use GitHub's private vulnerability reporting feature for this repository.
Include reproduction steps, affected routes or tools, and the expected impact.
Avoid opening a public issue until a fix is available.
