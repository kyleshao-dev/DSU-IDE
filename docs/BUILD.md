# 构建 DSU IDE 0.1.2

## 1. 编译 DSU 模块与浏览器扩展

在项目根目录使用 Node.js 22 或更新版本：

```bash
npm ci
npm run check
```

仅修改 DSU 代码后可以运行 `npm run build`。构建产物不提交到 Git。

运行浏览器端到端测试：

```bash
npx playwright install chromium
npm run test:e2e
```

Linux CI 使用 `npx playwright install --with-deps chromium` 安装系统依赖。测试使用独立临时 Chromium 配置，加载真实 MV3 扩展，并通过真实 CDP 验证内置浏览器通信代码。题面和 OJ 提交接口由测试拦截，不需要登录账号。报告位于 `playwright-report/index.html`。这不能替代完整 Code OSS 桌面启动验收。

可交付扩展附件：

```bash
npm run release:artifacts
```

输出 `dist/release/dsu-ide-0.1.2.vsix`、`dsu-companion-0.1.2.zip` 和 `SHA256SUMS`。ZIP 解压后通过浏览器「加载已解压的扩展」安装。VSIX 是 DSU 模块，仍需要允许 browser 提案 API 的宿主。

## 2. 准备 Code OSS 源码

```bash
npm run fork:prepare
```

脚本浅拉取 `config/upstream.json` 固定的微软开源提交到 `vendor/code-oss`，应用产品信息、商店服务补丁，并复制内置 `extensions/dsu-ide`。重复运行不会重置其他源代码修改。此目录忽略上传；上游 MIT license 保留。

固定提交：`067c1c2b93989930185121fefb58830c54d2a4dd`。固定版本的 `.nvmrc` 为 Node **24.18.0**。该版本有 `window.openBrowserTab`、`BrowserTab.startCDPSession` 提案，产品配置允许 `dsu.dsu-ide` 使用它。

**构建目录不能包含空格。** 上游原生模块的 node-gyp 会错误拆分带空格的路径。推荐把整个项目放到 `~/DSU-IDE` 等无空格位置。本次工作区保留原名称，并将 `vendor/code-oss` 链接到 `/Users/olive/.cache/dsu-ide/code-oss-067c1c2`；它只属于本机，不会上传。已有用户可在没有构建进程时把 `vendor/code-oss` 移到自己的无空格目录，再创建目录符号链接（Windows 使用目录 junction）。

切换到固定 Node 24.18.0 后，可在项目根目录运行：

```bash
npm run desktop:install
npm run desktop:build
npm run desktop:start
# 临时工作区内的真实宿主验收：
npm run test:desktop
# 生成当前系统/架构的未签名桌面目录：
npm run desktop:package
# 验证交付应用中的内置模块（不依赖开发版模块）：
npm run test:packaged
```

脚本检查 Node 版本和真实构建路径；桌面产物在真实上游目录的同级 `VSCode-<系统>-<架构>` 下。默认还提供 GitHub Actions 手动触发的 Build DSU desktop，三平台分别构建，运行结果需在上传后确认。

