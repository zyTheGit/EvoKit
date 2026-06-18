# EvoKit 的 Homebrew Tap

EvoKit 可通过 Homebrew 使用自定义 tap 进行安装。✅ 已在 Homebrew 上线！

## 安装步骤

```bash
# 添加 tap
brew tap zyTheGit/homebrew-evokit

# 安装
brew install evokit
```

## 验证

```bash
evokit --version  # → 0.4.1
evokit doctor
```

## 创建 Tap Formula

Homebrew tap 仓库（`homebrew-evokit`）应在 `Formula/evokit.rb` 中包含一个 formula：

```ruby
class Evokit < Formula
  desc "AI 编码助手的自进化系统框架"
  homepage "https://github.com/zyTheGit/EvoKit"
  license "MIT"

  depends_on "node"

  on_macos do
    url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.4.1.tgz"
    sha256 "<npm-package-sha>"
  end

  on_linux do
    url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.4.1.tgz"
    sha256 "<npm-package-sha>"
  end

  def install
    system "npm", "install", *std_npm_args
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/evokit", "--version"
  end
end
```

## 更新

当新版本发布时，使用更新脚本：

```bash
bash scripts/update-homebrew.sh 0.4.1
```

或手动操作：

1. 下载 npm tarball：`npm pack @zythegit/evokit`
2. 获取 SHA256：`shasum -a 256 evokit-*.tgz`
3. 使用新版本和 SHA 更新 formula
4. 推送到 `zyTheGit/homebrew-evokit`

## 系统要求

- **需要 Node.js 18+**。如果系统中未安装，Homebrew 将自动安装。
- 支持 macOS 和 Linux（包括 WSL）。
