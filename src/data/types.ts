// Shape of curriculo.json after localization (see localize.ts). Based on JSON Resume.

export interface Profile {
  network: string
  username: string
  url: string
}

export interface Work {
  id: string
  name: string
  position: string
  url?: string
  location?: string
  startDate: string
  endDate: string | null
  summary?: string
  highlights: string[]
  keywords?: string[]
}

export interface Education {
  id: string
  institution: string
  area: string
  studyType: string
  /** Leave out to show only when it was completed. */
  startDate?: string
  endDate: string | null
  summary?: string
}

export interface Certificate {
  id: string
  name: string
  issuer: string
  date: string
  url?: string
  image?: string
}

export interface SkillGroup {
  name: string
  keywords: string[]
}

export interface Language {
  language: string
  fluency: string
}

/** An image. Without `src` (a path under public/ or a full URL) a placeholder is drawn. */
export interface Media {
  src?: string
  caption: string
}

/** A project's repository. `label` tells a project's repositories apart ("backend", "mobile"). */
export interface Repo {
  label?: string
  url: string
}

export interface Project {
  id: string
  name: string
  description: string
  highlights: string[]
  keywords: string[]
  repos: Repo[]
  demo?: string
  images: Media[]
}

export interface Bookmark {
  name: string
  url: string
}

export interface Resume {
  basics: {
    name: string
    label: string
    image: string | null
    email: string
    url?: string
    /** A two-sentence version of the summary for the About me app. Falls back to `summary`. */
    intro?: string
    summary: string
    location: { city: string; region: string; countryCode: string }
    profiles: Profile[]
  }
  work: Work[]
  education: Education[]
  certificates: Certificate[]
  skills: SkillGroup[]
  languages: Language[]
  projects: Project[]
  photos: Media[]
  meta: {
    /** Path under public/ to the PDF for the current language, or null to render it from the data. */
    pdf: string | null
    /** Sites the Browser app may open in an iframe. */
    bookmarks: Bookmark[]
  }
}
