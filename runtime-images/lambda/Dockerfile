# ---- build stage ----
FROM node:22 AS build

RUN npm install -g pnpm@10.9.0 esbuild@0.25.10

WORKDIR /app
COPY runtime-images/lambda/src ./src

RUN esbuild src/handler.ts \
  --bundle --platform=node --format=esm --target=node22 \
  --external:floww \
  --outfile=handler.mjs

# ---- runtime stage ----
FROM public.ecr.aws/lambda/nodejs:22 AS runtime

# copy just what you need
COPY --from=build /app/handler.mjs /var/task/bootstrap.mjs
RUN echo '{"type":"module"}' > /var/task/package.json

CMD [ "bootstrap.handler" ]


FROM runtime AS example

RUN echo '{"type":"module","dependencies":{"floww":"*","fastify":"^5.2.0"}}' > package.json && \
    npm install
