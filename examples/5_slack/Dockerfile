FROM base-floww

# Install project dependencies (including SDK)
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Set entrypoint from config
ENV FLOWW_ENTRYPOINT=main.ts

# No source code copying - code will be provided via Lambda event payload
# SDK must be listed in package.json dependencies