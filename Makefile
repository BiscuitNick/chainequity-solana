.PHONY: dev build test clean install deploy

# ============================================================================
# Development - Network Selection
# ============================================================================
# Choose your Solana network:
#   make dev-localnet  - Use local validator (must run solana-test-validator first)
#   make dev-devnet    - Use Solana devnet (public testnet)
#   make dev           - Default (devnet)
# ============================================================================

dev: dev-devnet ## Start all services (default: devnet)

dev-devnet: ## Start with DEVNET (public Solana testnet)
	@echo "🌐 Starting with DEVNET configuration..."
	docker-compose -f docker-compose.yml -f docker-compose.devnet.yml up -d
	@echo ""
	@echo "✅ Services started on DEVNET"
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend:  http://localhost:8000"
	@echo "   API Docs: http://localhost:8000/docs"

dev-localnet: ## Start with LOCALNET (requires solana-test-validator running)
	@echo "🖥️  Starting with LOCALNET configuration..."
	@echo "⚠️  Make sure solana-test-validator is running on your host!"
	docker-compose -f docker-compose.yml -f docker-compose.localnet.yml up -d
	@echo ""
	@echo "✅ Services started on LOCALNET"
	@echo "   Frontend: http://localhost:3000"
	@echo "   Backend:  http://localhost:8000"
	@echo "   Validator: http://localhost:8899"

dev-down: ## Stop all services
	docker-compose down

dev-logs: ## View logs from all services
	docker-compose logs -f

dev-backend: ## Run backend locally (requires Python env)
	cd backend && uvicorn app.main:app --reload

dev-frontend: ## Run frontend locally (requires Node.js)
	cd frontend && npm run dev

# ============================================================================
# Environment Setup
# ============================================================================

setup-localnet: ## Configure local .env files for LOCALNET
	@echo "📝 Setting up LOCALNET environment..."
	@if [ -f env/localnet.env ]; then cp env/localnet.env backend/.env; \
	elif [ -f env/localnet.env.example ]; then cp env/localnet.env.example backend/.env; \
	else echo "❌ No env/localnet.env or env/localnet.env.example found"; exit 1; fi
	@echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > frontend/.env.local
	@echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws" >> frontend/.env.local
	@echo "NEXT_PUBLIC_SOLANA_NETWORK=localnet" >> frontend/.env.local
	@echo "NEXT_PUBLIC_SOLANA_RPC_URL=http://localhost:8899" >> frontend/.env.local
	@echo "" >> frontend/.env.local
	@echo "# Program IDs (localnet deployment)" >> frontend/.env.local
	@echo "NEXT_PUBLIC_FACTORY_PROGRAM_ID=3Jui9FBBhqbbxE9s83fcUya1xrG9kpUZS1pTBAcWohbE" >> frontend/.env.local
	@echo "NEXT_PUBLIC_TOKEN_PROGRAM_ID=TxPUnQaa9MWhTdTURSZEieS6BKmpYiU4c3GtYKV3Kq2" >> frontend/.env.local
	@echo "NEXT_PUBLIC_GOVERNANCE_PROGRAM_ID=qonFMa4fD9KLRWG73aQzvQ2d5WnBNF5S9jzaRwLcwQQ" >> frontend/.env.local
	@echo "NEXT_PUBLIC_TEST_USDC_PROGRAM_ID=28JkLhzXCQme5fFrAqoWwyJxSNiv71CMQcS5x4xCtqoX" >> frontend/.env.local
	@echo "✅ Environment configured for LOCALNET"
	@echo "   Run: solana-test-validator"
	@echo "   Then: make dev-backend (terminal 1)"
	@echo "   Then: make dev-frontend (terminal 2)"

