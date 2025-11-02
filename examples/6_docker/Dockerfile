FROM floww-docker-runtime

# Build context is SDK root, copy pre-built SDK tarball
COPY floww-*.tgz /tmp/

# Setup /app with SDK and runtime dependencies
WORKDIR /app
# Create package.json with required dependencies (floww SDK + fastify for the HTTP server)
RUN echo '{"type":"module","dependencies":{"floww":"*","fastify":"^5.2.0"}}' > package.json && \
    npm install /tmp/floww-*.tgz && \
    npm install && \
    rm -rf /tmp/*.tgz

# Set entrypoint from config
ENV FLOWW_ENTRYPOINT=main.ts

# No source code copying - code will be provided via HTTP request payload
# Uses the universal server from floww-docker-runtime base image
