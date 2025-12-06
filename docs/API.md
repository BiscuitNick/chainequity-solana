# ChainEquity API Documentation

This document describes the REST API endpoints for the ChainEquity backend.

**Base URL:** `http://localhost:8000/api/v1`

## Table of Contents

1. [Authentication](#authentication)
2. [Tokens](#tokens)
3. [Allowlist](#allowlist)
4. [Vesting](#vesting)
5. [Dividends](#dividends)
6. [Governance](#governance)
7. [Cap Table](#cap-table)
8. [Admin](#admin)
9. [WebSocket](#websocket)

---

## Authentication

Currently, the API does not require authentication. In production, implement JWT or API key authentication.

---

## Tokens

### List Tokens

```http
GET /tokens
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| skip | int | 0 | Number of records to skip |
| limit | int | 100 | Maximum records to return |

**Response:**
```json
[
  {
    "token_id": 1,
    "symbol": "ACME",
    "name": "ACME Corp Equity",
    "mint_address": "Hk4M...",
    "decimals": 0,
    "total_supply": 1000000,
    "is_paused": false,
    "created_at": "2024-01-15T10:00:00Z"
  }
]
```

### Get Token Info

```http
GET /tokens/{token_id}/info
```

**Response:**
```json
{
  "token_id": 1,
  "symbol": "ACME",
  "name": "ACME Corp Equity",
  "mint_address": "Hk4M...",
  "on_chain_config": "Cfg1...",
  "decimals": 0,
  "total_supply": 1000000,
  "features": {
    "vesting_enabled": true,
    "governance_enabled": true,
    "dividends_enabled": true,
    "transfer_restrictions_enabled": true
  },
  "is_paused": false
}
```

### Get Wallet Balance

```http
GET /tokens/{token_id}/balance/{address}
```

**Response:**
```json
{
  "address": "Jm2N...",
  "balance": 50000,
  "token_account": "TkAc..."
}
```

---

## Allowlist

### Get Allowlist

```http
GET /tokens/{token_id}/allowlist
```

**Response:**
```json
[
  {
    "address": "Jm2N...",
    "status": "approved",
    "kyc_level": 2,
    "approved_at": "2024-01-15T10:00:00Z",
    "approved_by": "Admin..."
  }
]
```

### Get Wallet Status

```http
GET /tokens/{token_id}/allowlist/{address}
```

**Response:**
```json
{
  "address": "Jm2N...",
  "status": "approved",
  "kyc_level": 2,
  "approved_at": "2024-01-15T10:00:00Z",
  "approved_by": "Admin..."
}
```

### Approve Wallet

```http
POST /tokens/{token_id}/allowlist/approve
```

**Request Body:**
```json
{
  "address": "Jm2N...",
  "kyc_level": 2
}
```

**Response:** Returns unsigned transaction for client signing.
```json
{
  "message": "Allowlist approve transaction prepared for signing",
  "allowlist_pda": "Alst...",
  "instruction": {
    "program": "Prog...",
    "action": "update_allowlist",
    "data": {
      "wallet": "Jm2N...",
      "approved": true,
      "kyc_level": 2
    }
  }
}
```

### Revoke Wallet

```http
POST /tokens/{token_id}/allowlist/revoke
```

**Request Body:**
```json
{
  "address": "Jm2N..."
}
```

### Bulk Approve

```http
POST /tokens/{token_id}/allowlist/bulk-approve
```

**Request Body:**
```json
{
  "addresses": ["Addr1...", "Addr2...", "Addr3..."],
  "kyc_level": 1
}
```

---

## Vesting

### List Vesting Schedules

```http
GET /tokens/{token_id}/vesting
```

**Response:**
```json
[
  {
    "id": "Vest...",
    "beneficiary": "Benf...",
    "total_amount": 100000,
    "released_amount": 25000,
    "vested_amount": 50000,
    "start_time": "2024-01-01T00:00:00Z",
    "cliff_duration": 31536000,
    "total_duration": 126144000,
    "vesting_type": "cliff_then_linear",
    "revocable": true,
    "is_terminated": false
  }
]
```

### Get Vesting Schedule

```http
GET /tokens/{token_id}/vesting/{schedule_id}
```

### Get Wallet Vesting Schedules

```http
GET /tokens/{token_id}/vesting/wallet/{address}
```

### Create Vesting Schedule

```http
POST /tokens/{token_id}/vesting
```

**Request Body:**
```json
{
  "beneficiary": "Benf...",
  "total_amount": 100000,
  "start_time": 1704067200,
  "cliff_seconds": 31536000,
  "duration_seconds": 126144000,
  "vesting_type": "cliff_then_linear",
  "revocable": true
}
```

**Vesting Types:**
- `linear` - Linear vesting over duration
- `cliff_then_linear` - Cliff period, then linear vesting
- `stepped` - Discrete vesting periods

### Release Vested Tokens

```http
POST /tokens/{token_id}/vesting/{schedule_id}/release
```

**Response:**
```json
{
  "message": "Release vested tokens transaction prepared for signing",
  "vesting_pda": "Vest...",
  "releasable_amount": 25000,
  "instruction": {...}
}
```

### Terminate Vesting

```http
POST /tokens/{token_id}/vesting/{schedule_id}/terminate
```

**Request Body:**
```json
{
  "termination_type": "standard",
  "notes": "Employee departure"
}
```

**Termination Types:**
- `standard` - Keep vested tokens, return unvested to treasury
- `for_cause` - Forfeit all unvested tokens
- `accelerated` - Fully vest all tokens immediately

### Preview Termination

```http
GET /tokens/{token_id}/vesting/{schedule_id}/termination-preview?termination_type=standard
```

**Response:**
```json
{
  "current_vested": 50000,
  "final_vested": 50000,
  "to_treasury": 50000
}
```

---

## Dividends

### List Dividend Rounds

```http
GET /tokens/{token_id}/dividends
```

**Response:**
```json
[
  {
    "id": 1,
    "round_number": 1,
    "payment_token": "USDC...",
    "total_pool": 50000,
    "amount_per_share": 50,
    "snapshot_slot": 12345678,
    "status": "active",
    "created_at": "2024-03-01T00:00:00Z",
    "expires_at": "2024-06-01T00:00:00Z",
    "total_claimed": 25000,
    "claim_count": 50
  }
]
```

### Get Dividend Round

```http
GET /tokens/{token_id}/dividends/{round_id}
```

### Create Dividend Round

```http
POST /tokens/{token_id}/dividends
```

**Request Body:**
```json
{
  "payment_token": "USDC...",
  "total_pool": 50000,
  "expires_in_seconds": 7776000
}
```

### Claim Dividend

```http
POST /tokens/{token_id}/dividends/{round_id}/claim
```

### Get Unclaimed Dividends

```http
GET /tokens/{token_id}/dividends/unclaimed/{address}
```

**Response:**
```json
{
  "total_unclaimed": 5000,
  "rounds": [...]
}
```

---

## Governance

### List Proposals

```http
GET /tokens/{token_id}/governance/proposals
```

**Response:**
```json
[
  {
    "id": 1,
    "proposal_number": 1,
    "proposer": "Prop...",
    "action_type": "stock_split",
    "action_data": {"ratio": 2},
    "description": "2-for-1 stock split",
    "votes_for": 600000,
    "votes_against": 100000,
    "votes_abstain": 50000,
    "status": "active",
    "voting_starts": "2024-03-01T00:00:00Z",
    "voting_ends": "2024-03-08T00:00:00Z",
    "quorum_reached": true,
    "approval_reached": true,
    "can_execute": false
  }
]
```

**Proposal Statuses:**
- `pending` - Not yet active
- `active` - Voting in progress
- `passed` - Voting complete, passed
- `failed` - Voting complete, failed
- `executed` - Proposal executed
- `cancelled` - Proposal cancelled

### Get Proposal

```http
GET /tokens/{token_id}/governance/proposals/{proposal_id}
```

### Create Proposal

```http
POST /tokens/{token_id}/governance/proposals
```

**Request Body:**
```json
{
  "action_type": "stock_split",
  "action_data": {"ratio": 2},
  "description": "Proposed 2-for-1 stock split"
}
```

**Action Types:**
- `stock_split` - Stock split with ratio
- `symbol_change` - Change token symbol
- `pause` - Pause token transfers
- `unpause` - Unpause token transfers
- `allowlist_add` - Add wallet to allowlist
- `allowlist_remove` - Remove wallet from allowlist

### Vote on Proposal

```http
POST /tokens/{token_id}/governance/proposals/{proposal_id}/vote
```

**Request Body:**
```json
{
  "vote": "for"
}
```

**Vote Options:**
- `for` - Vote in favor
- `against` - Vote against
- `abstain` - Abstain from voting

### Execute Proposal

```http
POST /tokens/{token_id}/governance/proposals/{proposal_id}/execute
```

### Get Voting Power

```http
GET /tokens/{token_id}/governance/voting-power/{address}
```

**Response:**
```json
{
  "address": "Vote...",
  "balance": 50000,
  "voting_power": 50000,
  "delegated_to": null
}
```

---

## Cap Table

### Get Current Cap Table

```http
GET /tokens/{token_id}/captable
```

**Response:**
```json
{
  "slot": 12345678,
  "timestamp": "2024-03-15T10:00:00Z",
  "total_supply": 1000000,
  "holder_count": 150,
  "holders": [
    {
      "wallet": "Hold...",
      "balance": 100000,
      "ownership_pct": 10.0,
      "vested": 50000,
      "unvested": 25000,
      "lockout_until": null,
      "daily_limit": null,
      "status": "active"
    }
  ]
}
```

### Get Historical Cap Table

```http
GET /tokens/{token_id}/captable/at/{slot}
```

### List Snapshots

```http
GET /tokens/{token_id}/captable/snapshots
```

**Response:**
```json
[
  {
    "slot": 12345678,
    "timestamp": "2024-03-15T10:00:00Z",
    "holder_count": 150
  }
]
```

### Export Cap Table

```http
GET /tokens/{token_id}/captable/export?format=csv
```

**Query Parameters:**
| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| format | string | csv | Export format: csv, json, pdf |
| slot | int | null | Historical slot (optional) |

**Response:** File download with appropriate content type.

---

## Admin

### Get Multi-Sig Config

```http
GET /tokens/{token_id}/admin/multisig/config
```

**Response:**
```json
{
  "signers": ["Sign1...", "Sign2...", "Sign3..."],
  "threshold": 2,
  "nonce": 5
}
```

### List Pending Transactions

```http
GET /tokens/{token_id}/admin/multisig/pending
```

**Response:**
```json
[
  {
    "id": "TxId...",
    "instruction_type": "stock_split",
    "instruction_data": {"ratio": 2},
    "signers_approved": ["Sign1..."],
    "signers_pending": ["Sign2...", "Sign3..."],
    "created_at": "2024-03-15T10:00:00Z",
    "expires_at": "2024-03-22T10:00:00Z"
  }
]
```

### Sign Transaction

```http
POST /tokens/{token_id}/admin/multisig/{tx_id}/sign
```

### Execute Transaction

```http
POST /tokens/{token_id}/admin/multisig/{tx_id}/execute
```

### Cancel Transaction

```http
POST /tokens/{token_id}/admin/multisig/{tx_id}/cancel
```

### Initiate Stock Split

```http
POST /tokens/{token_id}/admin/corporate-actions/split
```

**Request Body:**
```json
{
  "action_type": "split",
  "params": {
    "ratio": 7
  }
}
```

**Response:**
```json
{
  "message": "Stock split transaction prepared for signing",
  "instruction": {...},
  "warning": "Stock splits affect all token holders. This action cannot be undone."
}
```

### Change Symbol

```http
POST /tokens/{token_id}/admin/corporate-actions/symbol
```

**Request Body:**
```json
{
  "action_type": "symbol",
  "params": {
    "new_symbol": "NEWT"
  }
}
```

### List Corporate Actions

```http
GET /tokens/{token_id}/admin/corporate-actions
```

**Response:**
```json
[
  {
    "id": 1,
    "action_type": "stock_split",
    "action_data": {"ratio": 7},
    "executed_at": "2024-03-15T10:00:00Z",
    "executed_by": "Admin...",
    "signature": "Sig...",
    "slot": 12345678
  }
]
```

---

## WebSocket

### Connection

```
ws://localhost:8000/ws/{token_id}
```

### Subscribe to Events

Send a subscription message after connecting:

```json
{
  "action": "subscribe",
  "channels": ["transfers", "vesting", "dividends", "governance"]
}
```

### Event Types

**Transfer Event:**
```json
{
  "type": "transfer",
  "data": {
    "from": "From...",
    "to": "To...",
    "amount": 1000,
    "signature": "Sig...",
    "slot": 12345678
  }
}
```

**Vesting Event:**
```json
{
  "type": "vesting_released",
  "data": {
    "schedule_id": "Vest...",
    "beneficiary": "Benf...",
    "amount": 25000
  }
}
```

**Governance Event:**
```json
{
  "type": "vote_cast",
  "data": {
    "proposal_id": 1,
    "voter": "Vote...",
    "vote": "for",
    "weight": 50000
  }
}
```

### WebSocket Stats

```http
GET /ws/stats
```

**Response:**
```json
{
  "active_connections": 15,
  "queue_size": 0,
  "subscriptions": {
    "transfers": 10,
    "governance": 5
  }
}
```

---

## Error Responses

All endpoints return standard error responses:

```json
{
  "detail": "Error message describing what went wrong"
}
```

**Common HTTP Status Codes:**
| Code | Description |
|------|-------------|
| 200 | Success |
| 400 | Bad Request - Invalid input |
| 404 | Not Found - Resource doesn't exist |
| 422 | Validation Error - Request validation failed |
| 500 | Internal Server Error |

---

## Rate Limiting

Currently no rate limiting is implemented. In production, implement appropriate rate limits.

---

## Pagination

List endpoints support pagination via query parameters:
- `skip` - Number of records to skip (default: 0)
- `limit` - Maximum records to return (default: 100, max: 1000)
