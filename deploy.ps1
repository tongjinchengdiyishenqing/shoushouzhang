# 一键更新线上版本（GitHub Pages）
# 用法：双击运行，或在 PowerShell 里执行 .\deploy.ps1
# 线上地址：https://tongjinchengdiyishenqing.github.io/shoushouzhang/

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$changed = git status --porcelain
if (-not $changed) {
  Write-Host "没有改动，无需部署。" -ForegroundColor Yellow
  exit 0
}

$stamp = Get-Date -Format "yyyy-MM-dd HH:mm"
git add -A
git -c user.name="trae" -c user.email="trae@local" commit -m "update $stamp"
git push origin main

Write-Host ""
Write-Host "已推送，GitHub Pages 大约 30-60 秒后生效：" -ForegroundColor Green
Write-Host "  https://tongjinchengdiyishenqing.github.io/shoushouzhang/" -ForegroundColor Cyan
