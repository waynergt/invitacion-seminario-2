"""
Reduce el modelo ONNX guardando los pesos en int8 (por canal) en lugar de float32.
Las operaciones siguen en float32: cada peso se reconstruye (int8 × escala) al cargar,
así que la precisión casi no cambia y el archivo pesa ~4 veces menos.

Uso:  python tools/quantize_weights.py entrada.onnx salida.onnx
Solo necesita numpy y protobuf (+ el archivo onnx_ml_pb2.py del paquete onnx).
"""
import sys

import numpy as np

try:
    from onnx import onnx_ml_pb2 as P
except ImportError:  # sin el paquete onnx completo
    import onnx_ml_pb2 as P

FLOAT, INT8 = 1, 3
MIN_ELEMENTOS = 1000  # tensores pequeños (bias, etc.) se quedan en float32


def tensor(name, arr, dtype):
    t = P.TensorProto(name=name, data_type=dtype, dims=list(arr.shape))
    t.raw_data = arr.tobytes()
    return t


def main(src, dst):
    m = P.ModelProto()
    with open(src, "rb") as f:
        m.ParseFromString(f.read())
    g = m.graph

    # Solo pesos que entran como "W" (input 1) de Conv o Gemm
    usados = {n.input[1] for n in g.node if n.op_type in ("Conv", "Gemm") and len(n.input) > 1}

    nuevos_init, nodos_dq = [], []
    for t in g.initializer:
        n = int(np.prod(t.dims)) if t.dims else 1
        if t.name not in usados or t.data_type != FLOAT or n < MIN_ELEMENTOS:
            nuevos_init.append(t)
            continue
        w = np.frombuffer(t.raw_data, dtype=np.float32).reshape(t.dims)
        canales = w.reshape(w.shape[0], -1)
        escala = np.abs(canales).max(axis=1) / 127.0
        escala[escala == 0] = 1e-8
        q = np.clip(np.round(canales / escala[:, None]), -127, 127).astype(np.int8).reshape(w.shape)

        # q (int8) --Cast--> float --Mul(escala)--> peso original.
        # Son operaciones con entradas constantes: ONNX Runtime las pre-calcula
        # una sola vez al cargar el modelo, así que la inferencia va igual de rápida.
        nombre = t.name
        forma_escala = [w.shape[0]] + [1] * (w.ndim - 1)
        nuevos_init += [
            tensor(nombre + "_q", q, INT8),
            tensor(nombre + "_scale", escala.astype(np.float32).reshape(forma_escala), FLOAT),
        ]
        cast = P.NodeProto(op_type="Cast", name=nombre + "_cast",
                           input=[nombre + "_q"], output=[nombre + "_f"])
        cast.attribute.add(name="to", type=P.AttributeProto.INT, i=FLOAT)
        mul = P.NodeProto(op_type="Mul", name=nombre + "_mul",
                          input=[nombre + "_f", nombre + "_scale"], output=[nombre])
        nodos_dq += [cast, mul]

    del g.initializer[:]
    g.initializer.extend(nuevos_init)
    resto = list(g.node)
    del g.node[:]
    g.node.extend(nodos_dq + resto)

    with open(dst, "wb") as f:
        f.write(m.SerializeToString())
    print(f"✓ {len(nodos_dq) // 2} pesos cuantizados → {dst}")


if __name__ == "__main__":
    main(*sys.argv[1:3])
