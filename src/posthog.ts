import posthog from 'posthog-js'

const posthogKey = import.meta.env.VITE_POSTHOG_KEY
const posthogHost = import.meta.env.VITE_POSTHOG_HOST

export const isPostHogConfigured = Boolean(posthogKey && posthogHost)

if (!posthogKey || !posthogHost) {
  if (import.meta.env.DEV) {
    const missingVariable = !posthogKey ? 'VITE_POSTHOG_KEY' : 'VITE_POSTHOG_HOST'

    throw new Error(
      `${missingVariable} variable required by PostHog is missing or un-configured, this causes events to be silently missed. This error stops appearing once ${missingVariable} is configured`,
    )
  }
} else {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    defaults: '2026-05-30',
    logs: {
      serviceName: 'everton-os-web',
      environment: import.meta.env.MODE,
    },
    capture_exceptions: {
      capture_unhandled_errors: true,
      capture_unhandled_rejections: true,
      capture_console_errors: false,
    },
    loaded: (instance) => {
      // Tags every event so local development can be told apart from production.
      instance.register({ environment: import.meta.env.MODE })

      // Opening the site with ?internal marks this browser as the owner's, so its
      // visits can be filtered out of the metrics. ?internal=0 undoes it.
      const internal = new URLSearchParams(location.search).get('internal')
      if (internal === '0') instance.unregister('internal')
      else if (internal !== null) instance.register({ internal: true })
    },
  })
}

export default posthog
