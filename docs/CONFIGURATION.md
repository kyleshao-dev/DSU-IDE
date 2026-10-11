# 自定义配置

执行 `DSU: 编辑 OJ、语言与模板配置` 会创建 `.dsu/config.json`。配置保存后，测试/导入/补全会读取新内容；浏览器页面需刷新以重新加载适配器。不要把配对令牌放入此文件。

更新已有工作区的内置 OJ 时，执行 `DSU: 更新内置 OJ 配置` 并选择站点。原配置先写入 `.dsu/config.backup-<时间戳>.json`；只有选中的 OJ 被替换，其他内容保持原样。软件更新不会偷偷覆盖你编辑过的配置。

## 语言

每个语言条目包含 `id`、`name`、`extension`、`vscode`（编辑器语言 ID）、`starter`、`run`，可选 `compile` 和 `sourceName`。

```json
{
  "id": "cpp",
  "name": "C++20",
  "extension": "cpp",
  "vscode": "cpp",
  "compile": ["g++", "-std=c++20", "-O2", "{source}", "-o", "{exe}"],
  "run": ["{exe}"],
  "starter": "#include <iostream>\nint main() {}\n"
}
```

每项是一个参数，不要自行添加 shell 引号，也不支持 `&&`、管道或 shell 字符串。可替换 `{source}`、`{file}`、`{build}`、`{exe}`。程序在临时目录运行，源文件复制进去，执行完清理，题目代码不被编译器改名。

Java 原文件仍按题目命名，编译时使用 `sourceName: "Main.java"`，入口类为 `Main`。TypeScript 用 `main.ts` → `main.js`；C# 默认是 `mcs` + `mono`；Scala 使用 `scala` CLI。不同 SDK 的命令请自行调整。macOS 的 `g++` 可能是 Apple Clang，不提供 `<bits/stdc++.h>`，请改为已安装的 GNU g++ 路径或改用标准头文件。Windows 若 Python 命令是 `py`，可将 run 改为 `["py", "-3", "{source}"]`。

默认 `timeoutMs: 2000`、`compileTimeoutMs: 30000`。单次运行 stdout+stderr 限制为 1 MiB，超过标记 OLE。`comparison` 可选：

- `tokens`：默认，忽略空白分隔的差别。
- `trim`：统一 CRLF，忽略末尾空白。
- `exact`：统一 CRLF 后严格比较，其余字符均保留。

没有浮点容差、special judge 或交互器。没有操作系统级内存沙箱；只运行你信任的程序。

## OJ

`hosts` 是精确域名；`problemPattern` 匹配 URL pathname，正则捕获组可在提交地址用 `{1}`、`{2}` 引用。输入/输出选择器分别应匹配同样数量的样例节点。

```json
{
  "id": "MyOJ",
  "name": "自己的 OJ",
  "hosts": ["oj.example.com"],
  "problemPattern": "^/problem/(\\d+)$",
  "title": "h1.problem-title",
  "statement": "article.problem-statement",
  "inputs": ".sample-input pre",
  "outputs": ".sample-output pre",
  "submit": {
    "url": "/problem/{1}/submit",
    "codeSelector": "textarea[name=code]",
    "languageSelector": "select[name=language]",
    "submitSelector": "button[type=submit]",
    "languageValues": { "cpp": "cpp20", "python": "python3" }
  }
}
```

`languageValues` 先精确匹配 option value，再精确匹配显示名称，最后尝试唯一的名称子串。不猜多个相似版本中的哪一个；请改成 OJ 当前准确值。

如需在提交页选择题目，添加 `problemSelector` 和 `problemValue`，后者可引用题目正则捕获组。提交 URL 必须是当前 OJ 配置里的 HTTPS 域名。队列按完整 URL（不含 hash，规范化查询参数）匹配，两分钟过期，不自动重复提交。页面跳转改变 URL 时应修正配置。

默认或 `kind: "form"` 支持原生 textarea/input、CodeMirror 和 Ace 的同步。Monaco、React 状态驱动的非表单编辑器和其他站点接口需要新增代码级适配，不能仅靠猜 CSS 选择器完成。

### 洛谷提交器

洛谷适配器用 `kind: "luogu"`，无需填写表单选择器：

```json
"submit": {
  "kind": "luogu",
  "url": "/problem/{1}",
  "enableO2": true,
  "languageValues": { "cpp": "27", "python": "7", "java": "33" }
}
```

此提交器仅允许 `www.luogu.com.cn` 和 `www.luogu.com`。语言值为洛谷当前的数字 ID，提交前会核对官方语言目录及题目 `acceptLanguages`。即使 `enableO2` 为 true，也只对当前目录标记 `canO2` 的语言启用优化。

`url` 必须指向同一道题的 `/problem/{1}`。导入 URL 如果包含 `contestId`，会保留到提交请求，并与洛谷返回的比赛上下文校验。不能从普通练习页凭空猜测比赛 ID。

提交在浏览器里读取新鲜题目页面、检查当前登录用户、读取 CSRF 信息，然后向同源接口发出一次请求。IDE 不接收密码、Cookie 或 CSRF token。成功回执必须含有效 `rid`，IDE 提供「查看 OJ 提交记录」。验证码、未登录、无权限和网络异常会停止自动流程；不会绕过验证码或自动重发。

Luogu 预设覆盖本地 17 种语言中的 15 种。Swift、TypeScript 未提供洛谷映射；不得把 TypeScript 原始源码直接当成 JavaScript 提交。

外部浏览器新增站点时，还需在 Companion 设置中「授权这个网站」；授权范围只对该网站生效。

## 模板

```json
{
  "name": "快速输入",
  "prefix": "fastio",
  "language": "cpp",
  "body": "ios::sync_with_stdio(false);\ncin.tie(nullptr);"
}
```

输入 `fastio`，在补全菜单选择 DSU 模板；也可以 `Ctrl+Space` 主动打开补全。body 按原样插入，不把 `$` 或反斜杠解释为 snippet 占位符，避免存入的代码被修改。选中代码执行 `DSU: 保存选中代码为模板` 可直接保存。

## 样例与工作区

`.dsu/problems/<URL 哈希>.json` 保存题目 URL、代码相对路径、语言、题面文本与 `samples` 数组。点击「编辑样例」可修改：

```json
"samples": [
  { "input": "1 2\n", "output": "3\n" },
  { "input": "100 200\n", "output": "300\n" }
]
```

保存后再测试。不支持多根工作区、远程容器或网页 IDE；当前实现针对本地单文件夹。

## 0.1.2 工作区操作

- `DSU: 开始使用：选择默认语言` 创建配置并设置新题目的默认语言，已有代码不受影响。
- `DSU: 检查语言环境` 检查当前 IDE 的 PATH。macOS 的 Java 启动器即使存在，也可能缺少 JDK；编译是否可用需要实际运行验证。
- `npm run test:languages` 编译/运行本机可发现的语言，测试正数、负数和带空格的文件路径，输出 `dist/validation/toolchains.json`；缺失工具链标为 NOT_INSTALLED，已发现但无法编译标为 FAIL。
- 样例面板点击「编辑样例」后可新增、删除并保存，保留换行及前后空格。保存失败会显示错误；点击取消放弃本次修改。
- `.dsu/config.json` 已关联本地 JSON Schema，编辑时可获得字段提示。自定义 OJ 仍需配置站点选择器，并在外部浏览器 Companion 设置页授权域名。
