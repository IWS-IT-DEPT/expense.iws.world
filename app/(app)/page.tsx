import { redirect } from "next/navigation";

// After sign-in everyone lands on My Expenses; the personal + review summary
// lives at /summary.
export default function Home() {
  redirect("/expenses");
}
