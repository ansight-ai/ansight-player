import { GithubLogo } from '../icons'

export function GithubRepositoryBadge() {
  return (
    <a
      aria-label="View ansight-cli source code on GitHub"
      className="ansight-github-badge"
      href="https://github.com/ansight-ai/ansight-cli"
      rel="noopener noreferrer"
      target="_blank"
    >
      <GithubLogo aria-hidden="true" size={16} />
      <span>GitHub</span>
    </a>
  )
}
