#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
投流预算管理 · 本地预览启动器
双击运行（Mac 用 .command，Windows 用 .bat），或用命令行 python3 start_server.py
自动选择空闲端口并打开浏览器。务必用 http://localhost 访问，不要用 file:// 直接打开。
"""
import http.server
import os
import socket
import sys
import threading
import webbrowser

START_PORT = 8090  # 避开 8080（产品管理 mapping_manager 等常占用 8080）；被占用会自动 +1 避让
DIR = os.path.dirname(os.path.abspath(__file__))


class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=DIR, **kwargs)

    def end_headers(self):
        # 本地预览禁用缓存，避免改了代码看不到效果
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    def log_message(self, fmt, *args):
        sys.stderr.write("[%s] %s\n" % (self.log_date_time_string(), fmt % args))


class Server(http.server.ThreadingHTTPServer):
    allow_reuse_address = True


def find_free_port(start):
    for port in range(start, start + 50):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    return None


def main():
    port = find_free_port(START_PORT)
    if port is None:
        print("错误：8080 起的 50 个端口都被占用，请关闭部分程序后重试。")
        input("按回车退出...")
        sys.exit(1)

    os.chdir(DIR)
    server = Server(("127.0.0.1", port), Handler)
    url = "http://localhost:%d/" % port

    print("=" * 56)
    print("  抖音本地推 · 投流预算管理  —— 本地预览已启动")
    print()
    print("  访问地址：%s" % url)
    print("  （默认端口 8090；若被占用会自动顺延 +1，以上方地址为准）")
    print()
    print("  注意事项：")
    print("  · 请用上方 http://localhost 地址访问，不要双击 index.html")
    print("    （file:// 打开会被浏览器拦截，无法读写云端数据）")
    print("  · 数据实时保存在腾讯云 CloudBase，关闭本窗口不影响数据")
    print("  · 按 Ctrl+C 停止服务")
    print("=" * 56)

    threading.Timer(1.0, lambda: webbrowser.open(url)).start()
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\n已停止服务。")
        server.server_close()


if __name__ == "__main__":
    main()
