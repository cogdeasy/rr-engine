import type { FastifyInstance } from "fastify";
import { buildEngineWorkscope, workscopeQueue, workscopeQueueSummary } from "@rr/data";

/** Shop visit workscoping: the queue of engines awaiting a decision, and the
 * scenario build-up for a single engine. */
export async function registerWorkscopeRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { limit?: string } }>("/workscope/queue", async (request) => {
    const limit = Number(request.query.limit ?? 14);
    return {
      summary: workscopeQueueSummary(limit),
      candidates: workscopeQueue(limit),
    };
  });

  app.get<{ Params: { engineId: string } }>("/workscope/:engineId", async (request, reply) => {
    const workscope = buildEngineWorkscope(request.params.engineId);
    if (!workscope) {
      return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    }
    return workscope;
  });
}
