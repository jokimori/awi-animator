"""AWI Animator · servidor local + servicio de exportación a .blend.

  python3 export_service.py            → http://localhost:8765
  BLENDER=/ruta/a/blender python3 export_service.py

Sirve la web y expone:
  GET  /api/health  → {"blender": true|false}
  POST /api/blend   → cuerpo: .glb animado · respuesta: .blend (Blender en modo background, proceso aislado)
"""
import http.server, json, os, shutil, subprocess, tempfile, urllib.parse

ROOT = os.path.dirname(os.path.abspath(__file__))
SCRIPT = os.path.join(ROOT, "blender", "awi_to_blend.py")
MAC_BLENDER = "/Applications/Blender.app/Contents/MacOS/Blender"
BLENDER = os.environ.get("BLENDER") or shutil.which("blender") or (MAC_BLENDER if os.path.exists(MAC_BLENDER) else None)
MAX_BODY = 60 * 1024 * 1024
PORT = int(os.environ.get("PORT", "8765"))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=ROOT, **kw)

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")  # siempre la última versión de la web
        super().end_headers()

    def _send(self, code, body, ctype="text/plain; charset=utf-8", extra=None):
        data = body if isinstance(body, bytes) else body.encode()
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(data)))
        for k, v in (extra or {}).items():
            self.send_header(k, v)
        self.end_headers()
        self.wfile.write(data)

    def do_GET(self):
        if self.path.startswith("/api/health"):
            return self._send(200, json.dumps({"blender": bool(BLENDER)}), "application/json")
        return super().do_GET()

    def do_POST(self):
        url = urllib.parse.urlparse(self.path)
        if url.path != "/api/blend":
            return self._send(404, "No encontrado")
        if not BLENDER:
            return self._send(503, "Blender no está instalado en el servicio de exportación (definí BLENDER=/ruta/a/blender).")
        n = int(self.headers.get("Content-Length") or 0)
        if n <= 0 or n > MAX_BODY:
            return self._send(413, "El .glb está vacío o es demasiado grande.")
        glb = self.rfile.read(n)
        if glb[:4] != b"glTF":
            return self._send(400, "El archivo recibido no es un .glb válido.")
        with tempfile.TemporaryDirectory(prefix="awi_") as tmp:
            src, out = os.path.join(tmp, "awi.glb"), os.path.join(tmp, "awi.blend")
            open(src, "wb").write(glb)
            try:
                p = subprocess.run([BLENDER, "-b", "--factory-startup", "-P", SCRIPT, "--", src, out],
                                   capture_output=True, text=True, timeout=300, cwd=tmp)
            except subprocess.TimeoutExpired:
                return self._send(504, "Blender tardó demasiado (más de 5 minutos).")
            if p.returncode != 0 or not os.path.exists(out):
                tail = (p.stderr or p.stdout or "").strip().splitlines()[-6:]
                return self._send(500, "Blender falló: " + " | ".join(tail))
            data = open(out, "rb").read()
        name = urllib.parse.parse_qs(url.query).get("name", ["awi"])[0]
        safe = "".join(c for c in name if c.isalnum() or c in "-_.") or "awi"
        return self._send(200, data, "application/octet-stream", {"Content-Disposition": f'attachment; filename="{safe}.blend"'})


if __name__ == "__main__":
    print(f"AWI Animator en http://localhost:{PORT}  ·  Blender: {BLENDER or 'no encontrado (el .blend se entrega como kit)'}")
    http.server.ThreadingHTTPServer(("127.0.0.1", PORT), Handler).serve_forever()
