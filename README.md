# ChainEquity: Tokenized Security Prototype

A technical prototype demonstrating tokenized securities on Solana with compliance gating, corporate actions, and operator workflows.

**DISCLAIMER: This is a prototype for educational and demonstration purposes only. NOT for production use.**

## Overview

ChainEquity is a full-stack application for managing tokenized securities on Solana. It provides:

- **4 Solana Programs** - Token factory, compliance-gated transfers, governance, and test stablecoin
- **Python Backend** - FastAPI with real-time indexer and WebSocket support
- **React Frontend** - Next.js 14 with complete operator dashboard
- **~31,000 lines of code** across Rust, Python, and TypeScript

## Features

### Core Features
- **Token Factory**: Create multiple security tokens with configurable features
- **Gated Transfers**: Allowlist-based transfer restrictions with KYC levels
- **Multi-Sig Admin**: M-of-N signature requirements for sensitive operations
- **Stock Splits**: On-chain configurable splits (e.g., 7-for-1)
- **Symbol Changes**: Mutable token metadata via Token-2022

### Advanced Features
- **Vesting Schedules**: Linear, cliff, and stepped vesting with 3 termination types
- **Dividend Distribution**: Pull-based claims with TestUSDC
- **On-Chain Governance**: Proposals, voting, and execution
- **Cap-Table Export**: CSV, JSON, and PDF formats
- **Real-Time Updates**: WebSocket subscriptions for transfers, votes, and more

## Documentation

- [API Documentation](docs/API.md) - Complete REST API reference
- [Product Requirements](docs/chainequity-prd-v1.5.md) - Detailed PRD
- [Deployment Guide](docs/DEPLOYMENT.md) - Production deployment instructions

