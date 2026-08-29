import { describe, expect, it } from "vitest";
import {
  buildActionUrl,
  type EmailData,
  matchSpaceByOrigin,
  normalizeOrigin,
  parseExtraOrigins,
  purposeFor,
  showsCode,
  showsLink,
  subjectFor,
  usesVerifyCopy,
} from "./auth-email";

const emailData = (over: Partial<EmailData> = {}): EmailData => ({
  token: "482913",
  token_hash: "abc123hash",
  redirect_to: "",
  email_action_type: "signup",
  site_url: "https://dailyos.foverotechnologies.com",
  ...over,
});

describe("showsCode / showsLink", () => {
  // The payload cannot tell a code flow from a link flow: Supabase carries both
  // tokens on every send, and VKT's signup OTP and its password signup both
  // arrive as "signup" wanting opposite things. So both are shown wherever both
  // are meaningful, rather than guessed at.
  it("shows a code for a signup, whether or not a redirect came with it", () => {
    expect(showsCode("signup")).toBe(true);
    expect(showsLink("signup", false)).toBe(false);
    expect(showsLink("signup", true)).toBe(true);
  });

  it("shows a code for a magic link, because VKT's sign-in types one in", () => {
    expect(showsCode("magiclink")).toBe(true);
  });

  it.each(["recovery", "email_change", "invite"])(
    "shows only a link for %s, where a typed code has nowhere to go",
    (actionType) => {
      expect(showsCode(actionType)).toBe(false);
      expect(showsLink(actionType, true)).toBe(true);
    }
  );

  it("shows neither for a password-changed notice, which is informational", () => {
    expect(showsCode("password_changed_notification")).toBe(false);
    expect(showsLink("password_changed_notification", true)).toBe(false);
  });

  it("omits the link when there is nowhere to send them", () => {
    expect(showsLink("recovery", false)).toBe(false);
  });

  // Once enabled the hook receives every action type Supabase has, including
  // ones neither app triggers today.
  it("still shows a code for an unrecognised action type rather than nothing", () => {
    expect(showsCode("some_future_type")).toBe(true);
  });
});

describe("buildActionUrl", () => {
  it("assembles the verify URL Supabase does not supply", () => {
    const url = new URL(
      buildActionUrl(
        "rrrmgbkqxqaqohejhcec",
        emailData({
          email_action_type: "recovery",
          redirect_to: "https://staging.vktbougie.com/auth/reset-password",
        })
      )
    );

    expect(url.origin).toBe("https://rrrmgbkqxqaqohejhcec.supabase.co");
    expect(url.pathname).toBe("/auth/v1/verify");
    expect(url.searchParams.get("token")).toBe("abc123hash");
    expect(url.searchParams.get("type")).toBe("recovery");
    expect(url.searchParams.get("redirect_to")).toBe(
      "https://staging.vktbougie.com/auth/reset-password"
    );
  });

  // The hashed token, never the six-digit one: the short code is guessable at
  // the scale a URL is shareable.
  it("uses the hashed token rather than the code", () => {
    const url = buildActionUrl("ref", emailData());
    expect(url).toContain("token=abc123hash");
    expect(url).not.toContain("482913");
  });
});

describe("normalizeOrigin", () => {
  it.each([
    ["https://www.vktbougie.com/", "vktbougie.com"],
    ["https://vktbougie.com", "vktbougie.com"],
    ["https://VKTBougie.com/shop?a=1", "vktbougie.com"],
    ["http://localhost:5173/auth/callback", "localhost"],
    ["https://staging.vktbougie.com", "staging.vktbougie.com"],
  ])("reduces %s to %s", (input, expected) => {
    expect(normalizeOrigin(input)).toBe(expected);
  });

  it.each([[""], [null], [undefined], ["not a url"], ["vktbougie.com"]])(
    "returns null for %s",
    (input) => {
      expect(normalizeOrigin(input)).toBeNull();
    }
  );
});

describe("matchSpaceByOrigin", () => {
  const spaces = [
    { spaceId: "space_vkt", storefrontUrl: "https://www.vktbougie.com" },
    { spaceId: "space_other", storefrontUrl: "https://othershop.com" },
  ];

  it("matches across a www mismatch, which is the whole point of normalising", () => {
    expect(matchSpaceByOrigin("https://vktbougie.com/auth/callback", spaces)).toBe("space_vkt");
  });

  it("does not match a different host", () => {
    expect(matchSpaceByOrigin("https://someoneelse.com/auth/callback", spaces)).toBeNull();
  });

  it("does not treat a subdomain as its parent", () => {
    expect(matchSpaceByOrigin("https://staging.vktbougie.com/auth/callback", spaces)).toBeNull();
  });

  // A single stored storefrontUrl cannot cover production, staging and a
  // per-branch preview URL at once, so extras win over the stored value.
  it("resolves a staging origin through the extras map", () => {
    expect(
      matchSpaceByOrigin("https://staging.vktbougie.com/auth/callback", spaces, {
        "staging.vktbougie.com": "space_vkt_test",
      })
    ).toBe("space_vkt_test");
  });

  // storefrontUrl has no uniqueness constraint, so a second space can claim
  // another merchant's domain. Picking "the first row back" would hand that
  // merchant's customers to whoever the query happened to return first.
  it("refuses to guess when two spaces claim the same origin", () => {
    expect(
      matchSpaceByOrigin("https://vktbougie.com/auth/callback", [
        { spaceId: "space_vkt", storefrontUrl: "https://www.vktbougie.com" },
        { spaceId: "space_impostor", storefrontUrl: "https://vktbougie.com" },
      ])
    ).toBeNull();
  });

  it("still resolves a contested origin when the extras map names one", () => {
    expect(
      matchSpaceByOrigin(
        "https://vktbougie.com/auth/callback",
        [
          { spaceId: "space_vkt", storefrontUrl: "https://www.vktbougie.com" },
          { spaceId: "space_impostor", storefrontUrl: "https://vktbougie.com" },
        ],
        { "vktbougie.com": "space_vkt" }
      )
    ).toBe("space_vkt");
  });

  it("returns null when there is no redirect to match on", () => {
    expect(matchSpaceByOrigin("", spaces)).toBeNull();
  });

  it("ignores a space that never set a storefront URL", () => {
    expect(
      matchSpaceByOrigin("https://vktbougie.com", [{ spaceId: "s", storefrontUrl: "" }])
    ).toBeNull();
  });
});

