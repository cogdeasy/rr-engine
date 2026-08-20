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

/** Read endpoints backing the SB & AD compliance module. */
export async function registerComplianceRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { horizonDays?: string } }>("/compliance/summary", async (request) =>
    complianceSummary(Number(request.query.horizonDays ?? COMPLIANCE_HORIZON_DAYS)),
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
    complianceOverdueRegister(Number(request.query.limit ?? 12)),
  );

  app.get<{ Querystring: { engines?: string } }>("/compliance/matrix", async (request) =>
    complianceMatrix(Number(request.query.engines ?? 24)),
  );

  app.get("/compliance/operators", async () => complianceByOperator());
}
