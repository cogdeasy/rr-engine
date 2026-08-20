import type { FastifyInstance } from "fastify";
import { costAnalytics, operatorCostDetail } from "@rr/data";

/**
 * Cost analytics (`costs`). One endpoint for the fleet roll-up the console
 * renders, one for the per-operator drill-down behind an operator row.
 */
export async function registerCostsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/costs/analytics", async () => costAnalytics());

  app.get<{ Params: { operatorId: string } }>("/costs/operators/:operatorId", async (request, reply) => {
    const detail = operatorCostDetail(request.params.operatorId);
    if (!detail) {
      return reply.code(404).send({ error: "not_found", message: "Unknown operator", statusCode: 404 });
    }
    return detail;
  });
}
