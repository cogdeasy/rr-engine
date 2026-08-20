import type { FastifyInstance } from "fastify";
import type { EngineFamily, ReportId, ReportPeriodId } from "@rr/types";
import {
  buildReportDocument,
  buildReportFacts,
  defaultReportScope,
  listScheduledReports,
  REPORT_DEFINITIONS,
  REPORT_PERIOD_IDS,
  reportDocumentToCsv,
  reportFileName,
  reportsOverview,
} from "@rr/data";

/**
 * Reports & exports (`/assure/reports`). The browser builds previews locally;
 * these endpoints exist so scheduled delivery and integrations can fetch the
 * same document, including a ready-to-attach CSV.
 */
export async function registerReportsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/reports/catalogue", async () => ({
    reports: REPORT_DEFINITIONS,
    overview: reportsOverview(buildReportFacts(), listScheduledReports()),
  }));

  app.get("/reports/schedules", async () => ({ schedules: listScheduledReports() }));

  app.get<{
    Params: { reportId: string };
    Querystring: { operatorId?: string; family?: string; period?: string; sections?: string; format?: string };
  }>("/reports/:reportId", async (request, reply) => {
    const definition = REPORT_DEFINITIONS.find((d) => d.id === request.params.reportId);
    if (!definition) {
      return reply.code(404).send({ error: "not_found", message: "Unknown report", statusCode: 404 });
    }
    const { operatorId = "all", family, period, sections, format } = request.query;
    if (period && !REPORT_PERIOD_IDS.includes(period as ReportPeriodId)) {
      return reply.code(400).send({
        error: "bad_request",
        message: `Unknown period. Expected one of: ${REPORT_PERIOD_IDS.join(", ")}`,
        statusCode: 400,
      });
    }
    const scope = defaultReportScope(definition.id as ReportId, operatorId);
    if (family) scope.family = family as EngineFamily | "all";
    if (period) scope.periodId = period as ReportPeriodId;
    if (sections) scope.sectionIds = sections.split(",").filter(Boolean);

    const document = buildReportDocument(buildReportFacts(), scope);
    if (format === "csv") {
      return reply
        .header("content-type", "text/csv; charset=utf-8")
        .header("content-disposition", `attachment; filename="${reportFileName(document)}"`)
        .send(reportDocumentToCsv(document));
    }
    return { scope, document };
  });
}
