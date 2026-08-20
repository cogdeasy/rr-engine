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

  // Allow-list driven: CORS_ORIGINS is a comma-separated list, defaulting to the local console.
  const allowedOrigins = (process.env.CORS_ORIGINS ?? "http://localhost:3000").split(",").map((o) => o.trim());
  app.register(cors, { origin: allowedOrigins });

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
