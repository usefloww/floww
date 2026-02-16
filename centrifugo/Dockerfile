FROM centrifugo/centrifugo:v6

# Install envsubst (part of gettext package)
USER root
RUN apk add --no-cache gettext

# Copy the config template
COPY config.json /centrifugo/config.template.json

# Copy and make the entrypoint script executable
COPY entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

# Switch back to centrifugo user for security
USER centrifugo

# Use our custom entrypoint
ENTRYPOINT ["/entrypoint.sh"]
