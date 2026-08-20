FROM node:20-alpine
WORKDIR /app
COPY services/sentiment-analysis/server.mjs ./server.mjs
ENV NODE_ENV=production PORT=8790
EXPOSE 8790
USER node
CMD ["node", "server.mjs"]
