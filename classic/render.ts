import type { Locale } from '../src/data/localize.ts'
import type { Resume } from '../src/data/types.ts'
import { type TKey, translate } from '../src/i18n/dict.ts'
import { repoText } from '../src/system/content.ts'
import { formatMonth, formatPeriod } from '../src/system/format.ts'

// The classic version: the whole résumé as one static, print-ready HTML page.
// It needs no JavaScript, so search engines and screen readers get everything.

const escape = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!)

const STYLE = `
*{box-sizing:border-box}
body{margin:0;background:#eef0f3;color:#1f2329;font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
a{color:#0b7fc0}
nav{display:flex;flex-wrap:wrap;gap:8px 20px;align-items:center;max-width:820px;margin:0 auto;padding:16px 24px;font-size:14px}
nav .spacer{flex:1}
nav button{font:inherit;padding:6px 14px;border:1px solid #c9ced6;border-radius:8px;background:#fff;cursor:pointer}
main{max-width:820px;margin:0 auto 48px;padding:48px 56px;background:#fff;border-radius:4px;box-shadow:0 2px 12px rgba(0,0,0,.12)}
header{padding-bottom:16px;border-bottom:2px solid #15a6f0}
h1{margin:0;font-size:32px;line-height:1.2}
.label{margin:0;color:#4a5461;font-size:18px;font-weight:500}
.contacts{display:flex;flex-wrap:wrap;gap:4px 18px;margin:10px 0 0;padding:0;list-style:none;font-size:14px}
section{margin-top:28px}
h2{margin:0 0 10px;color:#0b7fc0;font-size:14px;letter-spacing:.08em;text-transform:uppercase}
h3{margin:0;font-size:17px}
article+article{margin-top:18px}
p{margin:4px 0}
.meta{color:#5d6672;font-size:14px}
ul.items{margin:6px 0 0;padding-left:20px}
dl{margin:0}
dl div{display:grid;grid-template-columns:150px 1fr;gap:12px;padding:3px 0}
dt{font-weight:600}
dd{margin:0}
@media(max-width:640px){main{padding:28px 22px;border-radius:0}dl div{grid-template-columns:1fr;gap:0}}
@media print{body{background:#fff}nav{display:none}main{max-width:none;margin:0;padding:0;box-shadow:none}a{color:inherit;text-decoration:none}}
`

export function renderClassic(resume: Resume, locale: Locale): string {
  const t = (key: TKey) => escape(translate(locale, key))
  const { basics } = resume
  // The page lives at /classic/ (pt) or /classic/en/ (en).
  const root = locale === 'pt' ? '../' : '../../'
  const other = locale === 'pt' ? { href: 'en/', label: 'English' } : { href: '../', label: 'Português' }

  const list = (items: string[]) =>
    items.length ? `<ul class="items">${items.map((item) => `<li>${escape(item)}</li>`).join('')}</ul>` : ''

  const work = resume.work
    .map(
      (item) => `<article>
<h3>${escape(item.position)} · ${escape(item.name)}</h3>
<p class="meta">${escape([formatPeriod(item.startDate, item.endDate, locale), item.location].filter(Boolean).join(' · '))}</p>
${item.summary ? `<p>${escape(item.summary)}</p>` : ''}
${list(item.highlights)}
</article>`,
    )
    .join('\n')

  const projects = resume.projects
    .map((item) => {
      const links = [
        item.demo && `<a href="${escape(item.demo)}">${t('content.demo')}</a>`,
        ...item.repos.map((repo) => `<a href="${escape(repo.url)}">${escape(repoText(repo, locale))}</a>`),
      ].filter(Boolean)
      return `<article>
<h3>${escape(item.name)}</h3>
<p>${escape(item.description)}</p>
${list(item.highlights)}
<p class="meta">${escape(item.keywords.join(' · '))}${links.length ? ` — ${links.join(' · ')}` : ''}</p>
</article>`
    })
    .join('\n')

  const education = [
    ...resume.education.map(
      (item) => `<article>
<h3>${escape(item.studyType)} · ${escape(item.area)}</h3>
<p class="meta">${escape(item.institution)} · ${escape(formatPeriod(item.startDate, item.endDate, locale))}</p>
${item.summary ? `<p>${escape(item.summary)}</p>` : ''}
</article>`,
    ),
    ...resume.certificates.map(
      (item) => `<article>
<h3>${item.url ? `<a href="${escape(item.url)}">${escape(item.name)}</a>` : escape(item.name)}</h3>
<p class="meta">${escape(item.issuer)} · ${escape(formatMonth(item.date, locale))}</p>
</article>`,
    ),
  ].join('\n')

  const skills = [
    ...resume.skills.map((group) => [group.name, group.keywords.join(', ')]),
    [translate(locale, 'content.languages'), resume.languages.map((item) => `${item.language} (${item.fluency})`).join(', ')],
  ]
    .map(([name, value]) => `<div><dt>${escape(name)}</dt><dd>${escape(value)}</dd></div>`)
    .join('\n')

  return `<!doctype html>
<html lang="${locale === 'pt' ? 'pt-BR' : 'en'}">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escape(basics.name)} — ${escape(basics.label)}</title>
<meta name="description" content="${escape(basics.summary)}">
<link rel="icon" type="image/svg+xml" href="${root}favicon.svg">
<style>${STYLE}</style>
</head>
<body>
<nav>
<a href="${root}">← ${t('classic.interactive')}</a>
<span class="spacer"></span>
<a href="${other.href}" hreflang="${locale === 'pt' ? 'en' : 'pt-BR'}">${other.label}</a>
<button type="button" onclick="print()">${t('classic.print')}</button>
</nav>
<main>
<header>
<h1>${escape(basics.name)}</h1>
<p class="label">${escape(basics.label)}</p>
<ul class="contacts">
<li>${escape(basics.location.city)}, ${escape(basics.location.region)}</li>
<li><a href="mailto:${escape(basics.email)}">${escape(basics.email)}</a></li>
${basics.profiles.map((profile) => `<li><a href="${escape(profile.url)}">${escape(profile.network)}: ${escape(profile.username)}</a></li>`).join('\n')}
</ul>
</header>
<section><h2>${t('content.summary')}</h2><p>${escape(basics.summary)}</p></section>
<section><h2>${t('content.experience')}</h2>
${work}
</section>
<section><h2>${t('content.projects')}</h2>
${projects}
</section>
<section><h2>${t('content.education')}</h2>
${education}
</section>
<section><h2>${t('content.skills')}</h2>
<dl>
${skills}
</dl>
</section>
</main>
<script>if(new URLSearchParams(location.search).has("print"))addEventListener("load",function(){print()})</script>
</body>
</html>
`
}
