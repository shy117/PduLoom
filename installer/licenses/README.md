# 第三方许可证补充文件

本目录保存发布包未附带许可证全文的依赖的补充文件。文件纳入 Git，打包时直接读取，不依赖临时下载或开发机缓存。

`sources.json` 按生态、包名和版本记录原始许可证声明、选用的许可、对应源码提交、官方来源及本地文件的 SHA-256。源码提交来自 Cargo 包的 `.cargo_vcs_info.json`。文本保留许可条款和版权声明，网页提取仅规范化换行。

对于 `MIT OR Apache-2.0` 或 `Apache-2.0 OR MIT` 的依赖，补充文件采用其中的 MIT 授权，并在清单中记录选用结果。`selectors` 使用 Mozilla 官方 MPL-2.0 全文，附带上游许可声明和对应版本的源码链接。

打包脚本先收集包根目录中的许可证及 Cargo 的 `license_file`，仅在缺失时使用对应版本的补充文件。补充文件必须匹配依赖的声明和源码提交，且哈希校验通过；否则停止打包。升级依赖后重新核对来源和文本，不直接沿用旧版本记录。

维护文件后运行：

```powershell
pwsh -NoProfile -File scripts/package_release.ps1 -PrepareOnly
```

该命令执行测试并生成依赖清单、许可证和打包配置，不编译桌面程序或生成安装包。输出的 `license-review.txt` 应为空，补充文件的来源记录位于各依赖目录的 `SOURCE.json`。
