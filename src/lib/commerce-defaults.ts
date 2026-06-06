// Shared commerce defaults usable from both server actions and client components.
// Single source of truth for the payment methods seeded into new spaces and used
// as fallback when a space's stored list is empty.

// Type alias (not interface) so it gets an implicit index signature and stays
// assignable to Prisma's InputJsonValue when written to the Json column.
export type DefaultPaymentMethod = {
  id: string;
  name: string;
  isActive: boolean;
};

export const DEFAULT_PAYMENT_METHODS: DefaultPaymentMethod[] = [
  { id: "cash", name: "Cash", isActive: true },
  { id: "card", name: "Card", isActive: true },
  { id: "transfer", name: "Bank Transfer", isActive: true },
  { id: "pos", name: "POS Terminal", isActive: true },
];