上游体积与构建依赖较大。先按 [VS Code 源码构建文档](https://github.com/microsoft/vscode/wiki/How-to-Contribute) 安装系统依赖（Windows C++ build tools、macOS Xcode 命令行工具、Linux 编译与桌面库等），再执行：

```bash
cd vendor/code-oss
# 已安装 nvm 的 macOS/Linux：
nvm install
nvm use
npm ci
npm run compile-client
```

macOS / Linux：

```bash
./scripts/code.sh
```

Windows PowerShell（先用自己的 Node 版本管理器安装上游要求的 Node）：

```powershell
.\scripts\code.bat
```

这是本地源码运行流程。首次运行可能下载 Electron。若上游提示缺少子模块，按该固定版本的构建说明执行 `git submodule update --init --recursive` 后重试依赖安装。

## 3. 同步 DSU 修改

在本项目根目录：

```bash
npm run build
npm run fork:sync
```

然后重新加载 DSU 窗口。涉及上游 TypeScript 修改时重新执行上游 `npm run compile-client`。

## 4. 安装程序与发布

默认 CI 检查 DSU 模块、浏览器流程并保存扩展附件；手动桌面工作流调用上游平台打包任务。**两者都不生成已签名安装包**。制作各平台安装程序需要使用固定上游的 gulp 平台构建任务，并自行配置应用图标、签名、公证和更新服务。可在上游运行 `npm run gulp -- --tasks-simple` 查看该版本支持的任务。

初期保留 Code OSS 的开源资源图标；产品名称、数据目录、协议、平台应用标识已隔离。正式对外发布前应制作 DSU 专用图标并完整走一遍三个平台的桌面验收流程。

普通 VS Code 的稳定扩展市场不允许依赖 proposed API 的扩展；本项目主要交付内置扩展。`npm run package:extension` 仅作为本地 VSIX 开发选项，打包 CLI 已固定在 package-lock.json 中，不代表已验证市场发布。

## 本机下载问题处理记录

本次网络环境中，代理会重置部分 GitHub/Electron 请求；对本次构建进程临时移除代理后，依赖安装成功。Electron 和三个内置调试组件通过官方发布附件获取，并按上游固定 SHA256 校验后写入上游缓存。没有更换依赖版本或关闭校验。正常网络无需这一步，脚本默认使用上游下载流程。

真实宿主冒烟测试会打开临时 DSU 窗口，测试结束后自动关闭；使用临时工作区、独立用户目录与内存 SecretStorage，报告保存到 `dist/validation/desktop-smoke.json`。


## 已验证的 macOS arm64 交付包

本机已完成源码构建和交付应用测试。`dist/release/DSU-IDE-0.1.2-macos-arm64.zip` 解压后为 `DSU IDE 0.1.2.app`，可移入「应用程序」目录。需要 Apple Silicon Mac；运行各语言仍需自行安装对应编译器或解释器。当前是未经签名和公证的开发版，macOS 可能要求在「系统设置 → 隐私与安全性」中允许打开。

复现压缩包时，将下面的 `APP_PATH` 替换为 `desktop:package` 输出的应用路径：

```bash
APP_PATH='/your/build/VSCode-darwin-arm64/DSU IDE 0.1.2.app'
mkdir -p dist/release
ditto -c -k --sequesterRsrc --keepParent "$APP_PATH" dist/release/DSU-IDE-0.1.2-macos-arm64.zip
npm run release:artifacts
cd dist/release
shasum -a 256 -c SHA256SUMS
```

扩展附件生成脚本也会为同目录当前版本的桌面 ZIP 更新校验值。交付应用测试报告位于 `dist/validation/packaged-smoke.json`；Windows/Linux 尚待实际执行对应平台工作流验收。


## 中文界面

`fork:prepare` / `fork:sync` 会复制仓库自带的简体中文资源，并将未设置语言时的启动默认值设为 `zh-cn`。首次启动直接读取随包资源，不依赖扩展商店。用户已有的显示语言设置和 `--locale` 优先；若曾明确选过英文，可执行 `Configure Display Language`，选择 `中文(简体)` 后重启。开发源码模式受上游 `VSCODE_DEV` 限制仍可能显示英文，最终语言验收使用 `npm run test:packaged`。官方尚未翻译的字符串保留英文。

可运行 `npm run test:locale` 对已打包应用验证默认中文和显式英文，测试使用独立临时用户目录，截图保存到 `dist/validation/`。Linux 无桌面环境时使用 `xvfb-run -a npm run test:locale`。


## 竞赛精简构建

默认禁用内置 AI，精简工作台入口；桌面打包跳过 Copilot 编译并排除无关扩展，具体清单见 `scripts/fork-patches.mjs` 的 `omittedExtensions`。Git、调试、终端、内置浏览器和语言基础功能保留。部分工作台服务被多个功能共享，因此仍随 Code OSS 引擎提供；不承诺删除所有底层 AI/远程源码或降低指定内存比例。用户已有显式设置优先于新的默认布局；若旧工作区仍显示聊天，可在设置中启用 `chat.disableAIFeatures`。

Chrome/Edge 的安装及发布见随附件提供的 `BROWSER_EXTENSION.md`，隐私说明为 `BROWSER_PRIVACY.md`。


## DSU 独立界面

起始页自动出现在空编辑器窗口，提供题目链接、已导入题目与设置菜单；可从编辑器标题栏主页按钮或 `DSU: 打开主页` 返回。文件列表在主页设置菜单中打开，辅助样例操作在「更多」菜单。设计取舍见 `UI_DESIGN.md`。

`npm run test:locale` 验证中文、英文、无工作区启动及主页重启恢复。`npm run test:workbench` 在临时工作区和本地 OJ 夹具中检查主页打开题目、真实样例按钮及样例编辑入口，截图保存为 `dist/validation/workbench-ac.png`。所有测试使用独立用户目录。
