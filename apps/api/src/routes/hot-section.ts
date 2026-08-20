import type { FastifyInstance } from "fastify";
import {
  hotSectionAssessment,
  hotSectionAssessments,
  hotSectionFleetSummary,
  hotSectionMarginCurve,
  hotSectionWashEffectiveness,
} from "@rr/data";

/**
 * Hot section condition endpoints: the fleet roll-up, the ranked restoration
 * queue, one engine's deterioration curve and the wash effectiveness view.
 */
export async function registerHotSectionRoutes(app: FastifyInstance): Promise<void> {
  app.get("/hot-section/summary", async () => hotSectionFleetSummary());

  app.get<{ Querystring: { status?: string; limit?: string } }>("/hot-section/engines", async (request) => {
    const { status, limit } = request.query;
    const assessments = status ? hotSectionAssessments().filter((a) => a.status === status) : hotSectionAssessments();
    const parsedLimit = Number(limit);
    return Number.isFinite(parsedLimit) && parsedLimit > 0 ? assessments.slice(0, parsedLimit) : assessments;
  });

  app.get<{ Params: { engineId: string } }>("/hot-section/engines/:engineId", async (request, reply) => {
    const assessment = hotSectionAssessment(request.params.engineId);
    if (!assessment) {
      return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    }
    return { assessment, curve: hotSectionMarginCurve(assessment.engineId) };
  });

  app.get("/hot-section/wash-effectiveness", async () => hotSectionWashEffectiveness());
}
