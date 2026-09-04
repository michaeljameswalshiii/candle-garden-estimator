// App.js
import React, { Suspense, lazy } from 'react';
import { ActivityIndicator, View, Text, StyleSheet } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';
import { StripeProvider } from './lib/stripeBridge';

import HomeScreen from './screens/HomeScreen';
import ProductsScreen from './screens/ProductsScreen';
import OrdersScreen from './screens/OrdersScreen';
import ClassScheduleScreen from './screens/ClassScheduleScreen';
import ProfileScreen from './screens/ProfileScreen';
import { colors, navigationTheme, fonts } from './lib/theme';
import { CartProvider, useCart } from './lib/cart';
import { AuthProvider, useAuth } from './lib/AuthContext';
import { setAuthTokenGetter, setAccessTokenGetter } from './lib/apiClient';
import { APPLE_MERCHANT_IDENTIFIER, STRIPE_PUBLISHABLE_KEY } from './lib/stripeConfig';

// Lazy-load Estimator so expo-image-picker / prepareImage are not required at app start
const EstimatorScreen = lazy(() => import('./screens/EstimatorScreen'));

const Tab = createBottomTabNavigator();

function EstimatorSuspense() {
  return (
    <Suspense
      fallback={
        <View style={styles.fallback}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.fallbackText}>Loading estimator…</Text>
        </View>
      }
    >
      <EstimatorScreen />
    </Suspense>
  );
}

function AuthTokenBridge({ children }) {
  const { getIdToken, getAccessToken } = useAuth();
  React.useEffect(() => {
    // API Gateway Cognito authorizer expects the ID token
    setAuthTokenGetter(() => getIdToken());
    // Detect attribution uses access token (Cognito GetUser)
    setAccessTokenGetter(() => getAccessToken());
  }, [getIdToken, getAccessToken]);
  return children;
}

function MainTabs() {
  const { itemCount } = useCart();
  const { isAuthenticated } = useAuth();

  return (
    <Tab.Navigator
      screenOptions={({ route }) => ({
        headerStyle: {
          backgroundColor: colors.white,
          borderBottomColor: colors.border,
          borderBottomWidth: 1,
        },
        headerTitleStyle: {
          color: colors.primary,
          fontWeight: '500',
          fontSize: 17,
        },
        headerTintColor: colors.primary,
        tabBarIcon: ({ focused, color, size }) => {
          let iconName;

          if (route.name === 'Home') iconName = focused ? 'home' : 'home-outline';
          else if (route.name === 'Estimator') iconName = focused ? 'calculator' : 'calculator-outline';
          else if (route.name === 'Products') iconName = focused ? 'pricetag' : 'pricetag-outline';
          else if (route.name === 'Orders') iconName = focused ? 'cart' : 'cart-outline';
          else if (route.name === 'Classes') iconName = focused ? 'school' : 'school-outline';
          else if (route.name === 'Profile') iconName = focused ? 'person' : 'person-outline';

          return <Ionicons name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.tabInactive,
        tabBarStyle: {
          paddingBottom: 5,
          height: 60,
          backgroundColor: colors.white,
          borderTopColor: colors.border,
        },
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '500',
          letterSpacing: 0.3,
        },
      })}
    >
      <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'The Candle Garden App' }} />
      <Tab.Screen
        name="Estimator"
        component={EstimatorSuspense}
        options={{ title: 'Refill Estimator' }}
      />
      <Tab.Screen name="Products" component={ProductsScreen} options={{ title: 'Shop' }} />
      <Tab.Screen
        name="Orders"
        component={OrdersScreen}
        options={{
          title: 'Cart',
          tabBarBadge: itemCount > 0 ? itemCount : undefined,
          tabBarBadgeStyle: {
            backgroundColor: colors.primary,
            fontSize: 10,
          },
        }}
      />
      <Tab.Screen name="Classes" component={ClassScheduleScreen} options={{ title: 'Classes' }} />
      <Tab.Screen
        name="Profile"
        component={ProfileScreen}
        options={{
          title: 'Profile',
          tabBarBadge: isAuthenticated ? undefined : '!',
          tabBarBadgeStyle: {
            backgroundColor: colors.warning,
            fontSize: 10,
            minWidth: 14,
            height: 14,
            lineHeight: 14,
          },
        }}
      />
    </Tab.Navigator>
  );
}

function AppTree() {
  return (
    <AuthProvider>
      <AuthTokenBridge>
        <CartProvider>
          <NavigationContainer theme={navigationTheme}>
            <StatusBar style="dark" />
            <MainTabs />
          </NavigationContainer>
        </CartProvider>
      </AuthTokenBridge>
    </AuthProvider>
  );
}

export default function App() {
  if (!STRIPE_PUBLISHABLE_KEY) {
    return <AppTree />;
  }
  return (
    <StripeProvider
      publishableKey={STRIPE_PUBLISHABLE_KEY}
      merchantIdentifier={APPLE_MERCHANT_IDENTIFIER || undefined}
    >
      <AppTree />
    </StripeProvider>
  );
}

const styles = StyleSheet.create({
  fallback: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.white,
    gap: 12,
  },
  fallbackText: {
    fontFamily: fonts.body,
    color: colors.textMuted,
    fontSize: 14,
  },
});
