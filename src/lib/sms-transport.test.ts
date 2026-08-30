import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contract under test has one more clause than email's, because a send
 * costs money: a broken merchant transport still costs the merchant their
 * sender ID rather than the customer their notification, but nothing at all
 * goes out to a number that is not already E.164, and nothing goes out while
 * the kill switch is engaged.
 */

const decryptSecret = vi.fn();
const findUnique = vi.fn();
const update = vi.fn();
const captureMessage = vi.fn();

vi.mock("./crypto", () => ({ decryptSecret: (...args: unknown[]) => decryptSecret(...args) }));
vi.mock("./db", () => ({
  prisma: {
    spaceSmsSettings: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));
// Dereferenced lazily: vi.mock is hoisted above the consts above.
vi.mock("@sentry/nextjs", () => ({
  captureMessage: (...args: unknown[]) => captureMessage(...args),
}));

import {
  fetchSmsBalance,
  invalidateSpaceSmsConfig,
  sendSmsForSpace,
  sendTestSms,
} from "./sms-transport";

const SPACE = "space_1";
const MESSAGE = { to: "+2348035550100", body: "VKT: order ORD-1 confirmed, NGN 100." };

const config = (over: Record<string, unknown> = {}) => ({
  spaceId: SPACE,
  provider: "termii",
  senderId: "VKTBougie",
  apiBaseUrl: "https://api.ng.termii.com",
  apiKey: "v1:enc",
  useDndRoute: true,
  verifiedAt: new Date(),
  lastError: null,
  ...over,
});

/** A Termii response, shaped as their docs describe it. */
function termiiOk(over: Record<string, unknown> = {}) {
  return {
    ok: true,
    status: 200,
    json: async () => ({
      code: "ok",
      message_id: "3017544054459083819856413",
      message: "Successfully Sent",
      balance: 1047.57,
      ...over,
    }),
  };
}

function termiiError(status: number, message: string) {
  return { ok: status < 400, status, json: async () => ({ code: "error", message }) };
}

const fetchMock = vi.fn();

beforeEach(() => {
  vi.clearAllMocks();
  // The module-level config cache leaks between tests otherwise.
  invalidateSpaceSmsConfig(SPACE);
  vi.stubGlobal("fetch", fetchMock);
  vi.stubEnv("SMS_ENABLED", "");
  vi.stubEnv("TERMII_API_KEY", "platform-key");
  vi.stubEnv("TERMII_SENDER_ID", "DailyOS");
  vi.stubEnv("TERMII_BASE_URL", "");
  decryptSecret.mockReturnValue("merchant-key");
  findUnique.mockResolvedValue(null);
  update.mockResolvedValue({});
  fetchMock.mockResolvedValue(termiiOk());
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

function lastRequestBody(): Record<string, unknown> {
  const [, init] = fetchMock.mock.calls.at(-1) as [string, { body: string }];
  return JSON.parse(init.body);
}

describe("sendSmsForSpace refuses before it spends", () => {
  it("sends nothing when the kill switch is engaged", async () => {
    vi.stubEnv("SMS_ENABLED", "false");
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({ success: false, error: "SMS is disabled" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a recipient that is not already E.164 rather than coercing it", async () => {
    // The phone columns are not clean. A national-format number here would
    // either be rejected at cost or, worse, delivered to whoever owns the
    // number it resembles.
    for (const to of ["08035550100", "2348035550100", "not a phone", ""]) {
      const result = await sendSmsForSpace(SPACE, { ...MESSAGE, to });
      expect(result.success).toBe(false);
      expect(result.error).toBe("Recipient is not a valid E.164 number");
    }
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses an empty body", async () => {
    const result = await sendSmsForSpace(SPACE, { ...MESSAGE, body: "   " });
    expect(result).toMatchObject({ success: false, error: "Message is empty" });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("treats an unset SMS_ENABLED as on, so a missed deploy var does not go silent", async () => {
    vi.stubEnv("SMS_ENABLED", "");
    const result = await sendSmsForSpace(null, MESSAGE);
    expect(result.success).toBe(true);
  });
});

describe("sendSmsForSpace refuses rather than spending the platform wallet", () => {
  // Where SMS parts company with email. Relaying an email costs nothing, so the
  // email transport falls back to the DailyOS sender for a half-configured
  // merchant. A text message is billed per send, so the same fallback would
  // move every merchant's messaging bill onto DailyOS. A space that has not
  // connected its own Termii account does not send.

  it("when the space has no configuration", async () => {
    findUnique.mockResolvedValue(null);
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({
      success: false,
      error: "This space has no SMS sender configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("when the configuration was saved but never verified", async () => {
    // verifiedAt is the switch, not provider: a half-finished configuration
    // sends nothing rather than sending under someone else's account.
    findUnique.mockResolvedValue(config({ verifiedAt: null }));
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("when the stored API key cannot be decrypted, and says so loudly", async () => {
    // Usually means SECRETS_ENCRYPTION_KEY was rotated. The alert matters more
    // now than it did under the old fallback: messages stop rather than
    // quietly moving onto the platform account.
    findUnique.mockResolvedValue(config());
    decryptSecret.mockReturnValue(null);
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(captureMessage).toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { lastError: "Stored Termii API key could not be decrypted" },
      })
    );
  });

  it("when no sender ID is set, rather than sending under the platform's", async () => {
    findUnique.mockResolvedValue(config({ senderId: "  " }));
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({ success: false });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("when Termii rejects the merchant send, without retrying on the platform", async () => {
    // One attempt, not two. A merchant whose wallet has run dry would
    // otherwise have every message billed to DailyOS instead.
    findUnique.mockResolvedValue(config());
    fetchMock.mockResolvedValueOnce(termiiError(400, "Sender ID not whitelisted"));
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({
      success: false,
      error: "Sender ID not whitelisted",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastError: "Sender ID not whitelisted" } })
    );
  });
});

describe("sendSmsForSpace still uses the platform account for platform messages", () => {
  // spaceId null is DailyOS messaging on its own behalf rather than for a
  // merchant, so there is no one else's bill to protect.

  it("when there is no space", async () => {
    const result = await sendSmsForSpace(null, MESSAGE);
    expect(result).toMatchObject({ success: true, provider: "platform" });
    expect(lastRequestBody().from).toBe("DailyOS");
  });

  it("reports failure rather than throwing when the platform has no account either", async () => {
    vi.stubEnv("TERMII_API_KEY", "");
    const result = await sendSmsForSpace(null, MESSAGE);
    expect(result).toMatchObject({
      success: false,
      provider: "platform",
      error: "No platform SMS account is configured",
    });
  });
});

describe("sendSmsForSpace uses the merchant transport", () => {
  beforeEach(() => {
    findUnique.mockResolvedValue(config());
  });

  it("sends under the merchant's sender ID and returns Termii's message id", async () => {
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    expect(result).toMatchObject({
      success: true,
      provider: "termii",
      messageId: "3017544054459083819856413",
      balanceAfter: 1047.57,
    });
    expect(lastRequestBody()).toMatchObject({
      api_key: "merchant-key",
      from: "VKTBougie",
      sms: MESSAGE.body,
      type: "plain",
    });
  });

  it("strips the plus, which is the format Termii documents", async () => {
    await sendSmsForSpace(SPACE, MESSAGE);
    expect(lastRequestBody().to).toBe("2348035550100");
  });

  it("uses the DND route by default", async () => {
    // On the generic route a transactional message never reaches a
    // DND-registered subscriber, which is most Nigerian numbers.
    await sendSmsForSpace(SPACE, MESSAGE);
    expect(lastRequestBody().channel).toBe("dnd");
  });

  it("uses the generic route only when the merchant turns DND off", async () => {
    findUnique.mockResolvedValue(config({ useDndRoute: false }));
    await sendSmsForSpace(SPACE, MESSAGE);
    expect(lastRequestBody().channel).toBe("generic");
  });

  it("posts to the space's own base URL, since Termii issues one per account", async () => {
    findUnique.mockResolvedValue(config({ apiBaseUrl: "https://api.eu.termii.com/" }));
    await sendSmsForSpace(SPACE, MESSAGE);
    const [url] = fetchMock.mock.calls.at(-1) as [string];
    // Trailing slash trimmed rather than doubled.
    expect(url).toBe("https://api.eu.termii.com/api/sms/send");
  });

  it("treats a 200 that is not code:ok as a failure", async () => {
    // Termii answers 200 with an error code for some rejections, so status
    // alone is not the signal.
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ code: "error", message: "Insufficient balance" }),
    });
    const result = await sendSmsForSpace(SPACE, MESSAGE);
    // "Insufficient balance" is exactly the case that must not retry on the
    // platform account: an empty merchant wallet would become a DailyOS bill.
    expect(result).toMatchObject({
      success: false,
      error: "Insufficient balance",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { lastError: "Insufficient balance" } })
    );
  });

  it("clears a stored error after a send succeeds", async () => {
    findUnique.mockResolvedValue(config({ lastError: "Sender ID not whitelisted" }));
    await sendSmsForSpace(SPACE, MESSAGE);
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastError: null } }));
  });

  it("does not write to the database when there was no error to clear", async () => {
    await sendSmsForSpace(SPACE, MESSAGE);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("sendTestSms", () => {
  // The function whose entire job is proving a merchant's credentials before
  // anything real depends on them. A refusal here that does not actually refuse
  // burns their credit silently, and unlike sendSmsForSpace there is no
  // fallback to hide behind: it reports failure on purpose.
  const testConfig = {
    senderId: "VKTBougie",
    apiBaseUrl: "https://api.ng.termii.com",
    apiKey: "v1:enc",
    useDndRoute: true,
  };

  it("sends through the given configuration and returns the message id", async () => {
    const result = await sendTestSms(testConfig, MESSAGE);
    expect(result).toEqual({ success: true, messageId: "3017544054459083819856413" });
    expect(lastRequestBody()).toMatchObject({ api_key: "merchant-key", from: "VKTBougie" });
  });

  it("refuses while the kill switch is engaged", async () => {
    vi.stubEnv("SMS_ENABLED", "false");
    await expect(sendTestSms(testConfig, MESSAGE)).resolves.toEqual({
      success: false,
      error: "SMS is disabled",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses a recipient that is not E.164", async () => {
    await expect(sendTestSms(testConfig, { ...MESSAGE, to: "08035550100" })).resolves.toEqual({
      success: false,
      error: "Recipient is not a valid E.164 number",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses without a sender ID", async () => {
    await expect(sendTestSms({ ...testConfig, senderId: "  " }, MESSAGE)).resolves.toEqual({
      success: false,
      error: "Set a sender ID before sending a test",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("refuses when the stored key cannot be decrypted", async () => {
    decryptSecret.mockReturnValue(null);
    await expect(sendTestSms(testConfig, MESSAGE)).resolves.toEqual({
      success: false,
      error: "No readable Termii API key is configured",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports the provider's failure rather than falling back to the platform", async () => {
    // The whole point of a test send. Quietly succeeding through the platform
    // account would mark a broken merchant configuration as verified.
    fetchMock.mockResolvedValue(termiiError(400, "Sender ID not whitelisted"));
    await expect(sendTestSms(testConfig, MESSAGE)).resolves.toEqual({
      success: false,
      error: "Sender ID not whitelisted",
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("does not touch the database", async () => {
    // It runs against an unsaved shape, so it must not record a transport error
    // against a configuration that may not exist yet.
    await sendTestSms(testConfig, MESSAGE);
    expect(update).not.toHaveBeenCalled();
  });
});

describe("the platform account honours its own environment", () => {
  it("uses TERMII_BASE_URL when set", async () => {
    vi.stubEnv("TERMII_BASE_URL", "https://api.eu.termii.com/");
    await sendSmsForSpace(null, MESSAGE);
    const [url] = fetchMock.mock.calls.at(-1) as [string];
    expect(url).toBe("https://api.eu.termii.com/api/sms/send");
  });

  it("defaults to the Nigerian host when it is not", async () => {
    vi.stubEnv("TERMII_BASE_URL", "");
    await sendSmsForSpace(null, MESSAGE);
    const [url] = fetchMock.mock.calls.at(-1) as [string];
    expect(url).toBe("https://api.ng.termii.com/api/sms/send");
  });

  it("uses the DND route unless TERMII_GENERIC_ROUTE forces otherwise", async () => {
    await sendSmsForSpace(null, MESSAGE);
    expect(lastRequestBody().channel).toBe("dnd");

    vi.stubEnv("TERMII_GENERIC_ROUTE", "true");
    await sendSmsForSpace(null, MESSAGE);
    expect(lastRequestBody().channel).toBe("generic");
  });

  it('treats any value but the literal "true" as leaving DND on', async () => {
    // The escape hatch is for the window before a sender ID is DND-whitelisted.
    // A typo in a deploy variable must not silently move transactional traffic
    // onto a route most Nigerian numbers never see.
    vi.stubEnv("TERMII_GENERIC_ROUTE", "yes");
    await sendSmsForSpace(null, MESSAGE);
    expect(lastRequestBody().channel).toBe("dnd");
  });
});

describe("fetchSmsBalance", () => {
  it("reads the merchant wallet when the space sends on its own account", async () => {
    findUnique.mockResolvedValue(config());
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: 250.5, currency: "NGN" }),
    });
    await expect(fetchSmsBalance(SPACE)).resolves.toEqual({ balance: 250.5, currency: "NGN" });
    const [url] = fetchMock.mock.calls.at(-1) as [string];
    expect(url).toContain("/api/get-balance?api_key=merchant-key");
  });

  it("falls back to the platform wallet for an unconfigured space", async () => {
    findUnique.mockResolvedValue(null);
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: 10, currency: "NGN" }),
    });
    await expect(fetchSmsBalance(SPACE)).resolves.toEqual({ balance: 10, currency: "NGN" });
    const [url] = fetchMock.mock.calls.at(-1) as [string];
    expect(url).toContain("api_key=platform-key");
  });

  it("returns null rather than a zero when the balance cannot be read", async () => {
    // A zero would read as "wallet empty" and trigger a low-balance alert that
    // is not true.
    findUnique.mockResolvedValue(null);
    fetchMock.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    await expect(fetchSmsBalance(SPACE)).resolves.toBeNull();
  });

  it("returns null when no account is configured at all", async () => {
    vi.stubEnv("TERMII_API_KEY", "");
    findUnique.mockResolvedValue(null);
    await expect(fetchSmsBalance(null)).resolves.toBeNull();
  });

  it("never falls back to the platform wallet under ownAccountOnly", async () => {
    // The settings card labels this number as the merchant's. Falling through
    // would show them DailyOS's shared wallet as their own and leak a
    // platform-level figure to every unconfigured space.
    findUnique.mockResolvedValue(null);
    await expect(fetchSmsBalance(SPACE, { ownAccountOnly: true })).resolves.toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reads an unverified space's own wallet under ownAccountOnly", async () => {
    // verifiedAt gates sending as the merchant, not reading their balance.
    // Mid-setup is exactly when a top-up is most likely to be needed.
    findUnique.mockResolvedValue(config({ verifiedAt: null }));
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ balance: 75, currency: "NGN" }),
    });
    await expect(fetchSmsBalance(SPACE, { ownAccountOnly: true })).resolves.toEqual({
      balance: 75,
      currency: "NGN",
    });
    const [url] = fetchMock.mock.calls.at(-1) as [string];
    expect(url).toContain("api_key=merchant-key");
  });

  it("still refuses under ownAccountOnly when the space is on the platform provider", async () => {
    findUnique.mockResolvedValue(config({ provider: "platform" }));
    await expect(fetchSmsBalance(SPACE, { ownAccountOnly: true })).resolves.toBeNull();
  });
});
