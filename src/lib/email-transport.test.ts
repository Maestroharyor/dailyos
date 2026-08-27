import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * The contract under test is a promise to the customer, not to the merchant:
 * a broken merchant transport costs the merchant their branding and never
 * costs the customer their email. Every case below is some way of breaking the
 * merchant transport and checking the mail still goes out.
 */

const sendEmail = vi.fn();
const decryptSecret = vi.fn();
const resendSend = vi.fn();
const smtpSendMail = vi.fn();
const smtpClose = vi.fn();
const createTransport = vi.fn((_options: unknown) => ({
  sendMail: smtpSendMail,
  close: smtpClose,
}));
const findUnique = vi.fn();
const update = vi.fn();

vi.mock("./email", () => ({ sendEmail: (...args: unknown[]) => sendEmail(...args) }));
vi.mock("./crypto", () => ({ decryptSecret: (...args: unknown[]) => decryptSecret(...args) }));
vi.mock("./db", () => ({
  prisma: {
    spaceEmailSettings: {
      findUnique: (...args: unknown[]) => findUnique(...args),
      update: (...args: unknown[]) => update(...args),
    },
  },
}));
vi.mock("resend", () => ({
  Resend: class {
    emails = { send: (...args: unknown[]) => resendSend(...args) };
  },
}));
// Every factory dereferences its spy lazily: vi.mock is hoisted above the
// consts, so `{ createTransport }` would read the binding before it exists.
vi.mock("nodemailer", () => ({
  default: { createTransport: (options: unknown) => createTransport(options) },
}));
vi.mock("@sentry/nextjs", () => ({ captureMessage: vi.fn() }));

import { invalidateSpaceEmailConfig, sendForSpace } from "./email-transport";

const SPACE = "space_1";
const MESSAGE = { to: "buyer@example.com", subject: "Order confirmed", html: "<p>hi</p>" };

const config = (over: Record<string, unknown> = {}) => ({
  spaceId: SPACE,
  provider: "resend",
  fromName: "VKT Bougie",
  fromAddress: "orders@vktbougie.com",
  replyTo: "",
  resendApiKey: "v1:enc",
  smtpHost: "",
  smtpPort: 587,
  smtpSecure: false,
  smtpUsername: "",
  smtpPassword: "",
  verifiedAt: new Date("2026-08-01"),
  lastError: null,
  ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  invalidateSpaceEmailConfig(SPACE);
  sendEmail.mockResolvedValue({ success: true });
  decryptSecret.mockReturnValue("re_live_key");
  resendSend.mockResolvedValue({ error: null });
  smtpSendMail.mockResolvedValue({ messageId: "1" });
  update.mockResolvedValue({});
});

describe("sendForSpace falls back to the platform", () => {
  it("when there is no space at all", async () => {
    const result = await sendForSpace(null, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "platform", fellBack: false });
    expect(findUnique).not.toHaveBeenCalled();
    expect(sendEmail).toHaveBeenCalledOnce();
  });

  it("when the space has no email settings row", async () => {
    findUnique.mockResolvedValue(null);

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result.provider).toBe("platform");
    expect(result.fellBack).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("when the provider is explicitly platform", async () => {
    findUnique.mockResolvedValue(config({ provider: "platform" }));

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result.provider).toBe("platform");
    expect(resendSend).not.toHaveBeenCalled();
  });

  // The heart of the design: credentials alone are not a switch. A merchant can
  // save a half-finished configuration without endangering customer mail.
  it("when credentials exist but no test send has ever passed", async () => {
    findUnique.mockResolvedValue(config({ verifiedAt: null }));

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result.provider).toBe("platform");
    expect(result.fellBack).toBe(false);
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("when the merchant set a provider but no from address", async () => {
    findUnique.mockResolvedValue(config({ fromAddress: "" }));

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ provider: "platform", fellBack: true });
    expect(resendSend).not.toHaveBeenCalled();
  });

  it("when the stored key cannot be decrypted, and records why", async () => {
    findUnique.mockResolvedValue(config());
    decryptSecret.mockReturnValue(null);

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "platform", fellBack: true });
    expect(sendEmail).toHaveBeenCalledOnce();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: expect.stringContaining("decrypted") }),
      })
    );
  });

  // The two nulls decryptSecret can return mean opposite things: "no password
  // was stored" is a legitimate IP-allowlisted relay, "this blob will not
  // decrypt" is a rotated key. Only the second may reach the wire.
  it("when a stored SMTP password will not decrypt, without connecting", async () => {
    findUnique.mockResolvedValue(
      config({ provider: "smtp", smtpHost: "smtp.example.com", smtpPassword: "v1:enc" })
    );
    decryptSecret.mockReturnValue(null);

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "platform", fellBack: true });
    expect(createTransport).not.toHaveBeenCalled();
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          lastError: expect.stringContaining("SMTP password could not be decrypted"),
        }),
      })
    );
  });

  it("when the merchant transport errors, and records why", async () => {
    findUnique.mockResolvedValue(config());
    resendSend.mockResolvedValue({ error: { message: "Domain is not verified" } });

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "platform", fellBack: true });
    expect(update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ lastError: "Domain is not verified" }),
      })
    );
  });

  it("when a config lookup fails, without caching the failure", async () => {
    findUnique.mockRejectedValueOnce(new Error("pool exhausted"));

    const first = await sendForSpace(SPACE, MESSAGE);
    expect(first.provider).toBe("platform");

    // A transient blip must not pin the space to the platform for a whole TTL.
    findUnique.mockResolvedValue(config());
    const second = await sendForSpace(SPACE, MESSAGE);
    expect(second.provider).toBe("resend");
  });

  it("when SMTP is configured but the caller cannot afford it", async () => {
    findUnique.mockResolvedValue(config({ provider: "smtp", smtpHost: "smtp.example.com" }));

    const result = await sendForSpace(SPACE, MESSAGE, { allowSmtp: false });

    expect(result).toMatchObject({ provider: "platform", fellBack: true });
    expect(createTransport).not.toHaveBeenCalled();
  });
});

