import { type BrandConfig, defaultBrandConfig, type ThemeColors } from '@/lib/branding'
import { getEnv } from '@/lib/core/config/env'

export type { BrandConfig, ThemeColors }

const getThemeColors = (): ThemeColors => {
  return {
    primaryColor:
      getEnv('NEXT_PUBLIC_BRAND_PRIMARY_COLOR') || defaultBrandConfig.theme?.primaryColor,
    primaryHoverColor:
      getEnv('NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR') ||
      defaultBrandConfig.theme?.primaryHoverColor,
    accentColor: getEnv('NEXT_PUBLIC_BRAND_ACCENT_COLOR') || defaultBrandConfig.theme?.accentColor,
    accentHoverColor:
      getEnv('NEXT_PUBLIC_BRAND_ACCENT_HOVER_COLOR') || defaultBrandConfig.theme?.accentHoverColor,
    backgroundColor:
      getEnv('NEXT_PUBLIC_BRAND_BACKGROUND_COLOR') || defaultBrandConfig.theme?.backgroundColor,
  }
}

function parseCsvList(value: string | undefined | null): string[] {
  if (!value) return []
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter((item) => item.length > 0)
    ),
  ]
}

/**
 * Get branding configuration from environment variables
 * Supports runtime configuration via Docker/Kubernetes
 */
export const getBrandConfig = (): BrandConfig => {
  const hasCustomBrand = Boolean(
    getEnv('NEXT_PUBLIC_BRAND_NAME') ||
      getEnv('NEXT_PUBLIC_BRAND_LOGO_URL') ||
      getEnv('NEXT_PUBLIC_BRAND_PRIMARY_COLOR') ||
      getEnv('NEXT_PUBLIC_BRAND_PRIMARY_HOVER_COLOR') ||
      getEnv('NEXT_PUBLIC_BRAND_ACCENT_COLOR') ||
      getEnv('NEXT_PUBLIC_BRAND_ACCENT_HOVER_COLOR') ||
      getEnv('NEXT_PUBLIC_BRAND_BACKGROUND_COLOR') ||
      getEnv('NEXT_PUBLIC_CUSTOM_CSS_URL') ||
      getEnv('NEXT_PUBLIC_WORKFLOW_SIDEBAR_HIDDEN_ITEMS') ||
      getEnv('NEXT_PUBLIC_SETTINGS_NAV_HIDDEN_ITEMS')
  )

  return {
    name: getEnv('NEXT_PUBLIC_BRAND_NAME') || defaultBrandConfig.name,
    logoUrl: getEnv('NEXT_PUBLIC_BRAND_LOGO_URL') || defaultBrandConfig.logoUrl,
    faviconUrl: getEnv('NEXT_PUBLIC_BRAND_FAVICON_URL') || defaultBrandConfig.faviconUrl,
    customCssUrl: getEnv('NEXT_PUBLIC_CUSTOM_CSS_URL') || defaultBrandConfig.customCssUrl,
    supportEmail: getEnv('NEXT_PUBLIC_SUPPORT_EMAIL') || defaultBrandConfig.supportEmail,
    documentationUrl:
      getEnv('NEXT_PUBLIC_DOCUMENTATION_URL') || defaultBrandConfig.documentationUrl,
    termsUrl: getEnv('NEXT_PUBLIC_TERMS_URL') || defaultBrandConfig.termsUrl,
    privacyUrl: getEnv('NEXT_PUBLIC_PRIVACY_URL') || defaultBrandConfig.privacyUrl,
    workflowSidebarHiddenItemIds: parseCsvList(getEnv('NEXT_PUBLIC_WORKFLOW_SIDEBAR_HIDDEN_ITEMS')),
    settingsNavigationHiddenItemIds: parseCsvList(getEnv('NEXT_PUBLIC_SETTINGS_NAV_HIDDEN_ITEMS')),
    theme: getThemeColors(),
    isWhitelabeled: hasCustomBrand,
  }
}

/**
 * Hook to use brand configuration in React components
 */
export const useBrandConfig = () => {
  return getBrandConfig()
}
