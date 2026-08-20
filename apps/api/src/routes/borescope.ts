import type { FastifyInstance } from "fastify";
import type { BorescopeDisposition, ModuleCode } from "@rr/types";
import {
  BORESCOPE_LIMITS,
  borescopeSummary,
  getBorescopeFinding,
  getBorescopeModuleTrends,
  getFindingProgression,
  getFindingsForInspection,
  getLatestInspections,
  getOpenBorescopeFindings,
  getReinspectionQueue,
  paginate,
} from "@rr/data";

/**
 * Borescope inspection endpoints: the current out-of-limit position, the
 * measurement history of a single damage site and the re-inspection queue.
 */
export async function registerBorescopeRoutes(app: FastifyInstance): Promise<void> {
  app.get("/borescope/summary", async () => borescopeSummary());

  app.get<{
    Querystring: {
      disposition?: BorescopeDisposition;
      moduleCode?: ModuleCode;
      engineId?: string;
      exceedancesOnly?: string;
      page?: string;
      pageSize?: string;
    };
  }>("/borescope/findings", async (request) => {
    const { disposition, moduleCode, engineId, exceedancesOnly, page = "1", pageSize = "50" } = request.query;
    let findings = getOpenBorescopeFindings();
    if (disposition) findings = findings.filter((f) => f.disposition === disposition);
    if (moduleCode) findings = findings.filter((f) => f.moduleCode === moduleCode);
    if (engineId) findings = findings.filter((f) => f.engineId === engineId);
    if (exceedancesOnly === "true") findings = findings.filter((f) => f.exceedsServiceable);
    return paginate(findings, Number(page), Number(pageSize));
  });

  app.get<{ Params: { findingId: string } }>("/borescope/findings/:findingId", async (request, reply) => {
    const finding = getBorescopeFinding(request.params.findingId);
    if (!finding) {
      return reply.code(404).send({ error: "not_found", message: "Unknown borescope finding", statusCode: 404 });
    }
    return { finding, progression: getFindingProgression(finding.id) };
  });

  app.get<{ Params: { inspectionId: string } }>("/borescope/inspections/:inspectionId/findings", async (request) =>
    getFindingsForInspection(request.params.inspectionId),
  );

  app.get("/borescope/inspections/latest", async () => getLatestInspections());

  app.get("/borescope/reinspections", async () => getReinspectionQueue());

  app.get("/borescope/trends", async () => getBorescopeModuleTrends());

  app.get("/borescope/limits", async () => BORESCOPE_LIMITS);
}
