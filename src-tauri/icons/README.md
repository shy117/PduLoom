# 图标维护

`PduLoom.svg` 为方形图标源文件，浏览器标签页使用此 SVG，Windows 桌面版使用生成的 PNG 和 ICO。侧栏和顶部品牌使用透明文字 Logo `PduLoom_logo.png`，其源文件为 `pduloom_logo.svg`。README 使用 `docs/images/PduLoom_logo.png`，与文档截图统一存放；更新文字 Logo 时同步这两份 PNG。

## 重新生成

需要 Python 3.10 或更高版本和 Inkscape；常规应用开发与构建不需要这些工具。在项目根目录执行：

```powershell
python src-tauri/icons/generate_app_icons.py --svg src-tauri/icons/PduLoom.svg
```

默认生成 16、24、32、48、64、128、256 像素的透明 PNG（`PduLoom_尺寸.png`）和包含这些尺寸的 `PduLoom.ico`，保存到脚本所在目录，覆盖同名输出文件。

## 通用参数

输出前缀取输入 SVG 的文件名，不含扩展名。不传 `--svg` 时读取脚本同目录的 `icon.svg`，使用 `icon` 前缀；本项目应显式指定 `PduLoom.svg`。

- `--svg 路径`：指定源 SVG。
- `--sizes 24,32,64,128,256`：指定尺寸，范围为 1～256，重复尺寸自动去重。
- `--out-dir 路径`：指定输出目录。
- `--inkscape 路径`：指定 `inkscape.com` 或 `inkscape.exe`；默认从 PATH 和常用安装目录查找。

## 应用引用

Tauri 的 `bundle.icon` 引用 `PduLoom_32.png`、`PduLoom_128.png`、`PduLoom_256.png` 和 `PduLoom.ico`。源 SVG、生成脚本和生成图标一并纳入版本管理。

安装器和卸载器需分别通过 `bundle.windows.nsis.installerIcon`、`uninstallerIcon` 指定 `PduLoom.ico`；仅配置 `bundle.icon` 不会自动替换 NSIS 默认安装器图标。打包配置示例见 [发布包制作](../../docs/PACKAGING.md)。

更换图标后重新生成这些文件，并检查小尺寸和深浅背景显示。若更改源文件名称，还需同步修改 `src/App.vue`、`index.html` 和 `src-tauri/tauri.conf.json` 中的引用。

脚本目前只生成 PNG 和 Windows ICO，不生成 macOS ICNS。
