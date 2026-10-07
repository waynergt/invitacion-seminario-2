FROM python:3.11-slim
WORKDIR /app
ENV TORCH_HOME=/app/.torch PYTHONUNBUFFERED=1

RUN pip install --no-cache-dir torch torchvision --index-url https://download.pytorch.org/whl/cpu
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .
# Descarga el modelo durante el build para que el arranque sea instantáneo
RUN python -c "from torchvision.models import mobilenet_v3_large, MobileNet_V3_Large_Weights as W; mobilenet_v3_large(weights=W.DEFAULT)" \
 && chmod -R 777 /app

EXPOSE 7860
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "7860"]