import { Check, Copy, ExternalLink, Mail, Send } from 'lucide-react'
import { type FormEvent, useRef, useState } from 'react'
import { track, useTrackView } from '../analytics.ts'
import { useResume } from '../data/resume.ts'
import { posthogLog } from '../posthog-logs.ts'
import { useT } from '../i18n/index.ts'

/**
 * Contact details plus a short form. There is no backend: the form hands the
 * message to the visitor's own e-mail app through a mailto: link.
 */
export default function Contact() {
  const t = useT()
  const { basics } = useResume()
  const [copied, setCopied] = useState(false)
  const [name, setName] = useState('')
  const [message, setMessage] = useState('')
  const started = useRef(false)

  useTrackView('contact_details_viewed', { source: 'contact_app' })

  const copy = async () => {
    await navigator.clipboard.writeText(basics.email)
    track('contact_email_copied', { source: 'contact_app' })
    posthogLog.contactEmailCopied()
    setCopied(true)
    window.setTimeout(() => setCopied(false), 2000)
  }

  const send = (event: FormEvent) => {
    event.preventDefault()
    track('contact_form_submitted', { message_length: message.length })
    posthogLog.contactFormSubmitted()
    const subject = t('contact.subject', { name })
    window.location.href = `mailto:${basics.email}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(message)}`
  }

  // The first keystroke in the form, so it can be compared with how many get sent.
  const start = () => {
    if (started.current) return
    started.current = true
    track('contact_form_started')
  }

  return (
    <div className="app contact">
      <h1>{t('contact.title')}</h1>
      <p className="contact-intro">{t('contact.intro')}</p>

      <ul className="contact-list">
        <li>
          <Mail size={18} />
          <a href={`mailto:${basics.email}`} onClick={() => track('contact_email_clicked', { source: 'contact_app' })}>
            {basics.email}
          </a>
          <button className="icon-button" onClick={() => void copy()} aria-label={t('contact.copy')} title={t('contact.copy')}>
            {copied ? <Check size={16} /> : <Copy size={16} />}
          </button>
        </li>
        {basics.profiles.map((profile) => (
          <li key={profile.network}>
            <ExternalLink size={18} />
            <a
              href={profile.url}
              target="_blank"
              rel="noopener noreferrer"
              onClick={() =>
                track('contact_profile_clicked', { network: profile.network.toLowerCase(), source: 'contact_app' })
              }
            >
              {profile.network} · {profile.username}
            </a>
          </li>
        ))}
      </ul>

      <form className="contact-form" onSubmit={send} onInput={start}>
        <label>
          {t('contact.name')}
          <input value={name} onChange={(event) => setName(event.target.value)} required autoComplete="name" />
        </label>
        <label>
          {t('contact.message')}
          <textarea value={message} onChange={(event) => setMessage(event.target.value)} required rows={5} />
        </label>
        <button className="button is-primary" type="submit">
          <Send size={15} />
          {t('contact.send')}
        </button>
        <p className="contact-hint">{t('contact.hint')}</p>
      </form>
    </div>
  )
}
