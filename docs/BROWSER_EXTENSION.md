# Chrome / Edge Companion 落地

## 现在就能使用：本地安装

1. 在 GitHub Release 下载 `dsu-companion-0.1.2.zip`，解压到一个固定目录。不要删除或移动该目录。
2. Chrome 打开 `chrome://extensions`；Edge 打开 `edge://extensions`。
3. 开启「开发者模式」，点击「加载已解压的扩展」，选择包含 `manifest.json` 的目录。不是选择 ZIP 文件本身。
4. 打开 DSU IDE 和做题文件夹。在主页「设置 → 配对外部浏览器」或命令面板执行 `DSU: 复制浏览器配对信息`。
5. 首次安装自动打开连接设置；以后点击浏览器工具栏 DSU 图标 →「连接设置」。粘贴配对信息，端口自动填写，点击「保存并测试连接」。旧版纯令牌也支持，但端口需自行填写。
6. 打开题目，点击工具栏图标 →「导入当前题目」，或点击页面右下角「在 DSU IDE 创建题目」。检查 IDE 中的代码、题面和样例；已有代码不会被覆盖。VJudge 先点击「打开原站题目」，到原站再次导入。
7. 若要使用该浏览器提交，在 IDE 设置中把 `dsu.submissionBrowser` 设为 `external`，并将它设为系统默认浏览器。使用浏览器现有的 OJ 登录态；验证码需自行完成。

Chrome 和 Edge 分别安装、分别配对。内置浏览器不需要安装 Companion 或配对。IDE 必须保持打开；多个 IDE 窗口需要不同桥接端口并与扩展设置一致。错误令牌请重新复制；连接失败先确认已打开单文件夹工作区，端口未占用。测试连接不会提交代码。

更新本地扩展：退出使用中的 OJ 页面，将新 ZIP 解压覆盖原目录，在扩展管理页点击「重新加载」，再打开题目页面。配对信息通常保留在浏览器本地；卸载再安装则需重新配对。设置页「断开配对」会删除本浏览器的令牌。

工具栏面板：上方显示连接是否正常及当前 OJ，主按钮执行导入，底部有「重新检查」和「连接设置」。未连接、提交页或未配置站点不会启用导入。IDE 后启动或重新配对后点击「重新检查」即可恢复。安装前已经打开的题目页可以从工具栏触发本地脚本，无需先刷新。

配对失败时先看面板提示：缺少令牌到连接设置粘贴；令牌错误重新从 IDE 复制；无法连接则确认 IDE 打开了做题文件夹、端口一致且未占用。页面已经变化时重新检查再导入。登录或验证码提示需先在 OJ 页面处理。

已有工作区要使用新版 Codeforces 地址规则，请执行 `DSU: 更新内置 OJ 配置` 并只选 Codeforces；会保留备份和其他配置。这修复旧规则把提交页识别为题目页的问题。

## 正式分发：浏览器商店

同一份 MV3 ZIP 可作为 Chrome Web Store 和 Microsoft Edge Add-ons 的提交包，审核要求以各商店当前说明为准。ZIP 已包含图标、设置页与脚本；不依赖远程加载的执行代码。

发布者需要自己完成：

1. 注册并验证 Chrome 开发者账号、Microsoft Partner Center 的 Edge 扩展账号。
2. 上传 `dist/release/dsu-companion-0.1.2.zip`。
3. 填写名称、说明、分类、支持联系方式和真实截图。本次 `dist/release/companion-settings.png` 是 1280×800 的真实设置页截图，令牌为空，可作为提交素材；其他宣传图按商店要求补充。
4. 将 `BROWSER_PRIVACY.md` 发布到可公开访问的网页，填入隐私政策地址；按实际行为完成权限与数据披露。
5. 提供审核说明：先运行 DSU IDE、打开做题文件夹、复制令牌并配对；审核题目导入无需真实提交。扩展依赖本机应用，不能脱离 IDE 工作。
6. 提交审核，通过后把两个商店的安装链接放入项目 README 和 Release。当前没有商店 ID，未代注册、付费或上架。

可使用的简短说明：

> 将在线评测题目导入本机 DSU IDE：按 OJ 整理代码文件，导入样例，并在用户操作时协助提交代码。需要先启动 DSU IDE 并配对。支持洛谷、Codeforces、AtCoder 和 VJudge 原站跳转；具体支持范围见项目说明。

权限用途：`storage` 保存本机配对令牌和端口；`scripting` 在授权的自定义 OJ 注入本地脚本；本机地址权限用于连接 IDE；内置 OJ 域名权限用于题面提取及提交；可选站点权限仅在用户主动授权时请求。没有请求浏览历史或 cookies API 权限，不代表题面、源码与登录态不参与操作，隐私声明已单独说明。

源码开发者执行 `npm run release:artifacts` 生成 ZIP；`npm run test:e2e` 验证真实 Chromium MV3 通信。此验证不等于两个商店认证或品牌版浏览器验收。

官方流程：[Chrome 准备发布](https://developer.chrome.com/docs/webstore/prepare)、[Edge 发布扩展](https://learn.microsoft.com/en-us/microsoft-edge/extensions-chromium/publish/publish-extension)。
