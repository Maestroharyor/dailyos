# Supabase Send Email Hook

DailyOS can take over sending every auth email for the Supabase project, so a
customer signing up on a merchant's storefront gets a code from *that merchant*
rather than an unbranded notice from Supabase.

The route is `POST /api/auth/send-email`.

## Read this before enabling it

Registering the hook is **project-wide and immediate**. Every auth email for
every user starts flowing through this one route — customer signup on the
storefront and merchant login on DailyOS alike. Supabase **does not fall back to
its own mailer when the hook fails; it fails the user's auth request.** A broken
route means nobody can sign up or reset a password anywhere.

The route is written accordingly: an invalid signature is the only non-200
response. An unknown action type, an unresolvable space, a dead merchant
transport — all degrade to a platform-branded send. An unbranded email that
arrives beats a branded one that locks someone out.

Supabase blocks the auth request on the response, so the whole path targets a
~5 second budget. That is why merchant SMTP is not eligible for auth email
(`allowSmtp: false`): SMTP is five to eight round trips before the first byte.
A merchant on SMTP gets platform delivery for auth mail and their own transport
for order mail.

## Environment

| Variable | Required | Purpose |
| --- | --- | --- |
| `SEND_EMAIL_HOOK_SECRET` | Yes | `v1,whsec_<base64>`, generated in the Supabase Auth Hooks page. Without it the route refuses every request rather than accepting unverified payloads. |
| `SUPABASE_PROJECT_REF` | Yes | Host for the verify URL the hook assembles. Missing it degrades link flows to code-only. |
| `AUTH_EMAIL_HOOK_MODE` | No | `merchant` (default) or `platform`. See below. |
| `EXTRA_STOREFRONT_ORIGINS` | No | `host=spaceId` pairs, comma separated, mapping staging and preview origins onto a space. |

`RESEND_API_KEY` and `SECRETS_ENCRYPTION_KEY` are already set and are what the
platform fallback and the merchant credentials depend on.

## The kill switch

There is no response that means "Supabase, you send it", so the switch cannot be
*off*. `AUTH_EMAIL_HOOK_MODE=platform` still sends every email, but forces the
platform transport and neutral branding. That neutralises a bad merchant
configuration without touching the dashboard.

**The only true off-switch is deleting the hook in the Supabase dashboard**,
which reverts to whatever SMTP the project has configured, immediately. Which is
why the project should have working custom SMTP configured even after this ships:
it is the floor you land on.

## Which merchant an email belongs to

Resolved in strict order, each step deferring when it cannot answer confidently:

1. **`profiles.role === MERCHANT` → platform.** Checked *first* and returned
   unconditionally. DailyOS's own password reset passes no `redirectTo`, so
   `redirect_to` falls back to the project Site URL and step 3 would otherwise
   confidently match whichever space owns it.
2. **`user_metadata.spaceId`, validated against a `Customer` row.** The metadata
   is writable by anyone holding a valid access token via
   `auth.updateUser({ data })`, so it is a claim, not evidence. Requiring a
   `Customer` for `(spaceId, email)` makes it one, at the cost of a single
   indexed lookup.
3. **`redirect_to` origin against `CommerceSettings.storefrontUrl`,** normalised
   (lowercased, `www.` stripped, port and path dropped) so a merchant who typed
   either form of their domain still matches. Covers users created before step 2
   existed, and password recovery, which carries an origin but no metadata.
4. **Exactly one `storefrontEnabled` space** means there is nothing to
   disambiguate. Deliberately a count check rather than "the first one", so it
   stops applying the moment a second storefront connects.
5. **Platform.**

## Rollout

1. Confirm custom SMTP works on the project first (the floor, step above).
2. Set the env vars on the DailyOS deployment. Deploy.
3. Exercise the route with a synthetic `standardwebhooks`-signed POST and
   confirm a 401 on a bad signature.
4. Register the hook in Supabase, out of hours.
5. Immediately test, in this order: VKT signup OTP, VKT password reset, DailyOS
   merchant login, DailyOS merchant password reset.
6. Watch Sentry. `sendForSpace` logs a warning on every platform fallback, which
   is how a dead merchant transport surfaces instead of going unnoticed.

Roll back by deleting the hook in the dashboard.
