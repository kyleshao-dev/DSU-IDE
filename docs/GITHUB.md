# 上传到 GitHub

产品显示名称为 **DSU IDE**。GitHub 仓库名不使用空格，建议 **DSU-IDE**。本项目没有替你创建远程仓库或上传。

在 GitHub 新建空仓库 `DSU-IDE`，不要勾选自动生成 README、License 或 .gitignore。然后在项目目录运行，把 `YOUR_USERNAME` 替换为你的账号：

```bash
git init -b main
git add .
git commit -m "feat: bootstrap DSU IDE 0.1.2"
git remote add origin https://github.com/YOUR_USERNAME/DSU-IDE.git
git push -u origin main
git tag -a v0.1.2 -m "DSU IDE 0.1.2"
git push origin v0.1.2
```

或者使用 GitHub CLI（选择公开或私有二者之一）：

```bash
gh auth login
git init -b main
git add .
git commit -m "feat: bootstrap DSU IDE 0.1.2"
gh repo create DSU-IDE --private --source=. --remote=origin --push --description "DSU IDE 0.1.2 — 基于 Code OSS 的竞赛编程 IDE"
git tag -a v0.1.2 -m "DSU IDE 0.1.2"
git push origin v0.1.2
```

若要公开，将 `--private` 改为 `--public`。两套命令任选一套，不要重复运行 `git remote add origin`。

`vendor`、`node_modules`、`dist`、`packages` 已忽略；上传的是源码、锁文件、文档与 CI。构建产物由 `npm run build` 生成。不要上传浏览器配对令牌或账号 Cookie。


桌面 ZIP 体积超过 GitHub 普通文件限制，应作为 Release 附件上传，不要加入 Git 历史。完成上面的推送后，可执行：

```bash
gh release create v0.1.2 dist/release/DSU-IDE-0.1.2-macos-arm64.zip dist/release/dsu-ide-0.1.2.vsix dist/release/dsu-companion-0.1.2.zip dist/release/BUILD.md dist/release/SHA256SUMS --title "DSU IDE 0.1.2" --notes-file CHANGELOG.md --prerelease
```

当前桌面附件仅包含已验证的 macOS arm64 开发版，未经签名和公证。Windows/Linux 可在 Actions 手动运行 `Build DSU desktop`，验证通过后再附加对应产物。
