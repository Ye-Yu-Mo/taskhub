import argparse
import time
import json
import os
import random
import math


def main():
    parser = argparse.ArgumentParser(description="Showcase Task Implementation")
    parser.add_argument("--title", type=str, default="My Analysis")
    parser.add_argument("--data-points", type=int, default=100)
    parser.add_argument("--noise-level", type=float, default=0.5)
    # 对于 boolean，使用 store_true/false 或者 type=lambda x: x.lower() == 'true'
    parser.add_argument("--include-charts", type=str, default="True")
    parser.add_argument("--theme", type=str, default="light")
    parser.add_argument("--tags", type=str, default="")

    args = parser.parse_args()

    include_charts = args.include_charts.lower() == "true"

    print(f"开始生成全能演示报告: {args.title}")
    print(
        f"参数: points={args.data_points}, noise={args.noise_level}, theme={args.theme}"
    )

    # 1. 模拟处理进度
    total_steps = 5
    for i in range(1, total_steps + 1):
        time.sleep(0.5)
        pct = int(i / total_steps * 100)
        print(
            f"TASKHUB_EVENT {json.dumps({'type': 'progress', 'data': {'pct': pct, 'msg': f'Step {i}/{total_steps}'} })}"
        )

    # 2. 准备目录
    # 注意：Worker 会设置 CWD 为 data/runs/r-xxx/，所以这里直接写相对路径即可
    os.makedirs("files", exist_ok=True)

    # 3. 生成 CSV 数据
    csv_path = "files/data.csv"
    data = []
    with open(csv_path, "w") as f:
        f.write("timestamp,value,sine_wave,noise\n")
        for i in range(args.data_points):
            ts = i
            val = i * 1.5
            sine = math.sin(i * 0.1) * 10
            noise = random.uniform(-args.noise_level, args.noise_level) * 5
            row_val = val + sine + noise
            data.append(row_val)
            f.write(f"{ts},{row_val:.2f},{sine:.2f},{noise:.2f}\n")

    # 4. 生成 SVG 图片
    svg_path = "files/chart.svg"
    svg_content = ""
    if include_charts:
        points_str = ""
        max_val = max(data) if data else 1
        width = 800
        height = 400
        for i, val in enumerate(data):
            x = (i / args.data_points) * width
            y = height - (val / max_val * height * 0.8) - (height * 0.1)
            points_str += f"{x},{y} "

        svg_content = f"""<svg width="{width}" height="{height}" xmlns="http://www.w3.org/2000/svg" style="background: #f8f9fa; border: 1px solid #ddd;">
          <path d="M0 {height} L0 0 L{width} 0 L{width} {height} Z" fill="none" />
          <polyline points="{points_str}" fill="none" stroke="#2563eb" stroke-width="2" />
          <text x="20" y="30" font-family="sans-serif" font-size="20" fill="#333">{args.title} - Trend</text>
        </svg>"""
        with open(svg_path, "w") as f:
            f.write(svg_content)

    # 5. 生成 HTML 报告
    html_path = "files/report.html"
    bg_color = "#1f2937" if args.theme == "dark" else "#ffffff"
    text_color = "#f3f4f6" if args.theme == "dark" else "#111827"

    # 这里的 f-string 是正常的 Python 代码，不需要双写花括号（除非是 CSS）
    html_content = f"""<!DOCTYPE html>
<html>
<head>
<style>
  body {{ font-family: system-ui, sans-serif; padding: 2rem; max-width: 800px; margin: 0 auto; background: {bg_color}; color: {text_color}; }}
  h1 {{ border-bottom: 2px solid #3b82f6; padding-bottom: 0.5rem; }}
  .card {{ border: 1px solid #e5e7eb; padding: 1.5rem; border-radius: 0.5rem; margin-bottom: 1rem; }}
  .stat {{ font-size: 2rem; font-weight: bold; color: #3b82f6; }}
</style>
</head>
<body>
  <h1>📊 {args.title}</h1>
  <p>Generated at: {time.ctime()}</p>
  
  <div class="card">
    <h3>Summary Statistics</h3>
    <div style="display: grid; grid-template-columns: 1fr 1fr 1fr;">
        <div>
            <div class="stat">{args.data_points}</div>
            <div>Data Points</div>
        </div>
        <div>
            <div class="stat">{sum(data)/len(data):.2f}</div>
            <div>Average Value</div>
        </div>
        <div>
            <div class="stat">{max(data):.2f}</div>
            <div>Max Value</div>
        </div>
    </div>
  </div>

  <div class="card">
    <h3>Configuration</h3>
    <ul>
        <li>Noise Level: {args.noise_level}</li>
        <li>Theme: {args.theme}</li>
        <li>Tags: {args.tags}</li>
    </ul>
  </div>
</body>
</html>"""

    with open(html_path, "w") as f:
        f.write(html_content)

    # 6. 生成索引
    artifacts = {
        "run_id": os.environ.get("TASKHUB_RUN_ID", "unknown"),
        "items": [
            {
                "artifact_id": "rep_html",
                "kind": "report",
                "title": "完整分析报告",
                "file_id": "f_rep_html",
                "path": html_path,
                "mime": "text/html",
                "size_bytes": len(html_content),
            },
            {
                "artifact_id": "dat_csv",
                "kind": "data",
                "title": "原始数据",
                "file_id": "f_dat_csv",
                "path": csv_path,
                "mime": "text/csv",
                "size_bytes": len(str(data)),
            },
        ],
    }

    if include_charts:
        artifacts["items"].insert(
            1,
            {
                "artifact_id": "cht_svg",
                "kind": "image",
                "title": "趋势图表",
                "file_id": "f_cht_svg",
                "path": svg_path,
                "mime": "image/svg+xml",
                "size_bytes": len(svg_content),
            },
        )

    with open("artifacts.json", "w") as f:
        json.dump(artifacts, f)

    print(
        f"TASKHUB_EVENT {json.dumps({'type': 'log', 'data': {'msg': 'Report generated successfully'} })}"
    )


if __name__ == "__main__":
    main()
