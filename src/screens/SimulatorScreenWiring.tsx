import { useAppServices } from "../useAppServices.ts";
import { SimulatorScreen } from "./SimulatorScreen.tsx";

/** `Simulator` on the app-wide learning clock. */
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
