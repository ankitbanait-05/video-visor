"""Run Video Visor's interface in a browser for fast testing, with a stand-in for the Electron
main process (tools/preview/mock-native.js). Files, exports and recordings are simulated.

    python3 -I tools/preview/serve.py [port]      then open http://localhost:8765

Sample media is generated once into tools/preview/samples/ with the bundled ffmpeg.
"""
import http.server
import json, os
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
SRC = os.path.join(ROOT, "src")
SAMPLES = os.path.join(HERE, "samples")
FFMPEG = os.path.join(ROOT, "vendor", "node_modules", "ffmpeg-static", "ffmpeg")


def make_samples():
    os.makedirs(SAMPLES, exist_ok=True)
    demo, still = os.path.join(SAMPLES, "demo.mp4"), os.path.join(SAMPLES, "still.png")
    if not os.path.exists(demo):
        subprocess.run([FFMPEG, "-v", "error", "-y", "-f", "lavfi", "-i", "testsrc2=size=1280x720:rate=30:duration=24",
                        "-f", "lavfi", "-i", "sine=frequency=330:duration=24", "-c:v", "libx264", "-pix_fmt", "yuv420p",
                        "-preset", "ultrafast", "-g", "30", "-c:a", "aac", "-shortest", demo], check=True)
    if not os.path.exists(still):
        subprocess.run([FFMPEG, "-v", "error", "-y", "-ss", "3", "-i", demo, "-frames:v", "1", still], check=True)


class Handler(http.server.SimpleHTTPRequestHandler):
    def translate_path(self, path):
        path = path.split("?", 1)[0].split("#", 1)[0]
        if path.startswith("/__preview/samples/"):
            return os.path.join(SAMPLES, os.path.basename(path))
        if path.startswith("/__preview/"):
            return os.path.join(HERE, os.path.basename(path))
        rel = os.path.normpath(path.lstrip("/")) or "index.html"
        full = os.path.join(SRC, rel)
        return full if full.startswith(SRC) else os.path.join(SRC, "index.html")

    def do_GET(self):
        if self.path.split("?")[0] in ("/", "/index.html"):
            with open(os.path.join(SRC, "index.html"), encoding="utf8") as f:
                html = f.read()
            html = html.replace('<script src="bootstrap.js', '<script src="/__preview/mock-native.js"></script><script src="bootstrap.js')
            html = html.replace("__VERSION__", json.load(open(os.path.join(ROOT, "package.json")))["version"])
            body = html.encode()
            self.send_response(200)
            self.send_header("Content-Type", "text/html; charset=utf-8")
            self.send_header("Cache-Control", "no-store")
            self.send_header("Content-Length", str(len(body)))
            self.end_headers()
            self.wfile.write(body)
            return
        super().do_GET()

    def end_headers(self):
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, *args):
        pass


if __name__ == "__main__":
    make_samples()
    port = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
    print("Video Visor preview on http://localhost:%d" % port)
    http.server.ThreadingHTTPServer(("127.0.0.1", port), Handler).serve_forever()
