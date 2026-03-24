import { SolarSystem } from './scene/SolarSystem';
import { TopBar } from './ui/TopBar';
import { PlanetNav } from './ui/PlanetNav';
import { InfoPanel } from './ui/InfoPanel';
import { TimeControl } from './ui/TimeControl';
import { StatusBar } from './ui/StatusBar';
import { LoadingScreen } from './ui/LoadingScreen';

export default function App() {
  return (
    <>
      <LoadingScreen />
      <SolarSystem />
      <TopBar />
      <PlanetNav />
      <InfoPanel />
      <TimeControl />
      <StatusBar />
    </>
  );
}
