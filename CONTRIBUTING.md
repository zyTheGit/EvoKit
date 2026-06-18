# Contributing to EvoKit

## Welcome!

Thank you for considering contributing to EvoKit. This is a community-driven project that aims to make AI coding assistants smarter through self-evolution.

## Code of Conduct

- Be respectful and inclusive
- Focus on what's best for the community
- Show empathy towards other community members

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in [Issues](https://github.com/your-username/EvoKit/issues)
2. If not, create a new issue using the [Bug Report template](.github/ISSUE_TEMPLATE/bug-report.md)
3. Include:
   - Clear description of the issue
   - Steps to reproduce
   - Expected vs actual behavior
   - Environment details (OS, Claude Code version, shell)

### Suggesting Features

1. Check existing [Issues](https://github.com/your-username/EvoKit/issues) for similar requests
2. Create a new issue using the [Feature Request template](.github/ISSUE_TEMPLATE/feature-request.md)
3. Explain:
   - What problem you're solving
   - How the feature would work
   - Why it would benefit the community

### Pull Requests

1. **Fork the repository**
2. **Create a feature branch:** `git checkout -b feat/your-feature-name`
3. **Make your changes**
4. **Test your changes** — ensure `/boot` passes
5. **Commit with clear messages**

### Format

```
type(scope): description

feat: new feature
fix: bug fix
docs: documentation
refactor: code restructuring
test: adding tests
chore: maintenance

Examples:
feat(adapter): add Codex adapter
fix(template): correct hook path placeholder
docs(readme): update install instructions
```

## Development Setup

```bash
git clone https://github.com/your-username/EvoKit.git
cd EvoKit

# The project is template-based — no build step needed
# Test the template locally:
bash bin/install.sh --template template --dry-run
```

## Testing

- **Template test:** Install to a temporary `.claude/` and verify `/boot`
- **Shell scripts:** Run `shellcheck` on all `.sh` files
- **Python scripts:** Check Python syntax on all embedded scripts
- **Documentation:** Ensure all markdown files render correctly

### Manual Test

```bash
# Create a temporary home for testing
mkdir -p /tmp/evokit-test-home
HOME=/tmp/evokit-test-home bash bin/install.sh --template template

# Verify installation
ls -la /tmp/evokit-test-home/.claude/
```

## Project Structure

```
EvoKit/
├── template/          # Installable template (~/.claude/)
├── bin/               # Installation scripts
├── src/               # Source code (future)
├── docs/              # Documentation
├── examples/          # Customization examples
└── tests/             # Tests (future)
```

## Adding a New Adapter

1. Read [MULTI_AGENT.md](docs/en/MULTI_AGENT.md) for the adapter specification
2. Create the adapter under `src/adapters/`
3. Implement the `AgentAdapter` interface
4. Add tests
5. Submit a PR

## Questions?

Open a [Discussion](https://github.com/your-username/EvoKit/discussions) or check [FAQ.md](docs/en/FAQ.md).
