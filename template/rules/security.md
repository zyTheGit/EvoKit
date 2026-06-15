---
paths: "*/security*"
---

# Security Rules

## API Keys & Secrets
- **Never hardcode** API keys, tokens, or secrets in source code.
- Use **environment variables** for all sensitive values (loaded via `process.env` or shell env).
- `.env` files must have permissions set to `600` (not readable by group/other).
- **Never commit** `.env` or `.env.local` files to git.

## Sensitive Operations

**NEVER execute directly** — explain impact and ask the user to run manually:
- Destructive file ops: `rm -rf`, `rm *`, `mv` overwrite, `dd`, `mkfs`
- Git force push: `git push --force`, `git push origin +main`
- Git destructive ops: `git reset --hard`, `git checkout --`, `git rebase`, `git merge`, `git clean -fd`

**Always confirm before executing:**
- Permissions changes (`chmod`, `chown`)
- API DELETE, database mutations, or data-destructive operations

## Code Security
- No `eval()` or `Function()` constructor with dynamic strings.
- No shell command injection (prefer parameterized APIs over string interpolation).
- Validate file paths before reading/writing to prevent path traversal.

## Self-Check Before Any Sensitive Operation

- ✅ Is this a destructive operation? (If yes → NEVER execute directly. Explain and ask.)
- ✅ Does this command accept user-controlled input that could cause shell injection? (If yes → use parameterized API.)
- ✅ Am I about to `git push --force` or `git reset --hard`? (If yes → explain impact, ask user to run manually.)
- ✅ Does this code touch files outside the project directory? (If yes → validate paths.)

## Examples

### Correct
```
User: "Delete the temp folder"
You: "Running `rm -rf ./temp` would delete the 'temp' directory in the current project. All contents will be lost. Shall I proceed?"

User: "Yes, delete it"
You: [executes rm -rf ./temp]
```

### Incorrect (NEVER do this)
```
User: "Force push my branch"
You: [runs git push --force origin main without warning]
```

### Correct (sensitive data)
```
// Use env vars for secrets
const API_KEY = process.env.STRIPE_SECRET_KEY;
if (!API_KEY) throw new Error('STRIPE_SECRET_KEY not set');
```

### Incorrect (hardcoded secret)
```
const API_KEY = 'sk_live_1234567890abcdef';  // NEVER do this
```
