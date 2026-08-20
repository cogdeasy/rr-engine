import type { FastifyInstance } from "fastify";
import type { AuditCategory, AuditEntityType } from "@rr/types";
import { auditEntityTimeline, auditTrail, paginate } from "@rr/data";

/**
 * Audit trail read endpoints. The ledger is append-only, so there is no write
 * surface here: entries are produced by the actions they describe.
 */
export async function registerAuditRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      actor?: string;
      category?: AuditCategory;
      entityType?: AuditEntityType;
      engineId?: string;
      q?: string;
      from?: string;
      to?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/audit/records", async (request) => {
    const { actor, category, entityType, engineId, q, from, to, page = "1", pageSize = "50" } = request.query;
    const needle = q?.trim().toLowerCase();
    const records = auditTrail()
      .records.filter((record) => {
        if (actor && record.actor.handle !== actor) return false;
        if (category && record.category !== category) return false;
        if (entityType && record.entityType !== entityType) return false;
        if (engineId && record.engineId !== engineId && record.esn !== engineId) return false;
        if (from && record.at < from) return false;
        if (to && record.at > to) return false;
        if (needle) {
          const haystack = `${record.action} ${record.detail} ${record.entityLabel} ${record.actor.name} ${record.esn ?? ""}`.toLowerCase();
          if (!haystack.includes(needle)) return false;
        }
        return true;
      })
      .reverse();
    return paginate(records, Number(page), Number(pageSize));
  });

  app.get("/audit/integrity", async () => auditTrail().integrity);

  app.get<{ Params: { entityId: string } }>("/audit/entities/:entityId", async (request, reply) => {
    const timeline = auditEntityTimeline(request.params.entityId);
    if (!timeline) {
      return reply.code(404).send({ error: "not_found", message: "No audit records for that entity", statusCode: 404 });
    }
    return timeline;
  });
}
