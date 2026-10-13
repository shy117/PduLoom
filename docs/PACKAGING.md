# Windows 发布包制作

本文描述发布包制作方法。面向使用者的版本说明维护在 [RELEASE.md](../RELEASE.md)，功能变更维护在 [CHANGELOG.md](../CHANGELOG.md)。

## 文档与构建记录

随包文档只描述功能、适用平台、安装方式、使用限制和授权信息。不要写入“尚未制作”“等待验证”“本轮仅整理”等制作进度，以免打包后文档立即失效。

每次构建的提交号、源码改动、构建时间、工具版本及验证记录写入发布目录的 `release-manifest.json`。未解决的第三方许可证条目写入 `license-review.txt`；安装验收记录单独保存到该发布目录，不回写版本说明。

## 环境与输入文件

使用 PowerShell 7、Node.js/npm、Rust Windows x64 MSVC 工具链、Microsoft C++ Build Tools 和 Windows SDK。环境要求见 [README](../README.md#开发环境)。

在项目根目录执行命令，关闭正在运行的 PduLoom 桌面程序。编译继续使用 `src-tauri/target/release/`，不用单独的 Cargo 构建目录。

制作前核对 `package.json`、`package-lock.json`、`src-tauri/Cargo.toml` 和 `src-tauri/tauri.conf.json` 中的版本，以及 CHANGELOG 和 RELEASE 中的对应版本。

| 输入 | 用途 |
|---|---|
| `src-tauri/icons/PduLoom.ico` | 程序、安装器和卸载器图标 |
| `src-tauri/icons/PduLoom_logo.png` | 软件界面的文字 Logo |
| `docs/images/PduLoom_logo.png` | README 的文字 Logo |
| `installer/LICENSE.zh-CN.txt` | 安装过程显示的中文许可说明 |
| `LICENSE`、`NOTICE` | 随软件分发的完整授权文件与项目声明 |
| `README.md`、`CHANGELOG.md`、`RELEASE.md` | 随软件分发的使用与版本文档 |
| `docs/images/` | README 引用的文字 Logo 与截图 |

第三方依赖的许可证全文也应随包分发，不能用项目的 Apache-2.0 许可证替代。

包内缺失的许可证由 [installer/licenses](../installer/licenses/README.md) 补充，按版本、上游提交和 SHA-256 校验后收集。缺失或校验失败时停止打包，不忽略警告。可先执行 `pwsh -NoProfile -File scripts/package_release.ps1 -PrepareOnly` 检查发布资料。

应用标识使用 `com.pduloom.desktop`，保持跨版本一致，不以 `.app` 结尾。变更标识可能影响 Tauri 的应用数据路径，应在版本定版时确认。

## 工具下载与本地缓存

Tauri CLI 版本由 `package-lock.json` 固定。以下工具版本适用于 CLI 2.12.2；升级 CLI 时重新核对工具版本和校验值。

| 工具 | 下载地址 | 说明 |
|---|---|---|
| NSIS 3.11 | [Tauri 工具 ZIP](https://github.com/tauri-apps/binary-releases/releases/download/nsis-3.11/nsis-3.11.zip) | 下载二进制 ZIP，不选 Source code；解压后应包含 `makensis.exe`、`Bin`、`Include`、`Plugins` |
| NSIS Tauri 插件 0.5.3 | [nsis_tauri_utils.dll](https://github.com/tauri-apps/nsis-tauri-utils/releases/download/nsis_tauri_utils-v0.5.3/nsis_tauri_utils.dll) | SHA-1 为 `75197FEE3C6A814FE035788D1C34EAD39349B860` |
| WebView2 Evergreen x64 | [微软离线安装程序](https://go.microsoft.com/fwlink/?linkid=2124701) | 下载完整离线安装程序，不选小体积 Bootstrapper |

下载文件保存在 `release/tools/`。解压 NSIS 后，推荐文件结构：

```text
release/tools/
  nsis-3.11/
    makensis.exe
    Bin/
    Include/
    Plugins/
  nsis_tauri_utils.dll
  MicrosoftEdgeWebView2RuntimeInstallerX64.exe
```

验证插件哈希和微软安装程序的签名：

```powershell
Get-FileHash release/tools/nsis_tauri_utils.dll -Algorithm SHA1
Get-AuthenticodeSignature release/tools/MicrosoftEdgeWebView2RuntimeInstallerX64.exe
```

默认工具缓存位于 `%LOCALAPPDATA%\tauri\`。使用本地工具时，将完整的 `nsis-3.11` 目录内容放入 `NSIS/`，插件放入 `NSIS/Plugins/x86-unicode/additional/`。保留目录结构；已有缓存先核对版本并备份，避免覆盖其他项目使用的工具。

Tauri 的 `offlineInstaller` 模式会联网查询微软最新安装程序的地址，即使文件已手动下载也可能访问网络。使用本地离线文件时，可将完整离线安装程序复制到缓存中的 `MicrosoftEdgeWebview2Setup.exe`，并在离线包配置中使用 `embedBootstrapper`。该模式仅控制嵌入流程，实际载荷必须是已验证的完整离线安装程序；安装时仍执行其 `/silent /install` 参数，不需要下载运行时。

在线包使用 `downloadBootstrapper`，只在目标电脑缺少 WebView2 时联网安装运行时。

## 制作流程

1. 完成功能、版本资料、图标及许可说明修改，确认要发布的源码提交。
2. 运行协议测试与前端构建，收集依赖许可证和随包文档。
3. 生成在线、离线两份 Tauri 打包配置，显式设置安装器图标和中文许可页面。
4. 在原目录编译一次桌面程序，两个安装包复用该程序。
5. 依次生成并立即另存两个安装包，避免第二次打包覆盖第一次产物。
6. 将程序、文档、图片和许可证整理成便携目录，压缩为 ZIP。
7. 核对包内容并生成 SHA-256 和构建清单，完成安装验收后发布。

联网自动制作入口：

```powershell
pwsh -NoProfile -File scripts/package_release.ps1 -Version 0.1.0

# 需要重新安装 npm 依赖时
pwsh -NoProfile -File scripts/package_release.ps1 -Version 0.1.0 -InstallDependencies
```

脚本执行测试、收集许可证、编译程序、生成两个 NSIS 安装包及便携 ZIP，并输出 `SHA256SUMS.txt` 和 `release-manifest.json`。发布目录默认采用 `release/v版本/windows-x64-时间戳/`，拒绝覆盖已有目录，不执行 Git 提交或打标签。

脚本默认采用联网的工具下载和 `offlineInstaller` 模式。使用本地文件时，按上述缓存方式调整生成配置中的离线模式；同时检查下列图标和资源配置。不要依赖 `release/tools/` 中临时生成的脚本作为唯一发布入口，该目录不纳入 Git。

### 打包配置要点

安装页面由 `bundle.licenseFile` 控制，与安装目录中附带的完整 `LICENSE` 是两项独立配置。

```json
{
  "bundle": {
    "targets": ["nsis"],
    "licenseFile": "../installer/LICENSE.zh-CN.txt",
    "windows": {
      "webviewInstallMode": { "type": "downloadBootstrapper" },
      "nsis": {
        "installerIcon": "icons/PduLoom.ico",
        "uninstallerIcon": "icons/PduLoom.ico",
        "installMode": "currentUser",
        "languages": ["SimpChinese", "English"],
        "displayLanguageSelector": true
      }
    }
  }
}
```

离线包仅将 WebView2 模式改为 `offlineInstaller`，或配合本地完整安装程序缓存改为 `embedBootstrapper`。生成配置建议使用图标、许可证和资源的绝对路径，减少路径解析歧义。

`bundle.resources` 需包含完整 `LICENSE`、`NOTICE`、中文许可说明、README、CHANGELOG、RELEASE、依赖许可证及清单，以及 `docs/images/` 中的文字 Logo 和截图。保留 `docs/images/` 的相对结构，确保安装后 README 图片仍可显示。便携包使用同样的文档和资源结构。软件界面的 Logo 由 Vite 构建到前端资源中。

### 分步命令

两份生成配置保存为发布目录中的 `online.json`、`offline.json`。下面以 `$releaseRoot` 表示已生成配置的发布目录：

```powershell
npm test
npm run build

npx --no-install tauri build --no-bundle --ci --config "$releaseRoot/online.json" -- --locked

npx --no-install tauri bundle --bundles nsis --ci --config "$releaseRoot/online.json"
Copy-Item src-tauri/target/release/bundle/nsis/PduLoom_0.1.0_x64-setup.exe `
  "$releaseRoot/PduLoom-v0.1.0-win64-setup.exe"

npx --no-install tauri bundle --bundles nsis --ci --config "$releaseRoot/offline.json"
Copy-Item src-tauri/target/release/bundle/nsis/PduLoom_0.1.0_x64-setup.exe `
  "$releaseRoot/PduLoom-v0.1.0-win64-offline-setup.exe"
```

版本变化时同步替换示例文件名。只修改安装器图标、许可页面或随包文档时，可以复用同一源码提交构建的程序，仅重新执行 bundle 和便携包整理；涉及程序代码或版本号变化时重新编译。需要记录配置和文档相对于该提交的改动。

## 验收与发布

- 检查安装器和卸载器图标、中文许可页面、版本与发布者。
- 在线包验证已有 WebView2 和缺少 WebView2 的情况；离线包在缺少 WebView2 的环境中断网安装验证。
- 验证程序启动、基本功能、复制、主题、断网运行、卸载和后续版本的升级安装。
- 便携包解压后验证启动和图片、许可证等资源完整性。
- 核对 `SHA256SUMS.txt`、源码提交、依赖清单及许可证复核结果。

源码提交和标签应与发布包的构建记录对应。制作过程中修订源码或随包资料后，应先提交并重新确认发布版本；不自动移动已公开的标签。GitHub Release 使用 `RELEASE.md` 的内容，上传三个发布包及 SHA-256 校验文件。
