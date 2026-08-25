## Description

<!-- What changed, and why. Lead with the why. -->

## Type of Change

- [ ] 🐛 Bug fix
- [ ] ✨ New feature
- [ ] 💥 Breaking change
- [ ] 📝 Documentation
- [ ] ♻️ Refactor
- [ ] 🔧 Configuration / infrastructure
- [ ] 🗄️ Database / schema change

## How Has This Been Tested?

<!-- Say what you actually ran. "Local testing" on its own is not an answer. -->

- [ ] `bun run lint`
- [ ] `bunx tsc --noEmit`
- [ ] `bun run test`
- [ ] `bun run build`
- [ ] Manual check in the app

## Money-path checklist

<!-- Only if this PR touches orders, pricing, discounts, payments or webhooks.
     Tick, or strike through with a one-line reason. -->

- [ ] Order totals still come from `computeOrderTotals`; nothing recomputes them
- [ ] Discount `usageCount` / `DiscountUsage` increment only on the create path, never on replay
- [ ] The Paystack webhook still resolves its signer across all storefront-enabled spaces
- [ ] Stock still aggregates in the database, not by loading movements into JS

## Database

<!-- Delete if no schema change. -->

- [ ] Migration written and applied deliberately (`prisma db push` is blocked by the cross-schema FK)
- [ ] `supabase/triggers.sql` re-applied if a destructive push touched the auth schema

## Checklist

- [ ] Self-reviewed the diff
- [ ] Every mutating path goes through `authorizeAction(spaceId, capability)`
- [ ] Mutations use the optimistic-update pattern
- [ ] No `any`, no type casts added to silence errors
- [ ] No sensitive data in logs, error responses or `NEXT_PUBLIC_` vars
- [ ] Tests added or updated, or the gap is called out below

## Related

<!-- Braandly task link, or Closes #<issue> -->

## Notes

<!-- Anything stubbed, mocked, hardcoded or deliberately deferred — list it here. -->