## Tech Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Solana (Localnet or Devnet) |
| Smart Contracts | Rust + Anchor Framework (4 programs) |
| Backend API | Python + FastAPI + anchorpy |
| Database | PostgreSQL + SQLAlchemy |
| Frontend | Next.js 14 + shadcn/ui + Tailwind |
| State Management | Zustand |
| Testing | Anchor tests, pytest, Playwright |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (1.18+)
- [Anchor](https://www.anchor-lang.com/docs/installation) (0.30+)
- [Node.js](https://nodejs.org/) (20+)
- [Python](https://python.org/) (3.11+)
- [Docker](https://docker.com/) (optional, for containerized dev)

---

## Network Configuration

ChainEquity supports two Solana networks. Choose based on your needs:

| Network | Command | Use Case |
|---------|---------|----------|
| **Localnet** | `make dev-localnet` | Fast iteration, offline dev, free transactions |
| **Devnet** | `make dev-devnet` | Integration testing, persistent state, team collaboration |

### Localnet vs Devnet

| Aspect | Localnet | Devnet |
|--------|----------|--------|
| **Speed** | Instant confirmations | Real network latency (~400ms) |
| **Cost** | Free, unlimited | Free but rate-limited |
| **State** | Resets on restart | Persistent |
| **Offline** | Yes | No |
| **Ecosystem** | Isolated | Access to other devnet programs |
| **Slot numbers** | Starts at 0 | ~426 million (running since 2020) |

---

## Running with Docker (Recommended)

### Option A: Devnet (Simplest)

No local validator needed. Connects to Solana's public devnet.

```bash
# Start all services on devnet
make dev-devnet

# Or simply (devnet is default)
make dev

# View logs
make dev-logs

# Stop services
make dev-down
```

### Option B: Localnet

Requires running a local Solana validator on your host machine.

```bash
# Terminal 1: Start local validator
make validator

# Terminal 2: Start services pointing to local validator
make dev-localnet

# View logs
make dev-logs

# Stop services
make dev-down
```

### Services (both modes)

| Service | URL |
|---------|-----|
| Frontend | http://localhost:3000 |
| Backend API | http://localhost:8000 |
| API Docs | http://localhost:8000/docs |
| Local Validator (localnet only) | http://localhost:8899 |

---

## Running Without Docker (Terminal Mode)

For faster iteration or debugging, run services directly in your terminal.

### Option A: Devnet

```bash
# 1. Configure environment for devnet
make setup-devnet

# 2. Start PostgreSQL (still via Docker, or use your own)
docker-compose up -d postgres

# 3. Terminal 1: Start backend
make dev-backend

# 4. Terminal 2: Start frontend
make dev-frontend
```

### Option B: Localnet

```bash
# 1. Configure environment for localnet
make setup-localnet

# 2. Start PostgreSQL
docker-compose up -d postgres

# 3. Terminal 1: Start local Solana validator
make validator

# 4. Terminal 2: Deploy programs to local validator
anchor deploy

# 5. Terminal 3: Start backend
make dev-backend

# 6. Terminal 4: Start frontend
make dev-frontend
```

---

## Mixed Mode (Docker + Terminal)

You can mix Docker and terminal for flexibility:

### Example: Docker DB + Terminal Services + Devnet

```bash
# Configure for devnet
make setup-devnet

# Start only the database in Docker
docker-compose up -d postgres

# Run backend in terminal (for hot reload / debugging)
make dev-backend

# Run frontend in terminal (for hot reload / debugging)
make dev-frontend
```

### Example: Docker DB + Terminal Services + Localnet

```bash
# Configure for localnet
make setup-localnet

# Terminal 1: Start local validator
make validator

# Start only the database in Docker
docker-compose up -d postgres

# Terminal 2: Deploy programs
anchor deploy

# Terminal 3: Run backend
make dev-backend

# Terminal 4: Run frontend
make dev-frontend
```

---

## Switching Networks

### If using Docker:

```bash
# Stop current services
make dev-down

# Switch to localnet
make dev-localnet

# Or switch to devnet
make dev-devnet
```

### If running in terminal:

```bash
# Switch to localnet
make setup-localnet
# Restart backend and frontend

# Switch to devnet
make setup-devnet
# Restart backend and frontend
```

---

## Environment Files

Configuration templates are in the `env/` directory:

```
env/
├── localnet.env    # Local validator configuration
└── devnet.env      # Devnet configuration
```

The `make setup-*` commands copy these to the appropriate locations:
- `backend/.env` - Backend configuration
- `frontend/.env.local` - Frontend configuration

### Manual Configuration

If you need custom settings, edit directly:

```bash
# Backend
cp env/devnet.env backend/.env
# Edit backend/.env as needed

# Frontend
# Edit frontend/.env.local as needed
```

---

## Program Deployment

### To Localnet

```bash
# Start validator first
make validator

# Deploy (new terminal)
anchor deploy
```

### To Devnet

```bash
# Ensure you have devnet SOL
solana airdrop 2

# Deploy
make deploy-programs
```

After deployment, update the program IDs in your environment files.

## Project Structure

```
chainequity-codelayer/
├── programs/                    # Solana programs (Rust)
│   ├── chainequity_factory/     # Token factory
│   ├── chainequity_token/       # Core token + compliance
│   ├── chainequity_governance/  # Governance + voting
│   └── test_usdc/               # Mock stablecoin
├── backend/                     # Python FastAPI backend
│   ├── app/
│   │   ├── api/                 # REST endpoints
│   │   ├── indexer/             # Blockchain event indexer
│   │   ├── models/              # SQLAlchemy models
│   │   ├── schemas/             # Pydantic schemas
│   │   └── services/            # Business logic
│   └── tests/
├── frontend/                    # Next.js frontend
│   ├── app/                     # App router pages
│   ├── components/              # React components
│   ├── hooks/                   # Custom hooks
│   ├── lib/                     # Utilities
│   └── stores/                  # Zustand stores
├── docs/                        # Documentation
│   └── chainequity-prd-v1.5.md  # Product Requirements
└── scripts/                     # Utility scripts
```

## Testing

```bash
# Run all tests
make test

# Run specific test suites
make test-programs    # Solana program tests
make test-backend     # Python tests
make test-frontend    # Frontend tests
```

## Development

```bash
# Format code
make format

# Lint code
make lint

# Clean build artifacts
make clean
```

## Configuration

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
```

Key environment variables:
- `SOLANA_CLUSTER`: Network (devnet, mainnet-beta)
- `DATABASE_URL`: PostgreSQL connection string
- `FACTORY_PROGRAM_ID`: Deployed factory program address

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                    Next.js + shadcn/ui + Tailwind                       │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            BACKEND API                                   │
│                      Python + FastAPI + anchorpy                        │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────┐ ┌─────────────┐ ┌─────────────────────────────┐
│      EVENT INDEXER      │ │  POSTGRESQL │ │      SOLANA DEVNET          │
│  WebSocket + Polling    │ │   Database  │ │                             │
└─────────────────────────┘ └─────────────┘ └─────────────────────────────┘
```

## License

MIT

## Acknowledgments

Built as a technical prototype for demonstrating blockchain primitives for equity management.
