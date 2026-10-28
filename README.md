# Ubi Vibe · Playtest Hub

成员原型试玩入口。当前提供 ASCENT / 上行撤离 v0.6.1，桌面键鼠 / WebGL 浏览器运行。

在线试玩：https://tonyguan530.github.io/UbiVibeCodingJam2026-Hub/

这是原型试玩，不是正式游戏发行。仓库仅包含Hub和选定原型的公开运行文件、截图及许可；不包含团队Unity工程、设计文档、调试夹具或凭据。

来源版本：`5f6b21607a72b0e8fbe23f86cc742962cdb41f48`。发布文件哈希见 `publish-manifest.json`。

本地运行：`python -m http.server 8000`，打开 http://127.0.0.1:8000 。

## 更新与新增作品

游戏列表使用 `games.json`；每个版本放在 `games/<id>/<version>/`。添加清单项、游戏运行目录和封面后，推送到main即可由GitHub Pages发布，无需npm或自建workflow。更新已有作品时发布新版本目录并调整清单；保留旧版本路径以便回看。

代码采用MIT许可，原始Idea 02版权说明保留于LICENSE；游戏许可详见对应版本licenses目录。封面是当前Demo的实际运行截图，没有使用第三方宣传图。
