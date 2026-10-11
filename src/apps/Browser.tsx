import { ArrowLeft, ArrowRight, ExternalLink, Globe, House, Plus, RotateCw, X } from 'lucide-react'
import { type FormEvent, useEffect, useRef, useState } from 'react'
import { useResume } from '../data/resume.ts'
import { useLocale, useT } from '../i18n/index.ts'
import type { AppProps } from '../system/apps.ts'
import { classicUrl } from '../system/media.ts'
import { useAppWindow } from '../system/os.ts'

// Most big sites refuse to load inside an iframe, and the page would just stay
// blank. So the browser only frames the sites it knows will work (the projects'
// demos and the bookmarks in curriculo.json) and offers a real tab for the rest.

const HOME = 'about:home'

interface Tab {
  id: number
  /** Addresses visited in this tab, and where in that list it is now. */
  history: string[]
  index: number
  /** Bumped to force the frame to load again. */
  reloads: number
}

interface Site {
  name: string
  url: string
}

function toUrl(input: string): string {
  const text = input.trim()
  if (!text || text === HOME) return HOME
  if (/^https?:\/\//i.test(text)) return text
  if (/^[\w-]+(\.[\w-]+)+(\/|$)/.test(text)) return `https://${text}`
  return `https://duckduckgo.com/?q=${encodeURIComponent(text)}`
}

const hostname = (url: string) => {
  try {
    return new URL(url).hostname
  } catch {
    return url
  }
}

function AddressBar({ url, onSubmit }: { url: string; onSubmit(address: string): void }) {
  const t = useT()
  const [address, setAddress] = useState(url)

  const submit = (event: FormEvent) => {
    event.preventDefault()
    onSubmit(address)
  }

  return (
    <form className="browser-address" onSubmit={submit}>
      <input
        value={address}
        onChange={(event) => setAddress(event.target.value)}
        onFocus={(event) => event.target.select()}
        placeholder={t('browser.address')}
        aria-label={t('browser.address')}
        spellCheck={false}
        autoCapitalize="off"
      />
    </form>
  )
}

export default function Browser({ args }: AppProps) {
  const t = useT()
  const locale = useLocale()
  const appWindow = useAppWindow()
  const resume = useResume()
  const nextId = useRef(1)
  const [tabs, setTabs] = useState<Tab[]>(() => [
    { id: 0, history: [args?.url ? toUrl(args.url) : HOME], index: 0, reloads: 0 },
  ])
  const [activeId, setActiveId] = useState(0)
  const active = tabs.find((tab) => tab.id === activeId) ?? tabs[0]
  const url = active.history[active.index]

  const sites: Site[] = [
    ...resume.projects.filter((project) => project.demo).map((project) => ({ name: project.name, url: project.demo! })),
    ...resume.meta.bookmarks,
    { name: t('common.classic'), url: new URL(classicUrl(locale), window.location.href).href },
  ].filter((site, index, list) => list.findIndex((other) => other.url === site.url) === index)

  const canFrame = (target: string) => {
    const host = hostname(target)
    return sites.some((site) => {
      const allowed = hostname(site.url)
      return host === allowed || host.endsWith(`.${allowed}`)
    })
  }

  const title = (target: string) => (target === HOME ? t('browser.newTab') : hostname(target))

  useEffect(() => {
    appWindow.setTitle(url === HOME ? t('app.browser') : hostname(url))
  }, [appWindow, url, t])

  const patch = (change: (tab: Tab) => Partial<Tab>) =>
    setTabs((list) => list.map((tab) => (tab.id === active.id ? { ...tab, ...change(tab) } : tab)))

  const navigate = (target: string) =>
    patch((tab) => ({ history: [...tab.history.slice(0, tab.index + 1), toUrl(target)], index: tab.index + 1 }))

  const addTab = () => {
    const id = nextId.current++
    setTabs((list) => [...list, { id, history: [HOME], index: 0, reloads: 0 }])
    setActiveId(id)
  }

  const closeTab = (id: number) => {
    if (tabs.length === 1) {
      appWindow.close()
      return
    }
    const remaining = tabs.filter((tab) => tab.id !== id)
    setTabs(remaining)
    if (id === activeId) setActiveId(remaining[remaining.length - 1].id)
  }

  return (
    <div className="app browser">
      <div className="browser-tabs" role="tablist">
        {tabs.map((tab) => (
          <div key={tab.id} className={`browser-tab${tab.id === active.id ? ' is-active' : ''}`}>
            <button role="tab" aria-selected={tab.id === active.id} onClick={() => setActiveId(tab.id)}>
              <Globe size={14} />
              <span>{title(tab.history[tab.index])}</span>
            </button>
            <button className="browser-tab-close" onClick={() => closeTab(tab.id)} aria-label={t('common.close')}>
              <X size={13} />
            </button>
          </div>
        ))}
        <button className="icon-button" onClick={addTab} aria-label={t('browser.newTab')} title={t('browser.newTab')}>
          <Plus size={16} />
        </button>
      </div>

      <div className="toolbar">
        <button
          className="icon-button"
          onClick={() => patch((tab) => ({ index: tab.index - 1 }))}
          disabled={active.index === 0}
          aria-label={t('common.back')}
        >
          <ArrowLeft size={17} />
        </button>
        <button
          className="icon-button"
          onClick={() => patch((tab) => ({ index: tab.index + 1 }))}
          disabled={active.index === active.history.length - 1}
          aria-label={t('browser.forward')}
        >
          <ArrowRight size={17} />
        </button>
        <button
          className="icon-button"
          onClick={() => patch((tab) => ({ reloads: tab.reloads + 1 }))}
          aria-label={t('browser.reload')}
        >
          <RotateCw size={15} />
        </button>
        <button className="icon-button" onClick={() => navigate(HOME)} aria-label={t('browser.home')}>
          <House size={16} />
        </button>
        {/* Keyed by page, so the field resets to the address whenever the tab navigates. */}
        <AddressBar key={`${active.id}:${active.index}`} url={url === HOME ? '' : url} onSubmit={navigate} />

        {url !== HOME && (
          <a className="icon-button" href={url} target="_blank" rel="noopener noreferrer" aria-label={t('browser.external')} title={t('browser.external')}>
            <ExternalLink size={16} />
          </a>
        )}
      </div>

      <div className="browser-bookmarks">
        {sites.map((site) => (
          <button key={site.url} onClick={() => navigate(site.url)}>
            {site.name}
          </button>
        ))}
      </div>

      {/* Every tab stays mounted so switching tabs doesn't reload its page. */}
      {tabs.map((tab) => {
        const target = tab.history[tab.index]
        return (
          <div key={tab.id} className="browser-page" hidden={tab.id !== active.id}>
            {target === HOME ? (
              <div className="browser-home">
                <h1>{t('browser.homeTitle')}</h1>
                <p>{t('browser.homeText')}</p>
                <div className="browser-tiles">
                  {sites.map((site) => (
                    <button key={site.url} onClick={() => navigate(site.url)}>
                      <Globe size={22} />
                      <strong>{site.name}</strong>
                      <span>{hostname(site.url)}</span>
                    </button>
                  ))}
                </div>
              </div>
            ) : canFrame(target) ? (
              <iframe
                key={`${tab.index}-${tab.reloads}`}
                src={target}
                title={hostname(target)}
                sandbox="allow-scripts allow-same-origin allow-forms allow-popups"
              />
            ) : (
              <div className="browser-blocked">
                <Globe size={40} />
                <h1>{t('browser.blockedTitle', { site: hostname(target) })}</h1>
                <p>{t('browser.blockedText')}</p>
                <a className="button is-primary" href={target} target="_blank" rel="noopener noreferrer">
                  <ExternalLink size={15} />
                  {t('browser.external')}
                </a>
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
