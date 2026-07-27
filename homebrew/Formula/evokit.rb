class Evokit < Formula
  desc "Self-Evolving System Framework for AI Coding Assistants"
  homepage "https://github.com/zyTheGit/EvoKit"
  license "MIT"
  depends_on "node"

  url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.6.8.tgz"
  sha256 "2897b64030cf17f1b0813bb128ff8286244fc326e05edb8779d5c997de401aa3"

  def install
    system "npm", "install", *std_npm_args(prefix: false)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/evokit", "--version"
  end
end
