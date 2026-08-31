import { redirect } from "next/navigation";

/** "Log a Purchase" / Receipt Bank moved into the unified expenses area. */
export default function ReceiptsRedirect() {
  redirect("/expenses");
}