setup-devnet: ## Configure local .env files for DEVNET
	@echo "📝 Setting up DEVNET environment..."
	@if [ -f env/devnet.env ]; then cp env/devnet.env backend/.env; \
	elif [ -f env/devnet.env.example ]; then cp env/devnet.env.example backend/.env; \
	else echo "❌ No env/devnet.env or env/devnet.env.example found"; exit 1; fi
	@echo "NEXT_PUBLIC_API_URL=http://localhost:8000/api/v1" > frontend/.env.local
	@echo "NEXT_PUBLIC_WS_URL=ws://localhost:8000/api/v1/ws" >> frontend/.env.local
	@echo "NEXT_PUBLIC_SOLANA_NETWORK=devnet" >> frontend/.env.local
	@echo "NEXT_PUBLIC_SOLANA_RPC_URL=https://api.devnet.solana.com" >> frontend/.env.local
	@echo "" >> frontend/.env.local
	@echo "# Program IDs (devnet deployment - update after deploy)" >> frontend/.env.local
	@echo "NEXT_PUBLIC_FACTORY_PROGRAM_ID=Fg6PaFpoGXkYsidMpWTK6W2BeZ7FEfcYkg476zPFsLnS" >> frontend/.env.local
	@echo "NEXT_PUBLIC_TOKEN_PROGRAM_ID=HmbTLCmaGvZhKnn1Zfa1JVnp7vkMV4DYVxPLWBVoN65L" >> frontend/.env.local
	@echo "NEXT_PUBLIC_GOVERNANCE_PROGRAM_ID=BPFLoaderUpgradeab1e11111111111111111111111" >> frontend/.env.local
	@echo "NEXT_PUBLIC_TEST_USDC_PROGRAM_ID=TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA" >> frontend/.env.local
	@echo "✅ Environment configured for DEVNET"
	@echo "   Run: make dev-backend (terminal 1)"
	@echo "   Then: make dev-frontend (terminal 2)"

# ============================================================================
# Local Validator
# ============================================================================

SOLANA_VALIDATOR := $(shell [ -x ~/.local/share/solana/install/releases/2.1.11/solana-release/bin/solana-test-validator ] && echo ~/.local/share/solana/install/releases/2.1.11/solana-release/bin/solana-test-validator || echo solana-test-validator)

validator: ## Start local Solana test validator
	@echo "🚀 Starting local Solana validator..."
	@rm -rf /tmp/solana-test-ledger
	$(SOLANA_VALIDATOR) --ledger /tmp/solana-test-ledger

validator-bg: ## Start local Solana test validator in background
	@echo "🚀 Starting local Solana validator in background..."
	@rm -rf /tmp/solana-test-ledger
	$(SOLANA_VALIDATOR) --ledger /tmp/solana-test-ledger &
	@sleep 5
	@echo "✅ Validator running at http://localhost:8899"

# ============================================================================
# Build
# ============================================================================

build: build-programs build-backend build-frontend ## Build all components

build-programs: ## Build Solana programs
	anchor build

build-backend: ## Build backend Docker image
	docker build -t chainequity-backend ./backend

build-frontend: ## Build frontend
	cd frontend && npm run build

# ============================================================================
# Testing
# ============================================================================

test: test-programs test-backend test-frontend ## Run all tests

test-programs: ## Run Solana program tests
	anchor test

test-backend: ## Run backend tests
	cd backend && pytest -v

test-frontend: ## Run frontend tests
	cd frontend && npm test

# ============================================================================
# Installation
# ============================================================================

install: install-programs install-backend install-frontend ## Install all dependencies

install-programs: ## Install Rust/Anchor dependencies
	@echo "Ensure Rust and Anchor are installed:"
	@echo "  curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh"
	@echo "  cargo install --git https://github.com/coral-xyz/anchor avm --locked"
	@echo "  avm install latest && avm use latest"

install-backend: ## Install Python dependencies
	cd backend && pip install -r requirements.txt

install-frontend: ## Install Node.js dependencies
	cd frontend && npm install

# ============================================================================
# Deployment
# ============================================================================

deploy-programs: ## Deploy Solana programs to devnet
	anchor deploy --provider.cluster devnet

deploy-localnet: ## Start local Solana validator and deploy
	solana-test-validator &
	sleep 5
	anchor deploy --provider.cluster localnet

# ============================================================================
# Database
# ============================================================================

db-migrate: ## Run database migrations
	cd backend && alembic upgrade head

db-reset: ## Reset database (WARNING: destroys data)
	docker-compose down -v
	docker-compose up -d postgres
	sleep 5
	make db-migrate

# ============================================================================
# Utilities
# ============================================================================

clean: ## Clean build artifacts
	rm -rf target/
	rm -rf frontend/.next/
	rm -rf frontend/node_modules/
	rm -rf backend/__pycache__/
	find . -type d -name "__pycache__" -exec rm -rf {} + 2>/dev/null || true

format: ## Format code
	cd programs && cargo fmt
	cd backend && black .
	cd frontend && npm run lint -- --fix

lint: ## Lint code
	cd programs && cargo clippy
	cd backend && ruff check .
	cd frontend && npm run lint

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-20s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
