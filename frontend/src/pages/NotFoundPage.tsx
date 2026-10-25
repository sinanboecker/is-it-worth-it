import { Anchor, Stack, Text, Title } from "@mantine/core";
import { Link } from "react-router-dom";

export function NotFoundPage() {
  return (
    <Stack align="center" mt="xl">
      <Title order={2}>Page not found</Title>
      <Text c="dimmed">
        Back to{" "}
        <Anchor component={Link} to="/">
          Now Playing
        </Anchor>
      </Text>
    </Stack>
  );
}
