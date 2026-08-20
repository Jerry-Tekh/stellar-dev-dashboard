import { createApp } from './app.js';

const port = Number(process.env.PORT || 3101);
const app = createApp();
const server = app.listen(port, () =>
  console.info(`Behavior analytics listening on http://localhost:${port}`)
);

function shutdown() {
  server.close(() => process.exit(0));
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
