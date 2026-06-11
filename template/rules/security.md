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
- Before running destructive operations (rm -rf, git reset --hard, API DELETE), explain what will happen and confirm with the user.
- Before modifying permissions (chmod, chown), explain why.

## Code Security
- No `eval()` or `Function()` constructor with dynamic strings.
- No shell command injection (prefer parameterized APIs over string interpolation).
- Validate file paths before reading/writing to prevent path traversal.
