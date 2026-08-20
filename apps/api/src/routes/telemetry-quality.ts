import type { FastifyInstance } from "fastify";
import { engineFeedQuality, telemetryQualityReport } from "@rr/data";

/** Telemetry quality: fleet feed coverage, gaps and per-engine data trust. */
export async function registerTelemetryQualityRoutes(app: FastifyInstance): Promise<void> {
  app.get("/telemetry-quality", async () => telemetryQualityReport());

  app.get<{ Params: { engineId: string } }>("/telemetry-quality/engines/:engineId", async (request, reply) => {
    const feed = engineFeedQuality(request.params.engineId);
    if (!feed) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    return feed;
  });
}
