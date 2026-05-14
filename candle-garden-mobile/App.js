import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createStackNavigator } from '@react-navigation/stack';
import { View, Text, StyleSheet } from 'react-native';

// Import screens
import HomeScreen from './screens/HomeScreen';
import ProductsScreen from './screens/ProductsScreen';
import OrdersScreen from './screens/OrdersScreen';
import ClassScheduleScreen from './screens/ClassScheduleScreen';
import EstimatorScreen from './screens/EstimatorScreen';
import ProfileScreen from './screens/ProfileScreen';
import RefillStep4 from './screens/RefillStep4';

const Stack = createStackNavigator();
const Tab = createBottomTabNavigator();

// Simple icon component using emoji - using proper boolean check
const TabIcon = ({ name, focused }) => {
  const icons = {
    Home: '🏠',
    Products: '🛒',
    Orders: '📦',
    Classes: '📅',
    Estimator: '🕯️',
    Profile: '👤',
  };
  // Explicitly convert to boolean to avoid Fabric issues
  const isFocused = Boolean(focused);
  return (
    <View style={styles.iconContainer}>
      <Text style={[styles.icon, isFocused && styles.iconFocused]}>{icons[name]}</Text>
    </View>
  );
};

// Estimator Stack Navigator
function EstimatorStack() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="EstimatorMain" component={EstimatorScreen} />
      <Stack.Screen name="RefillStep4" component={RefillStep4} />
    </Stack.Navigator>
  );
}

export default function App() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={({ route }) => ({
          tabBarIcon: ({ focused }) => (
            <TabIcon name={route.name} focused={focused} />
          ),
          tabBarActiveTintColor: '#2e7d32',
          tabBarInactiveTintColor: '#666',
          headerShown: false,
        })}
      >
        <Tab.Screen 
          name="Home" 
          component={HomeScreen}
        />
        <Tab.Screen 
          name="Products" 
          component={ProductsScreen}
        />
        <Tab.Screen 
          name="Orders" 
          component={OrdersScreen}
        />
        <Tab.Screen 
          name="Classes" 
          component={ClassScheduleScreen}
        />
        <Tab.Screen 
          name="Estimator" 
          component={EstimatorStack}
          options={{ title: 'Refill' }}
        />
        <Tab.Screen 
          name="Profile" 
          component={ProfileScreen}
        />
      </Tab.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  tabBar: {
    height: 60,
    paddingBottom: 8,
    paddingTop: 8,
    backgroundColor: '#fff',
    borderTopWidth: 1,
    borderTopColor: '#eee',
  },
  tabLabel: {
    fontSize: 12,
    fontWeight: '500',
  },
  iconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  icon: {
    fontSize: 22,
  },
  iconFocused: {
    transform: [{ scale: 1.1 }],
  },
});
