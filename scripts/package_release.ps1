#Requires -Version 7.0
param(
    [string]$Version = '0.1.0',
    [string]$OutputDirectory = '',
    [switch]$InstallDependencies,
    [switch]$PrepareOnly
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$repoRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
function Invoke-Checked {
    param([string]$Command, [string[]]$Arguments)
    & $Command @Arguments
    if ($LASTEXITCODE -ne 0) { throw "$Command 失败，退出码 $LASTEXITCODE" }
}
function Save-Json {
    param($Value, [string]$Path)
    [IO.File]::WriteAllText($Path, ($Value | ConvertTo-Json -Depth 20), [Text.UTF8Encoding]::new($false))
}
function Collect-Licenses {
    param([string]$PackageRoot, [string]$Name, [string]$PackageVersion, [string]$License, [string]$Ecosystem, [string]$LicenseFile = '', [string]$VcsCommit = '')
    $safeName = $Name -replace '[^A-Za-z0-9._-]', '_'
    $destination = Join-Path $legalRoot "$Ecosystem/$safeName-$PackageVersion"
    New-Item -ItemType Directory -Path $destination -Force | Out-Null
    $files = @(Get-ChildItem -LiteralPath $PackageRoot -File | Where-Object { $_.Name -match '^(LICENSE|LICENCE|COPYING|NOTICE|COPYRIGHT)([._-]|$)' })
    # Cargo 显式指定的 license_file 可能位于子目录，必须在判断缺失前处理。
    if ($LicenseFile) {
        $declaredFile = Join-Path $PackageRoot $LicenseFile
        if (Test-Path -LiteralPath $declaredFile -PathType Leaf) { $files += Get-Item -LiteralPath $declaredFile }
    }
    $files = @($files | Sort-Object FullName -Unique)
    $key = "$Ecosystem/$Name@$PackageVersion"
    $source = $null
    if ($files.Count -eq 0 -and $licenseSources.ContainsKey($key)) {
        $source = $licenseSources[$key]
        if ($source.license -ne $License -or $source.gitCommit -ne $VcsCommit) { throw "许可证补充文件与依赖声明或源码提交不一致：$key" }
        $snapshotRoot = Join-Path $repoRoot "installer/licenses/$Ecosystem/$safeName-$PackageVersion"
        foreach ($sourceFile in $source.files) {
            if ([IO.Path]::GetFileName($sourceFile.name) -ne $sourceFile.name) { throw "许可证文件名非法：$key" }
            $snapshot = Join-Path $snapshotRoot $sourceFile.name
            if ((Get-FileHash -LiteralPath $snapshot -Algorithm SHA256).Hash.ToLowerInvariant() -ne $sourceFile.sha256) { throw "许可证补充文件校验失败：$key" }
            $files += Get-Item -LiteralPath $snapshot
        }
        Save-Json $source (Join-Path $destination 'SOURCE.json')
    }
    foreach ($file in $files) { Copy-Item -LiteralPath $file.FullName -Destination $destination }
    $record = @{ ecosystem = $Ecosystem; name = $Name; version = $PackageVersion; license = $License; files = @($files | ForEach-Object Name) }
    if ($source) { $record['selectedLicense'] = $source.selectedLicense; $record['source'] = $source }
    $inventory.Add([pscustomobject]$record)
    if ($files.Count -eq 0) { $missing.Add("$key ($License)") }
}

Push-Location $repoRoot
try {
    foreach ($tool in @('node', 'npm.cmd', 'npx.cmd', 'cargo', 'rustc', 'git')) { Get-Command $tool -ErrorAction Stop | Out-Null }
    $npmPackage = Get-Content package.json -Raw | ConvertFrom-Json
    $npmLock = Get-Content package-lock.json -Raw | ConvertFrom-Json -AsHashtable
    $tauri = Get-Content src-tauri/tauri.conf.json -Raw | ConvertFrom-Json
    if ($Version -notmatch '^\d+\.\d+\.\d+$' -or $npmPackage.version -ne $Version -or $npmLock.version -ne $Version -or $tauri.version -ne $Version) { throw '发布版本与项目配置不一致' }
    $rustInfo = & rustc -vV
    if ($LASTEXITCODE -ne 0 -or $rustInfo -notcontains 'host: x86_64-pc-windows-msvc') { throw '当前脚本要求 Windows x64 MSVC 工具链' }
    if (!$OutputDirectory) { $OutputDirectory = "release/v$Version/windows-x64-$(Get-Date -Format yyyyMMdd-HHmmss)" }
    $releaseRoot = [IO.Path]::GetFullPath((Join-Path $repoRoot $OutputDirectory))
    if (!$releaseRoot.StartsWith($repoRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) { throw '发布目录必须位于项目目录内' }
    if (Test-Path -LiteralPath $releaseRoot) { throw "发布目录已存在，拒绝覆盖：$releaseRoot" }
    New-Item -ItemType Directory -Path $releaseRoot | Out-Null
    $sourceRevision = (& git rev-parse HEAD) -join ''
    if ($LASTEXITCODE -ne 0) { throw '读取 Git 提交失败' }
    $sourceStatus = @(& git status --porcelain)
    if ($LASTEXITCODE -ne 0) { throw '读取 Git 状态失败' }
    if ($sourceStatus.Count) { Write-Warning '当前源码含未提交改动，发布清单将记录此状态，不自动提交或打标签。' }
    if ($InstallDependencies) { Invoke-Checked 'npm.cmd' @('ci') }
    Invoke-Checked 'npm.cmd' @('test')

    $legalRoot = Join-Path $releaseRoot 'licenses'
    $inventory = [Collections.Generic.List[object]]::new()
    $missing = [Collections.Generic.List[string]]::new()
    $licenseSources = Get-Content -LiteralPath (Join-Path $repoRoot 'installer/licenses/sources.json') -Raw | ConvertFrom-Json -AsHashtable
    $npmPaths = @(& npm.cmd ls --omit=dev --all --parseable)
    if ($LASTEXITCODE -ne 0) { throw 'npm 依赖树检查失败' }
    foreach ($packageRoot in $npmPaths) {
        if ($packageRoot -eq $repoRoot) { continue }
        $package = Get-Content -LiteralPath (Join-Path $packageRoot 'package.json') -Raw | ConvertFrom-Json
        $license = if ($package.PSObject.Properties['license']) { [string]$package.license } else { '未声明' }
        Collect-Licenses $packageRoot $package.name $package.version $license 'npm'
    }
    $cargoJson = & cargo metadata --manifest-path src-tauri/Cargo.toml --locked --format-version 1 --filter-platform x86_64-pc-windows-msvc
    if ($LASTEXITCODE -ne 0) { throw 'Cargo 依赖信息读取失败' }
    $cargo = $cargoJson | ConvertFrom-Json
    $app = @($cargo.packages | Where-Object name -eq 'pduloom')[0]
    if ($app.version -ne $Version -or $app.license -ne 'Apache-2.0') { throw 'Cargo 版本或许可证不一致' }
    foreach ($package in $cargo.packages) {
        if ($package.id -eq $app.id) { continue }
        $packageRoot = Split-Path -Parent $package.manifest_path
        $vcsPath = Join-Path $packageRoot '.cargo_vcs_info.json'
        $vcsCommit = if (Test-Path -LiteralPath $vcsPath) { (Get-Content -LiteralPath $vcsPath -Raw | ConvertFrom-Json).git.sha1 } else { '' }
        Collect-Licenses $packageRoot $package.name $package.version ([string]$package.license) 'cargo' ([string]$package.license_file) $vcsCommit
    }
    Save-Json @($inventory.ToArray()) (Join-Path $releaseRoot 'third-party-inventory.json')
    [IO.File]::WriteAllLines((Join-Path $releaseRoot 'license-review.txt'), $missing.ToArray(), [Text.UTF8Encoding]::new($false))
    if ($missing.Count) { throw "$($missing.Count) 个依赖缺少许可证全文，详见 license-review.txt；补齐后再制作发布包。" }

    $resources = @{}
    foreach ($name in @('LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'RELEASE.md')) {
        $resources[(Join-Path $repoRoot $name)] = $name
    }
    $resources[$legalRoot + '/'] = 'licenses/'
    $resources[(Join-Path $repoRoot 'docs/images') + '/'] = 'docs/images/'
    $resources[(Join-Path $releaseRoot 'third-party-inventory.json')] = 'third-party-inventory.json'
    $resources[(Join-Path $releaseRoot 'license-review.txt')] = 'license-review.txt'
    $installerIcon = Join-Path $repoRoot 'src-tauri/icons/PduLoom.ico'
    if (!(Test-Path -LiteralPath $installerIcon -PathType Leaf)) { throw "安装器图标不存在：$installerIcon" }
    foreach ($mode in @('online', 'offline')) {
        $config = @{ bundle = @{ targets = @('nsis'); resources = $resources; windows = @{ webviewInstallMode = @{ type = $(if ($mode -eq 'online') { 'downloadBootstrapper' } else { 'offlineInstaller' }) }; nsis = @{ installerIcon = $installerIcon; uninstallerIcon = $installerIcon; installMode = 'currentUser'; languages = @('SimpChinese', 'English'); displayLanguageSelector = $true } } } }
        Save-Json $config (Join-Path $releaseRoot "$mode.json")
    }
    if ($PrepareOnly) { Write-Host "发布资料准备完成，许可证缺失数：$($missing.Count)；目录：$releaseRoot"; return }
    # 只编译一次，两个安装包复用相同程序；资源配置在编译与打包时保持一致。
    Invoke-Checked 'npx.cmd' @('--no-install', 'tauri', 'build', '--no-bundle', '--ci', '--config', (Join-Path $releaseRoot 'online.json'), '--', '--locked')
    $binaryRoot = Join-Path ([string]$cargo.target_directory) 'release'
    $exe = Join-Path $binaryRoot 'PduLoom.exe'
    if (!(Test-Path -LiteralPath $exe)) { throw '未找到本次编译的程序' }
    $bundleRoot = Join-Path $binaryRoot 'bundle/nsis'
    foreach ($mode in @('online', 'offline')) {
        $started = Get-Date
        Invoke-Checked 'npx.cmd' @('--no-install', 'tauri', 'bundle', '--bundles', 'nsis', '--ci', '--config', (Join-Path $releaseRoot "$mode.json"))
        $installers = @(Get-ChildItem -LiteralPath $bundleRoot -Filter '*-setup.exe' -File | Where-Object { $_.LastWriteTime -ge $started.AddSeconds(-2) })
        if ($installers.Count -ne 1) { throw '无法唯一确认本次生成的安装包，拒绝收集旧产物' }
        $suffix = if ($mode -eq 'online') { 'setup' } else { 'offline-setup' }
        Copy-Item -LiteralPath $installers[0].FullName -Destination (Join-Path $releaseRoot "PduLoom-v$Version-win64-$suffix.exe")
    }
    $portable = Join-Path $releaseRoot "PduLoom-v$Version-win64-portable"
    New-Item -ItemType Directory -Path $portable | Out-Null
    Copy-Item -LiteralPath $exe -Destination $portable
    foreach ($name in @('LICENSE', 'NOTICE', 'README.md', 'CHANGELOG.md', 'RELEASE.md')) {
        Copy-Item -LiteralPath (Join-Path $repoRoot $name) -Destination $portable
        Copy-Item -LiteralPath (Join-Path $repoRoot $name) -Destination $releaseRoot
    }
    Copy-Item -LiteralPath $legalRoot -Destination $portable -Recurse
    Copy-Item -LiteralPath (Join-Path $repoRoot 'docs') -Destination $portable -Recurse
    Copy-Item -LiteralPath (Join-Path $releaseRoot 'third-party-inventory.json') -Destination $portable
    Copy-Item -LiteralPath (Join-Path $releaseRoot 'license-review.txt') -Destination $portable
    Compress-Archive -LiteralPath $portable -DestinationPath (Join-Path $releaseRoot "PduLoom-v$Version-win64-portable.zip")
    $artifacts = @(Get-ChildItem -LiteralPath $releaseRoot -File | Where-Object Extension -in @('.exe', '.zip'))
    $hashes = @($artifacts | ForEach-Object { "$( (Get-FileHash -LiteralPath $_.FullName -Algorithm SHA256).Hash.ToLowerInvariant())  $($_.Name)" })
    [IO.File]::WriteAllLines((Join-Path $releaseRoot 'SHA256SUMS.txt'), $hashes, [Text.UTF8Encoding]::new($false))
    Save-Json @{ version = $Version; publisher = 'ShyHiker'; sourceCommit = $sourceRevision; sourceChanges = $sourceStatus; sourceClean = ($sourceStatus.Count -eq 0); builtAt = (Get-Date).ToUniversalTime().ToString('o'); architecture = 'x86_64-pc-windows-msvc'; node = (& node --version); rust = $rustInfo; licenseReviewRequired = ($missing.Count -gt 0); installedVerification = '未执行'; artifacts = @($artifacts | ForEach-Object { @{ name = $_.Name; size = $_.Length } }) } (Join-Path $releaseRoot 'release-manifest.json')
    Write-Host "三种发布包已生成：$releaseRoot"
    Write-Host '尚需安装、运行及卸载验证；脚本未修改 Git 提交或标签。'
}
finally { Pop-Location }
