import type { FastifyInstance } from "fastify";
import { getReliabilityOverview, getRemovalCauses, getWeibullFits } from "@rr/data";

/** Read endpoints for the Reliability KPIs module. */
export async function registerReliabilityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reliability/overview", async () => getReliabilityOverview());

  app.get("/reliability/scorecard", async () => {
    const overview = getReliabilityOverview();
    return { generatedAt: overview.generatedAt, windowMonths: overview.windowMonths, rows: overview.scorecard };
  });

  app.get<{ Querystring: { kind?: "family" | "operator" } }>("/reliability/segments", async (request) => {
    const overview = getReliabilityOverview();
    if (request.query.kind === "operator") return overview.operators;
    if (request.query.kind === "family") return overview.families;
    return [...overview.families, ...overview.operators];
  });

  app.get("/reliability/removal-causes", async () => getRemovalCauses());

  app.get("/reliability/weibull", async () => getWeibullFits());
}
