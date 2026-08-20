import { buildServer } from "./server";

const port = Number(process.env.PORT ?? 4000);
const host = process.env.HOST ?? "0.0.0.0";

const app = buildServer();

app
  .listen({ port, host })
  .then(() => {
    app.log.info(`rr-engine api listening on http://${host}:${port}`);
  })
  .catch((error) => {
    app.log.error(error);
    process.exit(1);
  });
