import { registerRootComponent } from 'expo';

// Must load before the app registers: defines the background location task, which the phone can run
// while no screens are mounted (mechanic in another app or screen locked).
import './services/backgroundLocation';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);
