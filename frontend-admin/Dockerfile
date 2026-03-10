FROM denoland/deno:1.41.0

WORKDIR /app

# Copy configuration files
COPY deno.json .
COPY fresh.config.ts .
COPY fresh.gen.ts .
COPY main.ts .
COPY dev.ts .
COPY global.d.ts .

# Copy application files
COPY routes/ ./routes/
COPY islands/ ./islands/
COPY utils/ ./utils/
COPY static/ ./static/

# Cache dependencies
RUN deno cache main.ts

EXPOSE 8000

CMD ["run", "-A", "main.ts"]