describe("sendForSpace uses the merchant transport", () => {
  it("sends through Resend under the merchant's own name and address", async () => {
    findUnique.mockResolvedValue(config());

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "resend", fellBack: false });
    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({
        from: "VKT Bougie <orders@vktbougie.com>",
        to: MESSAGE.to,
        subject: MESSAGE.subject,
      })
    );
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("omits the display name when the merchant set only an address", async () => {
    findUnique.mockResolvedValue(config({ fromName: "" }));

    await sendForSpace(SPACE, MESSAGE);

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ from: "orders@vktbougie.com" })
    );
  });

  it("applies the configured reply-to when the caller did not set one", async () => {
    findUnique.mockResolvedValue(config({ replyTo: "hello@vktbougie.com" }));

    await sendForSpace(SPACE, MESSAGE);

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "hello@vktbougie.com" })
    );
  });

  it("lets an explicit reply-to win over the configured one", async () => {
    findUnique.mockResolvedValue(config({ replyTo: "hello@vktbougie.com" }));

    await sendForSpace(SPACE, { ...MESSAGE, replyTo: "support@vktbougie.com" });

    expect(resendSend).toHaveBeenCalledWith(
      expect.objectContaining({ replyTo: "support@vktbougie.com" })
    );
  });

  it("sends through SMTP and always closes the transport", async () => {
    findUnique.mockResolvedValue(
      config({ provider: "smtp", smtpHost: "smtp.example.com", smtpUsername: "user" })
    );

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "smtp" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.objectContaining({ host: "smtp.example.com", port: 587, secure: false })
    );
    expect(smtpClose).toHaveBeenCalledOnce();
  });

  it("connects without auth when no SMTP password was ever stored", async () => {
    findUnique.mockResolvedValue(
      config({ provider: "smtp", smtpHost: "smtp.example.com", smtpUsername: "user" })
    );

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ success: true, provider: "smtp" });
    expect(createTransport).toHaveBeenCalledWith(
      expect.not.objectContaining({ auth: expect.anything() })
    );
  });

  it("closes the SMTP transport even when the send throws", async () => {
    findUnique.mockResolvedValue(config({ provider: "smtp", smtpHost: "smtp.example.com" }));
    smtpSendMail.mockRejectedValue(new Error("Connection refused"));

    const result = await sendForSpace(SPACE, MESSAGE);

    expect(result).toMatchObject({ provider: "platform", fellBack: true });
    expect(smtpClose).toHaveBeenCalledOnce();
  });

  it("clears a stale failure once the transport works again", async () => {
    findUnique.mockResolvedValue(config({ lastError: "Domain is not verified" }));

    await sendForSpace(SPACE, MESSAGE);

    expect(update).toHaveBeenCalledWith(expect.objectContaining({ data: { lastError: null } }));
  });

  it("does not write on every successful send when nothing was wrong", async () => {
    findUnique.mockResolvedValue(config());

    await sendForSpace(SPACE, MESSAGE);

    expect(update).not.toHaveBeenCalled();
  });

  it("reads the config once and serves later sends from cache", async () => {
    findUnique.mockResolvedValue(config());

    await sendForSpace(SPACE, MESSAGE);
    await sendForSpace(SPACE, MESSAGE);

    expect(findUnique).toHaveBeenCalledOnce();
    expect(resendSend).toHaveBeenCalledTimes(2);
  });
});
