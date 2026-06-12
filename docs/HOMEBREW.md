# Homebrew Tap for EvoKit

EvoKit can be installed via Homebrew using a custom tap. ✅ Live on Homebrew!

## Setup

```bash
# Add the tap
brew tap zyTheGit/homebrew-evokit

# Install
brew install evokit
```

## Verify

```bash
evokit --version  # → 0.2.0
evokit doctor
```

## Creating the Tap Formula

The Homebrew tap repository (`homebrew-evokit`) should contain a formula at `Formula/evokit.rb`:

```ruby
class Evokit < Formula
  desc "Self-Evolving System Framework for AI Coding Assistants"
  homepage "https://github.com/zyTheGit/EvoKit"
  license "MIT"

  depends_on "node"

  on_macos do
    url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.2.0.tgz"
    sha256 "<npm-package-sha>"
  end

  on_linux do
    url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.2.0.tgz"
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

## Updating

When a new version is released, use the update script:

```bash
bash scripts/update-homebrew.sh 0.2.1
```

Or manually:

1. Download the npm tarball: `npm pack @zythegit/evokit`
2. Get the SHA256: `shasum -a 256 evokit-*.tgz`
3. Update the formula with the new version and SHA
4. Push to `zyTheGit/homebrew-evokit`

## Requirements

- **Node.js 18+** is required. Homebrew will install it automatically if not present.
- Works on macOS and Linux (including WSL).
