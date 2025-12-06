# ChainEquity Deployment Guide

This guide covers deploying ChainEquity to production environments.

## Table of Contents

1. [Prerequisites](#prerequisites)
2. [Solana Program Deployment](#solana-program-deployment)
3. [Backend Deployment](#backend-deployment)
4. [Frontend Deployment](#frontend-deployment)
5. [Environment Configuration](#environment-configuration)
6. [Database Setup](#database-setup)
7. [Monitoring](#monitoring)

---

## Prerequisites

### Required Tools

```bash
# Rust and Solana
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sh -c "$(curl -sSfL https://release.solana.com/v1.18.0/install)"
cargo install --git https://github.com/coral-xyz/anchor anchor-cli

# Node.js (via nvm)
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install 20
nvm use 20

# Python
# Install Python 3.11+ via your package manager
pip install poetry
```

### Solana Wallet Setup

```bash
# Generate a new keypair for deployment
solana-keygen new -o ~/.config/solana/deploy-keypair.json

# Set the keypair as default
solana config set --keypair ~/.config/solana/deploy-keypair.json

# Fund the wallet (devnet)
solana airdrop 5 --url devnet

# For mainnet, transfer SOL to the wallet address
solana address
```

---

## Solana Program Deployment

### 1. Build Programs

```bash
# Build all programs
anchor build

# Verify builds
ls -la target/deploy/
```

### 2. Get Program IDs

```bash
# Get program IDs from keypairs
solana address -k target/deploy/chainequity_factory-keypair.json
solana address -k target/deploy/chainequity_token-keypair.json
solana address -k target/deploy/chainequity_governance-keypair.json
solana address -k target/deploy/test_usdc-keypair.json
```

### 3. Update Program IDs

Update `Anchor.toml` and `programs/*/src/lib.rs` with the correct program IDs:

```toml
# Anchor.toml
[programs.devnet]
chainequity_factory = "YOUR_FACTORY_PROGRAM_ID"
chainequity_token = "YOUR_TOKEN_PROGRAM_ID"
chainequity_governance = "YOUR_GOVERNANCE_PROGRAM_ID"
test_usdc = "YOUR_TEST_USDC_PROGRAM_ID"
```

### 4. Deploy to Devnet

```bash
# Set cluster to devnet
solana config set --url devnet

# Deploy all programs
anchor deploy --provider.cluster devnet

# Verify deployment
solana program show YOUR_PROGRAM_ID
```

### 5. Deploy to Mainnet (Production)

```bash
# Set cluster to mainnet
solana config set --url mainnet-beta

# Ensure sufficient SOL for deployment (~3-5 SOL per program)
solana balance

# Deploy with priority fee for faster confirmation
anchor deploy --provider.cluster mainnet-beta
```

---

## Backend Deployment

### Option 1: Docker Deployment

```bash
# Build Docker image
docker build -t chainequity-backend:latest ./backend

# Run container
docker run -d \
  --name chainequity-backend \
  -p 8000:8000 \
  -e DATABASE_URL=postgresql://user:pass@host:5432/chainequity \
  -e SOLANA_RPC_URL=https://api.devnet.solana.com \
  -e FACTORY_PROGRAM_ID=YOUR_FACTORY_ID \
  -e TOKEN_PROGRAM_ID=YOUR_TOKEN_ID \
  -e GOVERNANCE_PROGRAM_ID=YOUR_GOVERNANCE_ID \
  -e TEST_USDC_PROGRAM_ID=YOUR_USDC_ID \
  chainequity-backend:latest
```

### Option 2: Manual Deployment

```bash
cd backend

# Create virtual environment
python -m venv venv
source venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run database migrations
alembic upgrade head

# Start with gunicorn
gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000 \
  --access-logfile - \
  --error-logfile -
```

### Option 3: Cloud Deployment (Railway/Render/Fly.io)

```bash
# Railway
railway login
railway init
railway up

# Render - use render.yaml
# Fly.io
fly launch
fly deploy
```

### Systemd Service (Linux)

```ini
# /etc/systemd/system/chainequity-backend.service
[Unit]
Description=ChainEquity Backend API
After=network.target postgresql.service

[Service]
Type=simple
User=chainequity
WorkingDirectory=/opt/chainequity/backend
Environment=PATH=/opt/chainequity/backend/venv/bin
EnvironmentFile=/opt/chainequity/.env
ExecStart=/opt/chainequity/backend/venv/bin/gunicorn app.main:app \
  --workers 4 \
  --worker-class uvicorn.workers.UvicornWorker \
  --bind 0.0.0.0:8000
Restart=always
RestartSec=5

[Install]
WantedBy=multi-user.target
```

```bash
sudo systemctl enable chainequity-backend
sudo systemctl start chainequity-backend
```

---

## Frontend Deployment

### Option 1: Vercel (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
cd frontend
vercel

# Set environment variables in Vercel dashboard:
# - NEXT_PUBLIC_API_URL
# - NEXT_PUBLIC_SOLANA_RPC_URL
# - NEXT_PUBLIC_SOLANA_CLUSTER
```

### Option 2: Static Export

```bash
cd frontend

# Build static export
npm run build

# Output in 'out' directory
# Deploy to any static host (S3, CloudFlare Pages, Netlify)
```

### Option 3: Docker

```bash
# Build Docker image
docker build -t chainequity-frontend:latest ./frontend

# Run container
docker run -d \
  --name chainequity-frontend \
  -p 3000:3000 \
  -e NEXT_PUBLIC_API_URL=https://api.chainequity.example.com \
  chainequity-frontend:latest
```

---

## Environment Configuration

### Backend Environment Variables

```bash
# .env file for backend

# Database
DATABASE_URL=postgresql://user:password@localhost:5432/chainequity

# Solana
SOLANA_RPC_URL=https://api.devnet.solana.com
SOLANA_WS_URL=wss://api.devnet.solana.com

# Program IDs
FACTORY_PROGRAM_ID=Fact...
TOKEN_PROGRAM_ID=Tokn...
GOVERNANCE_PROGRAM_ID=Govr...
TEST_USDC_PROGRAM_ID=USDC...

# API Settings
API_HOST=0.0.0.0
API_PORT=8000
DEBUG=false
LOG_LEVEL=INFO

# Indexer Settings
INDEXER_POLL_INTERVAL=5
INDEXER_BATCH_SIZE=100

# CORS (comma-separated origins)
CORS_ORIGINS=https://app.chainequity.example.com,https://chainequity.example.com
```

### Frontend Environment Variables

```bash
# .env.local for frontend

NEXT_PUBLIC_API_URL=https://api.chainequity.example.com
NEXT_PUBLIC_WS_URL=wss://api.chainequity.example.com/ws
NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com
NEXT_PUBLIC_SOLANA_CLUSTER=devnet
```

---

## Database Setup

### PostgreSQL Setup

```bash
# Create database and user
sudo -u postgres psql

CREATE USER chainequity WITH PASSWORD 'secure_password';
CREATE DATABASE chainequity OWNER chainequity;
GRANT ALL PRIVILEGES ON DATABASE chainequity TO chainequity;
\q
```

### Run Migrations

```bash
cd backend
alembic upgrade head
```

### Database Backup

```bash
# Backup
pg_dump -U chainequity -h localhost chainequity > backup_$(date +%Y%m%d).sql

# Restore
psql -U chainequity -h localhost chainequity < backup_20240315.sql
```

---

## Monitoring

### Health Checks

```bash
# Backend health check
curl https://api.chainequity.example.com/health

# Expected response:
{
  "status": "healthy",
  "version": "1.0.0",
  "cluster": "devnet"
}
```

### Logging

Configure structured logging with:

```python
# backend/app/config.py
import structlog

structlog.configure(
    processors=[
        structlog.stdlib.filter_by_level,
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.JSONRenderer()
    ],
    logger_factory=structlog.stdlib.LoggerFactory(),
)
```

### Metrics (Optional)

Add Prometheus metrics:

```python
# backend/app/main.py
from prometheus_fastapi_instrumentator import Instrumentator

Instrumentator().instrument(app).expose(app)
```

### Alerts

Set up alerts for:
- API response time > 2s
- Error rate > 1%
- Database connection failures
- Solana RPC connection issues
- Indexer lag > 100 slots

---

## Security Checklist

- [ ] Use HTTPS everywhere
- [ ] Set secure CORS origins
- [ ] Enable rate limiting
- [ ] Use environment variables for secrets
- [ ] Regular security updates
- [ ] Database connection encryption (SSL)
- [ ] Implement API authentication
- [ ] Set up WAF (Web Application Firewall)
- [ ] Regular backups
- [ ] Audit logging enabled

---

## Troubleshooting

### Common Issues

**1. Solana RPC Rate Limits**
```bash
# Use a dedicated RPC provider:
# - Helius: https://helius.xyz
# - QuickNode: https://quicknode.com
# - Triton: https://triton.one
```

**2. Database Connection Issues**
```bash
# Check PostgreSQL is running
sudo systemctl status postgresql

# Test connection
psql -U chainequity -h localhost -d chainequity -c "SELECT 1"
```

**3. Program Deployment Failures**
```bash
# Check wallet balance
solana balance

# Verify program size
ls -la target/deploy/*.so

# Extend program if needed
solana program extend PROGRAM_ID 50000 --url devnet
```

**4. Indexer Not Syncing**
```bash
# Check indexer logs
journalctl -u chainequity-backend -f | grep indexer

# Verify RPC connection
curl -X POST -H "Content-Type: application/json" \
  -d '{"jsonrpc":"2.0","id":1,"method":"getSlot"}' \
  https://api.devnet.solana.com
```

---

## Support

For issues and questions:
- GitHub Issues: [chainequity/issues](https://github.com/org/chainequity/issues)
- Documentation: [docs/](./docs/)
