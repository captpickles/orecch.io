#!/usr/bin/env python3
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import urlparse


class SpaFallbackHandler(SimpleHTTPRequestHandler):
  def do_GET(self):
    parsed = urlparse(self.path)
    request_path = parsed.path
    if request_path.startswith("/"):
      request_path = request_path[1:]

    local_path = Path(self.directory or ".") / request_path

    if parsed.path in ("/", "") or local_path.exists():
      return super().do_GET()

    self.path = "/index.html"
    return super().do_GET()


def main():
  port = 8000
  server = ThreadingHTTPServer(("127.0.0.1", port), SpaFallbackHandler)
  print(f"Serving with SPA fallback on http://localhost:{port}")
  server.serve_forever()


if __name__ == "__main__":
  main()
