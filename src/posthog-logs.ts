import posthog, { isPostHogConfigured } from './posthog.ts'

type PortfolioEntryPoint = 'desktop_login' | 'mobile_lock_screen'

export const posthogLog = {
  portfolioEntered(entryPoint: PortfolioEntryPoint) {
    if (isPostHogConfigured) {
      posthog.logger.info('portfolio entry completed', {
        event: 'portfolio_entered',
        entry_point: entryPoint,
      })
    }
  },
  contactEmailCopied() {
    if (isPostHogConfigured) {
      posthog.logger.info('contact email copied', {
        event: 'contact_email_copied',
      })
    }
  },
  contactFormSubmitted() {
    if (isPostHogConfigured) {
      posthog.logger.info('contact mail client opened', {
        event: 'contact_form_submitted',
        delivery_method: 'mailto',
      })
    }
  },
}
