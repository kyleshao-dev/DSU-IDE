# 本地验证记录

## 2026-10-08 · 0.1.2 桌面验收

- Node 24.18.0：完整 Code OSS 依赖安装和 `npm run desktop:build` 通过。修复商店补丁的未使用导入，以及产品配置删除必需字段导致的启动和扩展扫描错误。
- `npm run test:desktop` 在真实 DSU Electron 宿主中通过：启动内部扩展、内置浏览器真实 CDP 点击导入、生成题目代码、运行样例 AC、模板补全。测试使用临时工作区与内存 SecretStorage，不使用真实 OJ 登录。
- `npm run check`：33 项核心测试、类型检查与模块构建通过。`npm run test:e2e`：12 项真实 Chromium 测试通过，包含样例编辑面板。
- 本机真实语言测试：C、C++、Python、JavaScript、TypeScript、Go、Swift、Ruby 均通过正数及负数样例；Java 只有系统启动器，没有 JDK，编译返回 CE。Rust、C#、Kotlin、PHP、Pascal、Lua、Haskell、Scala 未安装，未声称通过。
- `npm run desktop:package` 成功生成 macOS arm64 应用；`npm run test:packaged` 从该应用内加载 DSU 模块，独立完成浏览器导入、样例 AC 和模板补全。修复上游打包遗漏内置 Copilot SDK 的问题。
- 生成 `dist/release/` 中的桌面 ZIP、VSIX、Companion ZIP 和 SHA256SUMS。桌面 ZIP 为未经签名和公证的开发版；VSIX 不是桌面引擎。
- 本次上游源码实际位于 `/Users/olive/.cache/dsu-ide/code-oss-067c1c2`，`vendor/code-oss` 为符号链接，以规避原生模块对空格路径的限制。
- 实际报告：`dist/validation/desktop-smoke.json`、`dist/validation/packaged-smoke.json`、`dist/validation/toolchains.json`；浏览器报告在 `playwright-report/`。
- 未验证：真实 OJ 账号提交、品牌版 Chrome/Edge 独立测试、Windows/Linux 桌面人工验收和签名公证。远端 CI 尚未执行。

## 2026-10-06 · 真实 Chromium 通信验证

- `npm run test:e2e`：11 项全部通过，使用 Playwright 1.58.2 和独立临时 Chromium 配置。
- 实际加载构建后的 MV3 扩展，经设置页配对、真实本机 HTTP 桥接和扩展后台完成导入与提交；修复设置页带有 `sender.tab` 时被误判为 OJ 页面的问题。
- 对内置浏览器采用 VS Code API 测试替身，页面注入、隔离世界、运行脚本和返回回执经过真实 Chromium CDP。此结果不代表 Code OSS/Electron 宿主已验收。
- 两条链路分别覆盖洛谷导入与样例保真、重复导入保留代码、单次异步提交与刷新不重放、验证码后不重试、Codeforces 表单提交、VJudge 原站跳转。另覆盖错误配对令牌及修复后无需刷新恢复。
- OJ 页面和接口均由本地夹具响应，未向真实 OJ 账号提交。未分别启动品牌版 Chrome / Edge。
- GitHub Actions 已加入独立浏览器任务和报告产物；远端 CI 尚未执行。

## 2026-10-06 · OJ 适配更新

- 类型检查、27 项测试和扩展构建通过。
- 只读获取洛谷当前 P1001 HTML，实际解析出题号、名称、5 个题面分节和原样样例。
- 核对洛谷公开 `_lfe/config`，15 个语言 ID 均存在且启用。
- 模拟接口验证了登录/CSRF/语言/比赛检查、单次提交、有效记录回执、验证码、失效登录、限流、服务器异常和断网；没有真实账号 POST。
- 当时仍未完成完整桌面构建、浏览器扩展实际加载和真实 OJ 账号提交验收；后续 Chromium 加载验证见上节。

## 2026-10-02 · 初始版本

日期：2026-10-02。环境：macOS arm64，Node.js 25.5.0。

已完成：

- `npm run check`：TypeScript 检查通过；14 项自动化测试通过；DSU 内置扩展和 MV3 浏览器扩展构建成功。
- C++、Python、Go：分别真实编译/运行 A+B 的正数与负数输入，两组结果均为 AC；代码路径包含空格。
- `npm run fork:prepare`：已浅拉取固定 Code OSS 提交，品牌配置、gallery 关闭补丁及内置 DSU 扩展已写入。
- `npm run fork:sync`：重复同步成功，补丁保持幂等。

未完成的验证：

- Code OSS 全量依赖安装、桌面编译和启动。其构建要求 Node 24.18.0，不能用上述 DSU 模块测试结果替代。
- Chrome / Edge 实际加载扩展，以及 Code OSS 原生 CDP 浏览器端到端交互。
- 登录真实 OJ 后提交代码；测试只验证了本地表单夹具。
- 其他 14 种语言的实际 SDK 与跨平台运行。
- GitHub Actions 三平台矩阵和发布安装包。

这些项目需要按 `ARCHITECTURE.md` 的桌面验收步骤验证，不能把当前源码开发版本称为已经验收完毕的成品。
