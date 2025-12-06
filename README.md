# ChainEquity: Tokenized Security Prototype

A technical prototype demonstrating tokenized securities on Solana with compliance gating, corporate actions, and operator workflows.

**DISCLAIMER: This is a prototype for educational and demonstration purposes only. NOT for production use.**

## Features

### Core Features
- **Token Factory**: Create multiple security tokens with configurable features
- **Gated Transfers**: Allowlist-based transfer restrictions
- **Multi-Sig Admin**: M-of-N signature requirements for sensitive operations
- **Stock Splits**: On-chain 7-for-1 (or configurable) splits
- **Symbol Changes**: Mutable token metadata

### Advanced Features
- **Vesting Schedules**: Linear, cliff, and stepped vesting with 3 termination types
- **Dividend Distribution**: Pull-based claims with TestUSDC
- **On-Chain Governance**: Proposals, voting, and execution
- **Cap-Table Export**: CSV, JSON, and PDF formats

## Tech Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Solana Devnet |
| Smart Contracts | Rust + Anchor Framework |
| Backend API | Python + FastAPI + anchorpy |
| Database | PostgreSQL |
| Frontend | Next.js 14 + shadcn/ui + Tailwind |
| Testing | Rust unit tests, pytest, Playwright |

## Quick Start

### Prerequisites

- [Rust](https://rustup.rs/) (1.70+)
- [Solana CLI](https://docs.solana.com/cli/install-solana-cli-tools) (1.18+)
- [Anchor](https://www.anchor-lang.com/docs/installation) (0.30+)
- [Node.js](https://nodejs.org/) (20+)
- [Python](https://python.org/) (3.11+)
- [Docker](https://docker.com/) (optional, for local dev)

### Using Docker (Recommended)

```bash
# Start all services
make dev

# View logs
make dev-logs

# Stop services
make dev-down
```

Services:
- Frontend: http://localhost:3000
- Backend API: http://localhost:8000
- API Docs: http://localhost:8000/docs

### Manual Setup

```bash
# 1. Install dependencies
make install

# 2. Build Solana programs
anchor build

# 3. Start local validator (optional)
solana-test-validator

# 4. Deploy programs
anchor deploy

# 5. Start backend
cd backend && uvicorn app.main:app --reload

# 6. Start frontend
cd frontend && npm run dev
```

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
