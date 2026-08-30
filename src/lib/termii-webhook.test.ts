import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const decryptSecret = vi.fn();
const findMany = vi.fn();

vi.mock("./crypto", () => ({ decryptSecret: (...args: unknown[]) => decryptSecret(...args) }));
vi.mock("./db", () => ({
  prisma: { spaceSmsSettings: { findMany: (...args: unknown[]) => findMany(...args) } },
}));

import { mapTermiiStatus, resolveTermiiSigner, verifyTermiiSignature } from "./termii-webhook";

const BODY = JSON.stringify({ message_id: "abc", status: "DELIVERED" });

function sign(body: string, secret: string): string {
  return crypto.createHmac("sha512", secret).update(body).digest("hex");
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("TERMII_WEBHOOK_SECRET", "");
  findMany.mockResolvedValue([]);
  decryptSecret.mockImplementation((blob: string) => blob.replace("enc:", ""));
});

describe("verifyTermiiSignature", () => {
  it("accepts a signature made with the same secret", () => {
    expect(verifyTermiiSignature(BODY, sign(BODY, "s3cret"), "s3cret")).toBe(true);
  });

  it("rejects a signature made with a different secret", () => {
    expect(verifyTermiiSignature(BODY, sign(BODY, "other"), "s3cret")).toBe(false);
  });

  it("rejects when the body has been altered", () => {
    const signature = sign(BODY, "s3cret");
    expect(verifyTermiiSignature(`${BODY} `, signature, "s3cret")).toBe(false);
  });

  it("rejects a missing signature or a missing secret rather than throwing", () => {
    expect(verifyTermiiSignature(BODY, null, "s3cret")).toBe(false);
    expect(verifyTermiiSignature(BODY, sign(BODY, "s3cret"), "")).toBe(false);
  });

  it("does not throw on a wrong-length signature", () => {
    // timingSafeEqual throws rather than returning false when the buffers
    // differ in length, which is why the length is checked first.
    expect(() => verifyTermiiSignature(BODY, "short", "s3cret")).not.toThrow();
    expect(verifyTermiiSignature(BODY, "short", "s3cret")).toBe(false);
  });
});

describe("resolveTermiiSigner", () => {
  it("tries every configured space, not just the first", () => {
    // The same reasoning as the Paystack signer: a staging space configured
    // alongside the live one must not break verification for real traffic.
    findMany.mockResolvedValue([
      { spaceId: "space_a", webhookSecret: "enc:aaa" },
      { spaceId: "space_b", webhookSecret: "enc:bbb" },
    ]);
    return expect(resolveTermiiSigner(BODY, sign(BODY, "bbb"))).resolves.toEqual({
      ok: true,
      spaceId: "space_b",
    });
  });

  it("falls back to the platform secret", async () => {
    vi.stubEnv("TERMII_WEBHOOK_SECRET", "platform");
    await expect(resolveTermiiSigner(BODY, sign(BODY, "platform"))).resolves.toEqual({
      ok: true,
      spaceId: null,
    });
  });

  it("reports unconfigured when there is nothing to verify against", async () => {
    // Distinct from invalid on purpose: the route answers 503 here so Termii
    // retries once a secret exists, and 401 for a forgery, which retrying
    // cannot fix.
    await expect(resolveTermiiSigner(BODY, sign(BODY, "anything"))).resolves.toEqual({
      ok: false,
      reason: "unconfigured",
    });
  });

  it("reports invalid when secrets exist but none match", async () => {
    findMany.mockResolvedValue([{ spaceId: "space_a", webhookSecret: "enc:aaa" }]);
    await expect(resolveTermiiSigner(BODY, sign(BODY, "forged"))).resolves.toEqual({
      ok: false,
      reason: "invalid",
    });
  });

  it("skips a space whose secret cannot be decrypted rather than throwing", async () => {
    findMany.mockResolvedValue([
      { spaceId: "space_a", webhookSecret: "corrupt" },
      { spaceId: "space_b", webhookSecret: "enc:bbb" },
    ]);
    decryptSecret.mockImplementation((blob: string) =>
      blob.startsWith("enc:") ? blob.slice(4) : null
    );
    await expect(resolveTermiiSigner(BODY, sign(BODY, "bbb"))).resolves.toEqual({
      ok: true,
      spaceId: "space_b",
    });
  });
});

describe("mapTermiiStatus", () => {
  it("maps a delivery", () => {
    expect(mapTermiiStatus("DELIVERED")).toBe("delivered");
    expect(mapTermiiStatus(" delivered ")).toBe("delivered");
  });

  it("maps every documented failure, DND included", () => {
    for (const status of ["DND Active on Phone Number", "Message Failed", "Rejected", "Expired"]) {
      expect(mapTermiiStatus(status)).toBe("failed");
    }
  });

  it("ignores the intermediate acknowledgement", () => {
    // "Message Sent" is not an outcome. Mapping it would overwrite a
    // `delivered` that arrived first with something less final.
    expect(mapTermiiStatus("Message Sent")).toBeNull();
  });

  it("ignores anything unrecognised, including nothing at all", () => {
    expect(mapTermiiStatus(undefined)).toBeNull();
    expect(mapTermiiStatus("")).toBeNull();
    expect(mapTermiiStatus("Received")).toBeNull();
  });
});
