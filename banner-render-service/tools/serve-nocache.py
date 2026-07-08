#!/usr/bin/env python3
"""Static server for public/ that ALWAYS sends no-cache headers.
Fixes the browser holding stale builder.js / index.html.
Usage: python3 tools/serve-nocache.py <port> [directory]
"""
import http.server, socketserver, sys, os

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8137
ROOT = sys.argv[2] if len(sys.argv) > 2 else os.path.join(os.path.dirname(__file__), "..", "public")
ROOT = os.path.abspath(ROOT)

class NoCacheHandler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **k):
        super().__init__(*a, directory=ROOT, **k)
    def end_headers(self):
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        super().end_headers()
    def log_message(self, *a):  # quiet
        pass

socketserver.TCPServer.allow_reuse_address = True
with socketserver.TCPServer(("", PORT), NoCacheHandler) as httpd:
    print(f"serving {ROOT} on http://localhost:{PORT}  (no-cache)")
    httpd.serve_forever()
