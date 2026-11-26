import { createServer } from './app';
import { loadConfig } from './config';
import { checkHealth, watchStorage } from './health';

/** Starts the bxvtt server from the environment's settings and stops it cleanly on SIGINT or SIGTERM. */
async function main(): Promise<void> {
  const config = loadConfig();
  const { app, ctx } = await createServer(config);
  await app.listen({ host: config.host, port: config.port });
  const health = await checkHealth(ctx);
  if (ctx.engine.tooOld) {
    app.log.error(
      { bxapi: config.bxapiUrl, engine: ctx.engine.version },
      health.bxapi.error ?? 'bxapi runs an osrlib that is too old',
    );
  } else if (health.bxapi.reachable) {
    app.log.info({ bxapi: config.bxapiUrl, engine: health.bxapi.meta?.engine_version }, 'bxapi is reachable');
  } else {
    app.log.warn({ bxapi: config.bxapiUrl }, health.bxapi.error ?? 'bxapi is unreachable');
  }
  if (config.webDist === null) app.log.info('apps/web/dist is missing, so the server serves only the API');
  if (config.hostKey === null) app.log.info('BXVTT_HOST_KEY is unset, so any user can create a table');
  watchStorage(app, ctx);

  let stopping = false;
  const stop = (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    const timer = setTimeout(() => process.exit(1), 10_000);
    timer.unref();
    app.close().then(
      () => process.exit(0),
      (error: unknown) => {
        app.log.error({ err: error }, 'shutdown failed');
        process.exit(1);
      },
    );
  };
  process.on('SIGINT', () => stop('SIGINT'));
  process.on('SIGTERM', () => stop('SIGTERM'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
