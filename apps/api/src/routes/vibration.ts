import type { FastifyInstance } from "fastify";
import type { ShaftId } from "@rr/types";
import {
  fleetVibrationProfiles,
  getVibrationProfile,
  signatureBreakdown,
  vibrationExceedances,
  vibrationFleetSummary,
  vibrationSpectrum,
  getEngine,
} from "@rr/data";

/**
 * Vibration analysis endpoints: the fleet exceedance ranking, one engine's
 * tracked orders / balance / interpretation, and a synthesised spectrum.
 */
export async function registerVibrationRoutes(app: FastifyInstance): Promise<void> {
  app.get("/vibration/summary", async () => ({
    summary: vibrationFleetSummary(),
    signatures: signatureBreakdown(),
  }));

  app.get<{ Querystring: { exceedancesOnly?: string; limit?: string } }>("/vibration/fleet", async (request) => {
    const { exceedancesOnly, limit } = request.query;
    const parsed = Number(limit);
    const take = Number.isFinite(parsed) && parsed > 0 ? Math.min(Math.floor(parsed), 500) : 50;
    const profiles = exceedancesOnly === "true" ? vibrationExceedances() : fleetVibrationProfiles();
    return { items: profiles.slice(0, take), total: profiles.length };
  });

  app.get<{ Params: { engineId: string } }>("/vibration/engines/:engineId", async (request, reply) => {
    const profile = getVibrationProfile(request.params.engineId);
    if (!profile) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
    return profile;
  });

  app.get<{ Params: { engineId: string }; Querystring: { shaft?: ShaftId } }>(
    "/vibration/engines/:engineId/spectrum",
    async (request, reply) => {
      const engine = getEngine(request.params.engineId);
      if (!engine) return reply.code(404).send({ error: "not_found", message: "Unknown engine", statusCode: 404 });
      return vibrationSpectrum(engine, request.query.shaft ?? "N1");
    },
  );
}
