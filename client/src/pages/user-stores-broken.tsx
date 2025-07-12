import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Store, Settings, Trash2, Link as LinkIcon, RefreshCw, ExternalLink, Zap, CheckCircle, AlertCircle, Clock } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import DashboardLayout from '@/components/DashboardLayout';

export default function UserStores() {
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [isShopifyDialogOpen, setIsShopifyDialogOpen] = useState(false);
  const [shopifyDomain, setShopifyDomain] = useState('');
  const [newStore, setNewStore] = useState({
    name: '',
    storeUrl: '',
    storeType: 'shopify',
    description: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Check for connection status in URL params
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const connected = urlParams.get('connected');
    const shopName = urlParams.get('shop');
    const error = urlParams.get('error');
    
    if (connected && shopName) {
      toast({
        title: "Store Connected!",
        description: `${decodeURIComponent(shopName)} has been successfully connected to your account.`,
      });
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/stores');
    } else if (error) {
      toast({
        title: "Connection Failed",
        description: "Failed to connect your Shopify store. Please try again.",
        variant: "destructive",
      });
      // Clean up URL
      window.history.replaceState({}, '', '/dashboard/stores');
    }
  }, [toast]);

  const { data: stores = [], isLoading } = useQuery({
    queryKey: ['/api/stores'],
  });

  const createStoreMutation = useMutation({
    mutationFn: (storeData: any) => apiRequest('POST', '/api/stores', storeData),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      setIsAddDialogOpen(false);
      setNewStore({ name: '', storeUrl: '', storeType: 'shopify', description: '' });
      toast({
        title: "Store Added",
        description: "Your store has been successfully added to your dashboard.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to add store. Please try again.",
        variant: "destructive",
      });
    },
  });

  const deleteStoreMutation = useMutation({
    mutationFn: (storeId: number) => apiRequest('DELETE', `/api/stores/${storeId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      toast({
        title: "Store Removed",
        description: "Your store has been removed from your dashboard.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to remove store. Please try again.",
        variant: "destructive",
      });
    },
  });

  const connectShopifyMutation = useMutation({
    mutationFn: (data: { shopDomain: string; userStoreId?: number }) => 
      apiRequest('POST', '/api/shopify/connect', data),
    onSuccess: (data: { authUrl: string }) => {
      // Redirect to Shopify OAuth
      window.location.href = data.authUrl;
    },
    onError: (error: any) => {
      toast({
        title: "Connection Error",
        description: error.message || "Failed to initiate Shopify connection.",
        variant: "destructive",
      });
    },
  });

  const analyzeStoreMutation = useMutation({
    mutationFn: (storeId: number) => apiRequest('POST', `/api/shopify/analyze/${storeId}`, {}),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['/api/stores'] });
      queryClient.invalidateQueries({ queryKey: ['/api/credits'] });
      queryClient.invalidateQueries({ queryKey: ['/api/analyses'] });
      toast({
        title: "Analysis Complete!",
        description: "Your store analysis has been completed. Check the past analyses page for results.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Analysis Failed",
        description: error.message || "Failed to analyze store. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleAddStore = () => {
    if (!newStore.name || !newStore.storeUrl) {
      toast({
        title: "Missing Information",
        description: "Please provide both store name and URL.",
        variant: "destructive",
      });
      return;
    }

    createStoreMutation.mutate(newStore);
  };

  const handleDeleteStore = (storeId: number) => {
    if (confirm('Are you sure you want to remove this store?')) {
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

  const handleReconnectStore = (storeId: number) => {
    const store = stores.find((s: any) => s.id === storeId);
    if (store?.storeUrl) {
      const domain = store.storeUrl.replace('https://', '').replace('http://', '');
      connectShopifyMutation.mutate({ shopDomain: domain, userStoreId: storeId });
    }
  };

  const handleAnalyzeStore = (storeId: number) => {
    analyzeStoreMutation.mutate(storeId);
  };

  const getStoreTypeColor = (type: string) => {
    return type === 'shopify' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
  };

  const getConnectionStatusIcon = (status: string) => {
    switch (status) {
      case 'connected':
        return <CheckCircle className="h-4 w-4 text-green-600" />;
      case 'pending':
        return <Clock className="h-4 w-4 text-yellow-600" />;
      case 'error':
        return <AlertCircle className="h-4 w-4 text-red-600" />;
      default:
        return <AlertCircle className="h-4 w-4 text-gray-400" />;
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
              <Dialog open={isShopifyDialogOpen} onOpenChange={setIsShopifyDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Store className="mr-2 h-4 w-4" />
                    Connect Shopify
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Connect Shopify Store</DialogTitle>
                    <CardDescription>
                      Connect your Shopify store for automatic analysis and AI-powered optimizations.
                    </CardDescription>
                  </DialogHeader>
                  <div className="space-y-4">
                    <div>
                      <Label htmlFor="shopifyDomain">Shopify Store Domain</Label>
                      <Input
                        id="shopifyDomain"
                        value={shopifyDomain}
                        onChange={(e) => setShopifyDomain(e.target.value)}
                        placeholder="mystore.myshopify.com"
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
              
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button variant="outline">
                    <Plus className="mr-2 h-4 w-4" />
                    Add Manual Store
                  </Button>
                </DialogTrigger>
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
            </div>
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
            </div>
          </div>
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
                <Dialog open={isShopifyDialogOpen} onOpenChange={setIsShopifyDialogOpen}>
                  <DialogTrigger asChild>
                    <Button>
                      <Store className="mr-2 h-4 w-4" />
                      Connect Shopify Store
                    </Button>
                  </DialogTrigger>
                  <DialogContent>
                    <DialogHeader>
                      <DialogTitle>Connect Your First Shopify Store</DialogTitle>
                      <CardDescription>
                        Connect your Shopify store for automatic analysis and AI-powered optimizations.
                      </CardDescription>
                    </DialogHeader>
                    <div className="space-y-4">
                      <div>
                        <Label htmlFor="shopifyDomain">Shopify Store Domain</Label>
                        <Input
                          id="shopifyDomain"
                          value={shopifyDomain}
                          onChange={(e) => setShopifyDomain(e.target.value)}
                          placeholder="mystore.myshopify.com"
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
                
                <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                  <DialogTrigger asChild>
                    <Button variant="outline">
                      <Plus className="mr-2 h-4 w-4" />
                      Add Manual Store
                    </Button>
                  </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Add Your First Store</DialogTitle>
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
                      <div className="text-sm text-gray-500">
                        Last analyzed: {new Date(store.lastAnalyzedAt).toLocaleDateString()}
                      </div>
                    )}

                    {store.isConnected && store.lastSyncAt && (
                      <div className="text-sm text-gray-500">
                        Last sync: {new Date(store.lastSyncAt).toLocaleDateString()}
                      </div>
                    )}
                    
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="flex space-x-2">
                        {store.isConnected && store.connectionStatus === 'connected' ? (
                          <Button 
                            size="sm" 
                            onClick={() => handleAnalyzeStore(store.id)}
                            disabled={analyzeStoreMutation.isPending}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                          >
                            <Zap className="mr-2 h-4 w-4" />
                            {analyzeStoreMutation.isPending ? 'Analyzing...' : 'Run AI Analysis'}
                          </Button>
                        ) : (
                          <Button 
                            size="sm" 
                            variant="outline"
                            onClick={() => handleReconnectStore(store.id)}
                            disabled={connectShopifyMutation.isPending}
                          >
                            <Settings className="mr-2 h-4 w-4" />
                            {store.isConnected ? 'Reconnect' : 'Connect Shopify'}
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
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Coming Soon Features */}
        <div className="mt-12">
          <h2 className="text-2xl font-bold text-gray-900 mb-6">Store Optimization Features</h2>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <RefreshCw className="mr-2 h-5 w-5" />
                  AI-Powered Analysis
                  <Badge variant="default" className="ml-2 bg-green-100 text-green-800">Active</Badge>
                </CardTitle>
                <CardDescription>
                  Get comprehensive AI analysis of your connected Shopify stores.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Detailed performance scoring (Design, Products, SEO, Trust)</li>
                  <li>• AI-powered improvement suggestions</li>
                  <li>• Store intelligence and competitor analysis</li>
                  <li>• Real-time data from Shopify API</li>
                </ul>
              </CardContent>
            </Card>
            
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Store className="mr-2 h-5 w-5" />
                  Shopify Direct Integration
                  <Badge variant="default" className="ml-2 bg-green-100 text-green-800">Active</Badge>
                </CardTitle>
                <CardDescription>
                  Connect directly to your Shopify store with OAuth authentication.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Secure OAuth connection to Shopify</li>
                  <li>• Real-time product and store data access</li>
                  <li>• Automatic analysis scheduling</li>
                  <li>• Advanced store intelligence insights</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}