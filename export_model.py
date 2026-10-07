"""
Exporta MobileNetV3 (PyTorch) a ONNX para ejecutarlo en el navegador.
Se ejecuta UNA sola vez.
"""
import glob
import json
import os

import onnx
import torch
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

DESTINO = "static/model"
os.makedirs(DESTINO, exist_ok=True)

weights = MobileNet_V3_Large_Weights.DEFAULT
model = mobilenet_v3_large(weights=weights).eval()
ejemplo = torch.randn(1, 3, 224, 224)

print("Exportando modelo a ONNX…")
torch.onnx.export(
    model, (ejemplo,), "tmp_model.onnx",
    input_names=["input"], output_names=["logits"], opset_version=17,
)

# Une todo en un solo archivo (más fácil de publicar)
onnx.save(onnx.load("tmp_model.onnx"), f"{DESTINO}/mobilenet_v3.onnx")
for f in glob.glob("tmp_model.onnx*"):
    os.remove(f)

with open(f"{DESTINO}/labels.json", "w") as f:
    json.dump(weights.meta["categories"], f)

tam = os.path.getsize(f"{DESTINO}/mobilenet_v3.onnx") / 1e6
print(f"✓ Listo: {DESTINO}/mobilenet_v3.onnx ({tam:.1f} MB) + labels.json")