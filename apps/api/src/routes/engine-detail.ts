import type { FastifyInstance } from "fastify";
import { engineDossier } from "@rr/data";

/**
 * `engine-detail` module route: the assembled per-engine dossier that backs the
 * engine detail page and its 3D twin.
 */
export async function registerEngineDetailRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Params: { engineId: string } }>("/engines/:engineId/dossier", async (request, reply) => {
    const dossier = engineDossier(request.params.engineId);
    if (!dossier) {
      return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    }
    return dossier;
  });
}
