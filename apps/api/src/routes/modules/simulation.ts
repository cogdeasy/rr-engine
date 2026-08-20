import type { FastifyInstance } from "fastify";
import type { SimulationLevers, WorkscopeLevel } from "@rr/types";
import {
  compareScenario,
  getSimulationBaseline,
  listSimulationCandidates,
  recommendScenario,
  sensitivity,
  simulate,
} from "@rr/data";

/**
 * Read-only endpoints for the What-if simulation module. The model is pure, so
 * the API is a thin wrapper: pass levers, get the same numbers the console
 * shows for those levers.
 */
export async function registerSimulationRoutes(app: FastifyInstance) {
  app.get<{ Querystring: { limit?: string } }>("/simulation/candidates", async (request) => {
    const limit = Number(request.query.limit ?? 12);
    return listSimulationCandidates(Number.isFinite(limit) ? Math.min(60, Math.max(1, Math.round(limit))) : 12);
  });

  app.get<{ Params: { engineId: string } }>("/simulation/:engineId/baseline", async (request, reply) => {
    const baseline = getSimulationBaseline(request.params.engineId);
    if (!baseline) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    return { baseline, outcome: simulate(baseline, baseline.levers), recommendation: recommendScenario(baseline) };
  });

  app.get<{
    Params: { engineId: string };
    Querystring: {
      removalOffsetCycles?: string;
      deratePct?: string;
      routeSeverity?: string;
      washIntervalDays?: string;
      workscope?: WorkscopeLevel;
    };
  }>("/simulation/:engineId/scenario", async (request, reply) => {
    const baseline = getSimulationBaseline(request.params.engineId);
    if (!baseline) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    const q = request.query;
    const levers: SimulationLevers = {
      removalOffsetCycles: Number(q.removalOffsetCycles ?? baseline.levers.removalOffsetCycles),
      deratePct: Number(q.deratePct ?? baseline.levers.deratePct),
      routeSeverity: Number(q.routeSeverity ?? baseline.levers.routeSeverity),
      washIntervalDays: Number(q.washIntervalDays ?? baseline.levers.washIntervalDays),
      workscope: q.workscope ?? baseline.levers.workscope,
    };
    const outcome = simulate(baseline, levers);
    return {
      levers,
      outcome,
      deltas: compareScenario(baseline, levers, simulate(baseline, baseline.levers), outcome),
      sensitivity: sensitivity(baseline, levers),
    };
  });
}
