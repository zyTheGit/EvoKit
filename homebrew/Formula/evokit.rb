class Evokit < Formula
  desc "Self-Evolving System Framework for AI Coding Assistants"
  homepage "https://github.com/zyTheGit/EvoKit"
  license "MIT"
  depends_on "node"

  url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.2.1.tgz"
  sha256 "205d1980b01a26575e4180a011fe2b5040c1214fa82c611df87486e39f602555"

  def install
    system "npm", "install", *std_npm_args(prefix: false)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/evokit", "--version"
  end
end
