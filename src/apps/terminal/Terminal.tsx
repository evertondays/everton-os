import { type KeyboardEvent, type ReactNode, useEffect, useRef, useState } from 'react'
import { track } from '../../analytics.ts'
import {
  type Entry,
  VfsError,
  basename,
  fsErrorMessage,
  isInTrash,
  isOwn,
  joinPath,
  setLocale,
  setTheme,
  splitPath,
  useAppWindow,
  useLocale,
  useOS,
  useResume,
  useT,
} from '../../sdk/index.ts'

interface Line {
  id: number
  /** The prompt and command that were typed, if this entry is a command. */
  prompt?: string
  command?: string
  output?: ReactNode
}

type Output = ReactNode | void
type Command = (args: string[]) => Output | Promise<Output>

const HOST = 'everton-os'

const plain = (text: string) =>
  text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()

/** Splits a command line into words; quotes keep spaces in: `cat "Nova pasta/notas.txt"`. */
function words(line: string): string[] {
  const found: string[] = []
  const pattern = /"([^"]*)"|'([^']*)'|(\S+)/g
  for (let match = pattern.exec(line); match; match = pattern.exec(line)) found.push(match[1] ?? match[2] ?? match[3])
  return found
}

const isFlag = (arg: string) => /^-[a-z]+$/i.test(arg)

const pad = (value: number) => String(value).padStart(2, '0')

