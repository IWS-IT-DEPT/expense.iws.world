"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { AuthError } from "next-auth";

import { signIn } from "@/lib/auth";
import { issueLoginCode, normalizeEmail } from "@/lib/login-code";

async function clientIp(): Promise<string> {
  const h = await headers();
  return h.get("x-real-ip") ?? h.get("x-forwarded-for")?.split(",")[0]?.trim() ?? "unknown";
}

/** Step 1: email a code. The answer is identical whether or not the address has an account. */
export async function requestCode(fd: FormData) {
  const email = normalizeEmail(fd.get("email"));
  await issueLoginCode(email, await clientIp());
  redirect(`/signin/code?${new URLSearchParams({ email, sent: "1" }).toString()}`);
}

/** Step 2: trade the code for a session. */
export async function submitCode(fd: FormData) {
  const email = normalizeEmail(fd.get("email"));
  const code = String(fd.get("code") ?? "");
  try {
    await signIn("email-code", { email, code, redirectTo: "/expenses" });
  } catch (err) {
    // signIn signals success by throwing a redirect — only swallow real auth failures.
    if (err instanceof AuthError) {
      redirect(`/signin/code?${new URLSearchParams({ email, sent: "1", error: "BadCode" }).toString()}`);
    }
    throw err;
  }
}
