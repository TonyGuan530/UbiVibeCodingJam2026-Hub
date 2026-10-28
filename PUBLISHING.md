# 成员 Prototype 发布到 GitHub Pages

成员希望公开试玩自己的 Prototype 时，统一使用本流程。开发仍在自己的原型目录与专用分支进行；完成验证后，将源码交付到团队 main，再将选定的网页产物加入现有 Hub。成员明确提出发布请求后，本流程允许直接提交相应原型及 Hub 更新，不要求新建 PR；这不授权发布别人的原型、覆盖他人修改或推进正式 release。

统一入口：[成员试玩 Hub](https://tonyguan530.github.io/UbiVibeCodingJam2026-Hub/)。不为每个作品另建网站，不使用 itch。ASCENT 的实际发布记录见 [PlaytestHub.md](https://github.com/TonyGuan530/UbiVibeCodingJam2026/blob/main/Docs/PlaytestHub.md)，原型归属与正式采用规则见 [Prototyping.md](https://github.com/TonyGuan530/UbiVibeCodingJam2026/blob/main/Docs/Prototyping.md)。

## 公开范围与访问控制

团队源码仓库仍为私有，但公开Hub中的JavaScript、WASM和素材都可由访问者下载。当前ASCENT是原生JavaScript，公开运行文件也是可读代码，不能保证其私密。GitHub Pages原生邀请制需要组织使用Enterprise Cloud；普通个人Pages不提供按小组邀请访问。若需要小组限定，先选具备登录访问控制的托管方式或符合条件的企业Pages，不用前端密码框假装保护资源。[官方访问控制说明](https://docs.github.com/en/enterprise-cloud%40latest/pages/getting-started-with-github-pages/changing-the-visibility-of-your-github-pages-site)。

## 1. 准备可公开的网页版本

- 源码放在 `prototypes/<member>/<slug>/`；填写原型 README、[登记表](https://github.com/TonyGuan530/UbiVibeCodingJam2026/blob/main/prototypes/README.md)、实际工具版本、操作、来源许可及作者 QA。
- 作者明确确认本次版本可公开，包含代码、素材、字体、音频和截图的分发权。素材授权未确认的部分先替换或移出产物，不把团队私有工程整个复制到公开仓库。
- 输出可由静态 HTTP 服务运行的网页包，包含入口 HTML 和全部运行依赖。桌面 `.exe`、Godot 工程目录、Unity 工程目录都不能直接作为 Pages 在线游戏；先生成适合浏览器的导出。
- 对实际网页产物完成“启动 → 核心操作 → 正常结束 → 重玩”，检查资源、输入、存档及已知限制。源码测试、编辑器截图、入口返回 200 各自不能代替这项验证。

不同引擎只共享发布流程，不共享“已经兼容”的结论：

| 类型 | 发布前检查 |
| --- | --- |
| HTML / Three.js / 原生 WebGL | 使用相对路径；生产包包含完整依赖，不依赖本机服务、开发服务器或个人绝对路径。 |
| Godot Web 导出 | 按对应版本官方文档核对 Web 导出支持、Compatibility 渲染和线程选项。当前 Godot 4 的 C# 项目不能直接按普通 Web 导出处理；需要额外跨源隔离响应头的线程版本不得假设 Pages 已支持。优先验证不依赖这些响应头的单线程导出。 |
| Unity Web 导出 | 固定本原型实际 Unity 版本。压缩产物依赖正确响应头；在 Pages 上验证禁用压缩或适用的 Decompression Fallback 配置，不能只在本机编辑器中通过就记作上线成功。 |

这些是检查项，不是替各引擎完成了导出验收。[Godot 官方 Web 导出说明](https://docs.godotengine.org/en/stable/tutorials/export/exporting_for_web.html)、[Unity 6000.4 Web 部署说明](https://docs.unity3d.com/6000.4/Documentation/Manual/webgl-deploying.html)。

## 2. 填写发布配置

在自己的原型目录建立 `publish.json`。所有输入路径相对于该文件所在的原型目录；`artifacts.root` 指向已验证的网页产物。只列入真正需要公开的文件，不能用宽泛匹配把源码仓库、缓存、设计文档、测试夹具或账号配置带出去。

以下是字段示例，复制后替换作品、路径、文件模式和许可；未生成产物时不要把示例记为已发布：

```json
{
  "schemaVersion": 1,
  "id": "member-my-prototype",
  "title": "我的原型",
  "subtitle": "一句话副标题",
  "version": "v0.1.0",
  "description": "本次要体验的核心玩法。",
  "tags": ["3D", "键鼠"],
  "updatedAt": "2026-10-28",
  "controls": [{"key": "WASD", "action": "移动"}],
  "artifacts": {
    "root": "WebProject/dist",
    "include": ["index.html", "*.js", "*.css", "assets/**/*"]
  },
  "entry": "index.html",
  "cover": "cover.png",
  "licenses": [{"source": "LICENSE", "target": "licenses/LICENSE.txt"}]
}
```

`id` 使用包含成员标识的稳定名称，不能占用现有作品 ID；`version` 对应一个不可变的公开产物。修改运行文件就发布新版本，不用同一版本号覆盖旧包。封面使用实际游戏截图或有明确分发权的图片。Unity / Godot 导出需按真实目录补齐 `.wasm`、数据包、加载器等全部运行文件，不能照抄上例的 JS 文件模式。

## 3. 固定源码版本并同步 Hub

团队源码仓库保持私有：`TonyGuan530/UbiVibeCodingJam2026`。公开产物仓库固定为 `TonyGuan530/UbiVibeCodingJam2026-Hub`。两个仓库分别提交，不把公开 Hub 绑定为正式 Unity 工程依赖。

1. 先确认当前路径、远端、分支和 Git 状态。按根规则从干净工作区同步；已有修改先保留，不自动 stash、强制重置或强推。
2. 将已经 QA 的本人成员原型、发布配置、README、登记及 GDD 摘要整合到最新团队 main，并直接提交、推送。复杂开发继续在专用分支进行；交付时只整合本次原型，不整包合入无关分支。保留必要的人类设计/UI review 状态，不把直接发布授权或 AI 自检写成人类批准。
3. 记录完整源码提交 SHA；从这个固定版本生成或核对本次产物。后续发布收据中的来源提交必须对应实际源码，而非仅填写一个看起来较新的 SHA。
4. 克隆公开 Hub 到团队源码目录外。已有克隆须先确认干净，再同步 `main`；没有公开仓库写权限时，将配置、实际产物、来源提交、SHA256 和 QA 记录交给有权限的维护者执行后续步骤。

```text
git clone https://github.com/TonyGuan530/UbiVibeCodingJam2026-Hub.git ../UbiVibeCodingJam2026-Hub
git -C ../UbiVibeCodingJam2026-Hub switch main
git -C ../UbiVibeCodingJam2026-Hub pull --ff-only
```

在团队源码仓库根目录执行通用工具；需 Python 3.10+ 标准库，无需 npm。Windows 先确认 `py -3 --version`，macOS 先确认 `python3 --version`。

```powershell
# Windows / PowerShell
py -3 Tools/add-hub-prototype.py --config prototypes/member/my-prototype/publish.json --hub ../UbiVibeCodingJam2026-Hub
```

```bash
# macOS
python3 Tools/add-hub-prototype.py --config prototypes/member/my-prototype/publish.json --hub ../UbiVibeCodingJam2026-Hub
```

工具只更新本机 Hub：加入或更新一个作品卡片，保留其他成员及旧版本，并生成包含来源和文件哈希的发布收据；它不会提交、推送或开启网站。发现同版本运行文件不同应停止，改用新版本号。`Tools/build-playtest-hub.py` 是 ASCENT 初次建站工具，不能拿来新增成员作品或覆盖已有 Hub。

## 4. 预览后提交公开产物

在公开 Hub 根目录启动 `python -m http.server 8000`；macOS 使用 `python3`。打开 `http://127.0.0.1:8000/`，至少检查：

- 自己的卡片标题、版本、封面、操作和启动入口正确，其他作品仍存在。
- 默认入口为共享试玩页 `play.html?game=<id>`。由 Hub 提供返回 Hub 的悬浮按钮；进入全屏后仍应能返回，不要求每个游戏修改自身代码。“单独打开”也进入共享试玩页；原始运行文件地址仅供维护定位，默认试玩入口始终带共享返回按钮。
- 从卡片实际进入游戏，检查输入、资源、核心操作、正常结束和重玩；检查浏览器错误及 Pages 子路径下的相对资源地址。
- 比较 `git diff` 和发布收据：只新增本作品所需文件与列表项，旧版本及其他成员内容保留。没有个人配置、密钥、私有设计材料或与本次无关的修改。

确认后，在公开 Hub 仓库内选择本次文件暂存，执行 `git diff --cached --check`、`git commit`、`git push origin main`。不使用 `git add .` 混入未知文件，不用强推绕过新提交；同步冲突时先保留现场并核对双方作品。

## 5. 线上验证后才登记“已发布”

Hub 已配置 Pages 从 `main` 根目录发布，保留 `.nojekyll`。成员新增作品不需重新建 Pages，也不添加自定义 Actions workflow；观察 GitHub 自带的 `pages-build-deployment` 是否成功。[GitHub 官方发布源说明](https://docs.github.com/en/pages/getting-started-with-github-pages/configuring-a-publishing-source-for-your-github-pages-site)。

部署成功后，从团队源码仓库运行文件验证，`SOURCE_SHA` 替换成步骤 3 记录的来源 SHA：

```powershell
py -3 Tools/verify-playtest-hub.py https://tonyguan530.github.io/UbiVibeCodingJam2026-Hub/ --game member-my-prototype --source SOURCE_SHA --report .utmp/pages-check.json
```

macOS 将 `py -3` 替换为 `python3`。随后匿名打开线上 Hub，实际从卡片进入本作品，再验证返回 Hub、全屏返回、核心输入、正常结束、重玩和资源加载。文件哈希检查通过只证明文件一致，不能代替这次真实运行。

把来源提交、公开产物提交、版本、试玩链接、部署结果、实际 QA 步骤/证据、未验证项及人类 review 状态补到原型 README、登记表和 GDD。构建中、404、资源缺失、无法操作或终局阻断时记为待修，不记“已上线可玩”。更新已有作品时保留 ID，发布新版本目录并切换该卡片；回退可把卡片指回已验证的旧版本，再按相同步骤验证。

## 给成员自己 AI 的执行说明

将下段交给自己负责本原型的 AI，并填入实际目录；它不授权触碰其他成员或正式工程：

```text
请按根 AGENTS.md、prototypes/AGENTS.md 和 Docs/PrototypePublishing.md，
把我的 prototypes/<member>/<slug>/ 原型发布到现有 GitHub Pages 试玩 Hub。
先检查现有工作和发布权限，完成实际网页产物的开始、核心操作、正常结束及重玩 QA；
填写 publish.json、来源许可和固定源码提交。仅整合我的原型，直接提交 main，不创建 PR。
用通用新增工具更新已同步的公开 Hub，保留其他作品和旧版本；
确认共享试玩页、返回 Hub 按钮及全屏返回正常后，再提交公开产物。
等待 Pages 部署并完成线上哈希与真实玩法验证，最后更新 README、登记表和 GDD。
权限不足或实际无法运行时据实记录并交接，不把未执行的验证写成通过。
```

## 本轮工具验证

增量发布工具6项合成夹具测试通过：多成员保留、旧版本保留、同版幂等及拒绝修改、归属冲突、越界路径、缺失许可及文件哈希。Hub17项本机浏览器检查通过，含普通/全屏实际返回、全屏后键盘背包/地图、桌面/手机布局。合成测试游戏不上传到线上，当前真实作品仍只有ASCENT。
