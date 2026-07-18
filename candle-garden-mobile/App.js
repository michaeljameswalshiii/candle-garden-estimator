// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons';
import { StatusBar } from 'expo-status-bar';

import HomeScreen from './screens/HomeScreen';
import EstimatorScreen from './screens/EstimatorScreen';
import ProductsScreen from './screens/ProductsScreen';
import OrdersScreen from './screens/OrdersScreen';
import ClassScheduleScreen from './screens/ClassScheduleScreen';
import ProfileScreen from './screens/ProfileScreen';
import { colors, navigationTheme } from './lib/theme';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer theme={navigationTheme}>
      <StatusBar style="dark" />
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
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'The Candle Garden' }} />
        <Tab.Screen name="Estimator" component={EstimatorScreen} options={{ title: 'Refill Estimator' }} />
        <Tab.Screen name="Products" component={ProductsScreen} options={{ title: 'Shop' }} />
        <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders' }} />
        <Tab.Screen name="Classes" component={ClassScheduleScreen} options={{ title: 'Classes' }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
