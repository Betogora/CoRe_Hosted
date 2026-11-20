import { useAppServices } from "../useAppServices.ts";
import { SimulatorScreen } from "./SimulatorScreen.tsx";

export function SimulatorScreenWiring() {
  const { clock } = useAppServices();
  return (
    <SimulatorScreen
      systemNow={new Date().toISOString()}
      offsetMinutes={clock.simulationOffsetMinutes}
      onOffsetChange={clock.changeSimulationOffset}
    />
  );
}
