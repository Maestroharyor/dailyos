import { type NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { markVerified } from "@/lib/auth/mark-verified";
import { createClient } from "@/lib/supabase/server";

/**
 * Verify a merchant's email address from the code they were emailed.
 *
 * The verifyOtp happens HERE, on the server, and that is the whole point.
 *
 * An earlier version had the page call verifyOtp in the browser and then POST
 * "I verified" to a route that stamped the flag. That route trusted the session
 * for identity, which is fine, but it had no way to tell "just verified" from
 * "never verified": any signed-in user could open devtools, POST it directly,
 * and clear their own gate without ever entering a code. Sign up with somebody
 * else's address, skip the page, land in the dashboard. It defeated the gate it
 * existed to serve.
 *
 * Doing the exchange here makes the proof intrinsic rather than asserted: the
 * flag is only ever written on a request that just handed Supabase a valid
 * one-time code. There is nothing to bypass, because there is no "tell me you
 * verified" step left to call.
 *
 * The session lands in cookies via the SSR client, and the browser client is
 * cookie-backed too (createBrowserClient), so the page picks it up without a
 * second exchange.
 */

const schema = z.object({
  email: z.string().email(),
  // Bounds rather than a fixed length: Supabase's Email OTP Length is a
  // project-wide dashboard setting between 6 and 10, and pinning a number here
  // is how the storefront's inputs turned a valid code into an invalid one.
  token: z.string().min(6).max(10),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ success: false, message: "Invalid input" }, { status: 400 });
  }

  const supabase = await createClient();

  /**
   * `email`, not `signup`. Both `signup` and `magiclink` are deprecated in
   * verifyOtp, and the code no longer comes from a signup confirmation anyway:
   * with confirmation off, signup requests it through signInWithOtp, which
   * issues an email OTP.
   */
  const { data, error } = await supabase.auth.verifyOtp({
    email: parsed.data.email,
    token: parsed.data.token,
    type: "email",
  });

  if (error || !data.user) {
    return NextResponse.json(
      { success: false, message: "Invalid or expired code" },
      { status: 401 }
    );
  }

  try {
    await markVerified(data.user.id);
  } catch (markError) {
    // The code is spent by now, so reporting success on a failed write would
    // leave them behind the gate with nothing left to verify with. Say so; the
    // page offers a fresh code.
    console.error("[auth/verify-email] could not stamp verification", markError);
    return NextResponse.json(
      {
        success: false,
        message: "We could not finish setting up your account. Request a new code and try again.",
      },
      { status: 502 }
    );
  }

  return NextResponse.json({ success: true, message: "Email verified" });
}
