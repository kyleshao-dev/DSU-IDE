# 本地验证记录

## 2026-10-11 · 统一代码与文件侧栏

- 移除独立 `dsu.problems` 视图，主页与做题共用原生 Explorer。实际桌面确认文件目录可见、重复题目树不存在；从样例面板聚焦状态双击另一题代码后，代码移回第一编辑器栏，题面与样例同步切换，一键测试为 AC。
- 类型检查、38 项核心测试与 18 项浏览器测试通过；最终 macOS arm64 交付应用导入、浏览器、样例 AC、模板补全、配对、文件搜索和终端检查通过。默认中文、英文覆盖、无工作区主页与主页重启恢复通过。
- 实际工作台报告：`dist/validation/workbench-smoke.json`，截图：`workbench-unified-sidebar.png`。交付应用报告：`packaged-smoke.json`、`locale-smoke.json`。
- 本次重新打包后文件总量 478,820,192 字节，磁盘分配 491,503,616 字节（491.5 MB），500 MB 门禁通过；桌面 ZIP、内置扩展 VSIX 与校验文件已更新，版本保持 0.1.2。

## 2026-10-11 · 解压后应用低于 500 MB

- macOS arm64 使用上游压缩发布构建重新打包：文件总量 **478,821,515 字节**，实际磁盘分配 **491,376,640 字节**（491.4 MB / 468.6 MiB）。`du -sk` 为 479,860 KiB；两项均低于 500,000,000 字节。之前应用磁盘占用约 1.05 GB；ZIP 不作为安装体积指标。
- 构建过滤开发源码映射、AI 会话窗口、Copilot 平台运行库及 AI 沙盒二进制，并排除 Markdown 预览/公式、终端建议、Notebook 渲染和 JS 性能分析表。保留 Chromium、语言基础支持、JSON 配置、Git、调试、终端和本地扩展宿主。
- 首次只计算文件长度时低于 500 MB，但磁盘分配略超；修正漏过滤的扩展后，严格磁盘上限检查通过。新增体积门禁覆盖硬链接去重、框架符号链接及应用外部链接，不统计构建目录或用户缓存。
- 38 项核心检查、类型检查与 DSU 构建通过。实际交付应用验证导入、内置浏览器、样例 AC、模板补全、复制配对信息、文件搜索以及真实 PTY 终端启动通过；报告为 `dist/validation/packaged-smoke.json`。
- 默认中文、显式英文、无文件夹起始页、中文主页重启恢复通过；真实工作台测试按钮得到 AC，样例编辑进入与取消通过。报告：`locale-smoke.json`、`workbench-smoke.json`。
- 修复增量打包读取旧 `.build/extensions/dsu-ide` 导致配对流程回退；同时关闭 AI 宿主及账号提示初始化，保留共享服务。最终启动未启动本地 AI 宿主，未出现本轮关闭宿主导致的 Codex 账号贡献错误。
- 超过 500 MB 的后续构建会报错并保存 `dist/validation/app-size.json`；CI 上传同一报告。Windows/Linux 尚未实际构建验收，不以 macOS 的数字代表其他平台。

## 2026-10-11 · Companion 使用流程

- `npm run check`：36 项核心测试、类型检查和构建通过。新增 Codeforces 题目/提交页识别回归检查。
- `npm run test:e2e`：18 项真实 Chromium 测试通过，包含工具栏实际页面与后台通信、单次粘贴自动填写非默认端口、重复导入保留代码、页面变化拒绝导入、无配对/非题目页禁用按钮、VJudge 跳转回执、页面与工具栏共用导入锁、错误令牌修复，以及错误配对信息不覆盖原设置。
- 桌面验收首次在浏览器点击导入处超时；将配对命令的通知验证放在浏览器操作完成后，并补充超时诊断截图后，macOS arm64 交付应用导入、内置浏览器、样例 AC、模板补全及配对信息复制检查通过。剪贴板内容在验证后恢复；报告不包含令牌。
- 真实工作台主页打开题目、样例测试 AC、成功输出折叠及样例编辑检查通过；报告见 `dist/validation/packaged-smoke.json` 与 `workbench-smoke.json`。
- `dist/release/companion-popup.png` 是实际构建的扩展面板截图，`companion-settings.png` 是无配对信息的设置页截图。工具栏页面测试在后台标签中保持 OJ 为活动标签；未人工点击品牌版 Chrome/Edge 的原生工具栏。
- 本轮依据参考仓库 README 的公开使用流程改进 DSU，未复制其源码、资源或 UI。OJ 请求仍全部使用本地夹具，未进行真实账号提交或商店发布。

## 2026-10-11 · DSU 独立界面

- 核心检查 35 项、浏览器测试 14 项通过；主页及样例编辑器的专项测试通过，后续类型检查通过。
- macOS arm64 交付应用通过中文/英文启动、无工作区起始页和主页重启恢复验证；没有复制参考项目的 UI 代码、图片、样式或文案。
- 真实工作台测试从主页打开本地题目，点击新版面板「一键测试」得到 AC，确认成功实际输出折叠、样例编辑可进入和取消。报告：`dist/validation/workbench-smoke.json`；截图：`workbench-ac.png`、`locale-zh-cn.png`、`home-empty.png`。
- 原有交付应用导入、浏览器、样例 AC 和模板补全验收也通过。使用独立临时配置和本地 OJ 夹具，未向真实账号提交。
- Electron 官方附件网络不稳定时，使用已按固定 SHA256 验证的官方本机缓存完成平台打包，上游校验仍启用；最后同步更新后的 DSU 模块并验证交付应用。

## 2026-10-11 · 竞赛精简版

- `npm run check`：35 项核心测试通过；`npm run test:e2e`：13 项通过，包含断开配对、刷新后令牌清除及重新连接。
- macOS arm64 桌面编译和打包完成，实际交付目录不含被排除的 Copilot、Mermaid、认证扩展。应用约 1.0 GB，之前约 1.6 GB；不将磁盘体积变化称为内存或启动性能提升。
- `npm run test:locale` 在全新中文及英文配置下确认无聊天标签、无 AI 登录按钮；`npm run test:packaged` 确认 AI 默认禁用、做题模块正常，并完成导入、AC 和模板补全。
- 浏览器安装包、图标、安装说明与隐私说明已准备；尚未提交 Chrome/Edge 商店，未声称通过商店审核或品牌版浏览器独立验收。

## 2026-10-11 · 中文界面修复

- `npm run check`：34 项核心测试、类型检查及 DSU 构建通过。
- macOS arm64 重新打包成功；`npm run test:locale` 使用两个全新用户目录验证默认中文与 `--locale=en`，实际窗口分别显示“资源管理器”和“Explorer”。截图和报告位于 `dist/validation/locale-zh-cn.png`、`locale-en.png`、`locale-smoke.json`。
- `npm run test:packaged` 通过，确认实际语言为 `zh-cn`，题目导入、样例 AC 和模板补全仍然正常。
- 简体中文资源固定于 microsoft/vscode-loc 的 `0f157dee0cdcbf58cdf51a221ee94751c7f35e75`，随包提供 MIT 许可；本次引擎 27,026 个核心消息键中匹配到 23,409 个翻译键，其余按上游机制回退英文。

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
