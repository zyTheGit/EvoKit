class Evokit < Formula
  desc "Self-Evolving System Framework for AI Coding Assistants"
  homepage "https://github.com/zyTheGit/EvoKit"
  license "MIT"
  depends_on "node"

  url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.6.4.tgz"
  sha256 "36a611f0f7a1b81ffee050a82662c489acee20efe3b5ee97f87b1b90b9f29b35"

  def install
    system "npm", "install", *std_npm_args(prefix: false)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/evokit", "--version"
  end
end
