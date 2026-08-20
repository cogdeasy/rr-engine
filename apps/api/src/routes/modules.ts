import type { FastifyInstance } from "fastify";
import { registerContractRoutes } from "./contracts";
import { registerAlertRoutes } from "./alerts";

/**
 * Feature-module routes.
 *
 * Each feature module owns a file in `src/routes/modules/<module-id>.ts`
 * exporting `register<ModuleName>Routes(app)`, and adds exactly one import plus
 * one call below so parallel branches conflict on a single line at most.
 */
import { registerAogRoutes } from "./aog";

export async function registerModuleRoutes(app: FastifyInstance): Promise<void> {
  await registerAogRoutes(app);
  await registerContractRoutes(app);
  await registerAlertRoutes(app);
}
