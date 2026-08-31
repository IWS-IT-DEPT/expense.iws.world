import { signIn } from "@/lib/auth";

export default function SignInPage() {
  return (
    <main className="flex min-h-screen items-center justify-center p-6">
      <div className="w-full max-w-sm rounded-xl border border-black/10 p-8 text-center dark:border-white/15">
        <h1 className="text-xl font-semibold">IWS Expense</h1>
        <p className="mt-2 text-sm opacity-70">
          Expense tracking for the IWS group of companies.
        </p>
        <form
          className="mt-6"
          action={async () => {
            "use server";
            await signIn("microsoft-entra-id", { redirectTo: "/" });
          }}
        >
          <button
            type="submit"
            className="w-full rounded-md bg-[#2f2f2f] px-4 py-2.5 text-sm font-medium text-white hover:bg-black dark:bg-white dark:text-black dark:hover:bg-white/90"
          >
            Sign in with Microsoft 365
          </button>
        </form>
      </div>
    </main>
  );
}
