# 学生端前端

当前运行、配置和接口边界维护在[根 README](../README.md)，最新逐项实现与验收边界见[本轮整改进度与验收](../本轮整改进度与验收_2026-10-11.md)。设计变量及素材来源见 [DESIGN.md](../DESIGN.md)。本地生成的交接、图集和轮次证据不保证随仓库分发，也不能代替当前版本验收。

技术栈保持 React 19、Vite 8、Ant Design 6、React Router 7 和 Axios，以 package-lock.json 锁定版本。没有学生注册、自助选课或退课页面。

本目录脚本：`npm run dev`、`npm run build`、`npm run preview`、`npm run lint`、`npm test`。前端单测在 test/；跨前后端浏览器回归在根 tests/，从根目录运行 `npm run test:acceptance`。本轮前端 121 项单测、lint 和构建通过，仍有大分块提示；根目录完整浏览器套件未全部复跑，具体已实测闭环与未验收项见本轮记录。不要沿用早期“没有测试”或“lint 未处理”的说明，也不要把历史轮次直接算作本轮通过。
