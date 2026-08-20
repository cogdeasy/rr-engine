import type { FastifyInstance } from "fastify";
import {
  getTestCellActionQueue,
  getTestCellRun,
  getTestCellRuns,
  getTestCellRunsForEngine,
  testCellFailureCauses,
  testCellFamilyStats,
  testCellFleetSummary,
  testCellUtilisation,
  toTestCellRunSummary,
} from "@rr/data";
import type { TestCellOutcome } from "@rr/types";

/**
 * Test cell results — post-overhaul pass-off runs.
 *
 * List responses omit the per-sample profile so a fleet query stays small; the
 * single-run endpoint returns the full record including the slam profile and
 * the acceptance checklist.
 */
export async function registerTestCellRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { outcome?: TestCellOutcome; family?: string; engineId?: string } }>(
    "/test-cell/runs",
    async (request) => {
      const { outcome, family, engineId } = request.query;
      let runs = engineId ? getTestCellRunsForEngine(engineId) : getTestCellRuns();
      if (outcome) runs = runs.filter((run) => run.outcome === outcome);
      if (family) runs = runs.filter((run) => run.family === family);
      return runs.map(toTestCellRunSummary);
    },
  );

  app.get<{ Params: { runId: string } }>("/test-cell/runs/:runId", async (request, reply) => {
    const run = getTestCellRun(request.params.runId);
    if (!run) return reply.code(404).send({ error: "not_found", message: "Unknown pass-off run", statusCode: 404 });
    return run;
  });

  app.get("/test-cell/queue", async () => getTestCellActionQueue().map(toTestCellRunSummary));

  app.get("/test-cell/summary", async () => ({
    summary: testCellFleetSummary(),
    failureCauses: testCellFailureCauses(),
    families: testCellFamilyStats(),
    beds: testCellUtilisation(),
  }));
}
