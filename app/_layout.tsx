import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { colors } from "@/constants/theme";
import { RoutineProvider } from "@/contexts/RoutineContext";
import { UserProvider } from "@/contexts/UserContext";

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