describe("parseExtraOrigins", () => {
  it("parses host=spaceId pairs and normalises the hosts", () => {
    expect(
      parseExtraOrigins("staging.vktbougie.com=space_a, https://www.preview.dev=space_b")
    ).toEqual({
      "staging.vktbougie.com": "space_a",
      "preview.dev": "space_b",
    });
  });

  // A typo in an env var must not take down every auth email on the platform.
  it("skips malformed entries instead of throwing", () => {
    expect(parseExtraOrigins("garbage,=space_a,host-with-no-space=,ok.com=space_b")).toEqual({
      "ok.com": "space_b",
    });
  });

  it.each([[""], [undefined], ["   "]])("returns an empty map for %s", (input) => {
    expect(parseExtraOrigins(input)).toEqual({});
  });
});

describe("subjectFor", () => {
  it("names the store so the recipient knows which one it is", () => {
    expect(subjectFor("recovery", "VKT Bougie")).toBe("Reset your password - VKT Bougie");
  });

  it("omits the dash when there is no store name", () => {
    expect(subjectFor("recovery", "")).toBe("Reset your password");
  });

  // Once enabled the hook receives every action type Supabase has, including
  // ones neither app triggers, so an unknown one has to send rather than throw.
  it("falls back for an unrecognised action type", () => {
    expect(subjectFor("some_future_type", "VKT Bougie")).toBe(
      "A message about your account - VKT Bougie"
    );
  });
});

describe("purposeFor", () => {
  it("reads the storefront's verify marker off the redirect", () => {
    expect(purposeFor("https://staging.vktbougie.com/auth/callback?flow=verify")).toBe("verify");
  });

  it("treats anything else as an ordinary send", () => {
    expect(purposeFor("https://staging.vktbougie.com/auth/callback")).toBe("default");
    expect(purposeFor("https://staging.vktbougie.com/auth/callback?flow=signin")).toBe("default");
    expect(purposeFor("https://dailyos.foverotechnologies.com")).toBe("default");
  });

  it("never throws on the values Supabase can actually send", () => {
    expect(purposeFor(null)).toBe("default");
    expect(purposeFor(undefined)).toBe("default");
    expect(purposeFor("")).toBe("default");
    expect(purposeFor("   ")).toBe("default");
    expect(purposeFor("not a url")).toBe("default");
  });
});

describe("usesVerifyCopy", () => {
  /**
   * The bug: Supabase issues magiclink for any OTP to an existing account, so a
   * shopper confirming their address got an email headed "Sign in" offering to
   * sign in someone already signed in.
   */
  it("rewords the types a storefront verification actually arrives on", () => {
    expect(usesVerifyCopy("magiclink", "verify")).toBe(true);
    expect(usesVerifyCopy("email", "verify")).toBe(true);
  });

  it("leaves genuine sign-in mail alone", () => {
    expect(usesVerifyCopy("magiclink", "default")).toBe(false);
    expect(usesVerifyCopy("email", "default")).toBe(false);
  });

  /**
   * Recovery carries a redirect too and could carry the marker. A password
   * reset relabelled "Confirm your email address" would misdescribe what the
   * link does, which is worse than the mismatch being fixed.
   */
  it("refuses to reword an action whose meaning is not verification", () => {
    expect(usesVerifyCopy("recovery", "verify")).toBe(false);
    expect(usesVerifyCopy("email_change", "verify")).toBe(false);
    expect(usesVerifyCopy("invite", "verify")).toBe(false);
    expect(usesVerifyCopy("signup", "verify")).toBe(false);
  });
});

describe("subjectFor with a verify purpose", () => {
  it("borrows the signup subject for a storefront verification", () => {
    expect(subjectFor("magiclink", "VKT Bougie", "verify")).toBe(
      "Confirm your email address - VKT Bougie"
    );
  });

  it("keeps the sign-in subject without the marker", () => {
    expect(subjectFor("magiclink", "VKT Bougie")).toBe("Your sign-in link - VKT Bougie");
    expect(subjectFor("magiclink", "VKT Bougie", "default")).toBe("Your sign-in link - VKT Bougie");
  });

  it("does not touch recovery", () => {
    expect(subjectFor("recovery", "VKT Bougie", "verify")).toBe("Reset your password - VKT Bougie");
  });
});
