# Plan: Activity Type Display Refactoring

## Goal
Create consistent display logic for all share-related activities in the Recent Activity table on the Dashboard.

## Current Issues
1. `share_grant` shows Type as "SHARES (CLASS)" - should not show share class in Type column
2. `share_grant` with purchased shares shows From as "GRANT" - should show "INVESTMENT"
3. `vesting_release` shows as separate type - should be "SHARES" type with From "VESTING"
4. `convertible_convert` shows as separate type - should be "SHARES" type with From "CONVERT"
5. `mint` type is confusing - all mints are ultimately shares

## Desired Behavior

### Type Column (What kind of transaction)
| Transaction Type | Display |
|-----------------|---------|
| `share_grant` | SHARES |
| `vesting_release` | SHARES |
| `convertible_convert` | SHARES |
| `mint` | SHARES |
| `transfer` | TRANSFER |
| `approval` | APPROVAL |
| `stock_split` | SPLIT |
| `dividend_payment` | DIVIDEND |

### From Column (Source of shares)
| Transaction Type | Condition | From Display |
|-----------------|-----------|--------------|
| `share_grant` | `price_per_share > 0` or `cost_basis > 0` | INVESTMENT |
| `share_grant` | No price/cost | GRANT |
| `vesting_release` | - | VESTING |
| `convertible_convert` | - | CONVERT |
| `mint` | - | GRANT (default) or check data for context |
| `transfer` | - | (wallet address) |

### To Column
- Always shows the recipient wallet address

### Remove from Type Column
- Share class symbol in parentheses (move to expanded details only)

## Files to Modify

### `frontend/app/page.tsx`

#### 1. Update `convertTransactionToActivity` function (lines 103-147)

Change the logic to:
```typescript
// For all share issuance types, determine the 'from' based on context
if (tx.tx_type === 'mint' || tx.tx_type === 'share_grant') {
  // Check if this is a paid investment (has price_per_share > 0 or cost_basis > 0)
  const hasCost = (tx.data?.price_per_share && tx.data.price_per_share > 0) ||
                  (tx.data?.cost_basis && tx.data.cost_basis > 0)
  from = hasCost ? 'INVESTMENT' : 'GRANT'
  to = tx.wallet || ''
} else if (tx.tx_type === 'vesting_release') {
  from = 'VESTING'
  to = tx.wallet || ''
} else if (tx.tx_type === 'convertible_convert') {
  from = 'CONVERT'
  to = tx.wallet || ''
}
```

#### 2. Update Type display (lines 499-531)

Change the type badge display:
```typescript
{activity.type === 'mint' || activity.type === 'share_grant'
  ? 'SHARES'
  : activity.type === 'vesting_release'
  ? 'SHARES'
  : activity.type === 'convertible_convert'
  ? 'SHARES'
  : activity.type === 'transfer'
  ? 'TRANSFER'
  : activity.type === 'approval'
  ? 'APPROVAL'
  : activity.type === 'stock_split'
  ? 'SPLIT'
  : activity.type === 'dividend_payment'
  ? 'DIVIDEND'
  : activity.type.toUpperCase().replace('_', ' ')}
```

#### 3. Remove share class from Type column (lines 529-531)

Delete:
```typescript
{activity.shareClass && (
  <span className="text-xs text-muted-foreground ml-1">({activity.shareClass})</span>
)}
```

The share class will still be visible in the expanded row details.

#### 4. Update color coding for types

Consolidate colors:
- All SHARES types (mint, share_grant, vesting_release, convertible_convert) use the same color (purple or green)

## Expected Result

| Type | From | To | Shares | Description |
|------|------|-----|--------|-------------|
| SHARES | GRANT | 7xK2...pQ3m | 1,000,000 | Free share grant |
| SHARES | INVESTMENT | 9aB1...cD4e | 500,000 | Purchased shares |
| SHARES | VESTING | 7xK2...pQ3m | 10,000 | Vesting release |
| SHARES | CONVERT | 3fG5...hI6j | 250,000 | SAFE conversion |
| TRANSFER | 7xK2...pQ3m | 9aB1...cD4e | 50,000 | Transfer between wallets |
