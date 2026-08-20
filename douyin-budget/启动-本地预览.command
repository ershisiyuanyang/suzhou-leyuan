#!/bin/bash
# macOS 一键启动本地预览（双击运行；桌面快捷方式双击同样可用）
# 自动解析真实路径，兼容符号链接/快捷方式场景
SCRIPT_PATH=$(readlink "$0" || echo "$0")
cd "$(dirname "$SCRIPT_PATH")"
python3 start_server.py
