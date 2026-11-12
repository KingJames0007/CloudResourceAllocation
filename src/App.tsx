import { CompareStrategiesTab } from './components/CompareStrategiesTab';
import { TopControlBar } from './components/TopControlBar';

export function App() {
  return (
    <div className="min-h-screen bg-[#f8f9fa]">
      <TopControlBar />
      <main className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <CompareStrategiesTab />
      </main>
    </div>
  );
}

export default App;
