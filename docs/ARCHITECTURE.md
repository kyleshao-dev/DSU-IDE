# 架构与验证

```text
Code OSS 定制产品
  ├── 内部扩展运行机制（保留）
  ├── Extension Gallery（关闭）
  ├── Chromium 浏览器编辑器
  │    └── browser proposed API → CDP 隔离世界 → 共享 page.js
  └── DSU 内置扩展
       ├── 题目文件与元数据
       ├── 编译/测试子进程
       ├── 原站题面 + 样例 Webview
       ├── 模板 Completion Provider
       └── loopback HTTP + 配对令牌 ← Chrome / Edge service worker
```

源代码位置：

| 路径 | 用途 |
| --- | --- |
| `src/core` | 配置、文件归档、运行器、桥接和提交队列 |
| `src/page` | OJ DOM 解析、按钮、MV3 worker、网页表单填充 |
| `src/extension` | VS Code 命令、CDP 浏览器集成、样例面板 |
| `config` | 默认语言/OJ/模板、扩展 manifest、固定上游版本 |
| `browser` | MV3 manifest、配对与站点授权设置页 |
| `scripts` | 构建和 Code OSS 定制 |
| `tests` | 文件保护、真实进程、HTTP、解析与表单夹具测试 |

浏览器页面不能调用本地任意命令。外部桥接只监听 loopback，要求 bearer token，并拒绝普通网页 Origin。可远程调用的操作限于读取 OJ 配置、导入当前题目、领取特定 URL 的提交任务以及回执；测试和提交入队由 IDE 用户操作发起。

洛谷使用浏览器同源异步请求提交，普通 OJ 保留表单填充。两者共享有类型的回执：表单动作只算 dispatched，洛谷有效记录编号才算 accepted。IDE 验证记录 URL 后显示链接，不把受理状态当成判题结果。接口核对与错误流程见 [OJ_SUPPORT.md](OJ_SUPPORT.md)。

运行器使用参数数组启动进程，不用 shell 拼接。它限制时间与输出量，并尝试清理进程树，但不是安全沙箱，不限制程序访问用户文件或网络。Code OSS workspace trust 是运行前提。

## 自动化验证

```bash
npm run check
```

包括 TypeScript 类型检查、测试和实际打包。测试覆盖：重复导入不覆盖文件、路径越界、编译失败、运行错误、样例比较、超时、输出上限、桥接鉴权、不同题目的提交隔离、表单语言歧义、Codeforces 多行样例、AtCoder 双语样例、洛谷 JSON 与 VJudge 映射。

GitHub Actions 已配置 Linux、Windows、macOS 矩阵；上传后才能看到这三个平台的实际 CI 结果。本地测试不代表矩阵已通过。

## 桌面手动验收

1. 按 BUILD.md 启动定制 Code OSS，确认品牌、商店不可用、内部 DSU 模块已加载。
2. 新建做题工作区，打开 Codeforces 题目，确认浏览器按钮；导入后出现代码、题面、样例三栏。
3. 写 A+B 的正确和错误实现，确认 AC/WA；测试无限循环、编译错误和停止按钮。
4. 重复导入与关闭重开文件，确认已有代码和题目关联。
5. 保存模板，输入关键字检查补全。
6. 在 Chrome 与 Edge 加载 Companion，完成配对并导入相同题目。
7. 使用测试账号/适当的练习题验证登录后的 Codeforces、AtCoder 与洛谷提交流程，确认只提交一次、题号正确、语言正确。洛谷检查记录编号和链接；验证码或登录失效时确认不会自动重试。
8. 在 VJudge 进入已知原站题目，确认跳转后按原站归档。
9. 添加自己的 OJ 选择器及语言配置，刷新浏览器验证。

0.1.2 已完成本机 macOS arm64 的全量桌面编译、打包、真实宿主和交付应用冒烟测试，提供桌面 ZIP；不声称完成真实账号网页提交、所有语言 SDK 或三个系统的人工验收。原站页面结构变动需要维护适配器。首期未包括 installer、自动更新、OJ 全量判题结果抓取、交互题、SPJ、语言服务器全家桶。

参考：[VS Code Webview API](https://code.visualstudio.com/api/extension-guides/webview)、[集成浏览器](https://code.visualstudio.com/docs/debugtest/integrated-browser)、[Chrome content scripts](https://developer.chrome.com/docs/extensions/develop/concepts/content-scripts)、固定上游 `src/vscode-dts/vscode.proposed.browser.d.ts`。
