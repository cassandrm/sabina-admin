FROM python:3.12-slim
WORKDIR /usr/src/app

# Copy backend-admin files (context is SABINA root)
COPY ./requirements.txt .
COPY ./src/ ./src/
COPY ./config/ ./config/

# Install curl for healthcheck
RUN apt-get update && apt-get install -y curl && rm -rf /var/lib/apt/lists/*

# Install dependencies
RUN pip install -r requirements.txt

EXPOSE 8002

ENV PYTHONPATH=/usr/src/app
ENV CONFIG_YAML_DIR=/usr/src/app/config/

CMD ["uvicorn", "src.main:app", "--host", "0.0.0.0", "--port", "8002", "--reload"]
