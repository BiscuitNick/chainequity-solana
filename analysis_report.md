# Backend Endpoint Analysis & Refactoring Plan

## Executive Summary
The current backend architecture relies on **state mutation** across multiple tables (`CurrentBalance`, `SharePosition`, `VestingSchedule`, etc.) to track ownership and history. To enable precise point-in-time snapshots (e.g., "what was the cap table at slot 400?"), we are moving to an **Event Sourcing** pattern.

A new `Transactions` table will serve as the single source of truth, capturing every business event with its associated Solana slot. State at any point will be derived by replaying these events.

## New 'Transactions' Table Schema
This table will consolidate data from `TokenIssuance`, `VestingSchedule`, `CorporateAction`, and others.

- **id**: Integer (Primary Key)
- **token_id**: Integer (Foreign Key)
- **type**: String (e.g., 'Mint', 'Transfer', 'VestingSchedule', 'Vested', 'Governance', 'Dividend')
- **wallet**: String (Address)
- **slot**: BigInteger (The strict ordering mechanism)
- **block_time**: DateTime
- **symbol**: String
- **shares**: BigInteger (Signed delta or absolute amount depending on type)
- **priority**: Integer (For investment analysis)
- **preference**: Float (For investment analysis)
- **data**: JSON (Context-specific fields: `proposal_id`, `vesting_terms`, etc.)
- **tx_hash**: String (Solana signature, optional)

## Endpoint Analysis

### 1. Token Factory (`factory.py`)
- **`POST /tokens`**: Creates a new token.
  - **Status**: **Keep**.
  - **Refactor**: Should emit a `TokenCreated` event in the `Transactions` table to mark the genesis of the token.

### 2. Issuance (`issuance.py`)
- **`POST /` (Issue Tokens)**: Currently updates `CurrentBalance` and creates `TokenIssuance`.
  - **Status**: **Keep**.
  - **Refactor**: Instead of mutating balance, write a `Mint` event to `Transactions`.
  - **Fields**: `Type=Mint`, `Wallet=Recipient`, `Shares=Amount`, `Slot=CurrentSlot`, `Priority=X`, `Preference=Y`.

### 3. Vesting (`vesting.py`)
- **`POST /` (Create Schedule)**: Currently creates `VestingSchedule`.
  - **Status**: **Keep**.
  - **Refactor**: Write a `VestingSchedule` event. This records the *promise* of future tokens.
  - **Fields**: `Type=VestingSchedule`, `Wallet=Beneficiary`, `Shares=TotalAmount`, `Data={start_time, cliff, duration}`.
- **`POST /{id}/release`**: Currently updates `CurrentBalance` and `VestingSchedule.released_amount`.
  - **Status**: **Keep**.
  - **Refactor**: Write a `Vested` event when tokens are actually released to the wallet.
  - **Fields**: `Type=Vested`, `Wallet=Beneficiary`, `Shares=AmountReleased`.

### 4. Transfers (`transfers.py`)
- **`GET /...`**: Reads from `Transfer` table.
  - **Status**: **Keep**.
  - **Refactor**: The `Transfer` table essentially *is* a log, but it should be merged into `Transactions` or `Transactions` should ingest on-chain transfers.
  - **Event**: `Transfer`. Records `Type=Transfer`, `Wallet=From`, `Shares=-Amount` AND `Type=Transfer`, `Wallet=To`, `Shares=+Amount`.

### 5. Corporate Actions (`admin.py`)
- **`POST /execute-split`**: Currently updates all `CurrentBalance` records.
  - **Status**: **Keep** (logic), but **Change** (implementation).
  - **Refactor**: Instead of updating every row, write a `StockSplit` event (`Type=Split`, `Data={ratio}`). The snapshot replayer will apply this multiplier dynamically when calculating balances past this slot.

### 6. Funding Rounds (`funding_rounds.py`)
- **`POST /{id}/close`**: Currently performs complex updates to `SharePosition` and `CurrentBalance`.
  - **Status**: **Keep**.
  - **Refactor**: This should emit multiple events:
    - `ValuationUpdated` (Token level)
    - `Mint` events for each investor (replacing the direct balance update).
    - `ShareClassAssigned` events.

### 7. Dividends (`dividends.py`)
- **`POST /`**: Creates `DividendPayment` records.
  - **Status**: **Keep**.
  - **Refactor**: Emit `DividendDistributed` events for historical tracking.

## Unneeded / Redundant Endpoints
- **`GET /captable`**: Currently queries `CurrentBalance`.
  - **Refactor**: This logic must change to `query Transactions where slot <= TargetSlot group by wallet`.
- **`POST /{id}/confirm`**: Manually confirming issuances might be redundant if we listen to the blockchain, but useful for the hybrid approach.

## Conclusion
Most *functionality* is needed, but the *storage mechanism* changes from "Update Current State" to "Append Event". The `Transactions` table becomes the primary write target. Read views (dashboards, cap tables) become projections of this table.
