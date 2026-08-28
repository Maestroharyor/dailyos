import { beforeEach, describe, expect, it, vi } from "vitest";

const $queryRaw = vi.fn();
vi.mock("@/lib/db", () => ({ prisma: { $queryRaw } }));

const { __resetVerificationLogging, verificationByCustomerId } = await import(
  "./customer-verification"
);

beforeEach(() => {
  vi.clearAllMocks();
  __resetVerificationLogging();
});

const ROW = (email: string, confirmed: Date | null) => ({ email, email_confirmed_at: confirmed });

describe("verificationByCustomerId", () => {
  it("marks an address with a confirmed auth user as verified", async () => {
    $queryRaw.mockResolvedValue([ROW("ada@example.com", new Date("2026-08-01"))]);

    const result = await verificationByCustomerId([{ id: "c1", email: "ada@example.com" }]);
    expect(result.get("c1")).toBe("verified");
  });

  it("marks an address with an unconfirmed auth user as unverified", async () => {
    $queryRaw.mockResolvedValue([ROW("ada@example.com", null)]);

    const result = await verificationByCustomerId([{ id: "c1", email: "ada@example.com" }]);
    expect(result.get("c1")).toBe("unverified");
  });

  it("marks an address with no auth user at all as unverified", async () => {
    $queryRaw.mockResolvedValue([]);

    const result = await verificationByCustomerId([{ id: "c1", email: "guest@example.com" }]);
    expect(result.get("c1")).toBe("unverified");
  });

  /**
   * The storefront routes lowercase addresses; the merchant-side create and
   * update do not, so a customer typed into the dashboard can carry mixed case
   * while GoTrue stores its own lowercased. Matching on the raw value would
   * report every one of those as unverified.
   */
  it("matches a mixed-case customer email against a lowercase auth user", async () => {
    $queryRaw.mockResolvedValue([ROW("ada@example.com", new Date("2026-08-01"))]);

    const result = await verificationByCustomerId([{ id: "c1", email: "Ada@Example.COM" }]);
    expect(result.get("c1")).toBe("verified");
  });

  /**
   * Customer.email is nullable because walk-in and POS customers are recorded
   * without one. They are a third state, not a failing one.
   */
  it("reports a customer with no email as no-email, and does not query for them", async () => {
    const result = await verificationByCustomerId([
      { id: "c1", email: null },
      { id: "c2", email: "   " },
    ]);

    expect(result.get("c1")).toBe("no-email");
    expect(result.get("c2")).toBe("no-email");
    expect($queryRaw).not.toHaveBeenCalled();
  });

  /**
   * The realistic failure is a runtime role without USAGE on the auth schema.
   * Reporting that as "unverified" would put a warning on every row in the
   * table at once, which is worse than saying nothing, and would read as a
   * finding rather than an outage.
   */
  it("degrades to unknown rather than unverified when the lookup fails", async () => {
    $queryRaw.mockRejectedValue(new Error("permission denied for schema auth"));

    const result = await verificationByCustomerId([{ id: "c1", email: "ada@example.com" }]);
    expect(result.get("c1")).toBe("unknown");
  });

  it("logs a failed lookup once, not once per page view", async () => {
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    $queryRaw.mockRejectedValue(new Error("permission denied for schema auth"));

    await verificationByCustomerId([{ id: "c1", email: "ada@example.com" }]);
    await verificationByCustomerId([{ id: "c2", email: "grace@example.com" }]);

    expect(consoleError).toHaveBeenCalledTimes(1);
    consoleError.mockRestore();
  });

  it("does not query at all for an empty page", async () => {
    const result = await verificationByCustomerId([]);
    expect(result.size).toBe(0);
    expect($queryRaw).not.toHaveBeenCalled();
  });
});
