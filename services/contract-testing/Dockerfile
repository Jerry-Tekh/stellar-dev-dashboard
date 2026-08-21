FROM node:20-alpine
WORKDIR /app
COPY services/contract-testing/server.mjs ./server.mjs
ENV NODE_ENV=production PORT=8793
EXPOSE 8793
USER node
CMD ["node", "server.mjs"]
