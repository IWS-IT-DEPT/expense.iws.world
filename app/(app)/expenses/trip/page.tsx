import { redirect } from "next/navigation";

// The GPS trip flow was replaced by odometer entry; keep old bookmarks working.
export default function TripRedirect() {
  redirect("/expenses/mileage");
}
