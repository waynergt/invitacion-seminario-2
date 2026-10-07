"""
Backend de visión artificial para la invitación del Seminario.
Clasifica cada fotograma con MobileNetV3 (PyTorch) y decide si hay café o teclado.
"""
import io

from datetime import datetime, timedelta, timezone
from fastapi.responses import Response

import torch
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from PIL import Image
from torchvision.models import MobileNet_V3_Large_Weights, mobilenet_v3_large

torch.set_num_threads(2)

# Modelo ligero preentrenado en ImageNet (~22 MB)
WEIGHTS = MobileNet_V3_Large_Weights.DEFAULT
MODEL = mobilenet_v3_large(weights=WEIGHTS).eval()
PREPROCESS = WEIGHTS.transforms()
CATEGORIES = WEIGHTS.meta["categories"]

# Clases de ImageNet que cuentan como cada objetivo
OBJETIVOS = {
    "cafe": ["coffee mug", "cup", "espresso", "coffeepot"],
    "teclado": ["computer keyboard", "typewriter keyboard", "space bar", "laptop", "notebook"],
}
INDICES = {k: [CATEGORIES.index(n) for n in v if n in CATEGORIES] for k, v in OBJETIVOS.items()}
UMBRAL = 0.35  # Súbelo para hacerlo más estricto, bájalo para hacerlo más fácil

app = FastAPI(title="Invitación IA · Seminario")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])


@app.post("/api/classify")
def classify(file: UploadFile = File(...)):
    data = file.file.read()
    if len(data) > 2_000_000:
        raise HTTPException(413, "Imagen demasiado grande")
    try:
        img = Image.open(io.BytesIO(data)).convert("RGB")
    except Exception:
        raise HTTPException(400, "Imagen inválida")

    with torch.inference_mode():
        probs = MODEL(PREPROCESS(img).unsqueeze(0)).softmax(dim=1)[0]

    scores = {k: float(probs[idx].sum()) for k, idx in INDICES.items()}
    objetivo = max(scores, key=scores.get)
    top = probs.topk(3)

    return {
        "unlocked": scores[objetivo] >= UMBRAL,
        "objetivo": objetivo,
        "confianza": scores[objetivo],
        "umbral": UMBRAL,
        "scores": scores,
        "top": [
            {"label": CATEGORIES[i], "score": float(p)}
            for p, i in zip(top.values.tolist(), top.indices.tolist())
        ],
    }

TZ_EVENTO = timezone(timedelta(hours=-6))  # Hora de Guatemala (no tiene horario de verano)


def _ics_texto(t: str) -> str:
    return t.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,").replace("\n", "\\n")


@app.get("/api/calendar.ics")
def calendario(titulo: str, fecha: str, inicio: str, fin: str,
               lugar: str = "", detalle: str = "", uid: str = "vip"):
    def utc(hora: str) -> str:
        local = datetime.fromisoformat(f"{fecha}T{hora}").replace(tzinfo=TZ_EVENTO)
        return local.astimezone(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    ics = "\r\n".join([
        "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Seminario//Pase VIP//ES", "METHOD:PUBLISH",
        "BEGIN:VEVENT",
        f"UID:{uid}@seminario",
        f"DTSTAMP:{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%SZ')}",
        f"DTSTART:{utc(inicio)}",
        f"DTEND:{utc(fin)}",
        f"SUMMARY:{_ics_texto(titulo)}",
        f"LOCATION:{_ics_texto(lugar)}",
        f"DESCRIPTION:{_ics_texto(detalle)}",
        "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:El seminario empieza en 2 horas", "END:VALARM",
        "END:VEVENT", "END:VCALENDAR", "",
    ])
    return Response(
        ics,
        media_type="text/calendar; charset=utf-8",
        headers={"Content-Disposition": 'inline; filename="seminario.ics"'},
    )


# Sirve el frontend (debe ir al final)
app.mount("/", StaticFiles(directory="static", html=True), name="static")