# 部署 / Deployment

`npm run build` 生成纯静态站点 `dist/`，可以放到任何静态托管（Nginx、Cloudflare Pages、Vercel、GitHub Pages）。

## 子路径

```bash
ATLAS_BASE=/words/ npm run build
```

## Nginx 示例

```nginx
location ^~ /words/ {
    alias /var/www/word-atlas/;
    try_files $uri $uri/ /words/index.html;
    expires 7d;
}
```

## GitHub Pages

仓库带有 `.github/workflows/pages.yml`，支持免费发布到自己的公开仓库：

1. Fork 仓库到自己的 GitHub 账号。
2. 在仓库 Settings → Pages → Build and deployment 中，将 Source 设为 “GitHub Actions”。
3. 如果 fork 的 Actions 尚未启用，先在 Actions 页面启用工作流。
4. 在 Actions 中选择 “Deploy to GitHub Pages”，点击 “Run workflow”。之后推送到 `main` 会自动更新网站。

工作流使用 Node.js 22，自动将 `ATLAS_BASE` 设为仓库子路径。例如，`word-atlas` 仓库的网址是 `https://<用户名>.github.io/word-atlas/`。

在 iPhone 上，用 Safari 打开发布后的 HTTPS 网址，点击“分享 → 添加到主屏幕”。如果出现“作为网页 App 打开”选项，将它开启。添加后可以从主屏幕启动，无需 Apple 开发者会员或 TestFlight。

学习进度保存在手机本地。换设备或清理浏览器数据前，在“我的”中导出备份。离线缓存按访问情况保存内容，不会在首次打开时下载全部词库媒体。

## 体积

插画与音频合计约数百 MB。建议在 CDN 后部署，或按需只发布 `thumb/` 和部分音频。
