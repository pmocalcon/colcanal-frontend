import api from './api';

export interface CompanyContact {
  contactId: number;
  companyId: number;
  projectId?: number | null;
  nit: string;
  businessName: string;
  address: string;
  phone: string;
  email?: string | null;
  city?: string | null;
  contactPerson?: string | null;
  isDefault: boolean;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  company?: {
    companyId: number;
    name: string;
  };
  project?: {
    projectId: number;
    name: string;
  } | null;
}

type DefaultContactResponse =
  | { data?: CompanyContact | null }
  | CompanyContact
  | null;

export const companyContactsService = {
  /**
   * Get the default billing/shipping contact for a company (optionally per project)
   */
  async getDefaultContact(companyId: number, projectId?: number): Promise<CompanyContact | null> {
    const params = projectId ? { projectId } : {};
    const response = await api.get<DefaultContactResponse>(
      `/company-contacts/company/${companyId}/default`,
      { params },
    );

    const rawData = response.data;

    if (rawData && typeof rawData === 'object' && 'data' in rawData) {
      return rawData.data ?? null;
    }

    return (rawData as CompanyContact | null) ?? null;
  },
};
