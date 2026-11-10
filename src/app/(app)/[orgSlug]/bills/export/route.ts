import { NextResponse, type NextRequest } from "next/server";
import { toCsv } from "@/lib/csv";
import { listBills, parseBillFilter } from "@/server/http/queries/bill-queries";
import { requireOrg } from "@/server/http/session";

/** The bills on screen (same filters), as a spreadsheet file. Needs a signed-in member of the org, like the page itself. */
export async function GET(request: NextRequest, { params }: { params: Promise<{ orgSlug: string }> }) {
  const { orgSlug } = await params;
  const { membership } = await requireOrg(orgSlug);
  const q = request.nextUrl.searchParams;
  const { filter, period } = parseBillFilter({ period: q.get("period") ?? undefined, q: q.get("q") ?? undefined, filter: q.get("filter") ?? undefined });
  const { rows } = await listBills(membership.orgId, filter);
  const head = ["Month", "Biller", "Source", "Amount", "Currency", "Bill date", "Due date", "Paid", "Needs review", "Read by", "Note", "Drive link"];
  const body = rows.map((b) => [
    b.periodKey, b.billerName, b.sourceName, b.amountPlain, "INR", b.billDate ?? "", b.dueDate ?? "", b.paid ? "Yes" : "No", b.needsReview ? "Yes" : "No",
    b.method === "manual" ? "typed in" : b.method, b.note ?? "", b.driveLink ?? "",
  ]);
  return new NextResponse(toCsv([head, ...body]), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="billfold-bills-${period || "all"}.csv"`,
      "cache-control": "private, no-store",
    },
  });
}
