FROM python:3.11-slim

WORKDIR /app
ENV PYTHONPATH=/app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

ENV PYTHONUNBUFFERED=1
VOLUME ["/app/data"]

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
