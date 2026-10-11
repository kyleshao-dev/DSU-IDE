# OJ 适配核对 · 2026-10-06

版本仍为 0.1.1。本次重点是洛谷，另修复 Codeforces Gym、AtCoder 样例和 VJudge 的 AtCoder 来源映射。HDU / POJ 仍只有导入预设，没有新增未经核对的自动提交配置。

## 洛谷

已只读核对以下第一方资料：

- [P1001 公开题目页](https://www.luogu.com.cn/problem/P1001)：`lentille-context.data.problem` 使用 `pid`、`name`、`content`、`samples`、`acceptLanguages`；`content` 还有 `formatI`、`formatO` 等分节字段。
- [洛谷当前前端配置](https://www.luogu.com.cn/_lfe/config)：`CodeLanguage` 提供语言 ID、`disabled`、`canO2`；路由包含 `api.problem.submit` 和 `record.show`。
- [该页面当前题目组件](https://fecdn.luogu.com.cn/columba/columba~2900b6145d38e342.js)：发布于 `20260919-2271` 的前端，代码提交请求使用 `/fe/api/problem/submit/{pid}`、JSON `lang` / `code` / `enableO2`，比赛通过 query `contestId` 传递，成功后读取 `rid`。
- [对应前端加载器](https://fecdn.luogu.com.cn/columba/loader.20260919-2271.js)：CSRF 来自页面 `meta[name=csrf-token]`，请求头为 `X-CSRF-TOKEN`。
- [官方题目帮助](https://help.luogu.com.cn/manual/luogu/problem/)：提交依赖登录状态与比赛报名权限。

实现重新读取当前题目的 HTML，不直接相信 SPA 初次加载时留下的旧 hydration 数据。新旧题面数据只按 JSON 解码，不运行站点内联脚本；样例字符串保留原始空行与末尾换行。

提交复用浏览器会话。先确认题号、用户、比赛、语言，再发送一次 POST；CSRF 和 Cookie 不进入本机 HTTP 桥接。若站点要求验证码，用户需转到原站完成正常提交流程；DSU 不提供验证码求解或批量重试。

### 回执含义

| 状态 | 含义 |
| --- | --- |
| `accepted` | 洛谷返回了有效记录编号，可以打开原站记录；不等于 AC |
| `dispatched` | 普通表单的提交动作已请求，尚不能确认受理 |
| `action-required` | 未登录、验证或权限问题，需要用户在网页处理 |
| `failed` | 提交前校验失败，或服务明确拒绝 |
| `unknown` | 请求后断网、服务异常、返回格式不符；先查提交记录再决定是否重试 |

有未完成回执时，IDE 会阻止同一提交页重复入队。不会因为超时、验证码或格式错误再次发出 POST。回执记录链接必须严格属于此任务的 OJ 域名和 `/record/<正整数>` 路径。

内置浏览器的 CDP 与 Chrome / Edge `executeScript` 共用同一个可序列化异步提交函数。CDP 明确等待 Promise；请求总超时为 15 秒，外围 CDP 等待为 25 秒。

这些是当前网站前端接口，网站更新可能改变它们，并非稳定的公开 SDK 合约。

## 其他修复

- Codeforces Gym 的题目 URL 可识别，并使用 `/gym/<id>/submit`，不再误走普通 contest 路径。
- AtCoder 没有英文样例时使用日文段落；题面只保留选中的语言，不重复导入双语样例。
- VJudge 的 AtCoder 任务 ID 按最后一个下划线分离 task index，可处理 `math_and_algorithm_a` 等题号；来源链接仍优先。

## 验证边界

本地测试覆盖新版与旧版洛谷结构、SPA 旧数据、原始样例空白、比赛 ID、语言目录、登录/CSRF/验证码错误、请求后断网、记录 URL 校验、配置升级，以及两类浏览器共享的异步函数序列化。另用真实 P1001 公开 HTML 导入成功，并核对了全部 15 个洛谷语言预设在当日官方目录中均启用。

没有使用用户账号进行真实提交，也没有宣称已经得到原站真实 AC。Chrome / Edge 实际加载和 Code OSS 原生浏览器交互仍需桌面端验收；本次未构建完整 IDE 安装包。
