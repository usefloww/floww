FROM base-floww

# ---- deps only ----
COPY package.json package-lock.json* ./
RUN npm install --omit=dev

# Set entrypoint from config (will be overridden by environment variable in Lambda)
ENV FLOWW_ENTRYPOINT=main.ts

# No source code copying - code will be provided via Lambda event payload
# Uses the universal handler from base-floww image