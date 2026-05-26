// App.js
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { Ionicons } from '@expo/vector-icons'; // For nice icons

// Import your screens
import HomeScreen from './screens/HomeScreen';
import EstimatorScreen from './screens/EstimatorScreen';
import ProductsScreen from './screens/ProductsScreen';
import OrdersScreen from './screens/OrdersScreen';
import ClassScheduleScreen from './screens/ClassScheduleScreen';
import ProfileScreen from './screens/ProfileScreen';

const Tab = createBottomTabNavigator();

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
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
          tabBarActiveTintColor: '#4A7043', // Your brand green
          tabBarInactiveTintColor: 'gray',
          tabBarStyle: { paddingBottom: 5, height: 60 },
        })}
      >
        <Tab.Screen name="Home" component={HomeScreen} options={{ title: 'Home' }} />
        <Tab.Screen name="Estimator" component={EstimatorScreen} options={{ title: 'Estimator' }} />
        <Tab.Screen name="Products" component={ProductsScreen} options={{ title: 'Products' }} />
        <Tab.Screen name="Orders" component={OrdersScreen} options={{ title: 'Orders' }} />
        <Tab.Screen name="Classes" component={ClassScheduleScreen} options={{ title: 'Classes' }} />
        <Tab.Screen name="Profile" component={ProfileScreen} options={{ title: 'Profile' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
