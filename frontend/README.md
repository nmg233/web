# 学生端前端

当前运行、配置、接口边界和验收统一维护在 [根 README](../README.md) 与 [当前交接说明](../docs/HANDOFF.md)。设计变量及素材来源见 [DESIGN.md](../DESIGN.md)，最终图集见 [总验收入口](../docs/acceptance/index.html)。

技术栈保持 React 19、Vite 8、Ant Design 6、React Router 7 和 Axios，以 package-lock.json 锁定版本。没有学生注册、自助选课或退课页面。

本目录脚本：`npm run dev`、`npm run build`、`npm run preview`、`npm run lint`、`npm test`。前端单测在 test/；跨前后端浏览器回归在根 tests/，从根目录运行 `npm run test:acceptance`。当前实际结果和已知构建体积提示见 [第十二轮](../docs/round-12.md)，不要沿用早期“没有测试”或“lint 未处理”的说明。
