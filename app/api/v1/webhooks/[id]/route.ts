import { withApiKey } from "@/lib/api/handler";
import { apiJson, apiError } from "@/lib/api/respond";
import { deleteWebhook } from "@/lib/webhooks/store";

export const runtime = "nodejs";

// DELETE /api/v1/webhooks/:id — unsubscribe (Zapier REST-hook "unsubscribe").
// Tenant-scoped delete. Requires 'write'.
export async function DELETE(req: Request, { params }: { params: { id: string } }) {
  return withApiKey(req, { scope: "write" }, async ({ tenantId }) => {
    const ok = await deleteWebhook(params.id, tenantId);
    if (!ok) return apiError(404, "not_found", "Webhook subscription not found.");
    return apiJson({ ok: true });
  });
}
