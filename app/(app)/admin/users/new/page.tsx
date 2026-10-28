import Link from "next/link";

import { SubmitButton } from "@/app/components/submit-button";
import { requireRole } from "@/lib/current-user";

import { inputClass } from "../../_ui";
import { inviteUser } from "../../actions";

export default async function NewUserPage() {
  await requireRole("admin");
  return (
    <div className="max-w-xl space-y-4">
      <Link href="/admin/users" className="text-sm underline opacity-70">
        ← Users
      </Link>
      <h2 className="text-base font-semibold">Add a user</h2>
      <p className="text-sm opacity-70">
        This sets someone up before their first sign-in. They still sign in with their Microsoft 365
        account — and only email addresses on an allowed company domain can sign in at all.
      </p>
      <form action={inviteUser} className="space-y-4 text-sm">
        <label className="block">
          <span className="mb-1 block font-medium">Email</span>
          <input name="email" type="email" required placeholder="name@iws.world" className={`${inputClass} w-full`} />
        </label>
        <label className="block">
          <span className="mb-1 block font-medium">Full name</span>
          <input name="name" placeholder="Jane Smith" className={`${inputClass} w-full`} />
        </label>
        <label className="flex items-start gap-2">
          <input type="checkbox" name="sendWelcome" defaultChecked className="mt-1" />
          <span>
            Email them setup instructions{" "}
            <span className="text-xs opacity-60">
              — how to sign in, add the app to an iPhone, Android or computer, and open the how-to guide
            </span>
          </span>
        </label>
        <SubmitButton className="rounded-md bg-black px-3.5 py-2 text-sm font-medium text-white dark:bg-white dark:text-black">
          Add user
        </SubmitButton>
      </form>
    </div>
  );
}
