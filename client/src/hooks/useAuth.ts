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
        const response = await apiRequest('/api/auth/me');
        return response.user as User;
      } catch (error: any) {
        if (error.status === 401) {
          return null; // User not authenticated
        }
        throw error;
      }
    },
    retry: false,
  });

  const logoutMutation = useMutation({
    mutationFn: async () => {
      return await apiRequest('/api/auth/logout', {
        method: 'POST',
      });
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
      return await apiRequest('/api/credits');
    },
  });

  const { data: transactions, isLoading: isLoadingTransactions } = useQuery({
    queryKey: ['/api/credits/transactions'],
    queryFn: async () => {
      return await apiRequest('/api/credits/transactions');
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
      return await apiRequest('/api/stores');
    },
  });

  const createStoreMutation = useMutation({
    mutationFn: async (storeData: any) => {
      return await apiRequest('/api/stores', {
        method: 'POST',
        body: JSON.stringify(storeData),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
    },
  });

  const updateStoreMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      return await apiRequest(`/api/stores/${id}`, {
        method: 'PUT',
        body: JSON.stringify(data),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
    },
  });

  const deleteStoreMutation = useMutation({
    mutationFn: async (id: number) => {
      return await apiRequest(`/api/stores/${id}`, {
        method: 'DELETE',
      });
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
      return await apiRequest('/api/analyses');
    },
  });

  return {
    analyses: analyses || [],
    isLoading,
    error,
  };
}