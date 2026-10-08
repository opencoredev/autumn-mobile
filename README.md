# Autumn Mobile

An unofficial mobile dashboard app for Autumn billing, inspired by the clarity of Polar's mobile app. This project is not affiliated with Autumn or Polar.

## Requirements

- Bun 1.4+
- Node.js 24+

## Commands

```sh
bun install          # install workspace dependencies
bun dev              # run the mobile Metro bundler and Cloudflare Worker together
bun mobile           # run only Expo
bun server           # run only Wrangler
bun run typecheck    # type-check every workspace
bun run lint         # lint with oxlint
bun run format       # format with oxfmt
bun run format:check # verify formatting
bun run build        # bundle the Worker and export the Expo app
```

The server exposes `GET /health` while Wrangler is running. The mobile app currently contains a placeholder home screen and imports the shared typed API client and billing types from `packages/shared`.

This repository is local-only during scaffolding. It does not deploy or connect to any remote repository.
