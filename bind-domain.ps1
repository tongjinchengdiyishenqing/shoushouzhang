# 把自定义域名绑到随手账（GitHub Pages）
# 用法：域名买好、DNS 生效后运行
#   .\bind-domain.ps1 yutiqu.cn
# 它会：写 CNAME 文件 → 推送到 GitHub → 在 Pages 里登记域名 → 检查解析 → 开启 HTTPS

param(
  [Parameter(Mandatory = $true)]
  [string]$Domain
)

$ErrorActionPreference = "Stop"
Set-Location -Path $PSScriptRoot

$repo = "tongjinchengdiyishenqing/shoushouzhang"

Write-Host "== 1/4 检查 DNS 解析 ==" -ForegroundColor Cyan
$a = @()
try { $a = (Resolve-DnsName -Name $Domain -Type A -ErrorAction Stop | Where-Object { $_.IPAddress }).IPAddress } catch {}
$cname = $null
try { $cname = (Resolve-DnsName -Name "www.$Domain" -Type CNAME -ErrorAction Stop | Where-Object { $_.NameHost }).NameHost } catch {}

if (-not $a -and -not $cname) {
  Write-Host "  域名还没有任何解析记录。" -ForegroundColor Yellow
  Write-Host "  请先到域名服务商加下面两类记录，等 10 分钟后再运行本脚本：" -ForegroundColor Yellow
  Write-Host ""
  Write-Host "   类型   主机记录   记录值"
  Write-Host "   A      @          185.199.108.153"
  Write-Host "   A      @          185.199.109.153"
  Write-Host "   A      @          185.199.110.153"
  Write-Host "   A      @          185.199.111.153"
  Write-Host "   CNAME  www        tongjinchengdiyishenqing.github.io"
  Write-Host ""
  exit 1
}
Write-Host ("  A: " + ($a -join ", ")) -ForegroundColor Green
if ($cname) { Write-Host ("  www CNAME: " + $cname) -ForegroundColor Green }

Write-Host "== 2/4 写入 CNAME 文件并推送 ==" -ForegroundColor Cyan
Set-Content -Path "CNAME" -Value $Domain -NoNewline -Encoding ASCII
git add -A
git -c user.name="trae" -c user.email="trae@local" commit -m "chore: 绑定域名 $Domain" | Out-Null
git push origin main

Write-Host "== 3/4 在 GitHub Pages 登记域名 ==" -ForegroundColor Cyan
gh api -X PUT "repos/$repo/pages" -f "cname=$Domain" --jq '.cname' 

Write-Host "== 4/4 检查 HTTPS 证书 ==" -ForegroundColor Cyan
$url = "https://$Domain/"
$ok = $false
for ($i = 1; $i -le 20; $i++) {
  Start-Sleep -Seconds 15
  try {
    $r = Invoke-WebRequest -Uri $url -UseBasicParsing -TimeoutSec 15
    if ($r.StatusCode -eq 200) { $ok = $true; break }
  } catch {}
  Write-Host ("  等待证书签发... " + $i + "/20")
}
if ($ok) {
  Write-Host ""
  Write-Host "  上线成功：$url" -ForegroundColor Green
} else {
  Write-Host ""
  Write-Host "  DNS 已配好，但 HTTPS 证书还在签发（最长 24 小时）。" -ForegroundColor Yellow
  Write-Host "  可以去仓库 Settings → Pages 勾上 Enforce HTTPS 加速。" -ForegroundColor Yellow
}
