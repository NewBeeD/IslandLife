import { buildApp } from './app';

// Entry point: build the Fastify app and listen. The app itself is exported
// separately so tests can drive it without binding a port.
const app = buildApp();
const port = Number(process.env.PORT ?? 3001);

app
  .listen({ port, host: '0.0.0.0' })
  .then(() => {
    // eslint-disable-next-line no-console
    console.log(`Island Life API listening on http://localhost:${port}`);
  })
  .catch((err) => {
    app.log.error(err);
    process.exit(1);
  });
