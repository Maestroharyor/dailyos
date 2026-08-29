/**
 * The single definition of "this address has been proved".
 *
 * Read from `app_metadata`, which only the service role can write, so a user
 * cannot set it from the browser the way they can with `user_metadata`.
 *
 * Deliberately NOT `email_confirmed_at`: with the project's "Confirm email"
 * setting off, GoTrue's autoconfirm path stamps that column at signup for
 * everybody, so anything reading it would treat every account as verified,
 * including the ones that never were.
 *
 * Absent reads as unverified. A missing flag must never be permission.
 *
 * Lives here rather than beside either caller because there are two, in
 * different layers - the middleware gate and the invite-accept mutation, which
 * the middleware cannot see because /api is exempt - and a second inline copy
 * of this is a definition that can drift from the tested one.
 */
export function isEmailVerified(user: { app_metadata?: Record<string, unknown> }): boolean {
  return user.app_metadata?.emailVerified === true;
}
