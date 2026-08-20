FROM node:20-alpine

ENV NODE_ENV=production \
    MONITOR_HOST=0.0.0.0 \
    MONITOR_PORT=8787

WORKDIR /app
COPY services/network-monitor/server.mjs ./server.mjs

USER node
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s --retries=3 CMD wget -q -O /dev/null http://127.0.0.1:8787/healthz || exit 1
CMD ["node", "server.mjs"]
