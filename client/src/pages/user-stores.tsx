import { useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from '@/hooks/use-toast';
import DashboardLayout from '@/components/DashboardLayout';
import { Store, Plus, Settings, Trash2, Zap, ExternalLink, LinkIcon, CheckCircle, Clock, AlertCircle, Target } from 'lucide-react';
import { apiRequest } from '@/lib/queryClient';

export default function UserStores() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isShopifyDialogOpen, setIsShopifyDialogOpen] = useState(false);
  const [isManualTokenDialogOpen, setIsManualTokenDialogOpen] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [manualTokenData, setManualTokenData] = useState({
    shopDomain: '',
    accessToken: '',
    storeName: ''
  });

  const [newStore, setNewStore] = useState({
    name: '',
    storeUrl: '',
    storeType: 'shopify',
    description: '',
  });

  const queryClient = useQueryClient();

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['/api/stores'],
  });

  const createStoreMutation = useMutation({
    mutationFn: (storeData: typeof newStore) => apiRequest('POST', '/api/stores', storeData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      setIsAddDialogOpen(false);
      setNewStore({ name: '', storeUrl: '', storeType: 'shopify', description: '' });
      toast({
        title: "Store Added",
        description: "Your store has been successfully added to your account.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add store",
        variant: "destructive",
      });
    },
  });

  const deleteStoreMutation = useMutation({
    mutationFn: (storeId: number) => apiRequest('DELETE', `/api/stores/${storeId}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      toast({
        title: "Store Deleted",
        description: "The store has been removed from your account.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to delete store",
        variant: "destructive",
      });
    },
  });

  const analyzeStoreMutation = useMutation({
    mutationFn: (storeId: number) => {
      console.log('🔄 Starting analysis mutation for store ID:', storeId);
      return apiRequest('POST', `/api/shopify/analyze/${storeId}`);
    },
    onSuccess: (data: any) => {
      console.log('🚀 Analysis mutation onSuccess triggered');
      console.log('📊 Response data type:', typeof data);
      console.log('📊 Response data:', data);
      console.log('📊 Response keys:', Object.keys(data || {}));
      console.log('📊 Raw response as string:', JSON.stringify(data));
      
      // Check if data is an array or object
      let analysisData = data;
      if (Array.isArray(data) && data.length > 0) {
        analysisData = data[0];
        console.log('📊 Using first item from array:', analysisData);
      }
      
      // Invalidate cache to refresh data
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analyses'] });
      
      const analysisId = analysisData?.id;
      console.log('🔍 Extracted analysis ID:', analysisId);
      
      if (analysisId) {
        console.log('✅ Redirecting to analysis page:', `/analysis/${analysisId}`);
        setTimeout(() => {
          window.location.href = `/analysis/${analysisId}`;
        }, 500);
      } else {
        console.error('❌ No valid analysis ID found. Full analysis data:', analysisData);
        // Fallback: redirect to analysis list
        console.log('🔄 Redirecting to analysis list as fallback');
        setTimeout(() => {
          window.location.href = '/dashboard/analysis';
        }, 1000);
      }
    },
    onError: (error: any) => {
      console.error('❌ Analysis mutation failed:', error);
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze store",
        variant: "destructive",
      });
    },
  });

  const connectShopifyMutation = useMutation({
    mutationFn: (data: { shopDomain: string; userStoreId?: number }) => 
      apiRequest('POST', '/api/shopify/connect', data),
    onSuccess: (data: { authUrl: string }) => {
      // Redirect to Shopify OAuth page
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to initiate Shopify connection.",
        variant: "destructive",
      });
    },
  });

  const connectManualTokenMutation = useMutation({
    mutationFn: (data: { shopDomain: string; accessToken: string; storeName: string }) => 
      apiRequest('POST', '/api/shopify/connect-token', data),
    onSuccess: (data: { success: boolean; shopName: string }) => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      setIsManualTokenDialogOpen(false);
      setManualTokenData({ shopDomain: '', accessToken: '', storeName: '' });
      toast({
        title: "Store Connected",
        description: `${data.shopName} has been successfully connected via access token.`,
      });
    },
    onError: (error: any) => {
      toast({
        title: "Connection Failed",
        description: error.message || "Failed to connect store with access token.",
        variant: "destructive",
      });
    },
  });

  const handleAddStore = () => {
    if (!newStore.name || !newStore.storeUrl) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    createStoreMutation.mutate(newStore);
  };

  const handleAnalyzeStore = (storeId: number) => {
    analyzeStoreMutation.mutate(storeId);
  };

  const handleReconnectStore = (storeId: number) => {
    const store = stores.find((s: any) => s.id === storeId);
    if (store && store.shopifyDomain) {
      // For reconnection, directly trigger OAuth with store ID
      connectShopifyMutation.mutate({ 
        shopDomain: store.shopifyDomain,
        userStoreId: storeId 
      });
    }
  };

  const handleDeleteStore = (storeId: number) => {
    if (confirm('Are you sure you want to delete this store?')) {
      deleteStoreMutation.mutate(storeId);
    }
  };

  const handleConnectShopify = () => {
    if (!shopifyDomain) {
      toast({
        title: "Missing Domain",
        description: "Please enter your Shopify store domain.",
        variant: "destructive",
      });
      return;
    }
    connectShopifyMutation.mutate({ shopDomain: shopifyDomain });
  };

  const handleManualTokenConnect = () => {
    if (!manualTokenData.shopDomain || !manualTokenData.accessToken || !manualTokenData.storeName) {
      toast({
        title: "Missing Information",
        description: "Please fill in all required fields.",
        variant: "destructive",
      });
      return;
    }
    connectManualTokenMutation.mutate(manualTokenData);
  };

  const getStoreTypeColor = (storeType: string) => {
    switch (storeType) {
      case 'shopify':
        return 'bg-green-100 text-green-800';
      case 'ebay':
        return 'bg-blue-100 text-blue-800';
      case 'amazon':
        return 'bg-orange-100 text-orange-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const getConnectionStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-3 w-3" />;
      case 'pending':
        return <Clock className="h-3 w-3" />;
      case 'error':
        return <AlertCircle className="h-3 w-3" />;
      default:
        return null;
    }
  };

  const getConnectionStatusText = (status: string) => {
    switch (status) {
      case 'connected':
        return 'Connected';
      case 'pending':
        return 'Connecting...';
      case 'error':
        return 'Connection Error';
      default:
        return 'Not Connected';
    }
  };

  if (isLoading) {
    return (
      <DashboardLayout>
        <div className="p-6">
          <div className="animate-pulse space-y-4">
            <div className="h-8 bg-gray-200 rounded w-1/4"></div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-48 bg-gray-200 rounded"></div>
              ))}
            </div>
          </div>
        </div>
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 max-w-6xl mx-auto">
        <div className="mb-8">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
                <Store className="mr-3 h-8 w-8" />
                Your Stores
              </h1>
              <p className="text-gray-600">
                Manage your connected stores and apply AI-powered optimizations.
              </p>
            </div>
            <div className="flex space-x-3">
              <Button onClick={() => setIsShopifyDialogOpen(true)}>
                <Store className="mr-2 h-4 w-4" />
                Connect Shopify Store
              </Button>
              <Button variant="outline" onClick={() => setIsManualTokenDialogOpen(true)}>
                <LinkIcon className="mr-2 h-4 w-4" />
                Manual Token (Backup)
              </Button>
              <Button variant="outline" onClick={() => setIsAddDialogOpen(true)}>
                <Plus className="mr-2 h-4 w-4" />
                Add Manual Store
              </Button>
            </div>
          </div>
        </div>

        {/* OAuth Configuration Help */}
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-yellow-900 mb-2">OAuth Configuration Required</h3>
          <p className="text-yellow-800 mb-4">
            If OAuth fails with "missing authorization code", you need to configure your app in Shopify Partners Dashboard:
          </p>
          <ol className="text-sm text-yellow-800 list-decimal list-inside space-y-1 mb-4">
            <li><strong>Distribution:</strong> Enable "Public distribution" (required even for development)</li>
            <li><strong>URLs:</strong> Set redirect URI to your callback URL</li>
            <li><strong>Permissions:</strong> Enable all required app scopes</li>
            <li><strong>Save:</strong> Click save after each change</li>
          </ol>
          <p className="text-sm text-yellow-700">
            See the configuration guide in scripts/fix-shopify-oauth.md for detailed instructions.
          </p>
        </div>

        {stores.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No stores connected</h3>
              <p className="text-gray-600 mb-4">
                Connect your first store to start receiving AI-powered optimizations and insights.
              </p>
              <div className="flex space-x-3 justify-center">
                <Button onClick={() => setIsShopifyDialogOpen(true)}>
                  <Store className="mr-2 h-4 w-4" />
                  Connect Shopify Store
                </Button>
                <Button variant="outline" onClick={() => setIsAddDialogOpen(true)}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Manual Store
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store: any) => (
              <Card key={store.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{store.name}</CardTitle>
                    <div className="flex items-center space-x-2">
                      <Badge variant="secondary" className={getStoreTypeColor(store.storeType)}>
                        {store.storeType.toUpperCase()}
                      </Badge>
                      {store.isConnected && (
                        <Badge variant="default" className="bg-green-100 text-green-800">
                          {getConnectionStatusIcon(store.connectionStatus)}
                          <span className="ml-1">{getConnectionStatusText(store.connectionStatus)}</span>
                        </Badge>
                      )}
                    </div>
                  </div>
                  <CardDescription>
                    {store.description || 'No description provided'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-3">
                    <div className="flex items-center text-sm text-gray-600">
                      <LinkIcon className="mr-2 h-4 w-4" />
                      <a 
                        href={store.storeUrl} 
                        target="_blank" 
                        rel="noopener noreferrer"
                        className="hover:text-blue-600 truncate flex items-center"
                      >
                        {store.storeUrl}
                        <ExternalLink className="ml-1 h-3 w-3" />
                      </a>
                    </div>

                    {store.isConnected && store.lastAnalyzedAt && (
                      <div className="space-y-1">
                        <div className="text-sm text-gray-500">
                          Last analyzed: {new Date(store.lastAnalyzedAt).toLocaleDateString()}
                        </div>
                        {store.lastAnalysisScore && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">Last Score:</span>
                            <span className={`font-semibold ${
                              store.lastAnalysisScore >= 80 ? 'text-green-600' : 
                              store.lastAnalysisScore >= 60 ? 'text-yellow-600' : 'text-red-600'
                            }`}>
                              {store.lastAnalysisScore}/100
                            </span>
                          </div>
                        )}
                        {store.aiRecommendationsCount > 0 && (
                          <div className="flex items-center justify-between text-sm">
                            <span className="text-gray-600">AI Recommendations:</span>
                            <Button
                              variant="link"
                              size="sm"
                              className="h-auto p-0 text-blue-600 hover:text-blue-700"
                              onClick={() => window.location.href = `/dashboard/stores/${store.id}/recommendations`}
                            >
                              {store.aiRecommendationsCount} suggestions →
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show permission status for Shopify stores */}
                    {store.storeType === 'shopify' && store.shopifyScope && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-gray-600">Permissions:</span>
                        <div className="flex items-center space-x-2">
                          <div className={`h-2 w-2 rounded-full ${store.shopifyScope.includes('write_products') ? 'bg-green-500' : 'bg-orange-500'}`}></div>
                          <span className={`font-medium text-xs ${store.shopifyScope.includes('write_products') ? 'text-green-700' : 'text-orange-700'}`}>
                            {store.shopifyScope.includes('write_products') ? 'Full Access' : 'Read Only'}
                          </span>
                        </div>
                      </div>
                    )}

                    {store.isConnected && store.lastSyncAt && (
                      <div className="text-sm text-gray-500">
                        Last sync: {new Date(store.lastSyncAt).toLocaleDateString()}
                      </div>
                    )}
                    
                    <div className="pt-4 border-t space-y-2">
                      <div className="flex flex-wrap gap-2">
                        {store.isConnected && store.connectionStatus === 'connected' ? (
                          <>
                            <Button 
                              size="sm" 
                              onClick={() => handleAnalyzeStore(store.id)}
                              disabled={analyzeStoreMutation.isPending}
                              className="bg-blue-600 hover:bg-blue-700 text-white flex-1 min-w-0"
                            >
                              <Zap className="mr-2 h-4 w-4" />
                              {analyzeStoreMutation.isPending ? 'Analyzing...' : 'Run AI Analysis'}
                            </Button>
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => window.location.href = `/dashboard/stores/${store.id}/recommendations`}
                              className="border-purple-300 text-purple-700 hover:bg-purple-50 flex-1 min-w-0"
                            >
                              <Target className="mr-2 h-4 w-4" />
                              Optimize with AI
                            </Button>
                          </>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReconnectStore(store.id)}
                            disabled={connectShopifyMutation.isPending}
                            className="flex-1"
                          >
                            <Settings className="mr-2 h-4 w-4" />
                            {store.isConnected ? 'Reconnect' : 'Connect Shopify'}
                          </Button>
                        )}
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex gap-2">
                          {/* Show reconnect button if store lacks write permissions */}
                          {store.isConnected && store.connectionStatus === 'connected' && store.shopifyScope && !store.shopifyScope.includes('write_products') && (
                            <Button 
                              size="sm" 
                              variant="outline"
                              onClick={() => handleReconnectStore(store.id)}
                              disabled={connectShopifyMutation.isPending}
                              className="border-orange-300 text-orange-700 hover:bg-orange-50"
                            >
                              <Settings className="mr-2 h-4 w-4" />
                              Upgrade Permissions
                            </Button>
                          )}
                        </div>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => handleDeleteStore(store.id)}
                          className="text-red-600 hover:text-red-700 hover:bg-red-50"
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Shopify Connection Dialog */}
        <Dialog open={isShopifyDialogOpen} onOpenChange={setIsShopifyDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Connect Your Shopify Store</DialogTitle>
              <CardDescription>
                Enter your Shopify store domain and you'll be redirected to authorize the connection.
              </CardDescription>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="shopifyDomain">Shopify Store Domain</Label>
                <Input
                  id="shopifyDomain"
                  value={shopifyDomain}
                  onChange={(e) => setShopifyDomain(e.target.value)}
                  placeholder="i10jxn-aa.myshopify.com"
                  className="mt-1"
                />
                <p className="text-sm text-gray-500 mt-1">
                  Enter your store's .myshopify.com domain or custom domain
                </p>
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsShopifyDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleConnectShopify}
                  disabled={connectShopifyMutation.isPending}
                >
                  {connectShopifyMutation.isPending ? 'Connecting...' : 'Connect to Shopify'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Add Store Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New Store</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label htmlFor="name">Store Name</Label>
                <Input
                  id="name"
                  value={newStore.name}
                  onChange={(e) => setNewStore({ ...newStore, name: e.target.value })}
                  placeholder="My Awesome Store"
                />
              </div>
              <div>
                <Label htmlFor="storeUrl">Store URL</Label>
                <Input
                  id="storeUrl"
                  value={newStore.storeUrl}
                  onChange={(e) => setNewStore({ ...newStore, storeUrl: e.target.value })}
                  placeholder="https://mystore.myshopify.com"
                />
              </div>
              <div>
                <Label htmlFor="description">Description (Optional)</Label>
                <Textarea
                  id="description"
                  value={newStore.description}
                  onChange={(e) => setNewStore({ ...newStore, description: e.target.value })}
                  placeholder="Brief description of your store..."
                  rows={3}
                />
              </div>
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsAddDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleAddStore}
                  disabled={createStoreMutation.isPending}
                >
                  {createStoreMutation.isPending ? 'Adding...' : 'Add Store'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Manual Token Connection Dialog */}
        <Dialog open={isManualTokenDialogOpen} onOpenChange={setIsManualTokenDialogOpen}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Connect Development Store</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="bg-green-50 border border-green-200 p-4 rounded-lg">
                <h4 className="font-semibold text-green-900 mb-2">✅ Recommended for Development</h4>
                <p className="text-sm text-green-800 mb-3">
                  This method works with development apps without requiring public distribution:
                </p>
                <ol className="text-sm text-green-800 list-decimal list-inside space-y-1">
                  <li><strong>Partners Dashboard:</strong> Go to Apps → Your App → "Test on development store"</li>
                  <li><strong>Install:</strong> Select testscorestore.myshopify.com and click "Install app"</li>
                  <li><strong>Token:</strong> Copy the access token provided after installation</li>
                  <li><strong>Connect:</strong> Paste the token below and click "Connect Store"</li>
                </ol>
              </div>
              
              <div>
                <Label htmlFor="tokenStoreName">Store Name</Label>
                <Input
                  id="tokenStoreName"
                  value={manualTokenData.storeName}
                  onChange={(e) => setManualTokenData({ ...manualTokenData, storeName: e.target.value })}
                  placeholder="My Test Store"
                />
              </div>
              
              <div>
                <Label htmlFor="tokenShopDomain">Shop Domain</Label>
                <Input
                  id="tokenShopDomain"
                  value={manualTokenData.shopDomain}
                  onChange={(e) => setManualTokenData({ ...manualTokenData, shopDomain: e.target.value })}
                  placeholder="teststore.myshopify.com"
                />
              </div>
              
              <div>
                <Label htmlFor="accessToken">Access Token</Label>
                <Input
                  id="accessToken"
                  type="password"
                  value={manualTokenData.accessToken}
                  onChange={(e) => setManualTokenData({ ...manualTokenData, accessToken: e.target.value })}
                  placeholder="shpat_..."
                />
                <p className="text-xs text-gray-500 mt-1">
                  Get this from your Shopify Partners Dashboard after installing the app
                </p>
              </div>
              
              <div className="flex justify-end space-x-2">
                <Button
                  variant="outline"
                  onClick={() => setIsManualTokenDialogOpen(false)}
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleManualTokenConnect}
                  disabled={connectManualTokenMutation.isPending}
                >
                  {connectManualTokenMutation.isPending ? 'Connecting...' : 'Connect Store'}
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </DashboardLayout>
  );
}