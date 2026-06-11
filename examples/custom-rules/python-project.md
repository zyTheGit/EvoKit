---
paths: "*/pyproject.toml,*/setup.py,*/setup.cfg,*requirements*.txt"
---

# Python Project Conventions

## Package Management

- Use `uv` for dependency management (`uv add`, `uv sync`, `uv lock`).
- Pin dependencies in `pyproject.toml` with minimum versions.
- Use `[project.optional-dependencies]` for dev/test/lint groups.

## Project Structure

```
project/
├── src/
│   └── package/
│       ├── __init__.py
│       ├── module.py
│       └── submodule/
├── tests/
│   ├── conftest.py
│   ├── test_module.py
│   └── test_submodule/
├── pyproject.toml
└── README.md
```

## Style

- Follow PEP 8. Use `ruff` for linting and formatting.
- Type hints for all public signatures.
- Docstrings for all public modules, classes, and functions.

## Testing

- Use `pytest` for testing.
- Use `pytest-cov` for coverage (target ≥ 80%).
- Fixtures in `conftest.py` for shared setup.
