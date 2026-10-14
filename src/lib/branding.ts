const configuredOrganizationName = import.meta.env.VITE_ORGANIZATION_NAME?.trim();

export const ORGANIZATION_NAME = configuredOrganizationName || 'xxxxx学院';
