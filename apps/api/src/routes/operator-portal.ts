import type { FastifyInstance } from "fastify";
import { buildOperatorPortalView, listOperatorPortalOptions } from "@rr/data";

/**
 * Operator portal — the customer-facing projection of a single operator's
 * fleet. The payload deliberately excludes internal cost, margin and penalty
 * data so it is safe to serve to an airline.
 */
export async function registerOperatorPortalRoutes(app: FastifyInstance): Promise<void> {
  app.get("/operator-portal/operators", async () => listOperatorPortalOptions());

  app.get<{ Params: { operatorId: string } }>("/operator-portal/:operatorId", async (request, reply) => {
    const view = buildOperatorPortalView(request.params.operatorId);
    if (!view) {
      return reply.code(404).send({ error: "not_found", message: "Unknown operator", statusCode: 404 });
    }
    return view;
  });
}
