import type { FastifyInstance } from "fastify";
import {
  correlationMatrix,
  investigation,
  investigations,
  parameterExplorerSummary,
  parameterSignals,
  parameterTrace,
  shortlist,
} from "@rr/data";

/**
 * Parameter explorer read endpoints: the investigation list, the ranked signals
 * for one investigation, its shortlist cross-correlation, and a single trace.
 */
export async function registerParameterExplorerRoutes(app: FastifyInstance): Promise<void> {
  app.get("/parameter-explorer/investigations", async () => investigations());

  app.get("/parameter-explorer/summary", async () => parameterExplorerSummary());

  app.get<{ Params: { investigationId: string }; Querystring: { limit?: string } }>(
    "/parameter-explorer/investigations/:investigationId/signals",
    async (request, reply) => {
      const inv = investigation(request.params.investigationId);
      if (!inv) return reply.code(404).send({ error: "not_found", message: "Unknown investigation", statusCode: 404 });
      const limit = Math.min(Math.max(Number(request.query.limit) || 50, 1), 500);
      return {
        investigation: inv,
        shortlist: shortlist(inv.id),
        signals: parameterSignals(inv.id).slice(0, limit),
        matrix: correlationMatrix(inv.id),
      };
    },
  );

  app.get<{ Params: { investigationId: string; parameterCode: string } }>(
    "/parameter-explorer/investigations/:investigationId/trace/:parameterCode",
    async (request, reply) => {
      const trace = parameterTrace(request.params.investigationId, request.params.parameterCode);
      if (trace.length === 0) {
        return reply.code(404).send({ error: "not_found", message: "Unknown parameter", statusCode: 404 });
      }
      return trace;
    },
  );
}
