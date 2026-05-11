#!/usr/bin/env python3
"""
perfboard 构建脚本
将 src/ 下的多文件合并为 dist/perfboard-vX.X.html 单文件
用法: python build.py [版本号]
"""

import os
import sys
import re

# 根目录 = 脚本所在目录
ROOT = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(ROOT, 'src')
DIST = os.path.join(ROOT, 'dist')

# JS 文件加载顺序（必须严格遵守依赖关系）
JS_FILES = [
    'constants.js',
    'datamodel.js',
    'hittester.js',
    'command.js',
    'renderer.js',
    'app-core.js',
    'app-events.js',
    'app-solder.js',
    'app-components.js',
    'app-edit.js',
    'app-ui.js',
    'app-files.js',
    'main.js',
]

def read(path):
    with open(path, 'r', encoding='utf-8') as f:
        return f.read()

def build(version='v1.0'):
    # 1. 读取 CSS
    css = read(os.path.join(SRC, 'css', 'style.css'))

    # 2. 按顺序读取并拼接所有 JS
    js_parts = []
    for filename in JS_FILES:
        filepath = os.path.join(SRC, 'js', filename)
        js_content = read(filepath)
        js_parts.append(f'// ====== {filename} ======\n{js_content}')
    js = '\n\n'.join(js_parts)

    # 3. 读取 dev index.html 中 <body> 的 HTML 内容
    dev_html = read(os.path.join(SRC, 'index.html'))

    # 提取 <body> 内容，移除 script 标签
    body_match = re.search(r'<body>\s*(.*?)</body>', dev_html, re.DOTALL)
    if not body_match:
        print("ERROR: Cannot find <body> in src/index.html")
        sys.exit(1)

    body_content = body_match.group(1)
    # 移除所有 <script src="..."></script> 和 <link rel="stylesheet"> 标签
    body_html = re.sub(r'\s*<script\s+src="[^"]*"></script>\s*', '\n', body_content)
    body_html = re.sub(r'\s*<link\s+rel="stylesheet"\s+href="[^"]*">\s*', '', body_html)
    body_html = body_html.strip()

    # 4. 组装最终 HTML
    output = f'''<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>洞洞板布局工具</title>
<style>
{css}
</style>
</head>
<body>
{body_html}
<script>
{js}
</script>
</body>
</html>'''

    # 5. 写入 dist/
    os.makedirs(DIST, exist_ok=True)
    output_path = os.path.join(DIST, f'perfboard-{version}.html')
    with open(output_path, 'w', encoding='utf-8') as f:
        f.write(output)

    # 6. 统计信息
    print(f'Built: {output_path}')
    print(f'  CSS: {len(css):,} bytes')
    print(f'  JS:  {len(js):,} bytes')
    print(f'  HTML: {len(output):,} bytes')

if __name__ == '__main__':
    version = sys.argv[1] if len(sys.argv) > 1 else 'v1.0'
    build(version)
