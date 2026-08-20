import type { FastifyInstance } from "fastify";
import {
  debrisByChamber,
  getDebrisEvents,
  getOilCondition,
  getOilCorrelationTimeline,
  oilConditions,
  oilFleetSummary,
  recentDebrisEvents,
} from "@rr/data";

function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback;
}

/**
 * Oil & debris monitoring endpoints — the evidence behind an off-wing decision.
 */
export async function registerOilDebrisRoutes(app: FastifyInstance): Promise<void> {
  app.get("/oil/summary", async () => ({ summary: oilFleetSummary(), chambers: debrisByChamber() }));

  app.get<{ Querystring: { status?: string; limit?: string } }>("/oil/engines", async (request) => {
    const { status, limit } = request.query;
    const conditions = status ? oilConditions().filter((c) => c.status === status) : oilConditions();
    return conditions.slice(0, positiveInt(limit, 100));
  });

  app.get<{ Params: { engineId: string } }>("/oil/engines/:engineId", async (request, reply) => {
    const condition = getOilCondition(request.params.engineId);
    if (!condition) {
      return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    }
    return {
      condition,
      events: getDebrisEvents(condition.engineId),
      timeline: getOilCorrelationTimeline(condition.engineId),
    };
  });

  app.get<{ Querystring: { days?: string; limit?: string } }>("/oil/debris", async (request) =>
    recentDebrisEvents(positiveInt(request.query.days, 30), positiveInt(request.query.limit, 40)),
  );
}
