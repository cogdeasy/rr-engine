import type { FastifyInstance } from "fastify";
import {
  COMPLIANCE_HORIZON_DAYS,
  complianceBulletins,
  complianceByOperator,
  complianceMatrix,
  complianceOverdueRegister,
  complianceSummary,
  complianceTasks,
} from "@rr/data";

/** Positive integer query param, falling back to `fallback` for missing or malformed input. */
function positiveInt(raw: string | undefined, fallback: number): number {
  const parsed = Number(raw);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

/** Read endpoints backing the SB & AD compliance module. */
export async function registerComplianceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { horizonDays?: string } }>("/compliance/summary", async (request) =>
    complianceSummary(positiveInt(request.query.horizonDays, COMPLIANCE_HORIZON_DAYS)),
  );

  app.get("/compliance/bulletins", async () => complianceBulletins());

  app.get<{ Querystring: { bulletinId?: string; engineId?: string; operatorId?: string; disposition?: string } }>(
    "/compliance/tasks",
    async (request) => {
      const { bulletinId, engineId, operatorId, disposition } = request.query;
      return complianceTasks().filter(
        (task) =>
          (!bulletinId || task.bulletinId === bulletinId) &&
          (!engineId || task.engineId === engineId) &&
          (!operatorId || task.operatorId === operatorId) &&
          (!disposition || task.disposition === disposition),
      );
    },
  );

  app.get<{ Querystring: { limit?: string } }>("/compliance/overdue", async (request) =>
    complianceOverdueRegister(positiveInt(request.query.limit, 12)),
  );

  app.get<{ Querystring: { engines?: string } }>("/compliance/matrix", async (request) =>
    complianceMatrix(positiveInt(request.query.engines, 24)),
  );

  app.get("/compliance/operators", async () => complianceByOperator());
}
