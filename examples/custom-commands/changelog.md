---
description: Generate a changelog from git history since the last tag
---

# /changelog — Changelog Generator

Generate a formatted changelog from recent git history.

## Usage

```
/changelog                   — Changes since last tag
/changelog --since v1.0.0    — Changes since specific tag
/changelog --format json     — Output as JSON
```

## Output Format

```
## [Unreleased] — 2026-06-11

### Features
- feat: new feature description (#PR)

### Bug Fixes
- fix: bug fix description (#PR)

### Documentation
- docs: documentation changes (#PR)
```

## How It Works

1. Reads git log between the last tag (or specified ref) and HEAD.
2. Groups commits by conventional commit type (`feat:`, `fix:`, `docs:`, `refactor:`).
3. Formats and prints the changelog.
