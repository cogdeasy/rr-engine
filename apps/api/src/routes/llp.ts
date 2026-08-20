import type { FastifyInstance } from "fastify";
import { llpFleetStacks, llpFleetSummary, llpStackForEngine } from "@rr/data";

/**
 * LLP life management endpoints: the fleet roll-up, the ranked exposure list
 * and the per-engine stack with its removal recommendation.
 */
export async function registerLlpRoutes(app: FastifyInstance): Promise<void> {
  app.get("/llp/summary", async () => llpFleetSummary());

  app.get<{ Querystring: { driver?: string; limit?: string } }>("/llp/stacks", async (request) => {
    const { driver, limit } = request.query;
    const stacks = driver ? llpFleetStacks().filter((s) => s.driver === driver) : llpFleetStacks();
    const parsed = Number(limit);
    const count = Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 100;
    return stacks.slice(0, count);
  });

  app.get<{ Params: { engineId: string } }>("/llp/stacks/:engineId", async (request, reply) => {
    const stack = llpStackForEngine(request.params.engineId);
    if (!stack) {
      return reply.code(404).send({ error: "not_found", message: "No LLP stack for that engine", statusCode: 404 });
    }
    return stack;
  });
}
