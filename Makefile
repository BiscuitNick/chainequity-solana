.PHONY: dev build test clean install deploy

# ============================================================================
# Development
# ============================================================================

dev: ## Start all services with Docker Compose
	docker-compose up -d

dev-down: ## Stop all services
	docker-compose down

dev-logs: ## View logs from all services
	docker-compose logs -f

dev-backend: ## Run backend locally (requires Python env)
	cd backend && uvicorn app.main:app --reload

dev-frontend: ## Run frontend locally (requires Node.js)
	cd frontend && npm run dev

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
