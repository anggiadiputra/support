const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3005';

// Helper to extract error message from API response
// Supports both old format { error: string } and new format { error: { code, message, details } }
function extractErrorMessage(errorData: unknown, fallback: string): string {
  if (!errorData || typeof errorData !== 'object') {
    return fallback;
  }
  
  const err = errorData as Record<string, unknown>;
  
  // New format: { error: { code, message, details } }
  if (err.error && typeof err.error === 'object') {
    const errorObj = err.error as Record<string, unknown>;
    if (typeof errorObj.message === 'string') {
      // Include details if available
      if (errorObj.details && typeof errorObj.details === 'string') {
        return `${errorObj.message} (${errorObj.details})`;
      }
      return errorObj.message;
    }
  }
  
  // Old format: { error: string }
  if (typeof err.error === 'string') {
    return err.error;
  }
  
  // Fallback
  return fallback;
}

export interface ExcludedCustomer {
  type: 'phone' | 'customerId';
  value: string;
  label?: string; // Customer name for display
}

export interface CustomerSearchResult {
  id: string;
  phoneNumber: string | null;
  name: string | null;
}

export interface AIConfig {
  id?: string; // Config ID (for WhatsAppAccountAIConfig)
  enabled: boolean;
  model: string;
  systemPrompt: string;
  temperature: number;
  filterWords?: string[];
  excludedCustomers?: ExcludedCustomer[];
  activeAgentId?: string;
  // Working Hours & Escalation fields
  timezone?: string;
  workingHours?: WorkingHours | null;
  escalationKeywords?: string[];
  escalationAutoAssign?: boolean;
}

export interface DaySchedule {
  start: string;
  end: string;
}

export interface WorkingHours {
  monday?: DaySchedule | null;
  tuesday?: DaySchedule | null;
  wednesday?: DaySchedule | null;
  thursday?: DaySchedule | null;
  friday?: DaySchedule | null;
  saturday?: DaySchedule | null;
  sunday?: DaySchedule | null;
}

export interface EscalationKeywordGroup {
  id: string;
  whatsappAccountAIConfigId: string;
  name: string;
  keywords: string[];
  assignedAgentId: string;
  assignedAgent?: {
    id: string;
    name: string;
    email: string;
  };
  createdAt: string;
  updatedAt: string;
}

export interface TeamAgent {
  id: string;
  name: string;
  email: string;
  role: 'ADMIN' | 'BUSINESS_OWNER' | 'AGENT';
}

export interface AIAgent {
  id: string;
  name: string;
  systemPrompt: string;
  knowledgeDocumentCount?: number;
  knowledgeDocuments?: KnowledgeDocument[];
  assignedPhoneNumberIds?: string[];
}

export interface KnowledgeDocument {
  id: string;
  filename: string;
  fileSize: number;
  mimeType: string;
  status: 'PENDING' | 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorMessage?: string;
  createdAt: string;
  _count?: {
    chunks: number;
  };
}

