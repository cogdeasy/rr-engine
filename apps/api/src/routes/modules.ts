import type { FastifyInstance } from "fastify";

/**
 * Feature-module routes.
 *
 * Each feature module owns a file in `src/routes/modules/<module-id>.ts`
 * exporting `register<ModuleName>Routes(app)`, and adds exactly one import plus
 * one call below so parallel branches conflict on a single line at most.
 */
import { registerTaskCardRoutes } from "./task-cards";

export async function registerModuleRoutes(app: FastifyInstance): Promise<void> {
  await registerTaskCardRoutes(app);
}
