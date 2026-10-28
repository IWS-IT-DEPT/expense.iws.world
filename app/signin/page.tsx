import { SubmitButton } from "@/app/components/submit-button";
import Image from "next/image";

import { signIn } from "@/lib/auth";

const ERRORS: Record<string, string> = {
  NoAccount:
    "That Microsoft account hasn't been set up in IWS Expense yet. Ask IT to add you, then try again.",
  Disabled: "Your IWS Expense account is turned off. Contact IT if you think that's a mistake.",
  AccessDenied: "That Microsoft account isn't allowed to use IWS Expense.",
};

export default async function SignInPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const message = error ? (ERRORS[error] ?? "Sign-in didn't work. Try again, or contact IT.") : null;
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/10 p-8 text-center dark:border-white/15">
        <Image
          src="/brand/iws.png"
          alt="IWS"
          width={64}
          height={64}
          className="mx-auto"
          priority
        />
        <h1 className="mt-4 text-xl font-semibold">IWS Expense</h1>
        <p className="mt-2 text-sm opacity-70">
          Expense tracking for the IWS group of companies.
        </p>
        {message ? (
          <p role="alert" className="mt-4 rounded-md border border-red-500/50 bg-red-500/10 p-3 text-sm">
            {message}
          </p>
        ) : null}
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/expenses" });
          }}
        >
          <SubmitButton
            type="submit"
            className="w-full rounded-md bg-brand px-4 py-2.5 text-sm font-medium text-white hover:bg-brand-dark"
          >
            Sign in with Microsoft 365
          </SubmitButton>
        </form>
      </div>
    </main>
  );
}
