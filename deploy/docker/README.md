# Docker deployment

Run Compose commands from the repository root:

```bash
docker compose -f deploy/docker/compose.yml up --build -d
```

The build context remains the repository root, while Docker-specific files stay grouped in this directory.
