FROM node:20-alpine
WORKDIR /app
COPY services/fraud-detection/server.mjs ./server.mjs
ENV NODE_ENV=production PORT=8791
EXPOSE 8791
USER node
CMD ["node", "server.mjs"]
