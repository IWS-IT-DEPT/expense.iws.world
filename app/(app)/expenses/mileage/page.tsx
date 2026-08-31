import { redirect } from "next/navigation";
import { desc, eq } from "drizzle-orm";

import { db } from "@/db";
import { categories, mileageRates } from "@/db/schema";
import { requireUser } from "@/lib/current-user";

import { MileageForm } from "../mileage-form";
import { loadCodingOptions } from "../coding-options";

export default async function MileagePage() {
  const user = await requireUser();
  if (!user.mileageEligible) redirect("/expenses");

  const [options, mileageCat, latestRate] = await Promise.all([
    loadCodingOptions(),
    db.query.categories.findFirst({ where: eq(categories.code, "MILEAGE") }),
    db.query.mileageRates.findFirst({ orderBy: [desc(mileageRates.effectiveDate)] }),
  ]);

  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Mileage</h1>
        <p className="text-sm opacity-70">
          Business miles in your personal vehicle. Reimbursed at the IRS standard rate for the trip
          date.
        </p>
      </div>
      <MileageForm
        {...options}
        mileageCategoryId={mileageCat?.id}
        currentRatePerMile={latestRate?.ratePerMile}
      />
    </div>
  );
}
