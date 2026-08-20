# Uninstall NeoWorker

There are two ways to uninstall NeoWorker depending on whether you want to keep local data.

## Option 1: Uninstall app/binaries only (keep database)

This removes installed application files and CLI/package artifacts while keeping workspace, settings, and task data for later restore.

### macOS app (manual drag-installed build)

```bash
pkill -f '/Applications/NeoWorker.app' || true
rm -rf "/Applications/NeoWorker.app"
```

### npm global package install

```bash
npm uninstall -g neoworker
```

### Local install in a folder

```bash
rm -rf ~/neoworker-run
```

### Source/development clone

```bash
rm -rf /path/to/NeoWorker
```

### Packaged Linux server release

```bash
sudo systemctl stop neoworker-node
sudo systemctl disable neoworker-node
sudo rm -f /etc/systemd/system/neoworker-node.service
sudo systemctl daemon-reload
sudo rm -rf /opt/neoworker
```

### VPS/headless Docker install

```bash
cd /path/to/docker-compose-dir
docker compose down
```

### VPS/headless systemd install

```bash
sudo systemctl stop neoworker neoworker-node
sudo systemctl disable neoworker neoworker-node
sudo rm -f /etc/systemd/system/neoworker.service
sudo rm -f /etc/systemd/system/neoworker-node.service
sudo systemctl daemon-reload
```

### Data locations to keep

Choose the one used by your install:

- macOS (Electron): `~/Library/Application Support/neoworker/`
- Linux desktop/Electron: `~/.config/neoworker/`
- Linux daemon/headless fallback: `~/.neoworker/`
- Node daemon custom path: value passed in `NEOWORKER_USER_DATA_DIR` or `--user-data-dir`
- Packaged/systemd example paths: `/var/lib/neoworker`, `/srv/neoworker/workspace`, and any custom path in `/etc/neoworker.env`
- Docker example paths: named volume `neoworker_data`, named volume `neoworker_workspace`, and any host bind mount in `/workspace`

## Option 2: Full uninstall + data deletion (database included) — irrecoverable

> **WARNING:** This removes all application data and settings (tasks, tasks timeline, memory, credentials, channel/session state, and the local database). **All data will be deleted and everything will be gone forever.**

Use this only when you are sure you want to destroy local state.

### Delete all user-data locations

```bash
rm -rf ~/Library/Application\ Support/neoworker
rm -rf ~/.config/neoworker
rm -rf ~/.neoworker
```

### Remove with custom user-data path

```bash
rm -rf "$NEOWORKER_USER_DATA_DIR"
```

### Fully remove Docker install data

```bash
cd /path/to/docker-compose-dir
docker compose down -v
docker compose rm -f
```

### Fully remove systemd/headless example data

```bash
sudo rm -rf /var/lib/neoworker
sudo rm -rf /srv/neoworker/workspace
```

After the data wipe, also remove remaining app binaries/shell package entries from Option 1 if you haven't already.
