"use client";

import { useEffect, useState, useCallback } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Button } from "@heroui/react";
import { Logo } from "@/components/shared/logo";
import { useSession, signOut } from "@/lib/supabase/use-session";

interface InviteDetails {
  email: string;
  role: string;
  spaceName: string;
  inviterName: string;
  status: "pending" | "expired" | "accepted";
}

export default function AcceptInvitePage() {
  const params = useParams<{ token: string }>();
  const token = params.token;
  const router = useRouter();
  const { data: session, isPending: sessionLoading } = useSession();

  const [invite, setInvite] = useState<InviteDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [accepting, setAccepting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/api/invite/${token}`)
      .then((r) => r.json())
      .then((json) => {
        if (!active) return;
        if (!json.success) {
          setNotFound(true);
        } else {
          setInvite(json.data);
        }
      })
      .catch(() => active && setNotFound(true))
      .finally(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [token]);

  const accept = useCallback(async () => {
    setAccepting(true);
    setError(null);
    try {
      const res = await fetch(`/api/invite/${token}/accept`, { method: "POST" });
      const json = await res.json();
      if (!res.ok || !json.success) {
        throw new Error(json.error || "Failed to accept invitation");
      }
      router.replace("/home");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to accept invitation");
      setAccepting(false);
    }
  }, [token, router]);

  const sessionEmail = session?.user?.email?.toLowerCase();
  const emailMatches =
    !!sessionEmail && !!invite && sessionEmail === invite.email.toLowerCase();

  // Auto-accept once the right user is signed in (covers returning from login).
  useEffect(() => {
    if (
      invite?.status === "pending" &&
      emailMatches &&
      !accepting &&
      !error
    ) {
      accept();
    }
  }, [invite?.status, emailMatches, accepting, error, accept]);

  const card = (children: React.ReactNode) => (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-gray-950 p-4">
      <div className="w-full max-w-md bg-white dark:bg-gray-900 rounded-2xl shadow-sm border border-gray-100 dark:border-gray-800 p-8 text-center">
        <div className="flex justify-center mb-6">
          <Logo className="w-12 h-12" />
        </div>
        {children}
      </div>
    </div>
  );

  if (loading || sessionLoading) {
    return card(<p className="text-gray-500">Loading invitation…</p>);
  }

  if (notFound || !invite) {
    return card(
      <>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Invitation not found
        </h1>
        <p className="text-gray-500 mb-6">
          This invitation link is invalid or no longer exists.
        </p>
        <Button as={Link} href="/login" color="primary" className="w-full">
          Go to sign in
        </Button>
      </>
    );
  }

  if (invite.status === "expired") {
    return card(
      <>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Invitation expired
        </h1>
        <p className="text-gray-500">
          Ask {invite.inviterName} to send you a new invitation to{" "}
          {invite.spaceName}.
        </p>
      </>
    );
  }

  if (invite.status === "accepted") {
    return card(
      <>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Already accepted
        </h1>
        <p className="text-gray-500 mb-6">
          You&apos;ve already joined {invite.spaceName}.
        </p>
        <Button as={Link} href="/home" color="primary" className="w-full">
          Go to dashboard
        </Button>
      </>
    );
  }

  // status: pending
  if (!session?.user) {
    const cb = encodeURIComponent(`/invite/${token}`);
    return card(
      <>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Join {invite.spaceName}
        </h1>
        <p className="text-gray-500 mb-6">
          {invite.inviterName} invited <strong>{invite.email}</strong> to join as{" "}
          {invite.role.replace(/_/g, " ")}. Sign in or create an account to
          continue.
        </p>
        <div className="flex flex-col gap-3">
          <Button
            as={Link}
            href={`/login?callbackUrl=${cb}`}
            color="primary"
            className="w-full"
          >
            Sign in
          </Button>
          <Button
            as={Link}
            href={`/signup?callbackUrl=${cb}`}
            variant="bordered"
            className="w-full"
          >
            Create account
          </Button>
        </div>
      </>
    );
  }

  if (!emailMatches) {
    return card(
      <>
        <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
          Wrong account
        </h1>
        <p className="text-gray-500 mb-6">
          This invitation is for <strong>{invite.email}</strong>, but you&apos;re
          signed in as <strong>{session.user.email}</strong>.
        </p>
        <Button
          color="primary"
          className="w-full"
          onPress={async () => {
            await signOut();
            window.location.reload();
          }}
        >
          Sign in as {invite.email}
        </Button>
      </>
    );
  }

  // Authed + matching → auto-accepting.
  return card(
    <>
      <h1 className="text-xl font-semibold text-gray-900 dark:text-white mb-2">
        Joining {invite.spaceName}…
      </h1>
      {error ? (
        <>
          <p className="text-red-500 mb-6">{error}</p>
          <Button color="primary" className="w-full" onPress={accept}>
            Try again
          </Button>
        </>
      ) : (
        <p className="text-gray-500">Setting up your access.</p>
      )}
    </>
  );
}
