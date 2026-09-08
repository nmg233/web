@echo off
chcp 65001 >nul
setlocal
rem ============================================================
rem  一键在 Linux 容器(Docker)中运行 novaPhy 气动滑翔机仿真（sim_service headless）
rem  用法:
rem    run_glider_docker.bat                                  (默认组合试飞 + MP4 回放)
rem    run_glider_docker.bat --dihedral 8 --cg 0.2 --speed 38 --video
rem  说明: glider 整目录实时挂载进容器, 改代码后无需重建镜像
rem ============================================================
cd /d "%~dp0.."

echo [1/2] 构建镜像 novaphy-glider（仅首次需几分钟；后续秒级）...
docker build -t novaphy-glider -f docker\Dockerfile .
if errorlevel 1 (
  echo 构建失败：请确认 Docker Desktop 已启动。
  exit /b 1
)

echo [2/2] 在 Linux 容器中运行 novaPhy 后端（sim_service）...
if "%*"=="" (
  docker run --rm -v "%CD%\glider:/glider_sim" novaphy-glider python sim_service.py --dihedral 6 --cg 0.1 --speed 36 --video
) else (
  docker run --rm -v "%CD%\glider:/glider_sim" novaphy-glider python sim_service.py %*
)

echo.
echo 完成。结果保存在 glider\output\ 下（PNG/CSV/JSON/MP4）。
endlocal

