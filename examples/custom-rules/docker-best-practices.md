---
paths: "*/Dockerfile*,*docker-compose*,*.dockerignore"
---

# Docker Best Practices

## Dockerfile

- Use specific base image tags (`node:20-alpine` not `node:latest`).
- Combine RUN commands to reduce layers:
  ```dockerfile
  RUN apt-get update && apt-get install -y pkg && rm -rf /var/lib/apt/lists/*
  ```
- Use multi-stage builds for compiled languages.
- Copy `package.json` before source code to leverage layer caching.

## Security

- Never run as root — use `USER` directive.
- Don't hardcopy secrets — use build args or Docker secrets.
- Scan images for vulnerabilities before deploying: `docker scout`.

## docker-compose

- Pin service image versions.
- Use `.env` file for environment-specific variables.
- Add healthcheck for each service.
