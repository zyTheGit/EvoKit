---
paths: "*/security*"
---

# Security Rules

## API Keys & Secrets
- Never hardcode API keys, tokens, or secrets in source code.
- Use environment variables for all sensitive values (loaded via `process.env` or shell env).
- `.env` files must have permissions set to `600` (not readable by group/other).
- Never commit `.env` or `.env.local` files to git.

## Sensitive Operations
- **Destructive file ops (`rm *`, `rm -rf`, `mv` overwrite, `dd`, `mkfs`):** Never execute directly — explain what will be removed and ask the user to run the command manually.
- **Git push / force push (`git push`, `git push --force`, `git push origin +main`):** Never execute directly — explain the impact (which branch, what commits) and ask the user to run the command manually.
- **Git destructive ops (`git reset --hard`, `git checkout --`, `git rebase`, `git merge`, `git clean -fd`):** Explain what will happen and confirm with the user before executing.
- **Permissions (`chmod`, `chown`):** Explain why before modifying.
- **API DELETE / database mutations:** Confirm with the user before executing.

## Code Security
- No `eval()` or `Function()` constructor with dynamic strings.
- No shell command injection (prefer parameterized APIs over string interpolation).
- Validate file paths before reading/writing to prevent path traversal.
