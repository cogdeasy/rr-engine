import type { FastifyInstance } from "fastify";
import type { DnStage } from "@rr/types";
import { changePack, changePacks, changePackSummary, outstandingMandatory } from "@rr/data";

/**
 * DN change-pack lifecycle read endpoints: the board, one pack's Definition of
 * Done, and the roll-up used by the operations hero.
 */
export async function registerChangePackRoutes(app: FastifyInstance): Promise<void> {
  app.get<{ Querystring: { stage?: DnStage; blocked?: string } }>("/change-packs", async (request) => {
    const { stage, blocked } = request.query;
    let packs = changePacks();
    if (stage) packs = packs.filter((pack) => pack.stage === stage);
    if (blocked === "true") packs = packs.filter((pack) => pack.gates.some((gate) => gate.state === "blocked"));
    return packs;
  });

  app.get("/change-packs/summary", async () => changePackSummary());

  app.get<{ Params: { packId: string } }>("/change-packs/:packId", async (request, reply) => {
    const pack = changePack(request.params.packId);
    if (!pack) return reply.code(404).send({ error: "not_found", message: "Unknown change pack", statusCode: 404 });
    return { pack, outstandingMandatory: outstandingMandatory(pack) };
  });
}
