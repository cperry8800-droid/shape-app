export const REQUIRED_PROVIDER_EXPERIENCE_YEARS = 7;
export const DEFAULT_BACKGROUND_CHECK_PROVIDER = 'checkr';
export const PROVIDER_APPLICATION_FILE_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg,.webp';
export const PROVIDER_APPLICATION_MAX_FILE_BYTES = 10 * 1024 * 1024;
export const PROVIDER_EXPERIENCE_OPTIONS = ['7-10 years', '10-15 years', '15+ years'];

export function minimumYears(value) {
  const firstNumber = Number(String(value || '').match(/\d+/)?.[0] || 0);
  return Number.isFinite(firstNumber) ? firstNumber : 0;
}

export function experienceMeetsMinimum(value) {
  return minimumYears(value) >= REQUIRED_PROVIDER_EXPERIENCE_YEARS;
}
