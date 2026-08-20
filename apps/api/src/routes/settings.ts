import type { FastifyInstance } from "fastify";
import { escalationPolicies, platformHealth, settingsSnapshot, thresholdImpact, thresholdPolicies } from "@rr/data";

function limitOrDefault(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw.trim() === "") return fallback;
  return Number(raw);
}

/**
 * Settings & access endpoints: the governance model behind every other module.
 */
export async function registerSettingsRoutes(app: FastifyInstance): Promise<void> {
  app.get("/settings/snapshot", async () => settingsSnapshot());

  app.get("/settings/thresholds", async () => thresholdPolicies());

  app.get<{ Params: { thresholdId: string }; Querystring: { amber?: string; red?: string } }>(
    "/settings/thresholds/:thresholdId/impact",
    async (request, reply) => {
      const policy = thresholdPolicies().find((t) => t.id === request.params.thresholdId);
      if (!policy) {
        return reply.code(404).send({ error: "not_found", message: "Unknown threshold", statusCode: 404 });
      }
      const amber = limitOrDefault(request.query.amber, policy.amber);
      const red = limitOrDefault(request.query.red, policy.red);
      if (Number.isNaN(amber) || Number.isNaN(red)) {
        return reply.code(400).send({ error: "bad_request", message: "amber and red must be numeric", statusCode: 400 });
      }
      return { thresholdId: policy.id, amber, red, impact: thresholdImpact(policy.values, amber, red, policy.direction) };
    },
  );

  app.get("/settings/escalations", async () => escalationPolicies());

  app.get("/settings/platform-health", async () => platformHealth());
}
