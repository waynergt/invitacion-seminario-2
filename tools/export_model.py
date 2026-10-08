"""
Exporta MobileNetV3-Large (PyTorch) a ONNX para ejecutarlo en el navegador
y lo reduce a int8 (22 MB → 6 MB) con quantize_weights.py.

Solo hace falta correrlo si quieres regenerar el modelo:
    python -m venv venv && source venv/bin/activate      (Windows: venv\\Scripts\\activate)
    pip install -r tools/requirements.txt
    python tools/export_model.py

Si cambias el modelo, cambia también el nombre del archivo (y MODELO en static/app.js),
porque los navegadores lo guardan en caché por un año.
"""
import json
import os
import sys

import torch
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

sys.path.insert(0, os.path.dirname(__file__))
from quantize_weights import main as cuantizar  # noqa: E402

DESTINO = "static/model"
TEMPORAL = "modelo.tmp.onnx"
SALIDA = f"{DESTINO}/mobilenet_v3_large.int8.onnx"
os.makedirs(DESTINO, exist_ok=True)

weights = MobileNet_V3_Large_Weights.DEFAULT
model = mobilenet_v3_large(weights=weights).eval()
ejemplo = torch.randn(1, 3, 224, 224)

print("Exportando modelo a ONNX…")
torch.onnx.export(
    model, (ejemplo,), TEMPORAL,
    input_names=["input"], output_names=["logits"], opset_version=18,
)

# Une los pesos en un solo archivo y los reduce a int8
import onnx  # noqa: E402

onnx.save(onnx.load(TEMPORAL), TEMPORAL)
cuantizar(TEMPORAL, SALIDA)
for f in os.listdir("."):
    if f.startswith(TEMPORAL):
        os.remove(f)

with open(f"{DESTINO}/labels.json", "w") as f:
    json.dump(weights.meta["categories"], f)

tam = os.path.getsize(SALIDA) / 1e6
print(f"✓ Listo: {SALIDA} ({tam:.1f} MB) + labels.json")
