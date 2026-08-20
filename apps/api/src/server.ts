import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { registerCoreRoutes } from "./routes/core";
import { registerModuleRoutes } from "./routes/modules";

export function buildServer(): FastifyInstance {
  const app = Fastify({
    logger: {
      level: process.env.LOG_LEVEL ?? "info",
      transport: process.env.NODE_ENV === "production" ? undefined : { target: "pino-pretty", options: { colorize: true } },
    },
  });

  app.register(cors, { origin: true });

  app.get("/health", async () => ({ status: "ok", service: "rr-engine-api", at: new Date().toISOString() }));

  app.register(
    async (instance) => {
      await registerCoreRoutes(instance);
      await registerModuleRoutes(instance);
    },
    { prefix: "/api" },
  );

  return app;
}
