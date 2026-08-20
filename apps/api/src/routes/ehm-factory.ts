import type { FastifyInstance } from "fastify";
import type { AnalyticStrand } from "@rr/types";
import { analytic, analytics, ehmFactorySummary } from "@rr/data";

/**
 * EHM analytics factory read endpoints: the analytic population, one analytic,
 * and the cycle-time / noise / value roll-up.
 */
export async function registerEhmFactoryRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { strand?: AnalyticStrand; live?: string } }>("/ehm-factory/analytics", async (request) => {
    const { strand, live } = request.query;
    let rows = analytics();
    if (strand) rows = rows.filter((row) => row.strand === strand);
    if (live === "true") rows = rows.filter((row) => row.live);
    if (live === "false") rows = rows.filter((row) => !row.live);
    return rows;
  });

  app.get("/ehm-factory/summary", async () => ehmFactorySummary());

  app.get<{ Params: { analyticId: string } }>("/ehm-factory/analytics/:analyticId", async (request, reply) => {
    const row = analytic(request.params.analyticId);
    if (!row) return reply.code(404).send({ error: "not_found", message: "Unknown analytic", statusCode: 404 });
    return row;
  });
}
