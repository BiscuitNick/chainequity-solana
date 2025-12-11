# ChainEquity Reset Guide

Quick reference for resetting the development environment.

## Full Reset (Database + Chain + Reseed)

### 1. Reset Database
```bash
docker exec chainequity-db psql -U chainequity -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;"
docker restart chainequity-api
```

### 2. Reset Solana Validator

**IMPORTANT:** Use the local Solana install (not homebrew) to avoid macOS extended attribute issues:

```bash
# Kill existing validator
pkill -9 -f solana-test-validator

# Clean extended attributes from local solana install
xattr -cr ~/.local/share/solana/

# Remove old ledger
rm -rf test-ledger

# Start fresh validator using LOCAL install
~/.local/share/solana/install/active_release/bin/solana-test-validator --reset &

# Wait and verify
sleep 10
~/.local/share/solana/install/active_release/bin/solana cluster-version
```

### 3. Deploy Programs
```bash
anchor deploy
```

### 4. Initialize Factory and Seed Data
```bash
# Initialize factory (required after chain reset)
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/init-and-create-token.ts

# Seed demo data (4 companies with realistic cap tables)
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/seed-demo-data.ts
```

## One-Liner (Copy-Paste)

```bash
# Full reset in one go
docker exec chainequity-db psql -U chainequity -c "DROP SCHEMA public CASCADE; CREATE SCHEMA public;" && \
docker restart chainequity-api && \
pkill -9 -f solana-test-validator; \
xattr -cr ~/.local/share/solana/ && \
rm -rf test-ledger && \
~/.local/share/solana/install/active_release/bin/solana-test-validator --reset &
sleep 12 && \
anchor deploy && \
ANCHOR_PROVIDER_URL=http://127.0.0.1:8899 ANCHOR_WALLET=~/.config/solana/id.json npx ts-node scripts/seed-demo-data.ts
```

## Troubleshooting

### "Archive error: extra entry found: ._genesis.bin"
This is a macOS extended attribute issue with homebrew's Solana installation. Solution:
1. Use the local Solana install at `~/.local/share/solana/install/active_release/bin/`
2. Run `xattr -cr ~/.local/share/solana/` before starting the validator

### Validator won't start
```bash
pkill -9 -f solana-test-validator
rm -rf test-ledger
```

### Database connection issues
```bash
docker ps  # Verify containers are running
docker restart chainequity-api chainequity-db
```

## Environment Info
- Docker containers: postgres (5432), backend (8000), frontend (3000)
- Solana RPC: http://127.0.0.1:8899
- API URL: http://localhost:8000
