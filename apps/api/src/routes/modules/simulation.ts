import type { FastifyInstance } from "fastify";
import type { SimulationLevers, WorkscopeLevel } from "@rr/types";
import {
  compareScenario,
  getSimulationBaseline,
  listSimulationCandidates,
  recommendScenario,
  sensitivity,
  simulate,
  WORKSCOPE_LEVELS,
} from "@rr/data";

/** Query levers are untrusted strings; a bad one must 400 rather than model NaN. */
function parseNumber(raw: string | undefined, fallback: number): number | undefined {
  if (raw === undefined) return fallback;
  const value = Number(raw);
  return Number.isFinite(value) ? value : undefined;
}

function parseWorkscope(raw: string | undefined, fallback: WorkscopeLevel): WorkscopeLevel | undefined {
  if (raw === undefined) return fallback;
  return WORKSCOPE_LEVELS.some((level) => level.id === raw) ? (raw as WorkscopeLevel) : undefined;
}

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
      workscope?: string;
    };
  }>("/simulation/:engineId/scenario", async (request, reply) => {
    const baseline = getSimulationBaseline(request.params.engineId);
    if (!baseline) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    const q = request.query;
    const candidate = {
      removalOffsetCycles: parseNumber(q.removalOffsetCycles, baseline.levers.removalOffsetCycles),
      deratePct: parseNumber(q.deratePct, baseline.levers.deratePct),
      routeSeverity: parseNumber(q.routeSeverity, baseline.levers.routeSeverity),
      washIntervalDays: parseNumber(q.washIntervalDays, baseline.levers.washIntervalDays),
      workscope: parseWorkscope(q.workscope, baseline.levers.workscope),
    };
    const invalid = Object.entries(candidate)
      .filter(([, value]) => value === undefined)
      .map(([key]) => key);
    if (invalid.length > 0) {
      return reply.code(400).send({
        error: "bad_request",
        message: `Invalid lever value for: ${invalid.join(", ")}`,
        statusCode: 400,
      });
    }
    const levers = candidate as SimulationLevers;
    const outcome = simulate(baseline, levers);
    return {
      levers,
      outcome,
      deltas: compareScenario(baseline, levers, simulate(baseline, baseline.levers), outcome),
      sensitivity: sensitivity(baseline, levers),
    };
  });
}
