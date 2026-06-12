class Evokit < Formula
  desc "Self-Evolving System Framework for AI Coding Assistants"
  homepage "https://github.com/zyTheGit/EvoKit"
  license "MIT"
  depends_on "node"

  url "https://registry.npmjs.org/@zythegit/evokit/-/evokit-0.2.0.tgz"
  sha256 "09510d8c439007b94ff85896fb689a137f4c2ef5"

  def install
    system "npm", "install", *std_npm_args(prefix: false)
    bin.install_symlink Dir["#{libexec}/bin/*"]
  end

  test do
    system "#{bin}/evokit", "--version"
  end
end
