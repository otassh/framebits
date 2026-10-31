# Changelog

> Rendered version: https://otassh.github.io/framebits/ (built from this file
> on every push to `main` by `.github/workflows/changelog.yml`).

All notable changes to the `@framebits/cli` package will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

> Release-notes source: per-version notes live in GitHub Releases and are
> auto-generated (`gh release create --generate-notes` in
> `.github/workflows/release.yml`), because the author and full commit list
> are only known at tag time. This file holds the curated highlights;
> GitHub Releases are authoritative for the complete notes.

## [Unreleased]

## [0.1.1] - 2026-10-31

### Fixed

- Resolve aliases from real JSONC project references and relative TypeScript
  `extends` chains, including paths declared in nested configurations.
- Honor explicit alias mappings and reject `baseUrl` configurations without an
  import alias instead of installing files with unresolved imports.

### Changed

- Set `framebits.trqsh.uz` as the permanent production domain and default registry.
- Verify packed CLI installs, dependency installation, generated production CSS,
  idempotency, and conflict protection in fresh Next.js and Vite projects with
  Tailwind 3 and 4 on Linux and Windows for every pull request.

## [0.1.0] - 2026-10-06

### Added

- Initial public release of the `@framebits/cli` organization package (`framebits`
  binary; `init`, `add` with hash
  verification, Tailwind style patching, and atomic rollback).
- OIDC trusted-publishing release pipeline (`release` workflow, no npm tokens).
