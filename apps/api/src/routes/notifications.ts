import type { FastifyInstance } from "fastify";
import type { AcknowledgementState, EscalationTier } from "@rr/types";
import {
  getAckTimeTrend,
  getChannelBreakdown,
  getEscalation,
  getEscalationOwnerLoad,
  getEscalationSummary,
  getEscalations,
  getEscalationsByTier,
} from "@rr/data";

/**
 * Escalations — ownership and acknowledgement of red conditions.
 */
export async function registerNotificationRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { tier?: EscalationTier; state?: AcknowledgementState; breached?: string } }>(
    "/escalations",
    async (request) => {
      const { tier, state, breached } = request.query;
      let rows = getEscalations();
      if (tier) rows = rows.filter((e) => e.tier === tier);
      if (state) rows = rows.filter((e) => e.acknowledgementState === state);
      if (breached === "true") rows = rows.filter((e) => e.breached);
      return rows;
    },
  );

  app.get("/escalations/summary", async () => ({
    summary: getEscalationSummary(),
    ackTimeTrend: getAckTimeTrend(),
    channels: getChannelBreakdown(),
    ownerLoad: getEscalationOwnerLoad(),
  }));

  app.get("/escalations/by-tier", async () => getEscalationsByTier());

  app.get<{ Params: { escalationId: string } }>("/escalations/:escalationId", async (request, reply) => {
    const escalation = getEscalation(request.params.escalationId);
    if (!escalation) {
      return reply.code(404).send({ error: "not_found", message: "Unknown escalation", statusCode: 404 });
    }
    return escalation;
  });
}
