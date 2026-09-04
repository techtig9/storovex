export const dynamic = "force-dynamic";

import {type NextRequest} from "next/server";
import {createServiceRoleSupabase} from "@/core/supabase/server";
import {toMinorUnits} from "@/core/commerce/money";
import {withApi, apiSuccess, apiError} from "@/core/security/apiHandler";
import {z} from "zod";

/**
 * The shopper's own view of an order group, for the confirmation page.
 *
 * There is no session to authorise against, so authority is knowing both the group
 * id and the email on it. The id alone is not enough: it appears in a URL that ends
 * up in browser history and referrer headers, and a bare id would let anyone holding
 * it read someone else's postal address.
 *
 * order_groups is server-only in RLS, which is why this runs as service role and
 * does the check itself.
 */
const schema = z.object({
  groupId: z.string().uuid(),
  email: z.string().trim().toLowerCase().email().max(254),
});

export const GET = withApi(
  {methods: ["GET"], rateLimit: {limit: 30, windowSeconds: 60, scope: "orders:confirm"}},
  async (req: NextRequest) => {
    const parsed = schema.safeParse(Object.fromEntries(new URL(req.url).searchParams));
    if (!parsed.success) return apiError(400, "INVALID_REQUEST", "We need the order reference and the email you used.");

    const supabase = createServiceRoleSupabase();
    const {data: group} = await supabase
      .from("order_groups").select("id,email,created_at")
      .eq("id", parsed.data.groupId).maybeSingle();

    // The same response either way, so this cannot be used to test whether an order
    // id exists.
    if (!group || (group.email as string).toLowerCase() !== parsed.data.email) {
      return apiError(404, "ORDER_NOT_FOUND", "We couldn't find an order with that reference and email.");
    }

    const {data: orders} = await supabase
      .from("orders")
      .select("id,order_number,status,total,store_id,stores(name,slug)")
      .eq("order_group_id", parsed.data.groupId);

    const {data: items} = await supabase
      .from("order_items")
      .select("id,order_id,title_snapshot,price_snapshot,quantity")
      .in("order_id", (orders ?? []).map(o => o.id as string));

    return apiSuccess({
      id: group.id as string,
      email: group.email as string,
      createdAt: group.created_at as string,
      orders: (orders ?? []).map(o => {
        const store = o.stores as unknown as {name: string; slug: string} | null;
        return {
          id: o.id as string,
          orderNumber: o.order_number as number,
          status: o.status as string,
          total: toMinorUnits(o.total as string),
          storeName: store?.name ?? "Seller",
          storeSlug: store?.slug ?? "",
          items: (items ?? []).filter(i => i.order_id === o.id).map(i => ({
            id: i.id as string,
            title: i.title_snapshot as string,
            quantity: i.quantity as number,
            unitPrice: toMinorUnits(i.price_snapshot as string),
          })),
        };
      }),
    });
  }
);
