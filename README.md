# Solana Trading Bot

MEV-aware automated trading on Solana. Built by Zoki 🤖

## Architecture

```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  Strategy   │────▶│  Executor    │────▶│  Solana     │
│   Engine    │     │  (Jito MEV)  │     │  Network    │
└─────────────┘     └──────────────┘     └─────────────┘
       │                                          │
       ▼                                          ▼
┌─────────────┐                          ┌─────────────┐
│  Market     │                          │  Risk       │
│  Data       │                          │  Manager    │
└─────────────┘                          └─────────────┘
```

## Strategies

1. **Arbitrage** — DEX price discrepancies (Jupiter, Raydium, Orca)
2. **Sandwich** — MEV extraction (requires significant capital)
3. **Liquidation** — Lending protocol liquidations (Solend, Mango)
4. **Copy-Trading** — Follow whale wallets

## Status

🚧 Under development

## Wallet

- Public: `5LCbxxX2fr2k2J5EijZnWWFp2cRJd1skVcgw39thk6h6`
- Fund to activate

## Risk Warning

This bot can lose money. Start small, monitor closely.
