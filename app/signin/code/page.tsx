import Image from "next/image";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SubmitButton } from "@/app/components/submit-button";
import { getCurrentUser } from "@/lib/current-user";

import { requestCode, submitCode } from "./actions";

const input =
  "min-h-11 w-full rounded-md border border-black/15 bg-transparent px-3 text-sm dark:border-white/20";
const button = "w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark";

export default async function EmailCodeSignInPage({
  searchParams,
}: {
  searchParams: Promise<{ email?: string; sent?: string; error?: string }>;
}) {
  const { email = "", sent, error } = await searchParams;
  const current = await getCurrentUser().catch(() => null);
  if (current?.active) redirect("/expenses");

  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/10 p-8 dark:border-white/15">
        <Image src="/brand/iws.png" alt="IWS" width={64} height={64} className="mx-auto" priority />
        <h1 className="mt-4 text-center text-xl font-semibold">Sign in with an email code</h1>
        <p className="mt-2 text-center text-sm opacity-70">
          For people without a Microsoft 365 work account. We&apos;ll email a 6-digit code to the address IT has on
          file for you.
        </p>

        {error ? (
          <p role="alert" className="mt-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
            That code didn&apos;t work. It may have expired or been used already — ask for a new one below.
          </p>
        ) : null}

        {sent ? (
          <form action={submitCode} className="mt-6 space-y-3">
            <p className="text-sm">
              If <strong>{email}</strong> is set up for email sign-in, a code is on its way. It expires in 10 minutes.
            </p>
            <input type="hidden" name="email" value={email} />
            <label className="block text-sm">
              <span className="mb-1 block font-medium">6-digit code</span>
              <input
                name="code"
                inputMode="numeric"
                autoComplete="one-time-code"
                pattern="[0-9 ]{6,7}"
                maxLength={7}
                required
                autoFocus
                className={`${input} text-center font-mono text-lg tracking-widest`}
              />
            </label>
            <SubmitButton pendingLabel="Checking…" className={button}>
              Sign in
            </SubmitButton>
          </form>
        ) : null}

        <form action={requestCode} className={`space-y-3 ${sent ? "mt-6 border-t border-black/10 pt-6 dark:border-white/15" : "mt-6"}`}>
          <label className="block text-sm">
            <span className="mb-1 block font-medium">{sent ? "Didn’t get it? Send a new code to" : "Your email address"}</span>
            <input
              name="email"
              type="email"
              required
              autoComplete="email"
              defaultValue={email}
              placeholder="you@example.com"
              className={input}
            />
          </label>
          <SubmitButton
            pendingLabel="Sending…"
            className={sent ? "w-full rounded-md border border-black/15 px-4 py-2.5 text-sm font-medium dark:border-white/20" : button}
          >
            {sent ? "Send a new code" : "Email me a code"}
          </SubmitButton>
        </form>

        <p className="mt-6 text-center text-sm">
          <Link href="/signin" className="underline opacity-70">
            ← Sign in with Microsoft 365 instead
          </Link>
        </p>
      </div>
    </main>
  );
}
