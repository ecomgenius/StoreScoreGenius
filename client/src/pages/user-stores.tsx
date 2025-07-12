import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Store, Settings, Trash2, Link as LinkIcon, RefreshCw } from 'lucide-react';
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
  const [newStore, setNewStore] = useState({
    name: '',
    storeUrl: '',
    storeType: 'shopify',
    description: ''
  });
  const { toast } = useToast();
  const queryClient = useQueryClient();

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

  const getStoreTypeColor = (type: string) => {
    return type === 'shopify' ? 'bg-green-100 text-green-800' : 'bg-blue-100 text-blue-800';
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
            <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
              <DialogTrigger asChild>
                <Button>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Store
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
        </div>

        {stores.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Store className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <h3 className="text-lg font-medium text-gray-900 mb-2">No stores connected</h3>
              <p className="text-gray-600 mb-4">
                Connect your first store to start receiving AI-powered optimizations and insights.
              </p>
              <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
                <DialogTrigger asChild>
                  <Button>
                    <Plus className="mr-2 h-4 w-4" />
                    Add Your First Store
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
            </CardContent>
          </Card>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {stores.map((store: any) => (
              <Card key={store.id} className="hover:shadow-lg transition-shadow">
                <CardHeader>
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-lg">{store.name}</CardTitle>
                    <Badge variant="secondary" className={getStoreTypeColor(store.storeType)}>
                      {store.storeType.toUpperCase()}
                    </Badge>
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
                        className="hover:text-blue-600 truncate"
                      >
                        {store.storeUrl}
                      </a>
                    </div>
                    
                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="flex space-x-2">
                        <Button size="sm" variant="outline">
                          <Settings className="mr-2 h-4 w-4" />
                          Connect Shopify
                        </Button>
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
            <Card className="opacity-75">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <RefreshCw className="mr-2 h-5 w-5" />
                  AI-Powered Optimization
                  <Badge variant="outline" className="ml-2">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Automatically apply AI suggestions to your connected Shopify stores.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Optimize product titles and descriptions</li>
                  <li>• Improve SEO meta tags</li>
                  <li>• Update pricing strategies</li>
                  <li>• Enhance product images</li>
                </ul>
              </CardContent>
            </Card>
            
            <Card className="opacity-75">
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Store className="mr-2 h-5 w-5" />
                  Shopify Integration
                  <Badge variant="outline" className="ml-2">Coming Soon</Badge>
                </CardTitle>
                <CardDescription>
                  Connect directly to your Shopify store for seamless management.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Real-time store synchronization</li>
                  <li>• Bulk product updates</li>
                  <li>• Performance monitoring</li>
                  <li>• Automated reporting</li>
                </ul>
              </CardContent>
            </Card>
          </div>
        </div>
      </div>
    </DashboardLayout>
  );
}