import { useState } from 'react';
import { useMutation, useQuery } from '@tanstack/react-query';
import { Settings, User, CreditCard, Bell, Shield, Save, Calendar, AlertTriangle } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { apiRequest } from '@/lib/queryClient';
import DashboardLayout from '@/components/DashboardLayout';
import { useAuth } from '@/hooks/useAuth';

export default function SettingsPage() {
  const { user } = useAuth();
  const { toast } = useToast();
  const [profile, setProfile] = useState({
    email: user?.email || '',
    name: user?.name || '',
    company: user?.company || '',
  });

  const [notifications, setNotifications] = useState({
    analysisComplete: true,
    weeklyReport: true,
    creditLowWarning: true,
    newFeatures: false,
  });

  const { data: credits = { balance: 0, transactions: [] } } = useQuery({
    queryKey: ['/api/credits'],
  });

  const { data: creditTransactions = [] } = useQuery({
    queryKey: ['/api/credits/transactions'],
  });

  const { data: subscription, refetch: refetchSubscription } = useQuery({
    queryKey: ['/api/subscriptions'],
  });

  const { data: paymentMethods = [], refetch: refetchPaymentMethods } = useQuery({
    queryKey: ['/api/billing/payment-methods'],
  });

  const updateProfileMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/profile', data),
    onSuccess: () => {
      toast({
        title: "Profile Updated",
        description: "Your profile has been successfully updated.",
      });
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update profile. Please try again.",
        variant: "destructive",
      });
    },
  });

  const updateSubscriptionMutation = useMutation({
    mutationFn: (data: any) => apiRequest('PUT', '/api/subscriptions', data),
    onSuccess: () => {
      toast({
        title: "Subscription Updated",
        description: "Your subscription has been successfully updated.",
      });
      refetchSubscription();
    },
    onError: (error: any) => {
      toast({
        title: "Error",
        description: error.message || "Failed to update subscription. Please try again.",
        variant: "destructive",
      });
    },
  });

  const handleUpdateProfile = () => {
    updateProfileMutation.mutate(profile);
  };

  const handleBuyCredits = (amount: number) => {
    // This would integrate with Stripe
    toast({
      title: "Coming Soon",
      description: "Credit purchase integration will be available soon.",
    });
  };

  return (
    <DashboardLayout>
      <div className="p-6 max-w-4xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900 mb-2 flex items-center">
            <Settings className="mr-3 h-8 w-8" />
            Settings
          </h1>
          <p className="text-gray-600">
            Manage your account settings and preferences.
          </p>
        </div>

        <Tabs defaultValue="profile" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4">
            <TabsTrigger value="profile">Profile</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="notifications">Notifications</TabsTrigger>
            <TabsTrigger value="security">Security</TabsTrigger>
          </TabsList>

          <TabsContent value="profile">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <User className="mr-2 h-5 w-5" />
                  Profile Information
                </CardTitle>
                <CardDescription>
                  Update your personal information and preferences.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="email">Email Address</Label>
                    <Input
                      id="email"
                      type="email"
                      value={profile.email}
                      onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label htmlFor="name">Full Name</Label>
                    <Input
                      id="name"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      placeholder="Your full name"
                    />
                  </div>
                </div>
                <div>
                  <Label htmlFor="company">Company (Optional)</Label>
                  <Input
                    id="company"
                    value={profile.company}
                    onChange={(e) => setProfile({ ...profile, company: e.target.value })}
                    placeholder="Your company name"
                  />
                </div>
                <Button 
                  onClick={handleUpdateProfile}
                  disabled={updateProfileMutation.isPending}
                >
                  <Save className="mr-2 h-4 w-4" />
                  {updateProfileMutation.isPending ? 'Updating...' : 'Update Profile'}
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="billing" className="space-y-6">
              {/* Current Subscription */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CreditCard className="h-5 w-5" />
                    Current Subscription
                  </CardTitle>
                  <CardDescription>
                    Manage your subscription and billing
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  {subscription ? (
                    <>
                      <div className="flex justify-between items-start">
                        <div>
                          <h4 className="font-semibold text-lg">{subscription.plan?.name}</h4>
                          <p className="text-gray-600">${(subscription.plan?.price / 100).toFixed(2)} per {subscription.plan?.interval}</p>
                        </div>
                        <div className="text-right">
                          <div className="flex items-center gap-2">
                            <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                              subscription.subscription.status === 'active' ? 'bg-green-100 text-green-800' :
                              subscription.subscription.status === 'trialing' ? 'bg-blue-100 text-blue-800' :
                              'bg-yellow-100 text-yellow-800'
                            }`}>
                              {subscription.subscription.status}
                            </span>
                          </div>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 gap-4 pt-4 border-t">
                        <div>
                          <p className="text-sm text-gray-600">Current Period</p>
                          <p className="font-medium">
                            {new Date(subscription.subscription.currentPeriodStart).toLocaleDateString()} - {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        </div>
                        <div>
                          <p className="text-sm text-gray-600">Next Billing</p>
                          <p className="font-medium flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <div className="flex gap-2 pt-4">
                        <Button
                          variant="outline"
                          onClick={() => updateSubscriptionMutation.mutate({ 
                            cancelAtPeriodEnd: !subscription.subscription.cancelAtPeriodEnd 
                          })}
                        >
                          {subscription.subscription.cancelAtPeriodEnd ? 'Resume Subscription' : 'Cancel Subscription'}
                        </Button>
                      </div>

                      {subscription.subscription.cancelAtPeriodEnd && (
                        <div className="flex items-center gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                          <AlertTriangle className="h-4 w-4 text-yellow-600" />
                          <p className="text-sm text-yellow-800">
                            Your subscription will end on {new Date(subscription.subscription.currentPeriodEnd).toLocaleDateString()}
                          </p>
                        </div>
                      )}
                    </>
                  ) : (
                    <div className="text-center py-8">
                      <p className="text-gray-600 mb-4">No active subscription</p>
                      <Button onClick={() => window.location.href = '/subscription-onboarding'}>
                        Subscribe Now
                      </Button>
                    </div>
                  )}
                </CardContent>
              </Card>

              {/* Payment Methods */}
              <Card>
                <CardHeader>
                  <CardTitle>Payment Methods</CardTitle>
                  <CardDescription>
                    Manage your saved payment methods
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  {paymentMethods.length > 0 ? (
                    <div className="space-y-3">
                      {paymentMethods.map((pm: any) => (
                        <div key={pm.id} className="flex items-center justify-between p-3 border rounded-lg">
                          <div className="flex items-center gap-3">
                            <CreditCard className="h-5 w-5 text-gray-400" />
                            <div>
                              <p className="font-medium">•••• •••• •••• {pm.card.last4}</p>
                              <p className="text-sm text-gray-600">{pm.card.brand.toUpperCase()} expires {pm.card.exp_month}/{pm.card.exp_year}</p>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-gray-600">No payment methods saved</p>
                  )}
                </CardContent>
              </Card>

              {/* Billing History */}
              <Card>
                <CardHeader>
                  <CardTitle>Billing History</CardTitle>
                  <CardDescription>
                    View your recent billing transactions
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-2">
                    {creditTransactions.slice(0, 5).map((transaction: any) => (
                      <div key={transaction.id} className="flex justify-between items-center py-2 border-b border-gray-100 last:border-0">
                        <div>
                          <p className="font-medium">{transaction.description}</p>
                          <p className="text-sm text-gray-600">
                            {new Date(transaction.createdAt).toLocaleDateString()}
                          </p>
                        </div>
                        <span className={`font-medium ${
                          transaction.amount > 0 ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {transaction.amount > 0 ? '+' : ''}{transaction.amount} credits
                        </span>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </TabsContent>

          <TabsContent value="notifications">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Bell className="mr-2 h-5 w-5" />
                  Notification Preferences
                </CardTitle>
                <CardDescription>
                  Choose what notifications you'd like to receive.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="analysis-complete">Analysis Complete</Label>
                    <p className="text-sm text-gray-600">Get notified when store analysis is finished</p>
                  </div>
                  <Switch
                    id="analysis-complete"
                    checked={notifications.analysisComplete}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, analysisComplete: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="weekly-report">Weekly Report</Label>
                    <p className="text-sm text-gray-600">Receive weekly summaries of your store performance</p>
                  </div>
                  <Switch
                    id="weekly-report"
                    checked={notifications.weeklyReport}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, weeklyReport: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="credit-warning">Credit Low Warning</Label>
                    <p className="text-sm text-gray-600">Alert when your credits are running low</p>
                  </div>
                  <Switch
                    id="credit-warning"
                    checked={notifications.creditLowWarning}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, creditLowWarning: checked })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label htmlFor="new-features">New Features</Label>
                    <p className="text-sm text-gray-600">Learn about new features and updates</p>
                  </div>
                  <Switch
                    id="new-features"
                    checked={notifications.newFeatures}
                    onCheckedChange={(checked) => setNotifications({ ...notifications, newFeatures: checked })}
                  />
                </div>
                <Button>
                  <Save className="mr-2 h-4 w-4" />
                  Save Preferences
                </Button>
              </CardContent>
            </Card>
          </TabsContent>

          <TabsContent value="security">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center">
                  <Shield className="mr-2 h-5 w-5" />
                  Security Settings
                </CardTitle>
                <CardDescription>
                  Manage your account security and privacy settings.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div>
                  <Label htmlFor="current-password">Current Password</Label>
                  <Input id="current-password" type="password" placeholder="Enter current password" />
                </div>
                <div>
                  <Label htmlFor="new-password">New Password</Label>
                  <Input id="new-password" type="password" placeholder="Enter new password" />
                </div>
                <div>
                  <Label htmlFor="confirm-password">Confirm New Password</Label>
                  <Input id="confirm-password" type="password" placeholder="Confirm new password" />
                </div>
                <Button variant="outline">
                  Change Password
                </Button>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </DashboardLayout>
  );
}