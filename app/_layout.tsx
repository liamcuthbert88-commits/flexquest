import { LogBox } from "react-native";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/constants/theme";
import { RoutineProvider } from "@/contexts/RoutineContext";
import { UserProvider } from "@/contexts/UserContext";

// Targeted, not LogBox.ignoreAllLogs() — this project's own code already
// imports AsyncStorage correctly from the dedicated
// @react-native-async-storage/async-storage package (see lib/storage.ts),
// so if this warning is showing up, it's coming from a dependency's
// internals, not fixable here, and purely informational. Suppressing
// everything app-wide would also hide real warnings/errors going forward —
// several actual bugs this project has hit were only obvious because
// something visibly misbehaved in dev.
LogBox.ignoreLogs([
  "AsyncStorage has been extracted from react-native core and will be removed in a future release.",
  // @react-three/fiber 9.6.1 (latest stable — only unstable 10.0.0
  // alpha/canary builds go further) constructs `new THREE.Clock()` inside
  // its own createStore internals on every Canvas mount; there's no app
  // callsite to swap for THREE.Timer, and no stable r3f release yet does.
  "THREE.Clock: This module has been deprecated. Please use THREE.Timer instead.",
]);

export default function RootLayout() {
  return (
    <UserProvider>
      <RoutineProvider>
        <StatusBar style="light" />
        <Stack
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: colors.background },
          }}
        />
      </RoutineProvider>
    </UserProvider>
  );
}
