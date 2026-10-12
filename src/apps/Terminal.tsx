import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { track } from '../analytics.ts'
import { useResume } from '../data/resume.ts'
import { useLocale, useT } from '../i18n/index.ts'
import { appList } from '../system/apps.ts'
import { resumeText } from '../system/content.ts'
import { type FsNode, chainPath, useFs, visibleChildren, walk } from '../system/fs.ts'
import { openNode, useAppWindow, useOS } from '../system/os.ts'
import { setLocale, setTheme } from '../system/settings.ts'

interface Entry {
  id: number
  /** The prompt and command that were typed, if this entry is a command. */
  prompt?: string
  command?: string
  output?: ReactNode
}

type Command = (args: string[]) => ReactNode | void

const HOST = 'everton-os'

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

export default function TerminalApp() {
  const t = useT()
  const locale = useLocale()
  const fs = useFs()
  const os = useOS()
  const appWindow = useAppWindow()
  const resume = useResume()
  const [entries, setEntries] = useState<Entry[]>(() => [{ id: 0, output: t('terminal.welcome') }])
  const [input, setInput] = useState('')
  const [cwd, setCwd] = useState('/')
  const typed = useRef<string[]>([])
  const cursor = useRef(0)
  const nextId = useRef(1)
  const field = useRef<HTMLInputElement>(null)
  const screen = useRef<HTMLDivElement>(null)

  const user = plain(resume.basics.name.split(' ')[0])

  const displayPath = (path: string) => {
    const names = (walk(fs, path) ?? [fs]).slice(1).map((node) => node.name)
    return ['~', ...names].join('/')
  }
  const prompt = `${user}@${HOST}:${displayPath(cwd)}$`

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight })
  }, [entries])

  const listing = (nodes: FsNode[]) => (
    <span className="terminal-listing">
      {nodes.map((node) => (
        <span key={node.id} className={node.kind === 'dir' ? 'terminal-dir' : undefined}>
          {node.name}
          {node.kind === 'dir' && '/'}
        </span>
      ))}
    </span>
  )

  const commands: Record<string, Command> = {
    help: () => t('terminal.help'),
    whoami: () => `${resume.basics.name} — ${resume.basics.label}\n${resume.basics.summary}`,
    pwd: () => displayPath(cwd).replace('~', `/home/${user}`),
    ls: (args) => {
      const all = args.includes('-a')
      const target = args.filter((arg) => !arg.startsWith('-')).join(' ') || '.'
      const node = walk(fs, target, cwd)?.at(-1)
      if (!node) return t('terminal.noSuchFile', { name: target })
      if (node.kind === 'file') return node.name
      return listing(all ? node.children : visibleChildren(node))
    },
    cd: (args) => {
      const target = args.join(' ') || '/'
      const chain = walk(fs, target, cwd)
      if (!chain) return t('terminal.noSuchFile', { name: target })
      if (chain.at(-1)!.kind !== 'dir') return t('terminal.notDir', { name: target })
      setCwd(chainPath(chain))
    },
    cat: (args) => {
      const target = args.join(' ')
      if (!target) return t('terminal.usage', { usage: 'cat <file>' })
      const node = walk(fs, target, cwd)?.at(-1)
      if (!node) return t('terminal.noSuchFile', { name: target })
      if (node.kind === 'dir') return t('terminal.isDir', { name: target })
      if (node.type === 'resume') return resumeText(resume, locale)
      if (node.type === 'link') return node.url
      if (node.type === 'image') return t('terminal.binary', { name: node.name })
      return node.content
    },
    open: (args) => {
      const target = args.join(' ')
      if (!target) return t('terminal.usage', { usage: 'open <app|file>' })
      const app = appList.find((item) => item.id === target || plain(t(item.name)) === plain(target))
      if (app) {
        os.open(app.id, 'terminal')
        return
      }
      const chain = walk(fs, target, cwd)
      if (!chain) return t('terminal.noSuchFile', { name: target })
      openNode(os, chain.at(-1)!, chainPath(chain), 'terminal')
    },
    skills: () => resume.skills.map((group) => `${group.name.padEnd(14)} ${group.keywords.join(', ')}`).join('\n'),
    contato: () => {
      track('contact_details_viewed', { source: 'terminal' })
      return [
        `E-mail    ${resume.basics.email}`,
        ...resume.basics.profiles.map((profile) => `${profile.network.padEnd(9)} ${profile.url}`),
      ].join('\n')
    },
    neofetch: () => os.open('system', 'terminal'),
    date: () => new Date().toLocaleString(locale === 'pt' ? 'pt-BR' : 'en-US'),
    echo: (args) => args.join(' '),
    history: () => typed.current.map((line, index) => `${String(index + 1).padStart(3)}  ${line}`).join('\n'),
    lang: ([value]) => {
      if (value !== 'pt' && value !== 'en') return t('terminal.usage', { usage: 'lang <pt|en>' })
      setLocale(value, 'terminal')
    },
    theme: ([value]) => {
      if (value !== 'light' && value !== 'dark') return t('terminal.usage', { usage: 'theme <light|dark>' })
      setTheme(value, 'terminal')
    },
    clear: () => setEntries([]),
    exit: () => appWindow.close(),
    sudo: () => t('terminal.sudo', { user }),
    rm: () => t('terminal.rm'),
  }
  commands.contact = commands.contato

  const run = (line: string) => {
    const [name, ...args] = line.trim().split(/\s+/)
    const entry: Entry = { id: nextId.current++, prompt, command: line }
    if (name) {
      typed.current.push(line.trim())
      const command = commands[name]
      // Only the command's name: its arguments are whatever the visitor typed.
      track('terminal_command_run', { command: name.slice(0, 32), known: command !== undefined })
      const output = command ? command(args) : t('terminal.notFound', { command: name })
      // `clear` has already emptied the screen; don't add its own line back.
      if (name === 'clear') return
      entry.output = output ?? undefined
    }
    setEntries((list) => [...list, entry])
  }

  const complete = () => {
    const parts = input.split(' ')
    const last = parts.pop() ?? ''
    const cwdNode = walk(fs, cwd)?.at(-1)
    const names =
      parts.length === 0
        ? Object.keys(commands)
        : cwdNode?.kind === 'dir'
          ? visibleChildren(cwdNode).map((node) => node.name)
          : []
    const matches = names.filter((name) => plain(name).startsWith(plain(last)))
    if (matches.length === 1) setInput([...parts, matches[0]].join(' '))
  }

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      run(input)
      setInput('')
      cursor.current = typed.current.length
    } else if (event.key === 'Tab') {
      event.preventDefault()
      complete()
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      event.preventDefault()
      const next = cursor.current + (event.key === 'ArrowUp' ? -1 : 1)
      cursor.current = Math.max(0, Math.min(typed.current.length, next))
      setInput(typed.current[cursor.current] ?? '')
    }
  }

  return (
    <div
      className="app terminal"
      ref={screen}
      onClick={() => {
        // Keep text selectable: only refocus when the click wasn't a selection.
        if (!window.getSelection()?.toString()) field.current?.focus()
      }}
    >
      {entries.map((entry) => (
        <div key={entry.id} className="terminal-entry">
          {entry.command !== undefined && (
            <div>
              <span className="terminal-prompt">{entry.prompt}</span> {entry.command}
            </div>
          )}
          {entry.output !== undefined && <div className="terminal-output">{entry.output}</div>}
        </div>
      ))}
      <label className="terminal-line">
        <span className="terminal-prompt">{prompt}</span>
        <input
          ref={field}
          autoFocus
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={onKeyDown}
          spellCheck={false}
          autoCapitalize="off"
          autoComplete="off"
          aria-label={t('app.terminal')}
        />
      </label>
    </div>
  )
}