const formatStamp = (time: number) => {
  const date = new Date(time)
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

const formatBytes = (bytes: number) => {
  const units = ['B', 'K', 'M', 'G', 'T']
  let value = bytes
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value >= 10 || unit === 0 ? Math.round(value) : value.toFixed(1)}${units[unit]}`
}

export default function TerminalApp() {
  const t = useT()
  const locale = useLocale()
  const os = useOS()
  const { fs } = os
  fs.useWatch()
  const appWindow = useAppWindow()
  const resume = useResume()
  const [entries, setEntries] = useState<Line[]>(() => [{ id: 0, output: t('terminal.welcome') }])
  const [input, setInput] = useState('')
  const [cwd, setCwd] = useState('/')
  const typed = useRef<string[]>([])
  const cursor = useRef(0)
  const nextId = useRef(1)
  const field = useRef<HTMLInputElement>(null)
  const screen = useRef<HTMLDivElement>(null)

  const user = plain(resume.basics.name.split(' ')[0])

  // The Terminal shows real names; the home folder is `~`.
  const displayPath = (path: string) => (path === '/' ? '~' : `~${path}`)
  const prompt = `${user}@${HOST}:${displayPath(cwd)}$`

  useEffect(() => {
    screen.current?.scrollTo({ top: screen.current.scrollHeight })
  }, [entries])

  // The folder may have been deleted or moved from elsewhere: back home.
  const here = fs.lookup(cwd)?.inode.kind === 'dir' ? cwd : '/'

  /** What a typed path names: real names first, then (only here) the names people see, ignoring case and accents. */
  const lookup = (path: string, follow = true) => fs.lookup(path, { cwd: here, lenient: true, follow })

  /** The absolute path a new `target` would have: its folder resolved (leniently), its name as typed. */
  const absolute = (target: string) => {
    const [folder, name] = splitPath(target)
    const dir = lookup(folder)
    if (!dir) throw new VfsError('ENOENT', folder)
    return joinPath(dir.path, name)
  }

  const operand = (args: string[]) => args.filter((arg) => !isFlag(arg)).join(' ')
  const operands = (args: string[]) => args.filter((arg) => !isFlag(arg))
  const hasFlag = (args: string[], flag: string) => args.some((arg) => isFlag(arg) && arg.includes(flag))

  /** Runs a file operation; if it's refused, the reason is the command's output. */
  const attempt = async (command: string, action: () => Promise<Output>): Promise<Output> => {
    try {
      return await action()
    } catch (caught) {
      return `${command}: ${fsErrorMessage(t, caught)}`
    }
  }

  const mode = (entry: Entry) => {
    const { kind, layer } = entry.inode
    if (kind === 'symlink') return 'lrwxrwxrwx'
    if (kind === 'dir') return `d${fs.canCreateIn(entry.path) ? 'rwx' : 'r-x'}r-xr-x`
    return `-${layer === 'upper' ? 'rw-' : 'r--'}r--r--`
  }

  const nameOf = (entry: Entry) => (
    <span className={entry.inode.kind === 'dir' ? 'terminal-dir' : entry.inode.kind === 'symlink' ? 'terminal-link' : undefined}>
      {entry.name}
      {entry.inode.kind === 'dir' && '/'}
    </span>
  )

  const longLine = (entry: Entry) => (
    <div key={entry.path}>
      {mode(entry)} {String(entry.inode.size ?? '-').padStart(7)} {formatStamp(entry.inode.mtime)} {nameOf(entry)}
      {entry.inode.kind === 'symlink' && ` -> ${fs.readlink(entry.path)}`}
    </div>
  )

  const listing = (list: Entry[]) => (
    <span className="terminal-listing">
      {list.map((entry) => (
        <span key={entry.path}>{nameOf(entry)}</span>
      ))}
    </span>
  )

  const commands: Record<string, Command> = {
    help: () => t('terminal.help'),
    whoami: () => `${resume.basics.name} — ${resume.basics.label}\n${resume.basics.summary}`,
    pwd: () => `/home/${user}${here === '/' ? '' : here}`,
    ls: (args) => {
      const target = operand(args) || '.'
      const entry = lookup(target)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      const long = hasFlag(args, 'l')
      if (entry.inode.kind !== 'dir') return long ? longLine(lookup(target, false)!) : entry.name
      const list = fs.readdir(entry.path, { all: hasFlag(args, 'a') })
      return long ? <div>{list.map(longLine)}</div> : listing(list)
    },
    cd: (args) => {
      const target = args.join(' ') || '/'
      const entry = lookup(target)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      if (entry.inode.kind !== 'dir') return t('terminal.notDir', { name: target })
      setCwd(entry.path)
    },
    cat: (args) => {
      const target = args.join(' ')
      if (!target) return t('terminal.usage', { usage: 'cat <file>' })
      const entry = lookup(target)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      if (entry.inode.kind === 'dir') return t('terminal.isDir', { name: target })
      return attempt('cat', async () => {
        const content = await fs.readFile(entry.path)
        return typeof content === 'string' ? content : t('terminal.binary', { name: entry.name })
      })
    },
    'xdg-open': (args) => {
      const target = args.join(' ')
      // Nothing to open: the file manager, here.
      if (!target) {
        os.exec('files', { files: [here] }, 'terminal')
        return
      }
      const app = os.apps.list().find((item) => item.id === target || plain(item.name) === plain(target))
      if (app) {
        os.exec(app.id, {}, 'terminal')
        return
      }
      if (/^https?:\/\//i.test(target)) {
        os.openUrl(target, 'terminal')
        return
      }
      const entry = lookup(target, false)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      return attempt('xdg-open', () => os.openFile(entry.path, 'terminal'))
    },
    stat: (args) => {
      const target = operand(args)
      if (!target) return t('terminal.usage', { usage: 'stat <path>' })
      const entry = lookup(target, false)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      const { inode } = entry
      return [
        `  File: ${entry.path}${inode.kind === 'symlink' ? ` -> ${fs.readlink(entry.path)}` : ''}`,
        ...(entry.displayName !== entry.name ? [`  Name: ${entry.displayName}`] : []),
        `  Size: ${inode.size ?? '-'}\tType: ${inode.kind}\tMime: ${entry.mime}`,
        ` Inode: ${inode.ino}\tLayer: ${inode.layer === 'upper' ? fs.mounts().upper : fs.mounts().lower}`,
        `Access: ${mode(entry)}${inode.flags?.length ? `\tFlags: ${inode.flags.join(',')}` : ''}`,
        `Modify: ${formatStamp(inode.mtime)}`,
        ` Birth: ${formatStamp(inode.ctime)}`,
      ].join('\n')
    },
    file: (args) => {
      const target = operand(args)
      if (!target) return t('terminal.usage', { usage: 'file <path>' })
      const entry = lookup(target, false)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      if (entry.inode.kind === 'dir') return `${entry.name}: directory`
      if (entry.inode.kind === 'symlink') return `${entry.name}: symbolic link to ${fs.readlink(entry.path)}`
      return `${entry.name}: ${entry.mime}`
    },
    readlink: (args) => {
      const target = operand(args)
      if (!target) return t('terminal.usage', { usage: 'readlink <path>' })
      const entry = lookup(target, false)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      if (entry.inode.kind !== 'symlink') return t('terminal.notLink', { name: target })
      return fs.readlink(entry.path)
    },
    ln: (args) => {
      const [target, name = basename(target ?? '')] = operands(args)
      if (!hasFlag(args, 's') || !target) return t('terminal.usage', { usage: 'ln -s <target> [name]' })
      return attempt('ln', async () => void (await fs.symlink(target, absolute(name))))
    },
    mv: (args) => {
      const [from, to] = operands(args)
      if (!from || !to) return t('terminal.usage', { usage: 'mv <from> <to>' })
      const source = lookup(from, false)
      if (!source) return t('terminal.noSuchFile', { name: from })
      const dest = lookup(to)
      return attempt('mv', async () => {
        if (dest?.inode.kind === 'dir') await fs.move([source.path], dest.path, { unique: false })
        else await fs.rename(source.path, absolute(to))
      })
    },
    ps: () =>
      [
        '  PID APP          STARTED',
        ...os.ps().map(
          (process) =>
            `${String(process.pid).padStart(5)} ${process.appId.padEnd(12)} ${formatStamp(process.startedAt).slice(11)}`,
        ),
      ].join('\n'),
    kill: ([value]) => {
      if (!value) return t('terminal.usage', { usage: 'kill <pid>' })
      const pid = Number(value)
      const process = os.ps().find((other) => other.pid === pid)
      if (!process) return t('terminal.noProcess', { pid: value })
      track('process_killed', { app: process.appId })
      os.kill(pid)
    },
    mount: () => {
      const { lower, upper } = fs.mounts()
      return `overlay on / type overlayfs (lowerdir=${lower},upperdir=${upper})`
    },
    df: async () => {
      const { upper } = fs.mounts()
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined)
      const header = 'Filesystem      Size   Used  Avail Use% Mounted on'
      if (!estimate?.quota) return `${header}\n${upper.padEnd(15)}    -      -      -    - /`
      const used = estimate.usage ?? 0
      const percent = `${Math.ceil((used / estimate.quota) * 100)}%`
      return `${header}\n${upper.padEnd(15)} ${formatBytes(estimate.quota).padStart(5)} ${formatBytes(used).padStart(6)} ${formatBytes(
        estimate.quota - used,
      ).padStart(6)} ${percent.padStart(4)} /`
    },
    skills: () => resume.skills.map((group) => `${group.name.padEnd(14)} ${group.keywords.join(', ')}`).join('\n'),
    contato: () => {
      track('contact_details_viewed', { source: 'terminal' })
      return [
        `E-mail    ${resume.basics.email}`,
        ...resume.basics.profiles.map((profile) => `${profile.network.padEnd(9)} ${profile.url}`),
      ].join('\n')
    },
    neofetch: () => void os.exec('system', {}, 'terminal'),
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
    mkdir: (args) => {
      const target = operand(args)
      if (!target) return t('terminal.usage', { usage: 'mkdir [-p] <folder>' })
      return attempt('mkdir', async () => {
        if (!hasFlag(args, 'p')) {
          await fs.mkdir(absolute(target))
          return
        }
        // -p: every missing folder along the way, and no complaint about the ones that exist.
        let at = target.startsWith('/') ? '/' : here
        for (const segment of target.split('/').filter(Boolean)) {
          const existing = fs.lookup(segment, { cwd: at, lenient: true })
          if (!existing) at = await fs.mkdir(joinPath(at, segment))
          else if (existing.inode.kind !== 'dir') throw new VfsError('ENOTDIR', segment)
          else at = existing.path
        }
      })
    },
    touch: (args) => {
      const target = operand(args)
      if (!target) return t('terminal.usage', { usage: 'touch <file>' })
      const existing = lookup(target, false)
      return attempt('touch', async () => void (await fs.touch(existing ? existing.path : absolute(target))))
    },
    editor: (args) => {
      const target = args.join(' ')
      if (!target) {
        os.exec('editor', {}, 'terminal')
        return
      }
      return attempt('editor', async () => {
        // Like `nano new.txt`: a file that doesn't exist yet is created.
        const path = lookup(target)?.path ?? (await fs.create(absolute(target)))
        const entry = fs.lookup(path)!
        if (entry.inode.kind === 'dir') return t('terminal.isDir', { name: target })
        if (!os.apps.forMime(entry.mime).some((app) => app.id === 'editor')) {
          return t('terminal.notText', { name: entry.name })
        }
        os.exec('editor', { files: [entry.path] }, 'terminal')
      })
    },
    rm: (args) => {
      const target = operand(args)
      if (!target) return t('terminal.usage', { usage: 'rm [-r] <path>' })
      const entry = lookup(target, false)
      if (!entry) return t('terminal.noSuchFile', { name: target })
      if (!isOwn(entry)) return t('terminal.rm')
      if (entry.inode.kind === 'dir' && !hasFlag(args, 'r')) return t('terminal.rmDir', { name: target })
      // Out of the Trash it's gone for good; anywhere else it goes to the Trash.
      return attempt('rm', async () => void (await (isInTrash(entry.path) ? fs.remove([entry.path]) : fs.trash([entry.path]))))
    },
  }
  commands.open = commands['xdg-open']
  commands.contact = commands.contato

  const run = (line: string) => {
    const [name, ...args] = words(line)
    const entry: Line = { id: nextId.current++, prompt, command: line }
    if (name) {
      typed.current.push(line.trim())
      const command = commands[name]
      // Only the command's name: its arguments are whatever the visitor typed.
      track('terminal_command_run', { command: name.slice(0, 32), known: command !== undefined })
      const output = command ? command(args) : t('terminal.notFound', { command: name })
      // `clear` has already emptied the screen; don't add its own line back.
      if (name === 'clear') return
      if (output instanceof Promise) {
        // Its output takes its place when it's ready.
        void output.then(
          (result) => setEntries((list) => list.map((other) => (other.id === entry.id ? { ...other, output: result ?? undefined } : other))),
        )
      } else {
        entry.output = output ?? undefined
      }
    }
    setEntries((list) => [...list, entry])
  }

  const complete = () => {
    const parts = input.split(' ')
    const last = parts.pop() ?? ''
    let names: string[]
    let prefix = ''
    let partial = last
    if (parts.length === 0) {
      names = Object.keys(commands)
    } else {
      // Paths complete one folder at a time: `cd proj<Tab>` → `cd projects/`.
      const slash = last.lastIndexOf('/')
      prefix = slash === -1 ? '' : last.slice(0, slash + 1)
      partial = last.slice(slash + 1)
      const dir = lookup(prefix || '.')
      names =
        dir?.inode.kind === 'dir'
          ? fs.readdir(dir.path, { all: partial.startsWith('.') }).map((entry) => `${entry.name}${entry.inode.kind === 'dir' ? '/' : ''}`)
          : []
    }
    const matches = names.filter((name) => name.startsWith(partial))
    if (matches.length === 1) setInput([...parts, `${prefix}${matches[0]}`].join(' '))
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
          aria-label={os.apps.get('terminal')?.name}
        />
      </label>
    </div>
  )
}
