import type { FastifyInstance } from "fastify";
import type { Alert } from "@rr/types";
import { getAlertEvidence, getTriageQueue, getTriageSummary, paginate } from "@rr/data";

/**
 * Alert triage endpoints: the ranked disposition queue and the evidence pack
 * behind a single alert.
 */
export async function registerAlertRoutes(app: FastifyInstance): Promise<void> {
  app.get<{
    Querystring: {
      severity?: Alert["severity"];
      source?: Alert["source"];
      state?: Alert["state"];
      operatorId?: string;
      beforeNextSector?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/alerts/queue", async (request) => {
    const { severity, source, state, operatorId, beforeNextSector, page = "1", pageSize = "50" } = request.query;
    let queue = getTriageQueue();
    if (severity) queue = queue.filter((item) => item.alert.severity === severity);
    if (source) queue = queue.filter((item) => item.alert.source === source);
    if (state) queue = queue.filter((item) => item.alert.state === state);
    if (operatorId) queue = queue.filter((item) => item.alert.operatorId === operatorId);
    if (beforeNextSector === "true") queue = queue.filter((item) => item.needsActionBeforeNextSector);
    return { summary: getTriageSummary(queue), ...paginate(queue, Number(page), Number(pageSize)) };
  });

  app.get<{ Params: { alertId: string } }>("/alerts/:alertId/evidence", async (request, reply) => {
    const evidence = getAlertEvidence(request.params.alertId);
    if (!evidence) return reply.code(404).send({ error: "not_found", message: "Unknown alert", statusCode: 404 });
    return evidence;
  });
}
