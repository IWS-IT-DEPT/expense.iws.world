import { requireUser } from "@/lib/current-user";

import { manualsFor } from "./manuals";

export const metadata = { title: "Help · IWS Expense" };

export default async function HelpPage() {
  const user = await requireUser();
  const manuals = manualsFor(user.role);

  return (
    <div className="mx-auto max-w-3xl">
      <h1 className="text-lg font-semibold">Help</h1>
      <p className="mt-1 text-sm opacity-70">
        Instructions for what you can do in IWS Expense. You&apos;re signed in as <strong>{user.role}</strong>,
        so you&apos;re seeing {manuals.length === 1 ? "the guide" : "the guides"} for your access.
      </p>

      {manuals.length > 1 && (
        <nav className="mt-4 flex flex-wrap gap-2 text-sm">
          {manuals.map((m) => (
            <a
              key={m.id}
              href={`#${m.id}`}
              className="rounded-md border border-black/15 px-3 py-1 hover:bg-black/5 dark:border-white/20 dark:hover:bg-white/10"
            >
              {m.title}
            </a>
          ))}
        </nav>
      )}

      {manuals.map((m) => (
        <section key={m.id} id={m.id} className="mt-10 scroll-mt-6 border-t border-black/10 pt-6 dark:border-white/15">
          <h2 className="text-base font-semibold">{m.title}</h2>
          <p className="text-sm opacity-60">{m.blurb}</p>
          {m.body}
        </section>
      ))}

      <p className="mt-10 text-xs opacity-60">
        Missing a section you should have? Open <strong>Your account</strong> (your name in the top bar) and send
        IT a screenshot.
      </p>
    </div>
  );
}
