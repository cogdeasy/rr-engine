import type { FastifyInstance } from "fastify";
import {
  getEnginePerformance,
  getFleetPerformance,
  getFleetPerformanceSummary,
  getOperatorFuelPenalty,
  getSfcSeries,
  getWashCandidates,
} from "@rr/data";

/**
 * Performance & fuel burn endpoints: fleet fuel-burn penalty ranking, the wash
 * business case for a single engine, and the operator roll-up.
 */
export async function registerPerformanceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { recommendation?: string; operatorId?: string; limit?: string } }>(
    "/performance/fleet",
    async (request) => {
      const { recommendation, operatorId, limit } = request.query;
      let rows = getFleetPerformance();
      if (recommendation) rows = rows.filter((r) => r.washCase.recommendation === recommendation);
      if (operatorId) rows = rows.filter((r) => r.operatorId === operatorId);
      return {
        summary: getFleetPerformanceSummary(),
        items: limit ? rows.slice(0, Number(limit)) : rows,
        total: rows.length,
      };
    },
  );

  app.get("/performance/wash-candidates", async () => getWashCandidates(12));

  app.get("/performance/operators", async () => getOperatorFuelPenalty());

  app.get<{ Params: { engineId: string } }>("/performance/engines/:engineId", async (request, reply) => {
    const performance = getEnginePerformance(request.params.engineId);
    if (!performance) {
      return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    }
    return { performance, sfcSeries: getSfcSeries(performance.engineId) };
  });
}
