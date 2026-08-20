import type { FastifyInstance } from "fastify";
import type { EngineFamily, ParameterId } from "@rr/types";
import {
  engineTrendBundle,
  engineTrendEvents,
  fleetBand,
  getEngine,
  TRENDED_PARAMETERS,
  trendEngineOptions,
} from "@rr/data";

/**
 * Health trending: parameter series with fitted deterioration statistics, the
 * events that explain discontinuities, and the same-family fleet band used by
 * compare mode.
 */
export async function registerHealthTrendingRoutes(app: FastifyInstance): Promise<void> {
  app.get("/health-trending/parameters", async () => TRENDED_PARAMETERS);

  app.get<{ Querystring: { limit?: string } }>("/health-trending/engines", async (request) =>
    trendEngineOptions(Number(request.query.limit ?? 14)),
  );

  app.get<{ Params: { engineId: string }; Querystring: { parameter?: ParameterId; days?: string } }>(
    "/health-trending/engines/:engineId/trend",
    async (request, reply) => {
      const engine = getEngine(request.params.engineId);
      if (!engine) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
      const parameter = request.query.parameter ?? "egtMargin";
      if (!TRENDED_PARAMETERS.includes(parameter)) {
        return reply.code(400).send({ error: "bad_request", message: `Parameter ${parameter} is not trended`, statusCode: 400 });
      }
      const days = Number(request.query.days ?? 180);
      return { ...engineTrendBundle(engine, parameter, days), events: engineTrendEvents(engine, days) };
    },
  );

  app.get<{ Querystring: { family?: EngineFamily; parameter?: ParameterId; days?: string } }>(
    "/health-trending/fleet-band",
    async (request, reply) => {
      const { family, parameter = "egtMargin", days = "180" } = request.query;
      if (!family) return reply.code(400).send({ error: "bad_request", message: "family is required", statusCode: 400 });
      if (!TRENDED_PARAMETERS.includes(parameter)) {
        return reply.code(400).send({ error: "bad_request", message: `Parameter ${parameter} is not trended`, statusCode: 400 });
      }
      return fleetBand(family, parameter, Number(days));
    },
  );
}
