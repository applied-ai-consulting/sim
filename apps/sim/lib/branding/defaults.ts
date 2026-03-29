import type { BrandConfig } from './types'

/**
 * Default brand configuration values
 */
export const defaultBrandConfig: BrandConfig = {
  name: 'OpsRabbit',
  logoUrl: '/opsrabbit-brand-logo.png',
  faviconUrl: '/opsrabbit-logo.png',
  customCssUrl: undefined,
  supportEmail: undefined,
  documentationUrl: undefined,
  termsUrl: undefined,
  privacyUrl: undefined,
  workflowSidebarHiddenItemIds: [],
  settingsNavigationHiddenItemIds: [],
  theme: {
    primaryColor: '#f97316',
    primaryHoverColor: '#ea580c',
    accentColor: '#0ea5e9',
    accentHoverColor: '#0284c7',
    backgroundColor: '#fcfcfd',
  },
  isWhitelabeled: false,
}
