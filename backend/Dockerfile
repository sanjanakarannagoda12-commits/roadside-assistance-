# Ridzo API — production image.
# Two stages: build TypeScript with dev tools, then ship only the compiled JS + production deps.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build

FROM node:24-alpine
ENV NODE_ENV=production
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force
COPY --from=build /app/dist ./dist
# Run as the unprivileged "node" user, never root.
USER node
EXPOSE 4000
CMD ["node", "--enable-source-maps", "dist/server.js"]
