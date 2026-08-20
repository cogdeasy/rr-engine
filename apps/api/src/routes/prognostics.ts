import type { FastifyInstance } from "fastify";
import { engineRulAssessment, engineSurvivalCurve, fleetRulOutlook } from "@rr/data";

/**
 * Prognostics & RUL endpoints — remaining useful life for the fleet and the
 * survival curve behind a single engine's removal window.
 */
export async function registerPrognosticsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/prognostics/rul", async () => fleetRulOutlook());

  app.get<{ Params: { engineId: string } }>("/prognostics/rul/:engineId", async (request, reply) => {
    const assessment = engineRulAssessment(request.params.engineId);
    if (!assessment) {
      return reply.code(404).send({ error: "not_found", message: "No prognostic for this engine", statusCode: 404 });
    }
    return { assessment, survival: engineSurvivalCurve(request.params.engineId) };
  });
}
