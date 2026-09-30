# Static server that labels HTML/JS as UTF-8 (python's http.server sends no charset, so the HUD's
# ▸◂ and · render as mojibake in local screenshots). Usage: python3 serve.py <port> <dir>
import sys, functools, http.server
H = http.server.SimpleHTTPRequestHandler
H.extensions_map.update({'.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.txt': 'text/plain; charset=utf-8'})
http.server.ThreadingHTTPServer(('127.0.0.1', int(sys.argv[1])), functools.partial(H, directory=sys.argv[2])).serve_forever()