export const aiApi = {
  async getConfig(whatsappAccountId?: string): Promise<{ data: AIConfig; isCustomized?: boolean }> {
    const params = whatsappAccountId ? `?whatsappAccountId=${whatsappAccountId}` : '';
    const response = await fetch(`${API_URL}/api/v1/ai/config${params}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch AI config'));
    }

    const json = await response.json();
    return { data: json.data || json, isCustomized: json.isCustomized };
  },

  async updateConfig(data: Partial<AIConfig>, whatsappAccountId?: string) {
    const params = whatsappAccountId ? `?whatsappAccountId=${whatsappAccountId}` : '';
    const response = await fetch(`${API_URL}/api/v1/ai/config${params}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to update AI config'));
    }

    const json = await response.json();
    return json.data || json;
  },

  async deleteAccountConfig(whatsappAccountId: string) {
    const response = await fetch(`${API_URL}/api/v1/ai/config?whatsappAccountId=${whatsappAccountId}`, {
      method: 'DELETE',
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to reset config'));
    }

    return response.json();
  },

  async getDocuments() {
    const response = await fetch(`${API_URL}/api/v1/ai/knowledge`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch documents'));
    }

    const json = await response.json();
    return json.data || json;
  },

  async uploadDocument(file: File) {
    const formData = new FormData();
    formData.append('file', file);

    const response = await fetch(`${API_URL}/api/v1/ai/knowledge/upload`, {
      method: 'POST',
      credentials: 'include',
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Gagal upload dokumen'));
    }

    return response.json();
  },

  async deleteDocument(id: string) {
    const response = await fetch(`${API_URL}/api/v1/ai/knowledge/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Gagal menghapus dokumen'));
    }

    return response.json();
  },

  async getAgents() {
    const response = await fetch(`${API_URL}/api/v1/ai/agents`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch agents'));
    }

    const json = await response.json();
    return json.data || json;
  },

  async getAgent(id: string) {
    const response = await fetch(`${API_URL}/api/v1/ai/agents/${id}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch agent'));
    }

    const json = await response.json();
    return json.data || json;
  },

  async createAgent(data: { name: string; systemPrompt: string; documentIds: string[]; assignedPhoneNumberIds?: string[] }) {
    const response = await fetch(`${API_URL}/api/v1/ai/agents`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to create agent'));
    }

    const json = await response.json();
    return json.data || json;
  },

  async updateAgent(id: string, data: { name: string; systemPrompt: string; documentIds: string[]; assignedPhoneNumberIds?: string[] }) {
    const response = await fetch(`${API_URL}/api/v1/ai/agents/${id}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to update agent'));
    }

    const json = await response.json();
    return json.data || json;
  },

  async deleteAgent(id: string) {
    const response = await fetch(`${API_URL}/api/v1/ai/agents/${id}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to delete agent'));
    }

    return true;
  },

  async testChat(
    message: string,
    agentId: string,
    history?: { role: 'user' | 'assistant'; content: string }[]
  ): Promise<{ response: string; isError: boolean }> {
    const response = await fetch(`${API_URL}/api/v1/ai/test-chat`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({ message, agentId, history }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to send message'));
    }

    const json = await response.json();
    return json.data;
  },

  async getModels(): Promise<{ models: Array<{ id: string; owned_by: string }> }> {
    const response = await fetch(`${API_URL}/api/v1/ai/models`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch models'));
    }

    const json = await response.json();
    return json.data || { models: [] };
  },

  async getMemoryCount(whatsappAccountId: string): Promise<{ count: number }> {
    const response = await fetch(`${API_URL}/api/v1/ai/memory/count?whatsappAccountId=${whatsappAccountId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch memory count'));
    }

    const json = await response.json();
    return json.data;
  },

  async deleteMemory(whatsappAccountId: string): Promise<{ deletedCount: number }> {
    const response = await fetch(`${API_URL}/api/v1/ai/memory?whatsappAccountId=${whatsappAccountId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to delete memory'));
    }

    const json = await response.json();
    return json.data;
  },

  async getCustomersWithMemory(
    whatsappAccountId: string,
    options: { page?: number; limit?: number; search?: string } = {}
  ): Promise<{
    customers: {
      customerId: string;
      customerName: string | null;
      customerPhone: string | null;
      memoryCount: number;
      lastMemoryAt: string;
    }[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const params = new URLSearchParams({ whatsappAccountId });
    if (options.page) params.set('page', options.page.toString());
    if (options.limit) params.set('limit', options.limit.toString());
    if (options.search) params.set('search', options.search);

    const response = await fetch(`${API_URL}/api/v1/ai/memory/customers?${params}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch customers'));
    }

    const json = await response.json();
    return json.data;
  },

  async deleteCustomerMemory(whatsappAccountId: string, customerId: string): Promise<{ deletedCount: number }> {
    const response = await fetch(`${API_URL}/api/v1/ai/memory/customer?whatsappAccountId=${whatsappAccountId}&customerId=${customerId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to delete customer memory'));
    }

    const json = await response.json();
    return json.data;
  },

  // ============================================================================
  // Escalation Keyword Groups
  // ============================================================================

  async getEscalationGroups(configId: string): Promise<EscalationKeywordGroup[]> {
    const response = await fetch(`${API_URL}/api/v1/ai/escalation-groups?configId=${configId}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch escalation groups'));
    }

    const json = await response.json();
    return json.data || [];
  },

  async createEscalationGroup(data: {
    configId: string;
    name: string;
    keywords: string[];
    assignedAgentId: string;
  }): Promise<EscalationKeywordGroup> {
    const response = await fetch(`${API_URL}/api/v1/ai/escalation-groups`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to create escalation group'));
    }

    const json = await response.json();
    return json.data;
  },

  async updateEscalationGroup(
    groupId: string,
    data: { name?: string; keywords?: string[]; assignedAgentId?: string }
  ): Promise<EscalationKeywordGroup> {
    const response = await fetch(`${API_URL}/api/v1/ai/escalation-groups/${groupId}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify(data),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to update escalation group'));
    }

    const json = await response.json();
    return json.data;
  },

  async deleteEscalationGroup(groupId: string): Promise<void> {
    const response = await fetch(`${API_URL}/api/v1/ai/escalation-groups/${groupId}`, {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to delete escalation group'));
    }
  },

  async getTeamAgents(): Promise<TeamAgent[]> {
    const response = await fetch(`${API_URL}/api/v1/ai/team-agents`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to fetch team agents'));
    }

    const json = await response.json();
    return json.data || [];
  },

  // ============================================================================
  // Customer Search for Exclusion Filter
  // ============================================================================

  async searchCustomers(query: string, whatsappAccountId?: string): Promise<CustomerSearchResult[]> {
    const params = new URLSearchParams({ q: query });
    if (whatsappAccountId) {
      params.set('whatsappAccountId', whatsappAccountId);
    }

    const response = await fetch(`${API_URL}/api/v1/ai/customers/search?${params}`, {
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({}));
      throw new Error(extractErrorMessage(error, 'Failed to search customers'));
    }

    const json = await response.json();
    return json.data || [];
  },
};