import { OutOfPocketForm } from "../out-of-pocket-form";
import { loadCodingOptions } from "../coding-options";

export default async function OutOfPocketPage() {
  const options = await loadCodingOptions();
  return (
    <div className="mx-auto max-w-xl space-y-4">
      <div>
        <h1 className="text-lg font-semibold">Out-of-Pocket Reimbursement</h1>
        <p className="text-sm opacity-70">
          Something you paid for personally (cash, personal card, check) that the company owes you
          back. Attach a receipt.
        </p>
      </div>
      <OutOfPocketForm {...options} />
    </div>
  );
}
