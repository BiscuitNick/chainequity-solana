# API Routes Comprehensive Review

## Overview

This document provides a complete analysis of all backend API routes, their purposes, frontend usage, and recommendations for routes to keep, modify, or remove. The system uses **transactions as the source of truth**, which has implications for several legacy routes.

## Executive Summary

- **Total Backend Routes**: ~95 endpoints across 18 router files
- **Active Frontend Usage**: ~60 distinct API calls from frontend
- **Recommended to Keep**: 85 routes (core functionality)
- **Recommended to Remove/Deprecate**: 3 routes (legacy/unused)
- **Recommended to Fix**: 2 frontend mismatches

---

## API Routes by Module

### 1. Root Level Routes (main.py)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/health` | GET | Health check endpoint | `api.health()` via special URL handling | **KEEP** - Essential for monitoring |
| `/slot` | GET | Get current Solana slot | `api.getCurrentSlot()` - special URL handling removes `/api/v1` | **KEEP** - Critical for transaction-based state reconstruction |

**Notes**: The `/slot` endpoint is at root level, not under `/api/v1`. Frontend handles this correctly with `this.baseUrl.replace('/api/v1', '') + '/slot'`.

---

### 2. Factory Routes (`factory.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/factory/info` | GET | Get factory program info | `api.getFactoryInfo()` | **KEEP** - Token creation support |
| `/factory/templates` | GET | List token templates | `api.getTemplates()` | **KEEP** - Token creation support |
| `/factory/tokens` | POST | Create new token | `api.createToken()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 3. Token Routes (`tokens.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/` | GET | List all tokens | `api.listTokens()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/info` | GET | Get token details | `api.getTokenInfo()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/balance/{address}` | GET | Get wallet balance | `api.getBalance()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/holders` | GET | List token holders | `api.getHolders()` | **KEEP** - Cap table support |

**Status**: All routes actively used, well-integrated.

---

### 4. Allowlist Routes (`allowlist.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/allowlist` | GET | List allowlist entries | `api.getAllowlist()` | **KEEP** - Essential for compliance |
| `/tokens/{token_id}/allowlist` | POST | Add to allowlist | `api.addToAllowlist()` | **KEEP** - Essential for compliance |
| `/tokens/{token_id}/allowlist/approve` | POST | Approve wallet | `api.approveWallet()` | **KEEP** - Essential for compliance |
| `/tokens/{token_id}/allowlist/revoke` | POST | Revoke wallet | `api.revokeWallet()` | **KEEP** - Essential for compliance |
| `/tokens/{token_id}/allowlist/{address}` | DELETE | Remove from allowlist | `api.removeFromAllowlist()` | **KEEP** - Essential for compliance |

**Status**: All routes actively used, well-integrated.

---

### 5. Issuance Routes (`issuance.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/issuance` | GET | List all issuances | `api.getIssuances()` | **KEEP** - Historical data |
| `/tokens/{token_id}/issuance` | POST | Issue tokens | `api.issueTokens()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/issuance/recent` | GET | Recent issuances with slot filter | `api.getRecentIssuances()` | **KEEP** - Activity feed support |
| `/tokens/{token_id}/issuance/stats` | GET | Issuance statistics | `api.getIssuanceStats()` | **KEEP** - Dashboard metrics |
| `/tokens/{token_id}/issuance/{id}/confirm` | POST | Confirm issuance | `api.confirmIssuance()` | **KEEP** - Transaction confirmation |

**Status**: All routes actively used, well-integrated.

---

### 6. Cap Table Routes (`captable.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/captable` | GET | Get current cap table | `api.getCapTable()` | **KEEP** - Core functionality (fallback) |
| `/tokens/{token_id}/captable/at/{slot}` | GET | Historical cap table at slot | `api.getCapTable(tokenId, slot)` | **KEEP** - Historical view |
| `/tokens/{token_id}/captable/export` | GET | Export cap table CSV/PDF | `api.exportCapTable()` | **KEEP** - Compliance reporting |
| `/tokens/{token_id}/captable/snapshots` | GET | List snapshots (V1) | `api.getCapTableSnapshots()` | **DEPRECATE** - V2 preferred |
| `/tokens/{token_id}/captable/snapshots/v2` | GET | List snapshots (V2) | `api.getCapTableSnapshotsV2()` | **KEEP** - Better historical data |
| `/tokens/{token_id}/captable/snapshots/v2` | POST | Create V2 snapshot | `api.createCapTableSnapshotV2()` | **KEEP** - Manual snapshots |
| `/tokens/{token_id}/captable/snapshots/v2/{slot}` | GET | Get V2 snapshot detail | `api.getCapTableSnapshotV2AtSlot()` | **KEEP** - Detailed historical view |
| `/tokens/{token_id}/captable/state/{slot}` | GET | Reconstruct state at slot | `api.getReconstructedStateAtSlot()` | **KEEP** - **PRIMARY** method for historical data |
| `/tokens/{token_id}/captable/enhanced` | GET | Enhanced cap table with share classes | `api.getEnhancedCapTable()` | **KEEP** - Investment modeling |
| `/tokens/{token_id}/captable/enhanced/by-wallet` | GET | Enhanced cap table grouped by wallet | `api.getEnhancedCapTableByWallet()` | **KEEP** - Investment modeling |

**Important Notes**:
- The frontend now primarily uses `getReconstructedStateAtSlot()` for both live and historical views
- V1 snapshots (`/captable/snapshots`) are legacy - consider deprecation
- The regular `/captable` endpoint is used as a fallback when reconstruction fails

---

### 7. Transfer Routes (`transfers.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/transfers` | GET | List transfers | `api.getTransfers()` | **KEEP** - Historical data |
| `/tokens/{token_id}/transfers/stats` | GET | Transfer statistics | `api.getTransferStats()` | **KEEP** - Dashboard metrics |
| `/tokens/{token_id}/transfers/recent` | GET | Recent transfers with slot filter | `api.getRecentTransfers()` | **REVIEW** - May be replaced by unified transactions |

**Notes**: The frontend now primarily uses unified transactions (`api.getUnifiedTransactions()`) for the activity feed, but these endpoints may still be used elsewhere.

---

### 8. Vesting Routes (`vesting.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/vesting` | GET | List vesting schedules | `api.getVestingSchedules()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/vesting` | POST | Create vesting schedule | `api.createVestingSchedule()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/vesting/{id}/release` | POST | Release vested tokens | `api.releaseVestedTokens()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/vesting/{id}/terminate` | POST | Terminate vesting | `api.terminateVesting()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 9. Dividend Routes (`dividends.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/dividends` | GET | List dividend rounds | `api.getDividendRounds()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/dividends` | POST | Create dividend round | `api.createDividendRound()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/dividends/{id}/progress` | GET | Distribution progress | `api.getDistributionProgress()` | **KEEP** - Monitoring |
| `/tokens/{token_id}/dividends/{id}/payments` | GET | List payments | `api.getDividendPayments()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/dividends/{id}/retry` | POST | Retry failed distributions | `api.retryFailedDistributions()` | **KEEP** - Error recovery |
| `/tokens/{token_id}/dividends/{id}/claims` | GET | List claims (legacy) | `api.getDividendClaims()` | **DEPRECATE** - Use `/payments` instead |

**Notes**: The `/claims` endpoint is marked as legacy in the frontend API client. Consider deprecating in favor of `/payments`.

---

### 10. Governance Routes (`governance.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/governance/proposals` | GET | List proposals | `api.getProposals()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/governance/proposals` | POST | Create proposal | `api.createProposal()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/governance/proposals/{id}` | GET | Get proposal detail | Not directly called | **KEEP** - May be used internally |
| `/tokens/{token_id}/governance/proposals/{id}/vote` | POST | Vote on proposal | `api.vote()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/governance/proposals/{id}/execute` | POST | Execute proposal | `api.executeProposal()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/governance/voting-power/{address}` | GET | Get voting power | `api.getVotingPower()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 11. Admin Routes (`admin.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/admin/multisig/config` | GET | Get multisig config | `api.getMultiSigInfo()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/multisig/pending` | GET | List pending transactions | `api.getPendingTransactions()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/multisig/{tx_id}/sign` | POST | Sign transaction | `api.approveTransaction()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/multisig/{tx_id}/execute` | POST | Execute transaction | `api.executeTransaction()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/multisig/{tx_id}/cancel` | POST | Cancel transaction | Not exposed in frontend | **KEEP** - May be needed |
| `/tokens/{token_id}/admin/multisig/threshold` | POST | Update threshold | `api.updateMultiSigThreshold()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/pause` | POST | Pause/unpause token | `api.setPaused()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/corporate-actions` | GET | List corporate actions | `api.getCorporateActions()` | **KEEP** - Historical data |
| `/tokens/{token_id}/admin/corporate-actions/split` | POST | Initiate split (prepare tx) | Not used | **REVIEW** - May be legacy |
| `/tokens/{token_id}/admin/corporate-actions/symbol` | POST | Change symbol (prepare tx) | Not used | **REVIEW** - May be legacy |
| `/tokens/{token_id}/admin/execute-split` | POST | Execute stock split | `api.executeStockSplit()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/admin/change-symbol` | POST | Execute symbol change | `api.changeSymbol()` | **KEEP** - Core functionality |

**Notes**:
- The `/corporate-actions/split` and `/corporate-actions/symbol` routes appear to be legacy routes for preparing unsigned transactions
- The frontend uses `/execute-split` and `/change-symbol` directly, which execute the actions
- Consider removing the legacy preparation routes if not needed

---

### 12. Share Classes Routes (`share_classes.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/share-classes` | GET | List share classes | `api.getShareClasses()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/share-classes` | POST | Create share class | `api.createShareClass()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/share-classes/{id}` | GET | Get share class | `api.getShareClass()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/share-classes/{id}` | PUT | Update share class | Not exposed in frontend | **KEEP** - May be needed |
| `/tokens/{token_id}/share-classes/{id}` | DELETE | Delete share class | `api.deleteShareClass()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/share-classes/{id}/positions` | GET | Get positions for class | `api.getSharePositions()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/share-classes/positions/recent` | GET | Recent share grants | `api.getRecentSharePositions()` | **KEEP** - Activity feed support |
| `/tokens/{token_id}/share-classes/issue` | POST | Issue shares | `api.issueShares()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 13. Funding Rounds Routes (`funding_rounds.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/funding-rounds` | GET | List funding rounds | `api.getFundingRounds()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds` | POST | Create funding round | `api.createFundingRound()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds/{id}` | GET | Get funding round | `api.getFundingRound()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds/{id}/investments` | GET | List investments | `api.getRoundInvestments()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds/{id}/investments` | POST | Add investment | `api.addInvestment()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds/{id}/investments/{inv_id}` | DELETE | Remove investment | `api.removeInvestment()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds/{id}/close` | POST | Close round | `api.closeFundingRound()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/funding-rounds/{id}/cancel` | POST | Cancel round | `api.cancelFundingRound()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 14. Convertibles Routes (`convertibles.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/convertibles` | GET | List convertibles | `api.getConvertibles()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/convertibles` | POST | Create convertible | `api.createConvertible()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/convertibles/outstanding` | GET | List outstanding only | Not exposed in frontend | **KEEP** - Useful for filtering |
| `/tokens/{token_id}/convertibles/{id}` | GET | Get convertible | `api.getConvertible()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/convertibles/{id}/convert` | POST | Convert instrument | `api.convertInstrument()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/convertibles/{id}/cancel` | POST | Cancel convertible | `api.cancelConvertible()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 15. Valuations Routes (`valuations.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/valuations` | GET | List valuation history | `api.getValuationHistory()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/valuations` | POST | Create valuation | `api.createValuation()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/valuations/current` | GET | Get current valuation | `api.getCurrentValuation()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/valuations/{id}` | GET | Get specific valuation | Not exposed in frontend | **KEEP** - May be needed |

**Status**: All routes actively used, well-integrated.

---

### 16. Simulator Routes (`simulator.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/simulator/waterfall` | POST | Simulate waterfall | `api.simulateWaterfall()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/simulator/waterfall/scenarios` | POST | Multiple scenarios | `api.simulateWaterfallScenarios()` | **KEEP** - Core functionality |
| `/tokens/{token_id}/simulator/dilution` | POST | Simulate dilution | `api.simulateDilution()` | **KEEP** - Core functionality |

**Status**: All routes actively used, well-integrated.

---

### 17. Transactions Routes (`transactions.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/tokens/{token_id}/transactions/` | GET | List transactions | `api.getUnifiedTransactions()` | **KEEP** - **PRIMARY** data source |
| `/tokens/{token_id}/transactions/` | POST | Record transaction | Admin/testing only | **KEEP** - Administrative |
| `/tokens/{token_id}/transactions/activity` | GET | Activity feed format | Not directly used | **REVIEW** - May be redundant |

**Important Notes**:
- The frontend now primarily uses `getUnifiedTransactions()` for the activity feed
- The `/activity` endpoint provides human-readable formatting but the frontend does its own formatting
- Consider if `/activity` endpoint is still needed

---

### 18. Sync Routes (`sync.py`)

| Route | Method | Purpose | Frontend Usage | Recommendation |
|-------|--------|---------|----------------|----------------|
| `/sync/tokens` | POST | Sync tokens from chain | Not exposed in frontend | **KEEP** - Server-side sync |
| `/sync/status` | GET | Sync service status | Not exposed in frontend | **KEEP** - Monitoring |

**Status**: Server-side functionality, not directly used by frontend.

---

## Frontend API Client Analysis

### Current Issues Found

#### 1. **Health Check URL Issue**
```typescript
// Current in api.ts line 59-61
async health() {
  return this.request<{ status: string; version: string; cluster: string }>('/health')
}
```

**Problem**: The `/health` endpoint is at root level, not under `/api/v1`, but `this.request()` adds the `/api/v1` prefix.

**Fix**: Change to:
```typescript
async health() {
  const url = this.baseUrl.replace('/api/v1', '') + '/health'
  const response = await fetch(url)
  return response.json() as Promise<{ status: string; version: string; cluster: string }>
}
```

**Impact**: Low - health check may be failing silently

---

#### 2. **Dividend Claims Legacy Endpoint**
```typescript
// Current in api.ts line 276-278
async getDividendClaims(tokenId: number, roundId: number) {
  return this.request<DividendClaim[]>(`/tokens/${tokenId}/dividends/${roundId}/claims`)
}
```

**Problem**: This is marked as "legacy" in the comments but the backend may not have this endpoint. The payments endpoint (`/dividends/{id}/payments`) should be used instead.

**Status**: Need to verify if `/claims` endpoint exists in backend. If not, remove from frontend.

---

### Routes That Are Well-Integrated

The following frontend methods correctly match their backend counterparts:

- All token operations (list, info, balance, holders)
- All allowlist operations
- All issuance operations
- All cap table operations (including V2 and reconstruction)
- All vesting operations
- All dividend operations (except legacy claims)
- All governance operations
- All admin operations
- All share class operations
- All funding round operations
- All convertible operations
- All valuation operations
- All simulator operations
- Unified transactions

---

## Recommendations Summary

### Routes to Remove/Deprecate

1. **`/tokens/{token_id}/captable/snapshots` (V1)** - Replaced by V2 snapshots and on-the-fly reconstruction
   - Action: Mark as deprecated, remove after migration

2. **`/tokens/{token_id}/dividends/{id}/claims`** - Legacy, replaced by `/payments`
   - Action: Remove backend route if it exists, or add if missing for backwards compatibility

3. **`/tokens/{token_id}/admin/corporate-actions/split`** and **`/corporate-actions/symbol`** - Legacy preparation routes
   - Action: Review if anyone uses unsigned transaction flow; if not, remove

### Routes to Keep As-Is

All other ~85 routes are actively used and should be kept.

### Frontend Fixes Required

1. **Fix `health()` method** to not use the `/api/v1` prefix
2. **Verify or remove `getDividendClaims()`** method

### Architecture Notes

The system has evolved to use **transactions as the source of truth**:

1. **State Reconstruction**: `getReconstructedStateAtSlot()` is the primary method for viewing historical and even current state
2. **Activity Feed**: `getUnifiedTransactions()` provides the activity feed data
3. **Legacy Endpoints**: Some endpoints like `/captable` serve as fallbacks but may not reflect transaction-reconstructed state

This is the correct architecture - transactions should be the source of truth for a blockchain-based system.

---

## Action Items

### Immediate (Before Next Release)

1. [ ] Fix frontend `health()` method URL handling
2. [ ] Verify `/dividends/{id}/claims` endpoint exists in backend; if not, remove from frontend

### Short-term (Next Sprint)

1. [ ] Add deprecation warnings to V1 snapshot endpoints
2. [ ] Review corporate action preparation routes for removal
3. [ ] Consider removing `/transactions/activity` if redundant

### Long-term (Future Release)

1. [ ] Remove deprecated V1 snapshot endpoints
2. [ ] Remove legacy claim-based dividend endpoints
3. [ ] Consolidate transfer/issuance routes with unified transactions if redundant

---

## Appendix: Complete Route Count by Module

| Module | Route Count | Status |
|--------|-------------|--------|
| Root (health, slot) | 2 | All Active |
| Factory | 3 | All Active |
| Tokens | 4 | All Active |
| Allowlist | 5 | All Active |
| Issuance | 5 | All Active |
| Cap Table | 10 | 1 Deprecated |
| Transfers | 3 | All Active |
| Vesting | 4 | All Active |
| Dividends | 6 | 1 Legacy |
| Governance | 6 | All Active |
| Admin | 12 | 2 Review |
| Share Classes | 8 | All Active |
| Funding Rounds | 8 | All Active |
| Convertibles | 6 | All Active |
| Valuations | 4 | All Active |
| Simulator | 3 | All Active |
| Transactions | 3 | 1 Review |
| Sync | 2 | All Active |
| **Total** | **~94** | **~85 Active, 5 Review, 4 Deprecated/Legacy** |
