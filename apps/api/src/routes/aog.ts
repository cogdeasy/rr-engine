import type { FastifyInstance } from "fastify";
import { aogFleetExposure, getAogEvent, getAogEvents } from "@rr/data";

/** AOG command centre: grounded aircraft recovery cases and fleet cost exposure. */
export async function registerAogRoutes(app: FastifyInstance): Promise<void> {
  app.get("/aog/events", async () => getAogEvents());

  app.get<{ Params: { eventId: string } }>("/aog/events/:eventId", async (request, reply) => {
    const event = getAogEvent(request.params.eventId);
    if (!event) return reply.code(404).send({ error: "not_found", message: "Unknown AOG event", statusCode: 404 });
    return event;
  });

  app.get("/aog/exposure", async () => aogFleetExposure());
}
