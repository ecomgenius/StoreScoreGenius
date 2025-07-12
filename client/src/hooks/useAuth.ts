import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { apiRequest } from "@/lib/queryClient";

export interface User {
  id: number;
  email: string;
  firstName: string;
  lastName: string;
  isAdmin: boolean;
  aiCredits: number;
  subscriptionStatus: 'trial' | 'active' | 'canceled' | 'past_due' | 'incomplete';
  trialEndsAt: string | null;
  createdAt: string;
}

export function useAuth() {
  const queryClient = useQueryClient();

  const { data: user, isLoading, error } = useQuery({
    queryKey: ['/api/auth/me'],
    queryFn: async () => {
      try {
        const response = await apiRequest('GET', '/api/auth/me');
        const data = await response.json();
        return data.user as User;
      } catch (error: any) {
        if (error.message?.includes('401')) {
          return null; // User not authenticated
        }
        throw error;
      }
    },
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('POST', '/api/auth/logout');
    },
    onSuccess: () => {
      queryClient.setQueryData(['/api/auth/me'], null);
      queryClient.invalidateQueries({ queryKey: ['/api/auth/me'] });
    },
  });

  const logout = () => {
    logoutMutation.mutate();
  };

  const isAuthenticated = !!user;
  const isTrialActive = user?.subscriptionStatus === 'trial' && user?.trialEndsAt && new Date(user.trialEndsAt) > new Date();
  const hasActiveSubscription = user?.subscriptionStatus === 'active' || isTrialActive;

  return {
    user,
    isLoading,
    error,
    isAuthenticated,
    isTrialActive,
    hasActiveSubscription,
    logout,
    isLoggingOut: logoutMutation.isPending,
  };
}

export function useCredits() {
  const { data: creditsData, isLoading, error } = useQuery({
    queryKey: ['/api/credits'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/credits');
      return await response.json();
    },
  });

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/credits/transactions'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/credits/transactions');
      return await response.json();
    },
  });

  return {
    credits: creditsData?.credits || 0,
    transactions: transactions || [],
    isLoading,
    isLoadingTransactions,
    error,
  };
}

export function useUserStores() {
  const queryClient = useQueryClient();

  const { data: stores, isLoading, error } = useQuery({
    queryKey: ['/api/stores'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/stores');
      return await response.json();
    },
  });

  const createStoreMutation = useMutation({
    mutationFn: async (storeData: any) => {
      const response = await apiRequest('POST', '/api/stores', storeData);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
    },
  });

  const updateStoreMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const response = await apiRequest('PUT', `/api/stores/${id}`, data);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
    },
  });

  const deleteStoreMutation = useMutation({
    mutationFn: async (id: number) => {
      const response = await apiRequest('DELETE', `/api/stores/${id}`);
      return await response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
    },
  });

  return {
    stores: stores || [],
    isLoading,
    error,
    createStore: createStoreMutation.mutate,
    updateStore: updateStoreMutation.mutate,
    deleteStore: deleteStoreMutation.mutate,
    isCreating: createStoreMutation.isPending,
    isUpdating: updateStoreMutation.isPending,
    isDeleting: deleteStoreMutation.isPending,
  };
}

export function useUserAnalyses() {
  const { data: analyses, isLoading, error } = useQuery({
    queryKey: ['/api/analyses'],
    queryFn: async () => {
      const response = await apiRequest('GET', '/api/analyses');
      return await response.json();
    },
  });

  return {
    analyses: analyses || [],
    isLoading,
    error,
  };
}