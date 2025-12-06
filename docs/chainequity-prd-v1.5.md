# ChainEquity: Tokenized Security Prototype with Compliance Gating

## Product Requirements Document (PRD)

**Version:** 1.5  
**Author:** Nick  
**Date:** December 2024  
**Status:** Draft  

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Problem Statement](#2-problem-statement)
3. [Solution Overview](#3-solution-overview)
4. [Technical Architecture](#4-technical-architecture)
5. [Feature Specifications](#5-feature-specifications)
6. [Data Models](#6-data-models)
7. [API Specifications](#7-api-specifications)
8. [User Interface Requirements](#8-user-interface-requirements)
9. [Testing Strategy](#9-testing-strategy)
10. [Security Considerations](#10-security-considerations)
11. [Performance Requirements](#11-performance-requirements)
12. [Deployment Strategy](#12-deployment-strategy)
13. [Future Considerations](#13-future-considerations)
14. [Appendices](#14-appendices)

---

## 1. Executive Summary

### 1.1 Project Overview

ChainEquity is a technical prototype demonstrating how tokenized securities could function on the Solana blockchain with compliance gating, corporate actions, and operator workflows. The project showcases blockchain primitives for equity management including instant settlement, transparent ownership records, and automated compliance checks.

### 1.2 Key Objectives

- Demonstrate deep understanding of blockchain mechanics and security token concepts
- Build production-quality, well-tested code with comprehensive documentation
- Implement a comprehensive feature set including advanced capabilities
- Create an impressive, functional application with intuitive UI/UX

### 1.3 Technology Stack

| Component | Technology |
|-----------|------------|
| Blockchain | Solana Devnet |
| Smart Contracts | Rust + Anchor Framework |
| Backend API | Python + FastAPI + anchorpy + solana-py |
| Database | PostgreSQL |
| Event Indexer | WebSocket (primary) + Polling (fallback) |
| Frontend | Next.js 14 + shadcn/ui + Tailwind CSS |
| Charts/Visualization | Recharts + D3.js |
| Testing | Rust unit tests, pytest, Playwright |
| Export Formats | CSV, JSON, PDF (ReportLab) |

### 1.4 Core Principles

- **Transparency:** All transfers are auditable on-chain
- **Automation:** Compliance checks happen programmatically
- **Efficiency:** Settlement is instant vs. T+2 traditional
- **Accuracy:** Cap-table is always correct and queryable

### 1.5 Disclaimer

This is a technical prototype. It is NOT regulatory-compliant and should not be used for real securities without legal review. All operations occur on Solana Devnet with no real monetary value.

---

## 2. Problem Statement

### 2.1 Current State

Cap-table management, equity issuance, and secondary settlements for private companies remain painful:

- **Manual spreadsheets** prone to errors and version conflicts
- **Slow transfer agents** with T+2 or longer settlement times
- **Limited liquidity** for private company shares
- **Compliance overhead** requiring manual verification
- **Opaque ownership records** difficult to audit
- **Complex corporate actions** (splits, dividends) requiring manual calculations

### 2.2 Opportunity

Tokenization on programmable blockchains offers:

- Instant settlement (sub-second on Solana)
- Transparent, immutable ownership records
- Automated compliance checks via smart contracts
- Programmable corporate actions
- Real-time cap-table visibility
- Reduced operational overhead

### 2.3 Target Users

| User Type | Description | Primary Needs |
|-----------|-------------|---------------|
| Issuer Admin | Company equity administrator | Mint shares, manage allowlist, execute corporate actions |
| Compliance Officer | KYC/AML verification | Approve/deny wallet addresses, audit transfers |
| Token Holder | Shareholder | View holdings, transfer shares, claim dividends |
| Auditor | External reviewer | Query cap-table, verify ownership history |

---

## 3. Solution Overview

### 3.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              FRONTEND                                    │
│                    Next.js + shadcn/ui + Tailwind                       │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │  Token   │  │ Dashboard │  │ Corporate│  │ Vesting  │  │Governance│  │
│  │ Selector │  │  & Charts │  │ Actions  │  │ Manager  │  │  Portal  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────────┐
│                            BACKEND API                                   │
│                      Python + FastAPI + anchorpy                        │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  │
│  │ Factory  │  │  Token   │  │ Corporate│  │ Dividend │  │Governance│  │
│  │ Service  │  │  Service │  │ Actions  │  │ Service  │  │ Service  │  │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┼───────────────┐
                    ▼               ▼               ▼
┌─────────────────────────┐ ┌─────────────┐ ┌─────────────────────────────┐
│      EVENT INDEXER      │ │  POSTGRESQL │ │      SOLANA DEVNET          │
│  WebSocket + Polling    │ │   Database  │ │                             │
│  ┌───────────────────┐  │ │ ┌─────────┐ │ │  ┌─────────────────────┐    │
│  │ Transfer Events   │  │ │ │ Tokens  │ │ │  │   Token Factory     │    │
│  │ Approval Events   │  │ │ │Cap-Table│ │ │  │   (Creates Tokens)  │    │
│  │ Corporate Actions │  │ │ │Snapshots│ │ │  └─────────────────────┘    │
│  │ Governance Events │  │ │ │ History │ │ │            │                │
│  │ Factory Events    │◄─┼─┼─┼─────────┼─┼─┼────────────┘                │
│  └───────────────────┘  │ │ └─────────┘ │ │    ┌───────┴───────┐        │
└─────────────────────────┘ └─────────────┘ │    ▼               ▼        │
                                            │  ┌───────┐     ┌───────┐    │
                                            │  │ ACME  │     │ TECH  │    │
                                            │  │ Token │     │ Token │    │
                                            │  └───────┘     └───────┘    │
                                            │  ┌─────────────────────┐    │
                                            │  │  Compliance Program │    │
                                            │  │  (Shared Logic)     │    │
                                            │  └─────────────────────┘    │
                                            │  ┌─────────────────────┐    │
                                            │  │  Governance Program │    │
                                            │  │  (Per-Token)        │    │
                                            │  └─────────────────────┘    │
                                            │  ┌─────────────────────┐    │
                                            │  │  TestUSDC Token     │    │
                                            │  │  (Mock Stablecoin)  │    │
                                            │  └─────────────────────┘    │
                                            └─────────────────────────────┘
```

### 3.2 Token Factory Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        CHAINEQUITY PLATFORM                              │
│                         (Token Factory)                                  │
└─────────────────────────────────────────────────────────────────────────┘
                                    │
                                    │ create_token()
                                    ▼
            ┌───────────────────────┼───────────────────────┐
            ▼                       ▼                       ▼
    ┌───────────────┐       ┌───────────────┐       ┌───────────────┐
    │   ACME Corp   │       │  TechStart    │       │   BioVenture  │
    │   Token: ACME │       │  Token: TECH  │       │   Token: BIOV │
    │   ID: 1       │       │   ID: 2       │       │   ID: 3       │
    ├───────────────┤       ├───────────────┤       ├───────────────┤
    │ Features:     │       │ Features:     │       │ Features:     │
    │ • Allowlist ✓ │       │ • Allowlist ✓ │       │ • Allowlist ✓ │
    │ • Vesting ✓   │       │ • Vesting ✓   │       │ • Vesting ✗   │
    │ • Governance ✓│       │ • Governance ✗│       │ • Governance ✓│
    │ • Dividends ✓ │       │ • Dividends ✗ │       │ • Dividends ✓ │
    │ • Restrictions│       │ • Restrictions│       │ • Restrictions│
    ├───────────────┤       ├───────────────┤       ├───────────────┤
    │ Admin:        │       │ Admin:        │       │ Admin:        │
    │ 2-of-3 multisig       │ 1-of-2 multisig       │ 3-of-5 multisig
    ├───────────────┤       ├───────────────┤       ├───────────────┤
    │ Cap Table     │       │ Cap Table     │       │ Cap Table     │
    │ Holders: 150  │       │ Holders: 45   │       │ Holders: 300  │
    │ Supply: 1M    │       │ Supply: 100K  │       │ Supply: 10M   │
    └───────────────┘       └───────────────┘       └───────────────┘
```

### 3.3 Feature Summary

#### Core Features (Required)
| Feature | Description | Status |
|---------|-------------|--------|
| Token Factory | Create multiple tokens with configurable features | ✅ Planned |
| Gated Token Contract | Allowlist-based transfer restrictions | ✅ Planned |
| Issuer Service | Wallet approval, minting, admin workflows | ✅ Planned |
| Event Indexer | Real-time cap-table from blockchain events | ✅ Planned |
| Stock Split | 7-for-1 (or configurable) split via on-chain iteration | ✅ Planned |
| Symbol Change | Mutable metadata update | ✅ Planned |
| Cap-Table Export | CSV, JSON, PDF at any block height | ✅ Planned |

#### Advanced Features
| Feature | Description | Status |
|---------|-------------|--------|
| Multi-Sig Admin | 2-of-3 (configurable) signature requirement | ✅ Planned |
| Vesting Schedules | Continuous + cliff, configurable timeframes | ✅ Planned |
| Vesting Termination | 3 types: Standard, ForCause, Accelerated | ✅ Planned |
| Lockout Periods | Time-based transfer restrictions per wallet | ✅ Planned |
| Daily Transfer Limits | Maximum transfer volume per wallet per day | ✅ Planned |
| Dividend Distribution | Pull-based claims with mock stablecoin | ✅ Planned |
| Upgradeable Program | Native Solana upgradeability with timelock | ✅ Planned |
| On-Chain Governance | Proposal creation, voting, execution | ✅ Planned |
| Gas Optimization | Compute unit optimization throughout | ✅ Planned |

#### Deferred Features (Architecture-Ready)
| Feature | Description | Status |
|---------|-------------|--------|
| Secondary Market | On-chain order book / AMM | ⏸️ Deferred |
| Cross-Chain Bridge | Solana ↔ EVM token bridging | ⏸️ Deferred |
| ZK Privacy | Zero-knowledge compliance proofs | ⏸️ Deferred |

---

## 4. Technical Architecture

### 4.1 Solana Program Architecture

#### 4.1.1 Program Overview

Four main Anchor programs:

```
programs/
├── chainequity_factory/         # Token factory (creates tokens)
│   ├── src/
│   │   ├── lib.rs              # Program entry point
│   │   ├── state.rs            # Factory & template structures
│   │   └── instructions/
│   │       ├── initialize.rs   # Initialize factory
│   │       ├── create_token.rs # Create new security token
│   │       └── templates.rs    # Token templates
│   └── Cargo.toml
│
├── chainequity_token/           # Core token + compliance
│   ├── src/
│   │   ├── lib.rs              # Program entry point
│   │   ├── state.rs            # Account structures
│   │   ├── instructions/       # Instruction handlers
│   │   │   ├── initialize.rs
│   │   │   ├── mint.rs
│   │   │   ├── transfer.rs
│   │   │   ├── allowlist.rs
│   │   │   ├── vesting.rs
│   │   │   ├── corporate_actions.rs
│   │   │   └── dividends.rs
│   │   └── errors.rs           # Custom error codes
│   └── Cargo.toml
│
├── chainequity_governance/      # Governance + voting
│   ├── src/
│   │   ├── lib.rs
│   │   ├── state.rs
│   │   └── instructions/
│   │       ├── create_proposal.rs
│   │       ├── vote.rs
│   │       └── execute.rs
│   └── Cargo.toml
│
└── test_usdc/                   # Mock stablecoin for dividends
    ├── src/lib.rs
    └── Cargo.toml
```

#### 4.1.2 Account Structure

```rust
// ============================================================================
// FACTORY ACCOUNTS
// ============================================================================

/// Global factory configuration - one per platform deployment
#[account]
pub struct TokenFactory {
    pub authority: Pubkey,           // Platform admin (can be multi-sig)
    pub token_count: u64,            // Total tokens created (for sequential IDs)
    pub creation_fee: u64,           // Fee to create token (0 for demo)
    pub fee_recipient: Pubkey,       // Where fees go
    pub paused: bool,                // Emergency pause
    pub bump: u8,
}

/// Template for quick token creation with preset configurations
#[account]
pub struct TokenTemplate {
    pub id: u8,                      // Template ID
    pub name: String,                // "Startup Equity", "VC Fund", etc.
    pub description: String,         // Template description
    pub features: TokenFeatures,     // Default feature flags
    pub default_vesting: Option<DefaultVestingConfig>,
    pub default_restrictions: Option<DefaultRestrictions>,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DefaultVestingConfig {
    pub cliff_seconds: u64,          // Default cliff (e.g., 1 year)
    pub duration_seconds: u64,       // Default duration (e.g., 4 years)
    pub vesting_type: VestingType,   // Default type
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct DefaultRestrictions {
    pub default_daily_limit_percent: Option<u8>,  // e.g., 1% of holdings
    pub default_lockout_seconds: Option<u64>,     // e.g., 6 months
}

/// Feature flags for token creation
#[derive(AnchorSerialize, AnchorDeserialize, Clone, Default)]
pub struct TokenFeatures {
    pub vesting_enabled: bool,           // Allow vesting schedules
    pub governance_enabled: bool,        // Allow on-chain governance
    pub dividends_enabled: bool,         // Allow dividend distribution
    pub transfer_restrictions_enabled: bool,  // Daily limits, lockouts
    pub upgradeable: bool,               // Can upgrade token program
}

/// Parameters for creating a new token
#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub struct CreateTokenParams {
    pub symbol: String,              // Token symbol (max 10 chars)
    pub name: String,                // Token name (max 50 chars)
    pub decimals: u8,                // Token decimals (typically 0 for equity)
    pub initial_supply: u64,         // Initial token supply
    pub features: TokenFeatures,     // Feature flags
    pub admin_signers: Vec<Pubkey>,  // Multi-sig signers
    pub admin_threshold: u8,         // Required signatures
    pub template_id: Option<u8>,     // Optional template to use
}

// ============================================================================
// TOKEN ACCOUNTS (Updated with factory reference)
// ============================================================================

/// Token configuration - one per created token
#[account]
pub struct TokenConfig {
    pub factory: Pubkey,             // Parent factory
    pub token_id: u64,               // Sequential ID from factory
    pub authority: Pubkey,           // Multi-sig address for this token
    pub mint: Pubkey,                // SPL Token mint
    pub symbol: String,              // Mutable ticker (max 10 chars)
    pub name: String,                // Token name (max 50 chars)
    pub decimals: u8,                // Token decimals
    pub total_supply: u64,           // Current total supply
    pub split_multiplier: u64,       // For virtual split (default 1)
    pub features: TokenFeatures,     // Enabled features
    pub is_paused: bool,             // Emergency pause
    pub upgrade_timelock: i64,       // Seconds before upgrade executes
    pub created_at: i64,             // Creation timestamp
    pub bump: u8,                    // PDA bump
}

// === Allowlist Entry ===
#[account]
pub struct AllowlistEntry {
    pub wallet: Pubkey,              // Approved wallet address
    pub approved_at: i64,            // Timestamp of approval
    pub approved_by: Pubkey,         // Admin who approved
    pub status: AllowlistStatus,     // Active, Revoked, Pending
    pub kyc_level: u8,               // KYC tier (1-3)
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum AllowlistStatus {
    Pending,
    Active,
    Revoked,
    Suspended,
}

// === Wallet Restrictions ===
#[account]
pub struct WalletRestrictions {
    pub wallet: Pubkey,
    pub daily_transfer_limit: Option<u64>,    // Max daily transfer
    pub transferred_today: u64,                // Running daily total
    pub last_transfer_day: i64,               // Day boundary (unix)
    pub lockout_until: Option<i64>,           // Cannot transfer until
    pub max_balance: Option<u64>,             // Maximum holdings
    pub bump: u8,
}

// === Vesting Schedule ===
#[account]
pub struct VestingSchedule {
    pub beneficiary: Pubkey,         // Wallet receiving vested tokens
    pub total_amount: u64,           // Total tokens in schedule
    pub released_amount: u64,        // Already released
    pub start_time: i64,             // Vesting start (unix timestamp)
    pub cliff_duration: u64,         // Seconds until cliff (0 = no cliff)
    pub total_duration: u64,         // Total vesting duration in seconds
    pub vesting_type: VestingType,   // Linear, Cliff+Linear, Stepped
    pub revocable: bool,             // Can issuer revoke unvested?
    pub revoked: bool,               // Has it been revoked/terminated?
    
    // Termination tracking (simplified: 3 types)
    pub termination_type: Option<TerminationType>,
    pub terminated_at: Option<i64>,           // Unix timestamp of termination
    pub terminated_by: Option<Pubkey>,        // Admin who terminated
    pub vested_at_termination: Option<u64>,   // Snapshot of vested amount
    pub termination_notes: Option<String>,    // Audit trail notes (max 200 chars)
    
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum VestingType {
    Linear,              // Continuous from start
    CliffThenLinear,     // Nothing until cliff, then continuous
    Stepped,             // Discrete unlocks (monthly/quarterly)
}

/// Simplified termination types (3 instead of 7)
/// Covers all real-world scenarios with clear, predictable behavior
#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum TerminationType {
    /// Standard departure (resignation, layoff, mutual agreement)
    /// Employee keeps vested tokens, unvested returns to treasury
    Standard,
    
    /// Termination for cause (misconduct, breach of contract)
    /// Employee forfeits ALL tokens (vested + unvested)
    ForCause,
    
    /// Accelerated vesting (death, disability, acquisition)
    /// 100% vests immediately, employee/estate gets everything
    Accelerated,
}

// === Multi-Sig Configuration ===
#[account]
pub struct MultisigConfig {
    pub signers: Vec<Pubkey>,        // List of authorized signers
    pub threshold: u8,               // Required signatures (M of N)
    pub nonce: u64,                  // Replay protection
    pub bump: u8,
}

// === Multi-Sig Transaction ===
#[account]
pub struct MultisigTransaction {
    pub multisig: Pubkey,            // Parent multisig config
    pub instruction_data: Vec<u8>,   // Serialized instruction
    pub signers: Vec<bool>,          // Which signers have approved
    pub executed: bool,              // Has been executed
    pub created_at: i64,             // Creation timestamp
    pub bump: u8,
}

// === Dividend Round ===
#[account]
pub struct DividendRound {
    pub id: u64,                     // Sequential round ID
    pub payment_token: Pubkey,       // TestUSDC mint address
    pub total_pool: u64,             // Total dividend amount
    pub snapshot_slot: u64,          // Block for ownership snapshot
    pub amount_per_share: u64,       // Calculated: pool / supply
    pub status: DividendStatus,      // Pending, Active, Completed
    pub created_at: i64,
    pub expires_at: Option<i64>,     // Claim deadline
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum DividendStatus {
    Pending,      // Announced but not claimable
    Active,       // Open for claims
    Completed,    // All claimed or expired
}

// === Dividend Claim Record ===
#[account]
pub struct DividendClaim {
    pub round: Pubkey,               // Dividend round
    pub wallet: Pubkey,              // Claimant
    pub amount: u64,                 // Amount claimed
    pub claimed_at: i64,             // Timestamp
    pub bump: u8,
}

// === Governance Proposal ===
#[account]
pub struct Proposal {
    pub id: u64,                     // Sequential proposal ID
    pub proposer: Pubkey,            // Who created it
    pub action: GovernanceAction,    // What it does
    pub description: String,         // Human-readable description
    pub votes_for: u64,              // Weighted votes in favor
    pub votes_against: u64,          // Weighted votes against
    pub status: ProposalStatus,
    pub voting_starts: i64,          // When voting opens
    pub voting_ends: i64,            // When voting closes
    pub execution_delay: u64,        // Timelock after passing
    pub executed_at: Option<i64>,    // When executed (if passed)
    pub snapshot_slot: u64,          // Block for voting power
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone)]
pub enum GovernanceAction {
    // Allowlist management
    AddToAllowlist { wallet: Pubkey },
    RemoveFromAllowlist { wallet: Pubkey },
    
    // Parameter changes
    UpdateDailyTransferLimit { wallet: Pubkey, limit: u64 },
    UpdateGlobalTransferLimit { limit: u64 },
    
    // Admin changes
    AddMultisigSigner { signer: Pubkey },
    RemoveMultisigSigner { signer: Pubkey },
    UpdateThreshold { new_threshold: u8 },
    
    // Corporate actions
    InitiateStockSplit { multiplier: u8 },
    UpdateSymbol { new_symbol: String },
    InitiateDividend { token: Pubkey, amount: u64 },
    
    // Emergency
    PauseTransfers,
    UnpauseTransfers,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum ProposalStatus {
    Pending,      // Created, voting not started
    Active,       // Voting in progress
    Passed,       // Voting ended, threshold met
    Failed,       // Voting ended, threshold not met
    Executed,     // Action completed
    Cancelled,    // Cancelled by proposer/admin
}

// === Vote Record ===
#[account]
pub struct VoteRecord {
    pub proposal: Pubkey,
    pub voter: Pubkey,
    pub vote: Vote,
    pub weight: u64,                 // Voting power used
    pub voted_at: i64,
    pub bump: u8,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, PartialEq)]
pub enum Vote {
    For,
    Against,
    Abstain,
}
```

### 4.2 Backend Architecture

#### 4.2.1 Service Layer

```
backend/
├── app/
│   ├── __init__.py
│   ├── main.py                 # FastAPI application entry
│   ├── config.py               # Environment configuration
│   ├── dependencies.py         # Dependency injection
│   │
│   ├── api/
│   │   ├── __init__.py
│   │   ├── v1/
│   │   │   ├── __init__.py
│   │   │   ├── router.py       # API router aggregation
│   │   │   ├── allowlist.py    # Allowlist endpoints
│   │   │   ├── tokens.py       # Mint/transfer endpoints
│   │   │   ├── captable.py     # Cap-table queries/exports
│   │   │   ├── corporate.py    # Corporate actions
│   │   │   ├── vesting.py      # Vesting management
│   │   │   ├── dividends.py    # Dividend distribution
│   │   │   ├── governance.py   # Governance endpoints
│   │   │   └── admin.py        # Multi-sig admin
│   │   └── websocket.py        # Real-time updates
│   │
│   ├── services/
│   │   ├── __init__.py
│   │   ├── solana_client.py    # Solana RPC wrapper
│   │   ├── program_client.py   # Anchor program interactions
│   │   ├── allowlist_service.py
│   │   ├── token_service.py
│   │   ├── captable_service.py
│   │   ├── vesting_service.py
│   │   ├── dividend_service.py
│   │   ├── governance_service.py
│   │   └── export_service.py   # CSV/JSON/PDF generation
│   │
│   ├── indexer/
│   │   ├── __init__.py
│   │   ├── event_listener.py   # WebSocket subscription
│   │   ├── factory_listener.py # Factory event handling (CRITICAL)
│   │   ├── poller.py           # Fallback polling
│   │   ├── processors/
│   │   │   ├── transfer.py
│   │   │   ├── allowlist.py
│   │   │   ├── vesting.py
│   │   │   ├── dividend.py
│   │   │   └── governance.py
│   │   └── snapshot.py         # Cap-table snapshots
│   │
│   ├── models/
│   │   ├── __init__.py
│   │   ├── database.py         # SQLAlchemy setup
│   │   ├── wallet.py
│   │   ├── transaction.py
│   │   ├── snapshot.py
│   │   ├── vesting.py
│   │   ├── dividend.py
│   │   └── governance.py
│   │
│   ├── schemas/
│   │   ├── __init__.py
│   │   ├── allowlist.py        # Pydantic schemas
│   │   ├── token.py
│   │   ├── captable.py
│   │   ├── vesting.py
│   │   ├── dividend.py
│   │   └── governance.py
│   │
│   └── utils/
│       ├── __init__.py
│       ├── pdf_generator.py    # ReportLab PDF creation
│       ├── csv_exporter.py
│       └── calculations.py     # Vesting/dividend math
│
├── tests/
│   ├── __init__.py
│   ├── conftest.py             # Pytest fixtures
│   ├── unit/
│   │   ├── test_vesting_calc.py
│   │   ├── test_dividend_calc.py
│   │   └── test_export.py
│   └── integration/
│       ├── test_allowlist_flow.py
│       ├── test_transfer_flow.py
│       ├── test_corporate_actions.py
│       └── test_governance_flow.py
│
├── alembic/                    # Database migrations
│   ├── versions/
│   └── env.py
│
├── requirements.txt
├── Dockerfile
└── docker-compose.yml
```

#### 4.2.2 Factory Event Listener (CRITICAL)

The indexer MUST dynamically subscribe to new tokens when the Factory creates them. Without this, new tokens won't appear in the dashboard until server restart.

```python
# backend/indexer/factory_listener.py

class FactoryEventListener:
    """
    Listens to Factory events and dynamically registers new tokens.
    
    CRITICAL: This component solves the "cold start problem" for multi-tenant
    indexing. When the Factory creates a new token, the indexer must immediately
    begin tracking transfers for that mint—no restart required.
    """
    
    def __init__(self, solana_client, db, transfer_indexer):
        self.solana = solana_client
        self.db = db
        self.transfer_indexer = transfer_indexer
        self.tracked_mints: set[str] = set()
    
    async def bootstrap(self):
        """
        On startup, discover all existing tokens from factory.
        Called once when the indexer process starts.
        """
        factory = await self.solana.get_factory_config()
        
        for token_id in range(factory.token_count):
            config = await self.solana.get_token_config(token_id)
            await self._register_token(config)
            
            # Backfill any transfers we missed while offline
            last_indexed_slot = await self.db.get_last_indexed_slot(token_id)
            await self.transfer_indexer.backfill(
                mint=config.mint,
                from_slot=last_indexed_slot
            )
        
        logger.info(f"Bootstrapped {factory.token_count} tokens from factory")
    
    async def on_token_created(self, event: TokenCreatedEvent):
        """
        Called when Factory emits TokenCreated event.
        Dynamically adds the new token to indexer subscriptions.
        """
        config = await self.solana.get_token_config(event.token_id)
        await self._register_token(config)
        
        # Broadcast to connected WebSocket clients
        await self.ws_manager.broadcast({
            "type": "token_created",
            "data": {
                "token_id": event.token_id,
                "symbol": config.symbol,
                "mint": str(config.mint),
            }
        })
        
        logger.info(f"Now tracking new token: {config.symbol} ({config.mint})")
    
    async def _register_token(self, config: TokenConfig):
        """Add token to DB and subscription list."""
        # Upsert to database
        await self.db.upsert_token({
            "token_id": config.token_id,
            "mint_address": str(config.mint),
            "symbol": config.symbol,
            "name": config.name,
            "decimals": config.decimals,
            "total_supply": config.total_supply,
            "features": config.features.to_dict(),
        })
        
        # Add to in-memory tracking set
        self.tracked_mints.add(str(config.mint))
        
        # Subscribe to transfer events for this mint
        self.transfer_indexer.add_subscription(str(config.mint))
```

#### 4.2.3 Database Schema

```sql
-- ============================================================================
-- FACTORY TABLES
-- ============================================================================

-- Factory configuration (single row)
CREATE TABLE factory_config (
    id SERIAL PRIMARY KEY,
    on_chain_address VARCHAR(44) UNIQUE NOT NULL,
    authority VARCHAR(44) NOT NULL,
    token_count INTEGER NOT NULL DEFAULT 0,
    creation_fee BIGINT NOT NULL DEFAULT 0,
    paused BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

-- Token templates
CREATE TABLE token_templates (
    id SERIAL PRIMARY KEY,
    template_id INTEGER UNIQUE NOT NULL,
    name VARCHAR(50) NOT NULL,
    description TEXT,
    features JSONB NOT NULL,
    default_vesting JSONB,
    default_restrictions JSONB,
    created_at TIMESTAMP DEFAULT NOW()
);

-- All tokens created by factory
CREATE TABLE tokens (
    id SERIAL PRIMARY KEY,
    token_id INTEGER UNIQUE NOT NULL,  -- Sequential ID from factory
    on_chain_config VARCHAR(44) UNIQUE NOT NULL,
    mint_address VARCHAR(44) UNIQUE NOT NULL,
    symbol VARCHAR(10) NOT NULL,
    name VARCHAR(50) NOT NULL,
    decimals INTEGER NOT NULL DEFAULT 0,
    total_supply BIGINT NOT NULL,
    features JSONB NOT NULL,
    is_paused BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_tokens_symbol ON tokens(symbol);

-- ============================================================================
-- PER-TOKEN TABLES (all have token_id foreign key)
-- ============================================================================

-- Wallets and their allowlist status (per token)
CREATE TABLE wallets (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    address VARCHAR(44) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    kyc_level INTEGER DEFAULT 0,
    approved_at TIMESTAMP,
    approved_by VARCHAR(44),
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, address)
);

CREATE INDEX idx_wallets_token ON wallets(token_id);
CREATE INDEX idx_wallets_status ON wallets(status);

-- All token transfers (per token)
CREATE TABLE transfers (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    signature VARCHAR(88) NOT NULL,
    from_wallet VARCHAR(44) NOT NULL,
    to_wallet VARCHAR(44) NOT NULL,
    amount BIGINT NOT NULL,
    slot BIGINT NOT NULL,
    block_time TIMESTAMP NOT NULL,
    status VARCHAR(20) NOT NULL,  -- success, failed, blocked
    failure_reason VARCHAR(255),
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, signature)
);

CREATE INDEX idx_transfers_token ON transfers(token_id);
CREATE INDEX idx_transfers_slot ON transfers(token_id, slot);
CREATE INDEX idx_transfers_from ON transfers(token_id, from_wallet);
CREATE INDEX idx_transfers_to ON transfers(token_id, to_wallet);

-- Cap-table snapshots (per token)
CREATE TABLE captable_snapshots (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    slot BIGINT NOT NULL,
    block_time TIMESTAMP NOT NULL,
    total_supply BIGINT NOT NULL,
    holder_count INTEGER NOT NULL,
    snapshot_data JSONB NOT NULL,  -- Full cap-table as JSON
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, slot)
);

CREATE INDEX idx_snapshots_token_slot ON captable_snapshots(token_id, slot);

-- Current balances (per token, materialized view updated by indexer)
CREATE TABLE current_balances (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    wallet VARCHAR(44) NOT NULL,
    balance BIGINT NOT NULL DEFAULT 0,
    last_updated_slot BIGINT NOT NULL,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, wallet)
);

CREATE INDEX idx_balances_token ON current_balances(token_id);

-- Vesting schedules (per token) - SIMPLIFIED
CREATE TABLE vesting_schedules (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    on_chain_address VARCHAR(44) NOT NULL,
    beneficiary VARCHAR(44) NOT NULL,
    total_amount BIGINT NOT NULL,
    released_amount BIGINT NOT NULL DEFAULT 0,
    start_time TIMESTAMP NOT NULL,
    cliff_seconds BIGINT NOT NULL DEFAULT 0,
    duration_seconds BIGINT NOT NULL,
    vesting_type VARCHAR(20) NOT NULL,
    revocable BOOLEAN DEFAULT FALSE,
    revoked BOOLEAN DEFAULT FALSE,
    
    -- Simplified termination (3 types: standard, for_cause, accelerated)
    termination_type VARCHAR(20),  -- 'standard', 'for_cause', 'accelerated'
    terminated_at TIMESTAMP,
    terminated_by VARCHAR(44),
    vested_at_termination BIGINT,
    termination_notes TEXT,
    
    created_at TIMESTAMP DEFAULT NOW(),
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, on_chain_address)
);

CREATE INDEX idx_vesting_token ON vesting_schedules(token_id);
CREATE INDEX idx_vesting_beneficiary ON vesting_schedules(token_id, beneficiary);
CREATE INDEX idx_vesting_terminated ON vesting_schedules(termination_type) WHERE termination_type IS NOT NULL;

-- Dividend distribution rounds (per token)
CREATE TABLE dividend_rounds (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    on_chain_address VARCHAR(44) NOT NULL,
    round_number INTEGER NOT NULL,
    payment_token VARCHAR(44) NOT NULL,
    total_pool BIGINT NOT NULL,
    amount_per_share BIGINT NOT NULL,
    snapshot_slot BIGINT NOT NULL,
    status VARCHAR(20) NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    expires_at TIMESTAMP,
    UNIQUE(token_id, on_chain_address)
);

CREATE INDEX idx_dividends_token ON dividend_rounds(token_id);
CREATE INDEX idx_dividends_status ON dividend_rounds(token_id, status);

-- Dividend claims (per token)
CREATE TABLE dividend_claims (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    round_id INTEGER REFERENCES dividend_rounds(id),
    wallet VARCHAR(44) NOT NULL,
    amount BIGINT NOT NULL,
    claimed_at TIMESTAMP DEFAULT NOW(),
    signature VARCHAR(88) NOT NULL,
    UNIQUE(round_id, wallet)
);

CREATE INDEX idx_claims_token ON dividend_claims(token_id);

-- Governance proposals (per token)
CREATE TABLE proposals (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    on_chain_address VARCHAR(44) NOT NULL,
    proposal_number INTEGER NOT NULL,
    proposer VARCHAR(44) NOT NULL,
    action_type VARCHAR(50) NOT NULL,
    action_data JSONB NOT NULL,
    description TEXT,
    votes_for BIGINT DEFAULT 0,
    votes_against BIGINT DEFAULT 0,
    status VARCHAR(20) NOT NULL,
    voting_starts TIMESTAMP NOT NULL,
    voting_ends TIMESTAMP NOT NULL,
    execution_delay_seconds BIGINT NOT NULL,
    executed_at TIMESTAMP,
    snapshot_slot BIGINT NOT NULL,
    created_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, on_chain_address)
);

CREATE INDEX idx_proposals_token ON proposals(token_id);
CREATE INDEX idx_proposals_status ON proposals(token_id, status);

-- Governance votes (per token)
CREATE TABLE votes (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    proposal_id INTEGER REFERENCES proposals(id),
    voter VARCHAR(44) NOT NULL,
    vote VARCHAR(10) NOT NULL,  -- for, against, abstain
    weight BIGINT NOT NULL,
    voted_at TIMESTAMP DEFAULT NOW(),
    signature VARCHAR(88) NOT NULL,
    UNIQUE(proposal_id, voter)
);

CREATE INDEX idx_votes_token ON votes(token_id);

-- Corporate actions log (per token)
CREATE TABLE corporate_actions (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    action_type VARCHAR(50) NOT NULL,  -- split, symbol_change, dividend
    action_data JSONB NOT NULL,
    executed_at TIMESTAMP DEFAULT NOW(),
    executed_by VARCHAR(44) NOT NULL,
    signature VARCHAR(88) NOT NULL,
    slot BIGINT NOT NULL
);

CREATE INDEX idx_corp_actions_token ON corporate_actions(token_id);
CREATE INDEX idx_corp_actions_type ON corporate_actions(token_id, action_type);

-- Wallet restrictions (per token)
CREATE TABLE wallet_restrictions (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id) NOT NULL,
    wallet VARCHAR(44) NOT NULL,
    daily_limit BIGINT,
    lockout_until TIMESTAMP,
    max_balance BIGINT,
    transferred_today BIGINT DEFAULT 0,
    last_transfer_date DATE,
    updated_at TIMESTAMP DEFAULT NOW(),
    UNIQUE(token_id, wallet)
);

CREATE INDEX idx_restrictions_token ON wallet_restrictions(token_id);

-- Audit log (token_id nullable for factory-level actions)
CREATE TABLE audit_log (
    id SERIAL PRIMARY KEY,
    token_id INTEGER REFERENCES tokens(token_id),
    action VARCHAR(100) NOT NULL,
    actor VARCHAR(44),
    target VARCHAR(44),
    details JSONB,
    ip_address VARCHAR(45),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_audit_token ON audit_log(token_id);
CREATE INDEX idx_audit_created ON audit_log(created_at);
```

### 4.3 Frontend Architecture

```
frontend/
├── app/
│   ├── layout.tsx              # Root layout with providers
│   ├── page.tsx                # Dashboard home
│   ├── globals.css             # Global styles
│   │
│   ├── dashboard/
│   │   └── page.tsx            # Main dashboard with charts
│   │
│   ├── allowlist/
│   │   ├── page.tsx            # Allowlist management
│   │   └── [address]/
│   │       └── page.tsx        # Individual wallet details
│   │
│   ├── tokens/
│   │   ├── page.tsx            # Token operations (mint/transfer)
│   │   └── transfer/
│   │       └── page.tsx        # Transfer interface
│   │
│   ├── captable/
│   │   ├── page.tsx            # Cap-table viewer
│   │   └── export/
│   │       └── page.tsx        # Export options
│   │
│   ├── vesting/
│   │   ├── page.tsx            # Vesting schedules list
│   │   ├── create/
│   │   │   └── page.tsx        # Create new schedule
│   │   └── [id]/
│   │       └── page.tsx        # Individual schedule detail
│   │
│   ├── dividends/
│   │   ├── page.tsx            # Dividend rounds list
│   │   ├── create/
│   │   │   └── page.tsx        # Create dividend round
│   │   └── [id]/
│   │       └── page.tsx        # Round details + claims
│   │
│   ├── governance/
│   │   ├── page.tsx            # Active proposals
│   │   ├── create/
│   │   │   └── page.tsx        # Create proposal
│   │   └── [id]/
│   │       └── page.tsx        # Proposal detail + voting
│   │
│   ├── corporate-actions/
│   │   ├── page.tsx            # Corporate actions hub
│   │   ├── split/
│   │   │   └── page.tsx        # Stock split interface
│   │   └── symbol/
│   │       └── page.tsx        # Symbol change interface
│   │
│   └── admin/
│       ├── page.tsx            # Admin dashboard
│       ├── multisig/
│       │   └── page.tsx        # Multi-sig management
│       └── settings/
│           └── page.tsx        # System settings
│
├── components/
│   ├── ui/                     # shadcn/ui components
│   │   ├── button.tsx
│   │   ├── card.tsx
│   │   ├── dialog.tsx
│   │   ├── dropdown-menu.tsx
│   │   ├── input.tsx
│   │   ├── table.tsx
│   │   ├── tabs.tsx
│   │   └── ...
│   │
│   ├── charts/
│   │   ├── OwnershipPieChart.tsx
│   │   ├── SupplyHistoryChart.tsx
│   │   ├── TransferVolumeChart.tsx
│   │   ├── VestingProgressChart.tsx
│   │   ├── VestingTimelineChart.tsx
│   │   ├── GovernanceVotingChart.tsx
│   │   └── DividendDistributionChart.tsx
│   │
│   ├── layout/
│   │   ├── Header.tsx
│   │   ├── Sidebar.tsx
│   │   ├── Footer.tsx
│   │   └── PageContainer.tsx
│   │
│   ├── allowlist/
│   │   ├── AllowlistTable.tsx
│   │   ├── ApprovalDialog.tsx
│   │   ├── WalletStatusBadge.tsx
│   │   └── BulkApprovalForm.tsx
│   │
│   ├── tokens/
│   │   ├── MintForm.tsx
│   │   ├── TransferForm.tsx
│   │   ├── BalanceDisplay.tsx
│   │   └── TransactionHistory.tsx
│   │
│   ├── captable/
│   │   ├── CapTableGrid.tsx
│   │   ├── SnapshotSelector.tsx
│   │   ├── ExportButtons.tsx
│   │   └── OwnershipBreakdown.tsx
│   │
│   ├── vesting/
│   │   ├── VestingCard.tsx
│   │   ├── VestingForm.tsx
│   │   ├── VestingProgressBar.tsx
│   │   ├── VestingTimeline.tsx
│   │   ├── TerminateDialog.tsx
│   │   └── ClaimButton.tsx
│   │
│   ├── dividends/
│   │   ├── DividendRoundCard.tsx
│   │   ├── CreateDividendForm.tsx
│   │   ├── ClaimDividendButton.tsx
│   │   └── ClaimHistoryTable.tsx
│   │
│   ├── governance/
│   │   ├── ProposalCard.tsx
│   │   ├── CreateProposalForm.tsx
│   │   ├── VotingInterface.tsx
│   │   ├── ProposalTimeline.tsx
│   │   └── VoteBreakdown.tsx
│   │
│   ├── admin/
│   │   ├── MultisigPanel.tsx
│   │   ├── PendingTransactions.tsx
│   │   ├── SignerList.tsx
│   │   └── SystemStatus.tsx
│   │
│   └── common/
│       ├── WalletAddress.tsx   # Truncated address with copy
│       ├── TransactionLink.tsx # Link to Solana Explorer
│       ├── LoadingSpinner.tsx
│       ├── ErrorBoundary.tsx
│       ├── ConfirmDialog.tsx
│       └── Toast.tsx
│
├── hooks/
│   ├── useAllowlist.ts
│   ├── useCapTable.ts
│   ├── useVesting.ts
│   ├── useDividends.ts
│   ├── useGovernance.ts
│   ├── useWebSocket.ts
│   ├── useTokenBalance.ts
│   └── useMultisig.ts
│
├── lib/
│   ├── api.ts                  # API client
│   ├── solana.ts               # Solana wallet adapter
│   ├── utils.ts                # Utility functions
│   ├── constants.ts            # App constants
│   └── types.ts                # TypeScript types
│
├── stores/
│   ├── useAppStore.ts          # Zustand global store
│   ├── useWalletStore.ts
│   └── useNotificationStore.ts
│
├── public/
│   ├── logo.svg
│   └── favicon.ico
│
├── tailwind.config.ts
├── next.config.js
├── package.json
└── tsconfig.json
```

---

## 5. Feature Specifications

### 5.1 Token Factory

#### 5.1.1 Description
A factory contract that creates and manages multiple security tokens. Each token can have different feature configurations, allowing the platform to support various equity structures (startup equity, fund shares, employee grants, etc.).

#### 5.1.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| TF-1 | Create new tokens with unique symbols and names | Must |
| TF-2 | Configure feature flags at token creation | Must |
| TF-3 | Assign multi-sig admin per token | Must |
| TF-4 | Support token templates for quick creation | Should |
| TF-5 | Track all created tokens in factory | Must |
| TF-6 | Each token has isolated state (allowlist, vesting, etc.) | Must |
| TF-7 | UI token selector to switch between tokens | Must |
| TF-8 | Platform admin can pause token creation | Should |

#### 5.1.3 Token Templates

| Template | Description | Features Enabled | Default Vesting |
|----------|-------------|------------------|-----------------|
| **Startup Equity** | Full-featured for startups | All features | 4-year, 1-year cliff |
| **VC Fund Shares** | Investment fund shares | Governance, Dividends | None |
| **Employee Grants** | Simplified for employees | Vesting, Restrictions | 4-year, 1-year cliff |
| **Advisory Shares** | For advisors/consultants | Vesting only | 2-year, 6-month cliff |
| **Custom** | Manual configuration | User-selected | User-defined |

#### 5.1.4 Token Creation Flow

```
STEP 1: SELECT TEMPLATE OR CUSTOM
User selects: Startup Equity Template (or Custom Configuration)

STEP 2: CONFIGURE TOKEN DETAILS
- Symbol: ACME
- Name: ACME Corporation Equity
- Decimals: 0
- Initial Supply: 10,000,000
- Features (from template, can override):
  [✓] Vesting [✓] Governance [✓] Dividends [✓] Transfer Restrictions [✓] Upgradeable

STEP 3: CONFIGURE ADMIN MULTI-SIG
- Threshold: 2 of 3
- Signer 1: 7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU
- Signer 2: 9yLMpq4EX98e08WYKREqC6kBchfUB94UWIvPmCstkBtV
- Signer 3: 3zNRsw5FY09f19XZLTFrD7hCjgVA95TMZJqQmDvuqCwR

STEP 4: FACTORY CREATES TOKEN
1. Validate params (symbol unique, supply > 0, etc.)
2. Increment factory.token_count → token_id = 4
3. Create SPL Token mint with factory as authority
4. Initialize TokenConfig PDA with all settings
5. Initialize MultisigConfig for token admin
6. Emit TokenCreated event

STEP 5: TOKEN READY
- Token ID: 4
- Symbol: ACME
- Mint: 8kPQtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgXyZ
- Config PDA: 5mNRtw3EY07e18WYKREqC6kBchfUB94UWIvPmCstABC
```

#### 5.1.5 Factory Instructions

```rust
/// Initialize the token factory (called once at deployment)
pub fn initialize_factory(
    ctx: Context<InitializeFactory>,
    creation_fee: u64,
) -> Result<()> {
    let factory = &mut ctx.accounts.factory;
    factory.authority = ctx.accounts.authority.key();
    factory.token_count = 0;
    factory.creation_fee = creation_fee;
    factory.fee_recipient = ctx.accounts.authority.key();
    factory.paused = false;
    factory.bump = ctx.bumps.factory;
    
    emit!(FactoryInitialized {
        authority: factory.authority,
        creation_fee,
    });
    
    Ok(())
}

/// Create a new security token
pub fn create_token(
    ctx: Context<CreateToken>,
    params: CreateTokenParams,
) -> Result<()> {
    let factory = &mut ctx.accounts.factory;
    
    // Validations
    require!(!factory.paused, ErrorCode::FactoryPaused);
    require!(params.symbol.len() <= 10, ErrorCode::SymbolTooLong);
    require!(params.symbol.len() >= 1, ErrorCode::SymbolEmpty);
    require!(params.name.len() <= 50, ErrorCode::NameTooLong);
    require!(params.initial_supply > 0, ErrorCode::ZeroSupply);
    require!(params.admin_signers.len() >= params.admin_threshold as usize, 
             ErrorCode::InvalidThreshold);
    
    // Increment token count
    let token_id = factory.token_count;
    factory.token_count = factory.token_count.checked_add(1)
        .ok_or(ErrorCode::MathOverflow)?;
    
    // Apply template defaults if specified
    let features = if let Some(template_id) = params.template_id {
        let template = &ctx.accounts.template;
        require!(template.id == template_id, ErrorCode::TemplateMismatch);
        // Merge template features with any overrides
        merge_features(&template.features, &params.features)
    } else {
        params.features.clone()
    };
    
    // Initialize token config
    let token_config = &mut ctx.accounts.token_config;
    token_config.factory = factory.key();
    token_config.token_id = token_id;
    token_config.authority = ctx.accounts.multisig.key();
    token_config.mint = ctx.accounts.mint.key();
    token_config.symbol = params.symbol.clone();
    token_config.name = params.name.clone();
    token_config.decimals = params.decimals;
    token_config.total_supply = params.initial_supply;
    token_config.split_multiplier = 1;
    token_config.features = features;
    token_config.is_paused = false;
    token_config.upgrade_timelock = 86400; // 24 hours default
    token_config.created_at = Clock::get()?.unix_timestamp;
    token_config.bump = ctx.bumps.token_config;
    
    // Initialize multi-sig for this token
    let multisig = &mut ctx.accounts.multisig;
    multisig.signers = params.admin_signers.clone();
    multisig.threshold = params.admin_threshold;
    multisig.nonce = 0;
    multisig.bump = ctx.bumps.multisig;
    
    emit!(TokenCreated {
        factory: factory.key(),
        token_id,
        symbol: params.symbol,
        name: params.name,
        mint: ctx.accounts.mint.key(),
        initial_supply: params.initial_supply,
        features,
        admin_threshold: params.admin_threshold,
        created_by: ctx.accounts.payer.key(),
    });
    
    Ok(())
}

/// Create a token template (platform admin only)
pub fn create_template(
    ctx: Context<CreateTemplate>,
    params: CreateTemplateParams,
) -> Result<()> {
    // ... template creation logic
}
```

#### 5.1.6 Indexer Integration

**CRITICAL**: Upon `TokenCreated` event emission, the backend indexer MUST dynamically subscribe to the new mint address. No server restart required.

On indexer startup, it bootstraps by:
1. Querying `factory.token_count`
2. Iterating 0..token_count to discover all existing tokens
3. Backfilling any missed transfers per token

See Section 4.2.2 for `FactoryEventListener` implementation.

#### 5.1.7 Feature Gating

When features are disabled at token creation, the corresponding instructions will fail:

```rust
// Example: Vesting instruction checks feature flag
pub fn create_vesting_schedule(
    ctx: Context<CreateVestingSchedule>,
    params: VestingParams,
) -> Result<()> {
    let token_config = &ctx.accounts.token_config;
    
    // Check feature is enabled for this token
    require!(
        token_config.features.vesting_enabled, 
        ErrorCode::FeatureDisabled
    );
    
    // ... rest of vesting creation logic
}

// Error when feature disabled
#[error_code]
pub enum ErrorCode {
    #[msg("This feature is not enabled for this token")]
    FeatureDisabled,
    // ...
}
```

### 5.2 Gated Token Contract

#### 5.2.1 Description
ERC-20 equivalent token on Solana with transfer restrictions based on an allowlist. Only approved wallets can send or receive tokens.

#### 5.2.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| GT-1 | Token follows SPL Token 2022 standard | Must |
| GT-2 | Transfers fail if sender not on allowlist | Must |
| GT-3 | Transfers fail if recipient not on allowlist | Must |
| GT-4 | Transfers succeed when both parties approved | Must |
| GT-5 | Events emitted for all transfers (success/failure) | Must |
| GT-6 | Admin can add/remove wallets from allowlist | Must |
| GT-7 | Revoked wallets cannot send or receive | Must |
| GT-8 | Batch allowlist operations supported | Should |

#### 5.2.3 Transfer Validation Flow

```
TRANSFER REQUEST: from Wallet A to Wallet B

1. Is contract paused?
   - Yes → FAIL (Paused)
   - No → Continue

2. Is sender on allowlist (Active)?
   - No → FAIL (Sender Not Approved)
   - Yes → Continue

3. Is sender in lockout period?
   - Yes → FAIL (Lockout)
   - No → Continue

4. Does transfer exceed daily limit?
   - Yes → FAIL (Daily Limit)
   - No → Continue

5. Does sender have sufficient vested balance?
   - No → FAIL (Vesting)
   - Yes → Continue

6. Is recipient on allowlist (Active)?
   - No → FAIL (Recipient Not Approved)
   - Yes → SUCCESS (Execute Transfer)
```

### 5.3 Multi-Sig Admin Controls

#### 5.3.1 Description
Sensitive operations require M-of-N signatures from authorized administrators. Provides security against single point of compromise.

#### 5.3.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| MS-1 | Configurable threshold (e.g., 2-of-3, 3-of-5) | Must |
| MS-2 | Any signer can propose a transaction | Must |
| MS-3 | Transaction executes when threshold met | Must |
| MS-4 | Transaction expires after configurable timeout | Should |
| MS-5 | Signers can be added/removed (requires multi-sig) | Must |
| MS-6 | Threshold can be changed (requires multi-sig) | Must |
| MS-7 | All proposals visible to all signers | Must |
| MS-8 | Signers can revoke their approval before execution | Should |

#### 5.3.3 Protected Operations

| Operation | Default Threshold | Timelock |
|-----------|------------------|----------|
| Mint tokens | 2-of-3 | None |
| Add to allowlist | 1-of-3 | None |
| Remove from allowlist | 2-of-3 | 1 hour |
| Execute stock split | 2-of-3 | 24 hours |
| Change symbol | 2-of-3 | 24 hours |
| Add/remove signer | 3-of-3 | 24 hours |
| Change threshold | 3-of-3 | 24 hours |
| Pause contract | 1-of-3 | None |
| Upgrade program | 3-of-3 | 48 hours |

#### 5.3.4 Multi-Sig Flow

```
Signer A creates proposal: "Mint 10,000 tokens to Wallet X"
Required: 2-of-3 signatures

1. Signer A signs (1/2)
   Status: PENDING APPROVAL
   Signers: [A: ✓] [B: ○] [C: ○]

2. Signer B signs (2/2)
   Status: THRESHOLD MET - EXECUTING
   Signers: [A: ✓] [B: ✓] [C: ○]

3. Transaction executes
   Status: EXECUTED
   Result: 10,000 tokens minted to Wallet X
```

### 5.4 Vesting Schedules

#### 5.4.1 Description
Tokens can be granted with time-based release schedules. Supports continuous vesting, cliff periods, and configurable durations. Includes simplified termination handling with 3 clear types.

#### 5.4.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| VS-1 | Create vesting schedule with configurable parameters | Must |
| VS-2 | Support continuous (linear) vesting | Must |
| VS-3 | Support cliff + linear vesting | Must |
| VS-4 | Arbitrary time durations (seconds granularity) | Must |
| VS-5 | Calculate vested amount at any timestamp | Must |
| VS-6 | Beneficiary can only transfer vested tokens | Must |
| VS-7 | Visual timeline showing vesting progress | Must |
| VS-8 | Admin can revoke unvested tokens (if revocable) | Should |
| VS-9 | Multiple vesting schedules per wallet | Should |
| VS-10 | Terminate vesting with 3 types (Standard, ForCause, Accelerated) | Must |
| VS-11 | Frozen vesting after termination (no further accrual) | Must |

#### 5.4.3 Termination Types (Simplified)

| Type | Description | Vested Shares | Unvested Shares | Use Case |
|------|-------------|---------------|-----------------|----------|
| **Standard** | Normal departure | Keep | Return to treasury | Resignation, layoff, mutual agreement |
| **ForCause** | Misconduct termination | Forfeit ALL | Return to treasury | Fired for cause, breach of contract |
| **Accelerated** | Immediate full vest | 100% vests | N/A (all vested) | Death, disability, acquisition |

This simplified model covers all real-world scenarios:
- Employee quits → **Standard** (keeps what they earned)
- Employee laid off → **Standard** (keeps what they earned)  
- Employee fired for misconduct → **ForCause** (loses everything)
- Employee dies → **Accelerated** (estate gets 100%)
- Company acquired → **Accelerated** (everyone gets 100%)

#### 5.4.4 Termination Flow

```
BEFORE TERMINATION (Month 18 of 48):
- Employee: Alice (0x1234...5678)
- Total Grant: 48,000 tokens
- Cliff: 12 months (passed)
- Vesting: 48 months
- Status: Vested 18,000 (37.5%), Unvested 30,000 (62.5%), Released 12,000

ADMIN TRIGGERS TERMINATION:
- Select type: Standard / ForCause / Accelerated
- (Standard selected)

TERMINATION EXECUTED:
1. Calculate vested amount at termination timestamp → 18,000 tokens
2. Freeze vesting (no further accrual)
   - terminated_at = current_timestamp
   - termination_type = Standard
3. Return unvested to treasury → 30,000 tokens transferred
4. Emit VestingTerminated event

AFTER TERMINATION:
- Schedule Status: TERMINATED (Standard)
- Vested (frozen): 18,000 tokens
- Released: 12,000 tokens (already in wallet)
- Claimable: 6,000 tokens (vested but not yet released)
- Forfeited: 30,000 tokens (returned to treasury)
- Alice can still release her remaining 6,000 vested tokens.
- No further vesting will occur.
```

#### 5.4.5 Termination Logic (Simplified)

```rust
/// Simplified termination with 3 clear types
pub fn terminate_vesting(
    ctx: Context<TerminateVesting>,
    termination_type: TerminationType,
    notes: Option<String>,
) -> Result<()> {
    let schedule = &mut ctx.accounts.vesting_schedule;
    let clock = Clock::get()?;
    
    // Cannot terminate already terminated schedule
    require!(!schedule.revoked, ErrorCode::AlreadyTerminated);
    
    // Calculate current vested amount
    let vested_now = calculate_vested_amount(schedule, clock.unix_timestamp);
    
    // Determine final vested based on termination type
    let final_vested = match termination_type {
        TerminationType::Standard => vested_now,                  // Keep what's vested
        TerminationType::ForCause => 0,                           // Lose everything
        TerminationType::Accelerated => schedule.total_amount,    // 100% vests
    };
    
    // Calculate amount to return to treasury
    let to_return = schedule.total_amount.saturating_sub(final_vested);
    
    // Transfer unvested back to treasury
    if to_return > 0 {
        transfer_to_treasury(ctx.accounts, to_return)?;
    }
    
    // Update schedule state
    schedule.revoked = true;
    schedule.termination_type = Some(termination_type.clone());
    schedule.terminated_at = Some(clock.unix_timestamp);
    schedule.terminated_by = Some(ctx.accounts.authority.key());
    schedule.vested_at_termination = Some(final_vested);
    schedule.termination_notes = notes;
    
    emit!(VestingTerminated {
        schedule: schedule.key(),
        beneficiary: schedule.beneficiary,
        termination_type,
        final_vested,
        returned_to_treasury: to_return,
        terminated_at: clock.unix_timestamp,
        terminated_by: ctx.accounts.authority.key(),
    });
    
    Ok(())
}

/// Vesting calculation respects termination
pub fn calculate_vested_amount(schedule: &VestingSchedule, current_time: i64) -> u64 {
    // If terminated, use the frozen vested amount
    if let Some(vested_at_term) = schedule.vested_at_termination {
        return vested_at_term;
    }
    
    // If revoked entirely, nothing further vests
    if schedule.revoked {
        return schedule.released_amount;
    }
    
    // Normal vesting calculation
    let elapsed = current_time - schedule.start_time;
    
    if elapsed < 0 {
        return 0;
    }
    
    if elapsed >= schedule.total_duration as i64 {
        return schedule.total_amount;
    }
    
    match schedule.vesting_type {
        VestingType::Linear => {
            (schedule.total_amount as u128 * elapsed as u128 
                / schedule.total_duration as u128) as u64
        },
        VestingType::CliffThenLinear => {
            if elapsed < schedule.cliff_duration as i64 {
                0
            } else {
                let time_after_cliff = elapsed - schedule.cliff_duration as i64;
                let remaining_duration = schedule.total_duration - schedule.cliff_duration;
                (schedule.total_amount as u128 * time_after_cliff as u128 
                    / remaining_duration as u128) as u64
            }
        },
        VestingType::Stepped => {
            let periods_elapsed = elapsed / (30 * 24 * 60 * 60); // 30-day periods
            let total_periods = schedule.total_duration as i64 / (30 * 24 * 60 * 60);
            (schedule.total_amount as u128 * periods_elapsed as u128 
                / total_periods as u128) as u64
        }
    }
}
```

#### 5.4.6 Vesting Calculation (Python)

```python
def calculate_vested_amount(schedule: VestingSchedule, current_time: int) -> int:
    """
    Calculate vested tokens at a given timestamp.
    
    Args:
        schedule: The vesting schedule
        current_time: Unix timestamp to calculate for
    
    Returns:
        Number of tokens vested (transferable)
    """
    # If terminated, return frozen amount
    if schedule.vested_at_termination is not None:
        return schedule.vested_at_termination
    
    if schedule.revoked:
        return schedule.released_amount
    
    elapsed = current_time - schedule.start_time
    
    if elapsed < 0:
        return 0
    
    if elapsed >= schedule.total_duration:
        return schedule.total_amount
    
    match schedule.vesting_type:
        case VestingType.Linear:
            vested = (schedule.total_amount * elapsed) // schedule.total_duration
            
        case VestingType.CliffThenLinear:
            if elapsed < schedule.cliff_duration:
                return 0
            else:
                time_after_cliff = elapsed - schedule.cliff_duration
                remaining_duration = schedule.total_duration - schedule.cliff_duration
                vested = (schedule.total_amount * time_after_cliff) // remaining_duration
                
        case VestingType.Stepped:
            periods_elapsed = elapsed // (30 * 24 * 60 * 60)
            total_periods = schedule.total_duration // (30 * 24 * 60 * 60)
            vested = (schedule.total_amount * periods_elapsed) // total_periods
    
    return min(vested, schedule.total_amount)
```

### 5.5 Lockout Periods & Transfer Limits

#### 5.5.1 Description
Additional transfer restrictions beyond allowlist status. Wallets can have lockout periods (no transfers at all) and daily transfer limits.

#### 5.5.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| LO-1 | Set lockout period per wallet | Must |
| LO-2 | Transfers blocked during lockout | Must |
| LO-3 | Set daily transfer limit per wallet | Must |
| LO-4 | Daily limit resets at UTC midnight | Must |
| LO-5 | Track daily transferred amount | Must |
| LO-6 | Clear error messages for blocked transfers | Must |
| LO-7 | Admin can modify/remove restrictions | Must |
| LO-8 | Global default limits configurable | Should |

#### 5.5.3 Restriction Configuration

```rust
pub struct WalletRestrictions {
    // Lockout: Cannot transfer ANY tokens until this time
    pub lockout_until: Option<i64>,  // Unix timestamp, None = no lockout
    
    // Daily limit: Maximum transfer volume per 24h period
    pub daily_transfer_limit: Option<u64>,  // None = unlimited
    
    // Running totals (reset daily)
    pub transferred_today: u64,
    pub last_transfer_day: i64,  // Unix timestamp of day start
    
    // Optional: Maximum holdings
    pub max_balance: Option<u64>,
}

// Example configurations:
// Founder shares: 6-month lockout, then 10% daily limit
// Employee grants: No lockout, 5% daily limit
// Investor shares: 3-month lockout, unlimited after
```

### 5.6 Stock Split (Corporate Action)

#### 5.6.1 Description
Multiply all token balances by a configurable factor (e.g., 7-for-1). Implemented via on-chain iteration for transparency.

#### 5.6.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| SS-1 | Execute N-for-1 split (configurable multiplier) | Must |
| SS-2 | All balances multiplied by factor | Must |
| SS-3 | Total supply multiplied by factor | Must |
| SS-4 | Ownership percentages unchanged | Must |
| SS-5 | Event emitted documenting split | Must |
| SS-6 | Requires multi-sig approval | Must |
| SS-7 | Split executed in batches (CU limit compliance) | Must |
| SS-8 | Split can be paused/resumed mid-execution | Must |
| SS-9 | Historical cap-table shows pre/post split | Should |

#### 5.6.3 Implementation Approach: On-Chain Iteration

**Why On-Chain Iteration over Virtual Multiplier:**

| Approach | Pros | Cons |
|----------|------|------|
| **On-Chain Iteration (chosen)** | Transparent, auditable on-chain, balances reflect reality | Higher compute cost, requires batching |
| Virtual Multiplier | Simple, single transaction | Confusing for explorers/wallets, display vs actual mismatch |
| New Contract Migration | Clean separation | Complex migration, breaks references |

For a prototype demonstrating blockchain mechanics, on-chain iteration better showcases the technology's transparency benefits, and Solana's low fees make batching practical.

#### 5.6.4 Compute Unit Constraints & Dynamic Batch Sizing

**Problem:** Solana's compute unit limit (200K standard, 1.4M max) prevents looping through all holders in a single transaction.

**Solution:** Backend Split Orchestrator with dynamic batch sizing.

**IMPORTANT:** The `ACCOUNTS_PER_TX = 12` constant is a conservative baseline for vanilla Token-2022 accounts. When Token Extensions are enabled (metadata, transfer hooks, confidential transfers), account sizes increase significantly. The backend MUST query the token's enabled extensions and dynamically calculate batch size based on:
1. Transaction serialization limits (~1232 bytes)
2. Compute unit targets (~80K CU per tx)
3. Extension-specific overhead

Failure to account for this will cause split transactions to fail with `Transaction too large` or `Compute budget exceeded` errors.

```python
# backend/services/split_orchestrator.py

class SplitOrchestrator:
    """
    Manages stock split execution across multiple transactions
    to comply with Solana CU limits.
    """
    
    # Base estimate - adjust dynamically based on token extensions
    BASE_ACCOUNTS_PER_TX = 12
    
    # Extension overhead (approximate account size increases in bytes)
    EXTENSION_OVERHEAD = {
        "metadata": 250,
        "transfer_hook": 100,
        "confidential_transfer": 500,
        "default_account_state": 50,
    }
    
    async def calculate_batch_size(self, token_id: int) -> int:
        """
        Dynamically calculate batch size based on enabled Token Extensions.
        """
        config = await self.solana.get_token_config(token_id)
        
        # Start with base account size (~165 bytes for Token-2022)
        account_size = 165
        
        # Add extension overhead
        if config.features.get("metadata_enabled"):
            account_size += self.EXTENSION_OVERHEAD["metadata"]
        if config.features.get("transfer_hook_enabled"):
            account_size += self.EXTENSION_OVERHEAD["transfer_hook"]
        
        # Calculate how many fit in serialization budget
        available_bytes = 900  # ~1232 - overhead for instruction data
        max_by_size = available_bytes // (32 + account_size)
        
        # Also constrained by CU
        cu_per_account = 6500  # Empirically measured
        target_cu = 80000
        max_by_cu = target_cu // cu_per_account
        
        return min(max_by_size, max_by_cu, self.BASE_ACCOUNTS_PER_TX)
    
    async def execute_split(
        self,
        token_id: int,
        split_ratio: int,
    ) -> SplitResult:
        # 1. Create split record with status "pending"
        split = await self.db.create_split(token_id, split_ratio, "pending")
        
        # 2. Calculate dynamic batch size
        batch_size = await self.calculate_batch_size(token_id)
        
        # 3. Fetch all token accounts for this token
        accounts = await self.solana.get_token_accounts(token_id)
        total_accounts = len(accounts)
        
        # 4. Chunk into batches
        batches = self._chunk(accounts, batch_size)
        
        # 5. Execute batches with progress tracking
        processed = 0
        for i, batch in enumerate(batches):
            try:
                sig = await self.solana.execute_split_batch(
                    token_id=token_id,
                    accounts=batch,
                    split_ratio=split_ratio,
                    batch_index=i,
                )
                processed += len(batch)
                
                # Update progress
                await self.db.update_split_progress(split.id, processed, total_accounts)
                await self.ws.broadcast_split_progress(split.id, processed, total_accounts)
                
            except Exception as e:
                await self.db.update_split_status(split.id, "paused", str(e))
                raise SplitPausedError(split.id, processed, total_accounts)
        
        # 6. Finalize
        await self.solana.finalize_split(token_id, split_ratio)
        await self.db.update_split_status(split.id, "completed")
        
        return SplitResult(split_id=split.id, accounts_updated=processed)
```

#### 5.6.5 Split Execution Example

```
BEFORE SPLIT:
| Wallet         | Balance | Ownership % |
|----------------|---------|-------------|
| 0x1234...5678  | 10,000  | 50.00%      |
| 0xabcd...ef01  | 7,000   | 35.00%      |
| 0x9876...4321  | 3,000   | 15.00%      |
| TOTAL SUPPLY   | 20,000  | 100.00%     |

Execute 7:1 Split (Multi-sig approved)

AFTER SPLIT:
| Wallet         | Balance | Ownership % | Change        |
|----------------|---------|-------------|---------------|
| 0x1234...5678  | 70,000  | 50.00%      | +60,000 (×7)  |
| 0xabcd...ef01  | 49,000  | 35.00%      | +42,000 (×7)  |
| 0x9876...4321  | 21,000  | 15.00%      | +18,000 (×7)  |
| TOTAL SUPPLY   | 140,000 | 100.00%     | +120,000 (×7) |
```

### 5.7 Symbol Change (Corporate Action)

#### 5.7.1 Description
Update the token's ticker symbol while preserving all balances and ownership. Uses Token-2022 native metadata extension.

#### 5.7.2 Implementation Approach: Mutable Metadata

**Why Token-2022 Native Metadata over Alternatives:**

| Approach | Pros | Cons |
|----------|------|------|
| **Token-2022 Metadata (chosen)** | Native support, single transaction, modern standard | Requires Token-2022 program |
| Metaplex Metadata | Widely supported | Separate account, more complexity |
| New Contract | Clean break | Migration complexity, breaks references |

Token-2022's built-in metadata extension is the cleanest solution for mutable symbols.

#### 5.7.3 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| SC-1 | Change token symbol | Must |
| SC-2 | All balances preserved | Must |
| SC-3 | Event emitted documenting change | Must |
| SC-4 | Requires multi-sig approval | Must |
| SC-5 | Symbol visible in explorers/wallets | Must |
| SC-6 | Historical record of symbol changes | Should |

#### 5.7.4 Implementation

```rust
pub fn change_symbol(
    ctx: Context<ChangeSymbol>,
    new_symbol: String,
) -> Result<()> {
    require!(new_symbol.len() <= 10, ErrorCode::SymbolTooLong);
    require!(!new_symbol.is_empty(), ErrorCode::SymbolEmpty);
    
    let config = &mut ctx.accounts.token_config;
    let old_symbol = config.symbol.clone();
    config.symbol = new_symbol.clone();
    
    // Update Token-2022 metadata
    update_field(
        &ctx.accounts.token_program.to_account_info(),
        &ctx.accounts.mint.to_account_info(),
        &ctx.accounts.update_authority.to_account_info(),
        spl_token_metadata_interface::state::Field::Symbol,
        new_symbol.clone(),
    )?;
    
    emit!(SymbolChanged {
        token_id: config.token_id,
        old_symbol,
        new_symbol,
        changed_by: ctx.accounts.authority.key(),
        slot: Clock::get()?.slot,
    });
    
    Ok(())
}
```

### 5.8 Dividend Distribution

#### 5.8.1 Description
Distribute payments (TestUSDC) proportionally to token holders using a pull-based claim model.

#### 5.8.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| DV-1 | Create dividend round with total pool | Must |
| DV-2 | Snapshot ownership at specific block | Must |
| DV-3 | Calculate per-share entitlement | Must |
| DV-4 | Holders can claim proportional share | Must |
| DV-5 | Prevent double-claiming | Must |
| DV-6 | Track claim status per wallet | Must |
| DV-7 | Support multiple dividend rounds | Must |
| DV-8 | Optional claim deadline | Should |
| DV-9 | Unclaimed funds return to treasury | Should |

#### 5.8.3 Dividend Flow

```
STEP 1: CREATE DIVIDEND ROUND
Admin creates dividend round:
- Payment Token: TestUSDC
- Total Pool: 100,000 TestUSDC
- Snapshot Slot: 123456789
- Claim Deadline: 30 days

STEP 2: CALCULATE ENTITLEMENTS (at snapshot)
Total Supply at Snapshot: 100,000 tokens
Dividend per Share: 1.0 TestUSDC

| Wallet         | Shares  | Entitlement   | Status    |
|----------------|---------|---------------|-----------|
| 0x1234...5678  | 50,000  | 50,000 USDC   | Unclaimed |
| 0xabcd...ef01  | 35,000  | 35,000 USDC   | Unclaimed |
| 0x9876...4321  | 15,000  | 15,000 USDC   | Unclaimed |

STEP 3: HOLDERS CLAIM
Wallet 0x1234 calls claim_dividend(round_id):
- Verifies not already claimed
- Looks up balance at snapshot_slot
- Transfers 50,000 TestUSDC to wallet
- Marks as claimed
```

### 5.9 On-Chain Governance

#### 5.9.1 Description
Token holders can create proposals and vote on protocol changes. Voting power is proportional to token holdings at snapshot.

#### 5.9.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| GV-1 | Create proposals with action and description | Must |
| GV-2 | Snapshot voting power at proposal creation | Must |
| GV-3 | Configurable voting period | Must |
| GV-4 | Vote for/against/abstain | Must |
| GV-5 | Weight votes by token balance | Must |
| GV-6 | Quorum requirement (% must vote) | Must |
| GV-7 | Approval threshold (% to pass) | Must |
| GV-8 | Timelock before execution | Must |
| GV-9 | Execute passed proposals | Must |
| GV-10 | Cancel proposals (proposer only) | Should |

#### 5.9.3 Governance Parameters

```rust
pub struct GovernanceConfig {
    pub min_proposal_threshold: u64,  // Minimum tokens to propose (e.g., 1%)
    pub voting_delay: u64,            // Seconds after creation before voting
    pub voting_period: u64,           // Seconds voting is open
    pub quorum_percentage: u8,        // % of supply must vote (e.g., 10%)
    pub approval_threshold: u8,       // % of votes to pass (e.g., 66%)
    pub execution_delay: u64,         // Seconds after passing before execution
    pub execution_window: u64,        // Seconds window to execute
}

// Default configuration (demo-friendly short times):
GovernanceConfig {
    min_proposal_threshold: 100,      // 1% of 10,000 supply
    voting_delay: 60,                 // 1 minute
    voting_period: 300,               // 5 minutes
    quorum_percentage: 10,            // 10% must vote
    approval_threshold: 66,           // 66% to pass
    execution_delay: 120,             // 2 minutes
    execution_window: 600,            // 10 minutes to execute
}
```

### 5.10 Cap-Table Export

#### 5.10.1 Description
Generate ownership records at any block height in multiple formats (CSV, JSON, PDF).

#### 5.10.2 Acceptance Criteria

| ID | Criteria | Priority |
|----|----------|----------|
| CT-1 | Export current cap-table | Must |
| CT-2 | Export historical cap-table at any block | Must |
| CT-3 | CSV format with all fields | Must |
| CT-4 | JSON format with all fields | Must |
| CT-5 | PDF format with formatting | Must |
| CT-6 | Include wallet, balance, ownership % | Must |
| CT-7 | Include vesting status per wallet | Should |
| CT-8 | Include restriction status per wallet | Should |
| CT-9 | Pie chart in PDF export | Should |

#### 5.10.3 Export Formats

**CSV Format:**
```csv
wallet,balance,ownership_pct,vested,unvested,lockout_until,daily_limit,status
0x1234...5678,70000,50.00,70000,0,,10000,Active
0xabcd...ef01,49000,35.00,24500,24500,2024-06-01,5000,Active
0x9876...4321,21000,15.00,21000,0,,,Active
```

**JSON Format:**
```json
{
  "snapshot": {
    "slot": 123456789,
    "timestamp": "2024-01-15T14:30:00Z",
    "total_supply": 140000,
    "holder_count": 3
  },
  "token": {
    "symbol": "ACME",
    "name": "ACME Corp Equity",
    "decimals": 0
  },
  "holders": [
    {
      "wallet": "0x1234...5678",
      "balance": 70000,
      "ownership_pct": 50.00,
      "vesting": {
        "total": 70000,
        "vested": 70000,
        "unvested": 0
      },
      "restrictions": {
        "lockout_until": null,
        "daily_limit": 10000
      },
      "status": "Active"
    }
  ]
}
```

---

## 6. Data Models

### 6.1 Core Entities

```typescript
// TypeScript interfaces for frontend/API

// ============================================================================
// FACTORY TYPES
// ============================================================================

interface TokenFactory {
  address: string;
  authority: string;
  tokenCount: number;
  creationFee: bigint;
  paused: boolean;
}

interface TokenTemplate {
  id: number;
  name: string;
  description: string;
  features: TokenFeatures;
  defaultVesting: DefaultVestingConfig | null;
  defaultRestrictions: DefaultRestrictions | null;
}

interface TokenFeatures {
  vestingEnabled: boolean;
  governanceEnabled: boolean;
  dividendsEnabled: boolean;
  transferRestrictionsEnabled: boolean;
  upgradeable: boolean;
}

interface Token {
  tokenId: number;
  configAddress: string;
  mintAddress: string;
  symbol: string;
  name: string;
  decimals: number;
  totalSupply: bigint;
  features: TokenFeatures;
  isPaused: boolean;
  createdAt: Date;
  holderCount: number;
  transferCount24h: number;
}

// ============================================================================
// WALLET & ALLOWLIST TYPES
// ============================================================================

interface Wallet {
  tokenId: number;
  address: string;
  status: 'pending' | 'active' | 'revoked' | 'suspended';
  kycLevel: number;
  approvedAt: Date | null;
  approvedBy: string | null;
  balance: bigint;
  vestingSchedules: VestingSchedule[];
  restrictions: WalletRestrictions | null;
}

// ============================================================================
// VESTING TYPES (SIMPLIFIED)
// ============================================================================

interface VestingSchedule {
  id: string;
  beneficiary: string;
  totalAmount: bigint;
  releasedAmount: bigint;
  startTime: Date;
  cliffDuration: number;
  totalDuration: number;
  vestingType: 'linear' | 'cliff_then_linear' | 'stepped';
  revocable: boolean;
  revoked: boolean;
  
  // Simplified termination (3 types)
  terminationType: TerminationType | null;
  terminatedAt: Date | null;
  terminatedBy: string | null;
  vestedAtTermination: bigint | null;
  terminationNotes: string | null;
  
  // Computed
  vestedAmount: bigint;
  availableAmount: bigint;
  percentVested: number;
  isTerminated: boolean;
  forfeitedAmount: bigint;
}

// Simplified: 3 types instead of 7
type TerminationType = 'standard' | 'for_cause' | 'accelerated';

interface WalletRestrictions {
  wallet: string;
  dailyLimit: bigint | null;
  transferredToday: bigint;
  lockoutUntil: Date | null;
  maxBalance: bigint | null;
  isInLockout: boolean;
  remainingDailyAllowance: bigint;
}

// ============================================================================
// OTHER TYPES
// ============================================================================

interface Transfer {
  signature: string;
  from: string;
  to: string;
  amount: bigint;
  slot: bigint;
  blockTime: Date;
  status: 'success' | 'failed' | 'blocked';
  failureReason: string | null;
}

interface DividendRound {
  id: number;
  paymentToken: string;
  totalPool: bigint;
  amountPerShare: bigint;
  snapshotSlot: bigint;
  status: 'pending' | 'active' | 'completed';
  createdAt: Date;
  expiresAt: Date | null;
  totalClaimed: bigint;
  claimCount: number;
}

interface Proposal {
  id: number;
  proposer: string;
  action: GovernanceAction;
  description: string;
  votesFor: bigint;
  votesAgainst: bigint;
  status: 'pending' | 'active' | 'passed' | 'failed' | 'executed' | 'cancelled';
  votingStarts: Date;
  votingEnds: Date;
  executionDelay: number;
  executedAt: Date | null;
  snapshotSlot: bigint;
  quorumReached: boolean;
  approvalReached: boolean;
  canExecute: boolean;
}

interface CapTableSnapshot {
  slot: bigint;
  timestamp: Date;
  totalSupply: bigint;
  holderCount: number;
  holders: CapTableEntry[];
}

interface CapTableEntry {
  wallet: string;
  balance: bigint;
  ownershipPct: number;
  vesting: {
    total: bigint;
    vested: bigint;
    unvested: bigint;
  };
  restrictions: {
    lockoutUntil: Date | null;
    dailyLimit: bigint | null;
  };
  status: string;
}
```

---

## 7. API Specifications

### 7.1 REST API Endpoints

#### 7.1.1 Token Factory

```yaml
GET /api/v1/factory
GET /api/v1/factory/tokens
GET /api/v1/factory/tokens/{token_id}
GET /api/v1/factory/templates
POST /api/v1/factory/tokens
```

#### 7.1.2 Allowlist Management

```yaml
GET /api/v1/tokens/{token_id}/allowlist
GET /api/v1/tokens/{token_id}/allowlist/{address}
POST /api/v1/tokens/{token_id}/allowlist/approve
POST /api/v1/tokens/{token_id}/allowlist/revoke
POST /api/v1/tokens/{token_id}/allowlist/bulk-approve
```

#### 7.1.3 Token Operations

```yaml
POST /api/v1/tokens/{token_id}/mint
GET /api/v1/tokens/{token_id}/info
GET /api/v1/tokens/{token_id}/balance/{address}
POST /api/v1/tokens/{token_id}/transfer
```

#### 7.1.4 Cap-Table

```yaml
GET /api/v1/tokens/{token_id}/captable
GET /api/v1/tokens/{token_id}/captable/at/{slot}
GET /api/v1/tokens/{token_id}/captable/snapshots
```

#### 7.1.5 Vesting (Simplified)

```yaml
# Create vesting schedule
POST /api/v1/tokens/{token_id}/vesting
Body:
  - beneficiary: string
  - total_amount: number
  - start_time: timestamp
  - cliff_seconds: number
  - duration_seconds: number
  - vesting_type: linear | cliff_then_linear | stepped
  - revocable: boolean
Response:
  - multisig_tx_id: string

# Get vesting schedule
GET /api/v1/tokens/{token_id}/vesting/{id}
Response:
  - schedule: VestingSchedule

# Get all schedules for wallet
GET /api/v1/tokens/{token_id}/vesting/wallet/{address}
Response:
  - schedules: VestingSchedule[]

# Release vested tokens
POST /api/v1/tokens/{token_id}/vesting/{id}/release
Response:
  - signature: string
  - released_amount: number

# Terminate vesting (SIMPLIFIED: 3 types)
POST /api/v1/tokens/{token_id}/vesting/{id}/terminate
Body:
  - termination_type: string  # 'standard', 'for_cause', 'accelerated'
  - notes: string (optional)
Response:
  - multisig_tx_id: string
  - final_vested: number
  - returned_to_treasury: number

# Get termination preview
GET /api/v1/tokens/{token_id}/vesting/{id}/termination-preview
Query:
  - termination_type: string
Response:
  - current_vested: number
  - final_vested: number      # What they'll get
  - to_treasury: number       # What returns to company
```

#### 7.1.6 Dividends

```yaml
POST /api/v1/tokens/{token_id}/dividends
GET /api/v1/tokens/{token_id}/dividends
GET /api/v1/tokens/{token_id}/dividends/{round_id}
POST /api/v1/tokens/{token_id}/dividends/{round_id}/claim
GET /api/v1/tokens/{token_id}/dividends/unclaimed/{address}
```

#### 7.1.7 Governance

```yaml
POST /api/v1/tokens/{token_id}/governance/proposals
GET /api/v1/tokens/{token_id}/governance/proposals
GET /api/v1/tokens/{token_id}/governance/proposals/{id}
POST /api/v1/tokens/{token_id}/governance/proposals/{id}/vote
POST /api/v1/tokens/{token_id}/governance/proposals/{id}/execute
GET /api/v1/tokens/{token_id}/governance/voting-power/{address}
```

#### 7.1.8 Corporate Actions

```yaml
POST /api/v1/tokens/{token_id}/corporate-actions/split
POST /api/v1/tokens/{token_id}/corporate-actions/symbol
GET /api/v1/tokens/{token_id}/corporate-actions
```

#### 7.1.9 Admin / Multi-Sig

```yaml
GET /api/v1/tokens/{token_id}/admin/multisig/pending
POST /api/v1/tokens/{token_id}/admin/multisig/{tx_id}/sign
GET /api/v1/tokens/{token_id}/admin/multisig/config
```

### 7.2 WebSocket Events

```typescript
// Connection
ws://localhost:8000/ws

// Subscribe to events
{
  "type": "subscribe",
  "channels": ["factory", "transfers", "allowlist", "governance", "dividends"],
  "token_id": 1  // Optional filter
}

// Event: Token Created
{
  "type": "token_created",
  "data": {
    "token_id": 4,
    "symbol": "ACME",
    "mint": "8kPQ..."
  }
}

// Event: Transfer
{
  "type": "transfer",
  "data": {
    "token_id": 1,
    "signature": "...",
    "from": "...",
    "to": "...",
    "amount": 1000,
    "status": "success"
  }
}

// Event: Vesting Terminated
{
  "type": "vesting",
  "subtype": "terminated",
  "data": {
    "token_id": 1,
    "schedule_id": "...",
    "beneficiary": "...",
    "termination_type": "standard",
    "final_vested": 18000,
    "returned_to_treasury": 30000
  }
}

// Event: Split Progress
{
  "type": "split_progress",
  "data": {
    "split_id": "...",
    "processed": 50,
    "total": 150,
    "status": "in_progress"
  }
}
```

---

## 8. User Interface Requirements

### 8.1 Token Selector (Header Component)

All pages must include a token selector dropdown in the header. Switching tokens reloads the page data for the selected token.

### 8.2 Vesting Management UI

**Terminate Dialog (3 Options):**
```
┌─────────────────────────────────────────────────────────────────────────┐
│  Terminate Vesting Schedule                                        [X] │
├─────────────────────────────────────────────────────────────────────────┤
│  Beneficiary: Alice (0x1234...5678)                                     │
│  Grant: 48,000 ACME tokens                                              │
│  Currently Vested: 18,000 tokens (37.5%)                                │
│                                                                          │
│  Termination Type:                                                      │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │ (●) Standard      Employee keeps vested tokens                  │   │
│  │                   Use for: resignation, layoff, mutual agreement│   │
│  │                                                                  │   │
│  │ ( ) For Cause     Employee forfeits ALL tokens                  │   │
│  │                   Use for: misconduct, breach of contract       │   │
│  │                                                                  │   │
│  │ ( ) Accelerated   100% vests immediately                        │   │
│  │                   Use for: death, disability, acquisition       │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  RESULT PREVIEW                                                         │
│  Employee receives:     18,000 tokens                                   │
│  Returns to treasury:   30,000 tokens                                   │
│                                                                          │
│  Notes (optional): [________________________________]                   │
│                                                                          │
│                    [Cancel]              [Terminate]                    │
│  ⓘ Requires 2 of 3 multi-sig approvals                                 │
└─────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Common UI Patterns

#### 8.3.1 Prototype Disclaimer Banner

```tsx
// components/PrototypeDisclaimer.tsx
export function PrototypeDisclaimer() {
  return (
    <div className="fixed bottom-0 left-0 right-0 bg-amber-100 border-t border-amber-300 
                    px-4 py-2 text-center text-sm text-amber-800 z-50">
      <span className="font-medium">⚠️ PROTOTYPE ENVIRONMENT</span>
      <span className="mx-2">•</span>
      <span>Not for Real Financial Use</span>
      <span className="mx-2">•</span>
      <span>Solana Devnet Only</span>
    </div>
  );
}
```

---

## 9. Testing Strategy

### 9.1 Testing Pyramid

```
                    ┌─────────────┐
                    │    E2E      │  Playwright (10%)
                    └─────────────┘
               ┌─────────────────────────┐
               │   Integration Tests     │  pytest (30%)
               └─────────────────────────┘
          ┌─────────────────────────────────────┐
          │         Unit Tests                  │  Rust + pytest (60%)
          └─────────────────────────────────────┘
```

### 9.2 Vesting Termination Tests (Simplified)

```rust
// tests/vesting_termination.rs

#[cfg(test)]
mod termination_tests {
    use super::*;
    
    #[test]
    fn test_standard_termination() {
        // Setup: Create vesting, advance to 50% vested
        // Action: Terminate with Standard
        // Assert: Beneficiary keeps 50%
        // Assert: Treasury receives 50%
    }
    
    #[test]
    fn test_for_cause_termination() {
        // Setup: Create vesting, advance to 50% vested
        // Action: Terminate with ForCause
        // Assert: Beneficiary gets 0%
        // Assert: Treasury receives 100%
    }
    
    #[test]
    fn test_accelerated_termination() {
        // Setup: Create vesting, advance to 25% vested
        // Action: Terminate with Accelerated
        // Assert: Beneficiary gets 100%
        // Assert: Treasury receives 0%
    }
    
    #[test]
    fn test_release_after_termination() {
        // Setup: Terminate Standard at 50% vested, 25% released
        // Action: Release remaining vested tokens
        // Assert: Can release the remaining 25%
        // Assert: Cannot release more than vested_at_termination
    }
    
    #[test]
    #[should_panic(expected = "AlreadyTerminated")]
    fn test_cannot_terminate_twice() {
        // Setup: Terminate schedule
        // Action: Attempt second termination
        // Assert: Fails with AlreadyTerminated
    }
    
    #[test]
    fn test_termination_before_cliff() {
        // Setup: Create cliff vesting, terminate before cliff
        // Action: Terminate with Standard
        // Assert: 0 tokens vested (cliff not reached)
        // Assert: 100% returned to treasury
    }
}
```

### 9.3 Required Test Scenarios (from spec)

| # | Scenario | Test Location |
|---|----------|---------------|
| 1 | Approve wallet → Mint tokens → Verify balance | Rust + Integration |
| 2 | Transfer between two approved wallets → SUCCESS | Rust + Integration |
| 3 | Transfer from approved to non-approved → FAIL | Rust + Integration |
| 4 | Transfer from non-approved to approved → FAIL | Rust + Integration |
| 5 | Revoke approval → Previously approved cannot receive | Rust + Integration |
| 6 | Execute 7-for-1 split → All balances multiply by 7 | Rust + Integration |
| 7 | Change symbol → Metadata updates, balances unchanged | Rust + Integration |
| 8 | Export cap-table at block N → Verify accuracy | Integration + E2E |
| 9 | Export cap-table at block N+10 → Verify changes | Integration |
| 10 | Unauthorized wallet attempts admin action → FAIL | Rust unit |

### 9.4 Compute Unit Benchmarks

| Operation | Target (CU) | Solana Limit |
|-----------|-------------|--------------|
| Initialize factory | <30,000 | 200,000 |
| Create token | <100,000 | 200,000 |
| Mint tokens | <50,000 | 200,000 |
| Approve wallet | <30,000 | 200,000 |
| Transfer (gated) | <80,000 | 200,000 |
| Create vesting | <60,000 | 200,000 |
| Terminate vesting | <70,000 | 200,000 |
| Stock split (per holder) | <50,000 | 200,000 |
| Symbol change | <30,000 | 200,000 |

---

## 10. Security Considerations

### 10.1 Smart Contract Security

- All admin functions require multi-sig approval
- Check-effects-interactions pattern for reentrancy protection
- Checked arithmetic to prevent overflows
- PDA derivation verification
- Account ownership validation

### 10.2 Known Risks & Limitations

| Risk | Mitigation | Residual Risk |
|------|------------|---------------|
| Admin key compromise | Multi-sig, timelocks | Threshold collusion |
| Bug in split logic | Extensive testing | Undiscovered edge cases |
| Indexer data inconsistency | Polling fallback | Brief desync windows |
| Devnet instability | Local testing option | Demo reliability |

### 10.3 Disclaimer

```
DISCLAIMER: This is a technical prototype for educational and demonstration 
purposes only. It is NOT regulatory-compliant and should NOT be used for 
actual securities issuance, trading, or management without comprehensive 
legal review and regulatory approval.
```

---

## 11. Performance Requirements

### 11.1 Latency Targets

| Operation | Target | Maximum |
|-----------|--------|---------|
| Transfer confirmation | <1 second | 3 seconds |
| Cap-table query | <500ms | 2 seconds |
| Indexer event processing | <2 seconds | 10 seconds |
| UI page load | <1 second | 3 seconds |

---

## 12. Deployment Strategy

### 12.1 Development Environment

```bash
# One-command setup
make dev

# Or with Docker
docker-compose up -d
```

### 12.2 Environment Configuration

```bash
# .env.example
SOLANA_CLUSTER=devnet
PROGRAM_ID=<deployed_program_id>
DATABASE_URL=postgresql://user:pass@localhost:5432/chainequity
API_HOST=0.0.0.0
API_PORT=8000
```

---

## 13. Future Considerations

### 13.1 Deferred Features

- Secondary Market (on-chain order book)
- Cross-Chain Bridge (Solana ↔ EVM)
- ZK Privacy (zero-knowledge compliance proofs)

### 13.2 Submission Deliverables

| Deliverable | Status |
|-------------|--------|
| GitHub Repository | ⏳ To Build |
| Technical Writeup (1-2 pages) | ⏳ To Create |
| Demo Video | ⏳ Required |
| AI Usage Log | ✅ Appendix |
| Live Demo | ⏳ Optional |

---

## 14. Appendices

### 14.1 Glossary

| Term | Definition |
|------|------------|
| Accelerated | Termination type where 100% vests immediately (death, disability, acquisition) |
| Allowlist | Set of approved wallet addresses |
| ForCause | Termination type where employee forfeits all tokens (misconduct) |
| Standard | Termination type where employee keeps vested, loses unvested (normal departure) |
| Vesting | Gradual release of tokens over time |

### 14.2 Decision Log

| Decision | Options | Choice | Rationale |
|----------|---------|--------|-----------|
| Blockchain | Ethereum, Solana | Solana | Low fees, fast finality |
| Termination types | 7 types | 3 types | Simpler, covers all real scenarios |
| Split implementation | Virtual, On-chain | On-chain | Transparency for prototype |
| Symbol change | Metaplex, Token-2022 | Token-2022 | Native support, simpler |

### 14.3 AI Usage Log

| Phase | AI Tool | Usage |
|-------|---------|-------|
| PRD Creation | Claude | Comprehensive specification |
| PRD Simplification | Claude | Reduced termination types 7→3 |
| Architecture | Claude | Token factory pattern |
| PRD v1.5 | Claude | Dynamic indexer subscription, batch sizing |

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Dec 2024 | Initial PRD |
| 1.1 | Dec 2024 | Added vesting termination (7 types) |
| 1.2 | Dec 2024 | Added token factory |
| 1.3 | Dec 2024 | Added CU constraints, disclaimers |
| 1.4 | Dec 2024 | Simplified termination: 7 types → 3 types |
| 1.5 | Dec 2024 | Added dynamic indexer subscription (Section 4.2.2, 5.1.6), dynamic batch sizing for splits (Section 5.6.4) |

---

*End of Document*
