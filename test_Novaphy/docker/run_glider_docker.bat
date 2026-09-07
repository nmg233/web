@echo off
chcp 65001 >nul
setlocal
rem ============================================================
rem  一键在 Linux 容器(Docker)中运行 novaPhy 气动滑翔机仿真
rem  用法:
rem    run_glider_docker.bat                       (盘旋 60s + GIF)
rem    run_glider_docker.bat --maneuver straight --seconds 40 --no-gif
rem  说明: glider_sim 整目录实时挂载进容器, 改代码后无需重建镜像
rem ============================================================
cd /d "%~dp0.."

echo [1/2] 构建镜像 novaphy-glider（仅首次需几分钟；后续秒级）...
docker build -t novaphy-glider -f docker\Dockerfile .
if errorlevel 1 (
  echo 构建失败：请确认 Docker Desktop 已启动。
  exit /b 1
)

echo [2/2] 在 Linux 容器中运行 novaPhy 后端...
docker run --rm -v "%CD%\glider_sim:/glider_sim" novaphy-glider python run_glider.py %*

echo.
echo 完成。结果保存在 glider_sim\output\ 下（GIF/PNG/CSV/JSON）。
endlocal

