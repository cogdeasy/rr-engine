import type { FastifyInstance } from "fastify";
import { buildRecordSummaries, buildRecordsFleetSummary, engineBuildRecord } from "@rr/data";

/**
 * Build records — as-built engine configuration and traceability.
 */
export async function registerBuildRecordsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/build-records", async () => ({
    summary: buildRecordsFleetSummary(),
    engines: buildRecordSummaries(),
  }));

  app.get<{ Params: { engineId: string } }>("/build-records/:engineId", async (request, reply) => {
    const record = engineBuildRecord(request.params.engineId);
    if (!record) {
      return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    }
    return record;
  });
}
