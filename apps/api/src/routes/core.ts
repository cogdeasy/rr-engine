import type { FastifyInstance } from "fastify";
import type { ParameterId, StatusLevel } from "@rr/types";
import {
  engineSeries,
  fleetSummary,
  getAlertsForEngine,
  getDataset,
  getEngine,
  getOpenAlerts,
  getPrognosticsForEngine,
  getWorkOrdersForEngine,
  latestTelemetry,
  paginate,
  PARAMETERS,
} from "@rr/data";

/**
 * Core read endpoints. Every endpoint is tightly scoped to a single resource so
 * feature modules can compose them rather than extending a catch-all route.
 */
export async function registerCoreRoutes(app: FastifyInstance) {
  app.get("/fleet/summary", async () => fleetSummary());

  app.get<{ Querystring: { status?: StatusLevel; operatorId?: string; family?: string; page?: string; pageSize?: string } }>(
    "/engines",
    async (request) => {
      const { status, operatorId, family, page = "1", pageSize = "50" } = request.query;
      let engines = getDataset().engines;
      if (status) engines = engines.filter((e) => e.status === status);
      if (operatorId) engines = engines.filter((e) => e.operatorId === operatorId);
      if (family) engines = engines.filter((e) => e.family === family);
      return paginate(engines, Number(page), Number(pageSize));
    },
  );

  app.get<{ Params: { engineId: string } }>("/engines/:engineId", async (request, reply) => {
    const engine = getEngine(request.params.engineId);
    if (!engine) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    const modules = getDataset().engineModules.filter((m) => m.engineId === engine.id);
    return { engine, modules, telemetry: latestTelemetry(engine) };
  });

  app.get<{ Params: { engineId: string }; Querystring: { parameter?: ParameterId; days?: string } }>(
    "/engines/:engineId/series",
    async (request, reply) => {
      const engine = getEngine(request.params.engineId);
      if (!engine) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
      const parameter = request.query.parameter ?? "egtMargin";
      if (!PARAMETERS[parameter]) {
        return reply.code(400).send({ error: "bad_request", message: `Unknown parameter ${parameter}`, statusCode: 400 });
      }
      return engineSeries(engine, parameter, Number(request.query.days ?? 180));
    },
  );

  app.get<{ Params: { engineId: string } }>("/engines/:engineId/alerts", async (request) =>
    getAlertsForEngine(request.params.engineId),
  );

  app.get<{ Params: { engineId: string } }>("/engines/:engineId/prognostics", async (request) =>
    getPrognosticsForEngine(request.params.engineId),
  );

  app.get<{ Params: { engineId: string } }>("/engines/:engineId/work-orders", async (request) =>
    getWorkOrdersForEngine(request.params.engineId),
  );

  app.get<{ Querystring: { open?: string } }>("/alerts", async (request) =>
    request.query.open === "false" ? getDataset().alerts : getOpenAlerts(),
  );

  app.get("/aircraft", async () => getDataset().aircraft);
  app.get("/operators", async () => getDataset().operators);
  app.get("/facilities", async () => getDataset().facilities);
  app.get("/technicians", async () => getDataset().technicians);
  app.get("/work-orders", async () => getDataset().workOrders);
  app.get("/task-cards", async () => getDataset().taskCards);
  app.get("/parts", async () => getDataset().parts);
  app.get("/llps", async () => getDataset().llps);
  app.get("/inventory", async () => getDataset().inventory);
  app.get("/contracts", async () => getDataset().contracts);
  app.get("/kpis", async () => getDataset().kpis);
  app.get("/service-bulletins", async () => getDataset().serviceBulletins);
  app.get("/audit-log", async () => getDataset().auditLog.slice(0, 200));
  app.get("/parameters", async () => PARAMETERS);
}
